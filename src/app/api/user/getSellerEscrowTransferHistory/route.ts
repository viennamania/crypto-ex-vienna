import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, Engine } from 'thirdweb';

import clientPromise, { dbName } from '@/lib/mongodb';

type TransferDirection = 'IN' | 'OUT';

type TransferCaseType =
  | 'SELLER_WALLET_TO_ESCROW'
  | 'ESCROW_TO_SELLER_WALLET'
  | 'BUYER_ESCROW_TO_ESCROW'
  | 'ESCROW_TO_BUYER_ESCROW'
  | 'ORDER_HASH_MATCHED'
  | 'UNCLASSIFIED_IN'
  | 'UNCLASSIFIED_OUT';

type RelatedTradeInfo = {
  tradeId: string;
  status: string;
  reason: string;
  orderId: string;
};

type OrderPreview = {
  orderId: string;
  tradeId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  paymentMethod: string;
  usdtAmount: string;
  krwAmount: string;
  rate: string;
  buyerWalletAddress: string;
  buyerEscrowWalletAddress: string;
  buyerDepositName: string;
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
  sellerBankName: string;
  sellerAccountNumber: string;
  sellerAccountHolder: string;
  transactionHash: string;
  escrowTransactionHash: string;
  buyerLockTransactionHash: string;
  sellerLockTransactionHash: string;
};

type TransferCaseDetail = {
  type: TransferCaseType;
  label: string;
  expectedFlow: boolean;
};

type ChainConfig = {
  chain: 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
  chainId: number;
  usdtContractAddress: string;
  usdtDecimals: number;
};

type InsightTransferItem = {
  from_address?: string;
  to_address?: string;
  contract_address?: string;
  block_number?: string;
  block_timestamp?: string;
  transaction_hash?: string;
  transfer_type?: string;
  chain_id?: number;
  token_type?: string;
  amount?: string;
};

type InsightTransferResponse = {
  data?: InsightTransferItem[];
  meta?: {
    page?: number;
    limit?: number;
    total_items?: number;
    total_pages?: number;
  };
  error?: string;
};

let insightClientIdCache = '';

const ESCROW_TRANSFER_CASE_LABELS: Record<TransferCaseType, string> = {
  SELLER_WALLET_TO_ESCROW: '판매자 지갑 -> 판매자 에스크로',
  ESCROW_TO_SELLER_WALLET: '판매자 에스크로 -> 판매자 지갑',
  BUYER_ESCROW_TO_ESCROW: '구매 에스크로 -> 판매자 에스크로',
  ESCROW_TO_BUYER_ESCROW: '판매자 에스크로 -> 구매 에스크로',
  ORDER_HASH_MATCHED: '주문 해시 매칭(수동 확인 필요)',
  UNCLASSIFIED_IN: '미분류 입금',
  UNCLASSIFIED_OUT: '미분류 출금',
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeAddress = (value: unknown) => String(value || '').trim().toLowerCase();

const normalizeHash = (value: unknown) => String(value || '').trim().toLowerCase();

const isWalletAddress = (value: string) => /^0x[a-f0-9]{40}$/i.test(String(value || '').trim());

const isTransactionHash = (value: string) => /^0x[a-f0-9]{64}$/i.test(String(value || '').trim());

const resolveChainConfig = (): ChainConfig => {
  const normalizedChain = String(process.env.NEXT_PUBLIC_CHAIN || 'polygon').trim().toLowerCase();
  if (normalizedChain === 'ethereum') {
    return {
      chain: 'ethereum',
      chainId: 1,
      usdtContractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      usdtDecimals: 6,
    };
  }
  if (normalizedChain === 'arbitrum') {
    return {
      chain: 'arbitrum',
      chainId: 42161,
      usdtContractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      usdtDecimals: 6,
    };
  }
  if (normalizedChain === 'bsc') {
    return {
      chain: 'bsc',
      chainId: 56,
      usdtContractAddress: '0x55d398326f99059fF775485246999027B3197955',
      usdtDecimals: 18,
    };
  }
  return {
    chain: 'polygon',
    chainId: 137,
    usdtContractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    usdtDecimals: 6,
  };
};

const formatTokenAmountFromRaw = (rawAmount: string, decimals: number) => {
  const normalized = String(rawAmount || '').trim();
  if (!/^-?\d+$/.test(normalized)) {
    return normalized || '0';
  }
  const rawValue = BigInt(normalized);
  const negative = rawValue < 0n;
  const absoluteValue = negative ? rawValue * -1n : rawValue;
  const divisor = 10n ** BigInt(Math.max(0, decimals));
  const whole = absoluteValue / divisor;
  const fraction = absoluteValue % divisor;
  if (fraction === 0n) {
    return `${negative ? '-' : ''}${whole.toString()}`;
  }
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}.${fractionText}`;
};

const parseRawAmountToBigInt = (value: string) => {
  const normalized = String(value || '').trim();
  if (!/^-?\d+$/.test(normalized)) return 0n;
  return BigInt(normalized);
};

const pushRelatedTradeInfo = (
  map: Map<string, RelatedTradeInfo[]>,
  key: string,
  tradeInfo: RelatedTradeInfo,
) => {
  if (!key || !tradeInfo.tradeId) return;
  const current = map.get(key) || [];
  const alreadyExists = current.some(
    (item) =>
      item.tradeId === tradeInfo.tradeId
      && item.reason === tradeInfo.reason
      && item.status === tradeInfo.status
      && item.orderId === tradeInfo.orderId,
  );
  if (alreadyExists) return;
  current.push(tradeInfo);
  map.set(key, current);
};

const buildMergedRelatedTrades = (
  hashRelatedTrades: RelatedTradeInfo[],
  counterpartyRelatedTrades: RelatedTradeInfo[],
) => {
  const merged = new Map<string, {
    tradeId: string;
    status: string;
    orderId: string;
    reasons: Set<string>;
  }>();
  const push = (source: RelatedTradeInfo[]) => {
    for (const item of source) {
      if (!item.tradeId) continue;
      const key = item.tradeId;
      if (!merged.has(key)) {
        merged.set(key, {
          tradeId: item.tradeId,
          status: item.status || '',
          orderId: item.orderId || '',
          reasons: new Set<string>(),
        });
      }
      const target = merged.get(key);
      if (!target) continue;
      if (item.status && !target.status) {
        target.status = item.status;
      }
      if (item.orderId && !target.orderId) {
        target.orderId = item.orderId;
      }
      if (item.reason) {
        target.reasons.add(item.reason);
      }
    }
  };

  push(hashRelatedTrades);
  push(counterpartyRelatedTrades);

  return Array.from(merged.values()).map((item) => ({
    tradeId: item.tradeId,
    status: item.status,
    orderId: item.orderId,
    reason: Array.from(item.reasons).join(', '),
  }));
};

const classifyTransferCase = ({
  direction,
  counterpartyAddress,
  sellerWalletAddress,
  buyerEscrowAddressSet,
  relatedTrades,
}: {
  direction: TransferDirection;
  counterpartyAddress: string;
  sellerWalletAddress: string;
  buyerEscrowAddressSet: Set<string>;
  relatedTrades: Array<{ tradeId: string; status: string; orderId: string; reason: string }>;
}): TransferCaseDetail => {
  if (direction === 'IN' && counterpartyAddress === sellerWalletAddress) {
    return {
      type: 'SELLER_WALLET_TO_ESCROW',
      label: ESCROW_TRANSFER_CASE_LABELS.SELLER_WALLET_TO_ESCROW,
      expectedFlow: true,
    };
  }

  if (direction === 'OUT' && counterpartyAddress === sellerWalletAddress) {
    return {
      type: 'ESCROW_TO_SELLER_WALLET',
      label: ESCROW_TRANSFER_CASE_LABELS.ESCROW_TO_SELLER_WALLET,
      expectedFlow: true,
    };
  }

  if (direction === 'IN' && buyerEscrowAddressSet.has(counterpartyAddress)) {
    return {
      type: 'BUYER_ESCROW_TO_ESCROW',
      label: ESCROW_TRANSFER_CASE_LABELS.BUYER_ESCROW_TO_ESCROW,
      expectedFlow: true,
    };
  }

  if (direction === 'OUT' && buyerEscrowAddressSet.has(counterpartyAddress)) {
    return {
      type: 'ESCROW_TO_BUYER_ESCROW',
      label: ESCROW_TRANSFER_CASE_LABELS.ESCROW_TO_BUYER_ESCROW,
      expectedFlow: true,
    };
  }

  if (relatedTrades.length > 0) {
    return {
      type: 'ORDER_HASH_MATCHED',
      label: ESCROW_TRANSFER_CASE_LABELS.ORDER_HASH_MATCHED,
      expectedFlow: false,
    };
  }

  if (direction === 'IN') {
    return {
      type: 'UNCLASSIFIED_IN',
      label: ESCROW_TRANSFER_CASE_LABELS.UNCLASSIFIED_IN,
      expectedFlow: false,
    };
  }

  return {
    type: 'UNCLASSIFIED_OUT',
    label: ESCROW_TRANSFER_CASE_LABELS.UNCLASSIFIED_OUT,
    expectedFlow: false,
  };
};

const resolveInsightClientId = async () => {
  if (insightClientIdCache) return insightClientIdCache;

  const fromEnv = String(process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '').trim();
  if (fromEnv) {
    insightClientIdCache = fromEnv;
    return insightClientIdCache;
  }

  const secretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
  if (!secretKey) {
    return '';
  }

  const client = createThirdwebClient({ secretKey });
  try {
    const result = await Engine.searchTransactions({
      client,
      pageSize: 1,
      page: 1,
    });
    const candidate = String(result.transactions?.[0]?.clientId || '').trim();
    if (candidate) {
      insightClientIdCache = candidate;
      return insightClientIdCache;
    }
  } catch (error) {
    console.error('getSellerEscrowTransferHistory: failed to resolve insight client id', error);
  }

  return '';
};

const findSellerById = async (sellerId: string) => {
  const normalizedSellerId = String(sellerId || '').trim();
  if (!normalizedSellerId) return null;

  const mongodbClient = await clientPromise;
  const usersCollection = mongodbClient.db(dbName).collection('users');

  const exactOrConditions: Record<string, unknown>[] = [
    {
      nickname: {
        $regex: `^${escapeRegExp(normalizedSellerId)}$`,
        $options: 'i',
      },
    },
    {
      walletAddress: {
        $regex: `^${escapeRegExp(normalizedSellerId)}$`,
        $options: 'i',
      },
    },
  ];

  const numericId = Number(normalizedSellerId);
  if (Number.isInteger(numericId) && numericId > 0) {
    exactOrConditions.push({ id: numericId });
  }

  const projection = {
    _id: 1,
    id: 1,
    nickname: 1,
    storecode: 1,
    walletAddress: 1,
    createdAt: 1,
    seller: 1,
  };

  const exactMatched = await usersCollection.findOne(
    {
      storecode: 'admin',
      seller: { $exists: true },
      $or: exactOrConditions,
    },
    { projection },
  );

  if (exactMatched) {
    return {
      seller: exactMatched,
      matchMode: 'exact',
      ambiguous: false,
      candidates: [] as Array<{ nickname: string; walletAddress: string }>,
    };
  }

  const partialCandidates = await usersCollection
    .find(
      {
        storecode: 'admin',
        seller: { $exists: true },
        nickname: {
          $regex: escapeRegExp(normalizedSellerId),
          $options: 'i',
        },
      },
      {
        projection: {
          nickname: 1,
          walletAddress: 1,
          seller: 1,
        },
      },
    )
    .limit(5)
    .toArray();

  if (partialCandidates.length === 1) {
    return {
      seller: partialCandidates[0],
      matchMode: 'partial',
      ambiguous: false,
      candidates: [] as Array<{ nickname: string; walletAddress: string }>,
    };
  }

  return {
    seller: null,
    matchMode: '',
    ambiguous: partialCandidates.length > 1,
    candidates: partialCandidates.map((item) => ({
      nickname: String(item?.nickname || ''),
      walletAddress: String(item?.walletAddress || ''),
    })),
  };
};

const resolveSellerEscrowWalletAddress = (sellerUser: any) => {
  const candidates = [
    sellerUser?.seller?.escrowWalletAddress,
    sellerUser?.seller?.escrowWallet?.smartAccountAddress,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (isWalletAddress(normalized)) {
      return normalized;
    }
  }
  return '';
};

const loadOrderContextBySeller = async ({
  sellerWalletAddress,
  sellerEscrowWalletAddress,
}: {
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
}) => {
  const mongodbClient = await clientPromise;
  const buyordersCollection = mongodbClient.db(dbName).collection('buyorders');

  const sellerWalletRegex = {
    $regex: `^${escapeRegExp(sellerWalletAddress)}$`,
    $options: 'i',
  };
  const sellerEscrowWalletRegex = {
    $regex: `^${escapeRegExp(sellerEscrowWalletAddress)}$`,
    $options: 'i',
  };

  const orders = await buyordersCollection
    .find(
      {
        $or: [
          { 'seller.walletAddress': sellerWalletRegex },
          { 'seller.escrowWalletAddress': sellerEscrowWalletRegex },
        ],
      },
      {
        projection: {
          _id: 1,
          tradeId: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          usdtAmount: 1,
          krwAmount: 1,
          rate: 1,
          paymentMethod: 1,
          walletAddress: 1,
          depositName: 1,
          bankName: 1,
          accountNumber: 1,
          accountHolder: 1,
          seller: 1,
          buyer: 1,
          escrowWallet: 1,
          transactionHash: 1,
          escrowTransactionHash: 1,
        },
      },
    )
    .toArray();

  const buyerEscrowAddressSet = new Set<string>();
  const hashToRelatedTradesMap = new Map<string, RelatedTradeInfo[]>();
  const counterpartyToRelatedTradesMap = new Map<string, RelatedTradeInfo[]>();
  const tradeIdToOrderPreviewMap = new Map<string, OrderPreview>();

  const registerHash = (
    txHash: unknown,
    tradeId: string,
    status: string,
    orderId: string,
    reason: string,
  ) => {
    const normalizedHash = normalizeHash(txHash);
    if (!isTransactionHash(normalizedHash) || !tradeId) return;
    pushRelatedTradeInfo(hashToRelatedTradesMap, normalizedHash, {
      tradeId,
      status,
      orderId,
      reason,
    });
  };

  for (const order of orders) {
    const orderId = String(order?._id || '').trim();
    const tradeId = String(order?.tradeId || '').trim();
    const status = String(order?.status || '').trim();
    const usdtAmount = String(order?.usdtAmount ?? '').trim();
    const krwAmount = String(order?.krwAmount ?? '').trim();
    const explicitRate = Number(order?.rate);
    let rate = Number.isFinite(explicitRate) && explicitRate > 0 ? String(explicitRate) : '';
    if (!rate) {
      const numericKrwAmount = Number(krwAmount);
      const numericUsdtAmount = Number(usdtAmount);
      if (Number.isFinite(numericKrwAmount) && Number.isFinite(numericUsdtAmount) && numericUsdtAmount > 0) {
        rate = String(numericKrwAmount / numericUsdtAmount);
      }
    }
    const buyerDepositName = String(
      order?.buyer?.depositName
      || order?.buyer?.bankInfo?.accountHolder
      || order?.buyer?.bankInfo?.depositName
      || order?.depositName
      || '',
    ).trim();
    const sellerBankName = String(order?.seller?.bankInfo?.bankName || order?.bankName || '').trim();
    const sellerAccountNumber = String(order?.seller?.bankInfo?.accountNumber || order?.accountNumber || '').trim();
    const sellerAccountHolder = String(order?.seller?.bankInfo?.accountHolder || order?.accountHolder || '').trim();
    const buyerWalletAddress = String(order?.walletAddress || order?.buyer?.walletAddress || '').trim();
    const buyerEscrowWalletAddress = String(
      order?.buyer?.escrowWalletAddress
      || order?.escrowWallet?.address
      || '',
    ).trim();
    const sellerWalletAddressFromOrder = String(order?.seller?.walletAddress || '').trim();
    const sellerEscrowWalletAddressFromOrder = String(order?.seller?.escrowWalletAddress || '').trim();
    if (tradeId) {
      tradeIdToOrderPreviewMap.set(tradeId, {
        orderId,
        tradeId,
        status,
        createdAt: String(order?.createdAt || ''),
        updatedAt: String(order?.updatedAt || ''),
        paymentMethod: String(order?.paymentMethod || ''),
        usdtAmount,
        krwAmount,
        rate,
        buyerWalletAddress,
        buyerEscrowWalletAddress,
        buyerDepositName,
        sellerWalletAddress: sellerWalletAddressFromOrder,
        sellerEscrowWalletAddress: sellerEscrowWalletAddressFromOrder,
        sellerBankName,
        sellerAccountNumber,
        sellerAccountHolder,
        transactionHash: String(order?.transactionHash || ''),
        escrowTransactionHash: String(order?.escrowTransactionHash || ''),
        buyerLockTransactionHash: String(order?.buyer?.lockTransactionHash || ''),
        sellerLockTransactionHash: String(order?.seller?.lockTransactionHash || ''),
      });
    }
    const buyerEscrowCandidates = [
      order?.buyer?.escrowWalletAddress,
      order?.escrowWallet?.address,
    ];

    for (const addressCandidate of buyerEscrowCandidates) {
      const normalizedAddress = normalizeAddress(addressCandidate);
      if (!isWalletAddress(normalizedAddress)) continue;
      buyerEscrowAddressSet.add(normalizedAddress);
      if (!tradeId) continue;
      pushRelatedTradeInfo(counterpartyToRelatedTradesMap, normalizedAddress, {
        tradeId,
        status,
        orderId,
        reason: 'buyerEscrowAddress',
      });
    }

    registerHash(order?.buyer?.lockTransactionHash, tradeId, status, orderId, 'buyer.lockTransactionHash');
    registerHash(order?.seller?.lockTransactionHash, tradeId, status, orderId, 'seller.lockTransactionHash');
    registerHash(order?.escrowTransactionHash, tradeId, status, orderId, 'escrowTransactionHash');
    registerHash(order?.transactionHash, tradeId, status, orderId, 'transactionHash');
  }

  return {
    orderCount: orders.length,
    buyerEscrowAddressSet,
    hashToRelatedTradesMap,
    counterpartyToRelatedTradesMap,
    tradeIdToOrderPreviewMap,
  };
};

const fetchSellerEscrowTransfers = async ({
  clientId,
  chainId,
  ownerAddress,
  contractAddress,
  page,
  limit,
}: {
  clientId: string;
  chainId: number;
  ownerAddress: string;
  contractAddress: string;
  page: number;
  limit: number;
}) => {
  const params = new URLSearchParams();
  params.append('chain_id', String(chainId));
  params.append('limit', String(limit));
  params.append('page', String(page));
  params.append('owner_address', ownerAddress);
  params.append('contract_address', contractAddress);
  params.append('token_types', 'erc20');
  params.append('sort_order', 'desc');

  const response = await fetch(
    `https://insight.thirdweb.com/v1/tokens/transfers?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        'x-client-id': clientId,
      },
      cache: 'no-store',
    },
  );

  const payload = (await response.json().catch(() => ({}))) as InsightTransferResponse;
  if (!response.ok) {
    throw new Error(String(payload?.error || 'Failed to fetch escrow transfers from thirdweb insight'));
  }
  return payload;
};

const fetchAllSellerEscrowTransfers = async ({
  clientId,
  chainId,
  ownerAddress,
  contractAddress,
}: {
  clientId: string;
  chainId: number;
  ownerAddress: string;
  contractAddress: string;
}) => {
  const insightFetchLimit = 100;
  const firstPage = await fetchSellerEscrowTransfers({
    clientId,
    chainId,
    ownerAddress,
    contractAddress,
    page: 0,
    limit: insightFetchLimit,
  });

  const firstPageData = Array.isArray(firstPage?.data) ? firstPage.data : [];
  const totalPagesFromMeta = Number(firstPage?.meta?.total_pages || 0);
  const totalPages = Math.max(1, Number.isFinite(totalPagesFromMeta) ? totalPagesFromMeta : 1);
  const pageDataMap = new Map<number, InsightTransferItem[]>();
  pageDataMap.set(0, firstPageData);

  const pageNumbers = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 1);
  const batchSize = 5;
  for (let index = 0; index < pageNumbers.length; index += batchSize) {
    const batch = pageNumbers.slice(index, index + batchSize);
    const responses = await Promise.all(
      batch.map(async (pageNumber) => {
        const pageResponse = await fetchSellerEscrowTransfers({
          clientId,
          chainId,
          ownerAddress,
          contractAddress,
          page: pageNumber,
          limit: insightFetchLimit,
        });
        return {
          pageNumber,
          data: Array.isArray(pageResponse?.data) ? pageResponse.data : [],
        };
      }),
    );

    for (const response of responses) {
      pageDataMap.set(response.pageNumber, response.data);
    }
  }

  const items: InsightTransferItem[] = [];
  for (let pageNumber = 0; pageNumber < totalPages; pageNumber += 1) {
    items.push(...(pageDataMap.get(pageNumber) || []));
  }

  return {
    items,
  };
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const sellerId = String(body?.sellerId || '').trim();
  const page = Math.max(1, Math.floor(Number(body?.page || 1) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(body?.limit || 20) || 20)));

  if (!sellerId) {
    return NextResponse.json(
      {
        error: 'sellerId is required',
      },
      { status: 400 },
    );
  }

  try {
    const sellerResult = await findSellerById(sellerId);
    if (!sellerResult?.seller) {
      return NextResponse.json(
        {
          error: sellerResult?.ambiguous
            ? '동일한 조건의 판매자 후보가 여러 명입니다.'
            : '판매자를 찾지 못했습니다.',
          candidates: sellerResult?.candidates || [],
        },
        { status: 404 },
      );
    }

    const sellerUser = sellerResult.seller;
    const sellerWalletAddress = String(sellerUser?.walletAddress || '').trim();
    const sellerEscrowWalletAddress = resolveSellerEscrowWalletAddress(sellerUser);

    if (!isWalletAddress(sellerWalletAddress)) {
      return NextResponse.json(
        {
          error: '판매자 지갑주소가 올바르지 않습니다.',
        },
        { status: 400 },
      );
    }

    if (!isWalletAddress(sellerEscrowWalletAddress)) {
      return NextResponse.json(
        {
          error: '판매자 에스크로 지갑주소가 설정되어 있지 않습니다.',
        },
        { status: 400 },
      );
    }

    const chainConfig = resolveChainConfig();
    const insightClientId = await resolveInsightClientId();
    if (!insightClientId) {
      return NextResponse.json(
        {
          error: 'thirdweb insight client id is not configured',
        },
        { status: 500 },
      );
    }

    const {
      orderCount,
      buyerEscrowAddressSet,
      hashToRelatedTradesMap,
      counterpartyToRelatedTradesMap,
      tradeIdToOrderPreviewMap,
    } = await loadOrderContextBySeller({
      sellerWalletAddress,
      sellerEscrowWalletAddress,
    });

    const allTransfersResponse = await fetchAllSellerEscrowTransfers({
      clientId: insightClientId,
      chainId: chainConfig.chainId,
      ownerAddress: sellerEscrowWalletAddress,
      contractAddress: chainConfig.usdtContractAddress,
    });

    const sellerEscrowWalletAddressLower = normalizeAddress(sellerEscrowWalletAddress);
    const sellerWalletAddressLower = normalizeAddress(sellerWalletAddress);

    const transferItems = allTransfersResponse.items;
    const allTransfers = transferItems.map((item) => {
      const fromAddress = normalizeAddress(item.from_address);
      const toAddress = normalizeAddress(item.to_address);
      const direction: TransferDirection =
        fromAddress === sellerEscrowWalletAddressLower ? 'OUT' : 'IN';
      const counterpartyAddress = direction === 'OUT' ? toAddress : fromAddress;
      const txHash = normalizeHash(item.transaction_hash);

      const hashRelatedTrades = hashToRelatedTradesMap.get(txHash) || [];
      const counterpartyRelatedTrades = counterpartyToRelatedTradesMap.get(counterpartyAddress) || [];
      const relatedTrades = buildMergedRelatedTrades(hashRelatedTrades, counterpartyRelatedTrades);
      const relatedTradesWithOrder = relatedTrades.map((trade) => ({
        ...trade,
        order: trade.tradeId ? tradeIdToOrderPreviewMap.get(trade.tradeId) || null : null,
      }));

      const caseDetail = classifyTransferCase({
        direction,
        counterpartyAddress,
        sellerWalletAddress: sellerWalletAddressLower,
        buyerEscrowAddressSet,
        relatedTrades: relatedTradesWithOrder,
      });

      const amountRaw = String(item.amount || '0');
      const amountFormatted = formatTokenAmountFromRaw(amountRaw, chainConfig.usdtDecimals);
      const amountRawBigInt = parseRawAmountToBigInt(amountRaw);
      const signedAmountRawBigInt = direction === 'IN' ? amountRawBigInt : amountRawBigInt * -1n;
      const signedAmountRaw = signedAmountRawBigInt.toString();
      const signedAmountFormatted = formatTokenAmountFromRaw(signedAmountRaw, chainConfig.usdtDecimals);

      return {
        transactionHash: txHash,
        blockNumber: String(item.block_number || ''),
        blockTimestamp: String(item.block_timestamp || ''),
        direction,
        fromAddress,
        toAddress,
        counterpartyAddress,
        amountRaw,
        amountFormatted,
        signedAmountRaw,
        signedAmountFormatted,
        runningBalanceRaw: '0',
        runningBalanceFormatted: '0',
        transferType: String(item.transfer_type || ''),
        tokenType: String(item.token_type || ''),
        caseType: caseDetail.type,
        caseLabel: caseDetail.label,
        isExpectedFlow: caseDetail.expectedFlow,
        relatedTrades: relatedTradesWithOrder,
      };
    });

    const transfersAsc = [...allTransfers].reverse();
    let totalInRaw = 0n;
    let totalOutRaw = 0n;
    let runningBalanceRaw = 0n;
    for (const transfer of transfersAsc) {
      const signedAmountRaw = parseRawAmountToBigInt(transfer.signedAmountRaw);
      if (signedAmountRaw > 0n) {
        totalInRaw += signedAmountRaw;
      }
      if (signedAmountRaw < 0n) {
        totalOutRaw += signedAmountRaw * -1n;
      }
      runningBalanceRaw += signedAmountRaw;
      transfer.runningBalanceRaw = runningBalanceRaw.toString();
      transfer.runningBalanceFormatted = formatTokenAmountFromRaw(
        transfer.runningBalanceRaw,
        chainConfig.usdtDecimals,
      );
    }
    const transfersWithRunningBalance = [...transfersAsc].reverse();

    const totalItems = transfersWithRunningBalance.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit;
    const transfers = transfersWithRunningBalance.slice(startIndex, endIndex);

    const caseSummaryMap = new Map<TransferCaseType, number>();
    for (const transfer of transfersWithRunningBalance) {
      const current = caseSummaryMap.get(transfer.caseType as TransferCaseType) || 0;
      caseSummaryMap.set(transfer.caseType as TransferCaseType, current + 1);
    }
    const caseSummary = Array.from(caseSummaryMap.entries())
      .map(([caseType, count]) => ({
        caseType,
        caseLabel: ESCROW_TRANSFER_CASE_LABELS[caseType],
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const netChangeRaw = totalInRaw - totalOutRaw;

    return NextResponse.json({
      result: {
        seller: {
          id: Number(sellerUser?.id || 0),
          nickname: String(sellerUser?.nickname || ''),
          storecode: String(sellerUser?.storecode || ''),
          walletAddress: sellerWalletAddress,
          escrowWalletAddress: sellerEscrowWalletAddress,
          matchMode: sellerResult.matchMode,
        },
        chain: chainConfig.chain,
        token: {
          symbol: 'USDT',
          contractAddress: chainConfig.usdtContractAddress,
          decimals: chainConfig.usdtDecimals,
        },
        pagination: {
          page: currentPage,
          limit,
          totalItems,
          totalPages,
        },
        orderContext: {
          orderCount,
          expectedCounterpartyCount: buyerEscrowAddressSet.size + 1, // seller wallet + buyer escrow wallets
        },
        overall: {
          totalInRaw: totalInRaw.toString(),
          totalInFormatted: formatTokenAmountFromRaw(totalInRaw.toString(), chainConfig.usdtDecimals),
          totalOutRaw: totalOutRaw.toString(),
          totalOutFormatted: formatTokenAmountFromRaw(totalOutRaw.toString(), chainConfig.usdtDecimals),
          netChangeRaw: netChangeRaw.toString(),
          netChangeFormatted: formatTokenAmountFromRaw(netChangeRaw.toString(), chainConfig.usdtDecimals),
          runningBalanceRaw: runningBalanceRaw.toString(),
          runningBalanceFormatted: formatTokenAmountFromRaw(runningBalanceRaw.toString(), chainConfig.usdtDecimals),
        },
        caseSummary,
        transfers,
      },
    });
  } catch (error) {
    console.error('getSellerEscrowTransferHistory failed', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get seller escrow transfer history',
      },
      { status: 500 },
    );
  }
}
