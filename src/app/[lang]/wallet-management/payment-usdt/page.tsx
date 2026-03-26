'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Manrope, Playfair_Display } from 'next/font/google';
import { toast } from 'react-hot-toast';
import {
  getContract,
  sendAndConfirmTransaction,
} from 'thirdweb';
import {
  balanceOf,
  transfer,
} from 'thirdweb/extensions/erc20';
import {
  ethereum,
  polygon,
  arbitrum,
  bsc,
  type Chain,
} from 'thirdweb/chains';
import {
  AutoConnect,
  useActiveAccount,
  useActiveWallet,
  useConnectedWallets,
} from 'thirdweb/react';
import { getUserPhoneNumber } from 'thirdweb/wallets/in-app';

import { client } from '@/app/client';
import { useClientWallets } from '@/lib/useClientWallets';
import { useClientSettings } from '@/components/ClientSettingsProvider';
import { createWalletSignatureAuthPayload } from '@/lib/security/walletSignature';
import WalletManagementBottomNav from '@/components/wallet-management/WalletManagementBottomNav';
import StoreMemberLinkCard from '@/components/wallet-management/StoreMemberLinkCard';
import WalletConnectPrompt from '@/components/wallet-management/WalletConnectPrompt';
import StoreMemberSummaryCard from '@/components/wallet-management/StoreMemberSummaryCard';
import WalletSummaryCard from '@/components/wallet-management/WalletSummaryCard';
import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';

type NetworkKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';

type NetworkOption = {
  id: NetworkKey;
  label: string;
  chain: Chain;
  contractAddress: string;
  tokenDecimals: number;
  explorerBaseUrl: string;
};

type Merchant = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  paymentWalletAddress: string;
  adminWalletAddress: string;
  usdtToKrwRate: number;
};

type PaymentRecord = {
  id: string;
  paymentId: string;
  productId: string;
  storecode: string;
  storeName: string;
  chain: NetworkKey;
  fromWalletAddress: string;
  toWalletAddress: string;
  usdtAmount: number;
  krwAmount: number;
  exchangeRate: number;
  transactionHash: string;
  createdAt: string;
  confirmedAt: string;
  member?: {
    nickname?: string;
    storecode?: string;
    buyer?: {
      bankInfo?: BuyerBankInfoSnapshot | null;
    } | null;
  } | null;
};

type BuyerBankInfoSnapshot = {
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  depositBankName?: string;
  depositBankAccountNumber?: string;
  depositName?: string;
  [key: string]: unknown;
};

type MemberProfile = {
  nickname: string;
  storecode: string;
  buyer: {
    bankInfo?: BuyerBankInfoSnapshot;
    depositBankName?: string;
    depositBankAccountNumber?: string;
    depositName?: string;
    [key: string]: unknown;
  } | null;
};

const displayFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const WALLET_AUTH_OPTIONS = ['phone'];
const QUICK_USDT_AMOUNTS = [10, 30, 50, 100, 300, 500];
const MEMBER_PROFILE_LOADING_MIN_MS = 5000;

const NETWORK_BY_KEY: Record<NetworkKey, NetworkOption> = {
  ethereum: {
    id: 'ethereum',
    label: 'Ethereum',
    chain: ethereum,
    contractAddress: ethereumContractAddressUSDT,
    tokenDecimals: 6,
    explorerBaseUrl: 'https://etherscan.io/tx/',
  },
  polygon: {
    id: 'polygon',
    label: 'Polygon',
    chain: polygon,
    contractAddress: polygonContractAddressUSDT,
    tokenDecimals: 6,
    explorerBaseUrl: 'https://polygonscan.com/tx/',
  },
  arbitrum: {
    id: 'arbitrum',
    label: 'Arbitrum',
    chain: arbitrum,
    contractAddress: arbitrumContractAddressUSDT,
    tokenDecimals: 6,
    explorerBaseUrl: 'https://arbiscan.io/tx/',
  },
  bsc: {
    id: 'bsc',
    label: 'BSC',
    chain: bsc,
    contractAddress: bscContractAddressUSDT,
    tokenDecimals: 18,
    explorerBaseUrl: 'https://bscscan.com/tx/',
  },
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

const shortAddress = (value: string) => {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const normalizeUsdtInput = (value: string) => {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const hasTrailingDot = cleaned.endsWith('.');
  const [wholeRaw, decimalRaw = ''] = cleaned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '');
  const decimal = decimalRaw.slice(0, 6);
  if (hasTrailingDot) {
    return `${whole || '0'}.`;
  }
  if (decimal.length > 0) {
    return `${whole || '0'}.${decimal}`;
  }
  return whole;
};

const toSafeUsdtAmount = (value: string) => {
  const parsed = Number(String(value || '').replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Number(parsed.toFixed(6));
  return normalized > 0 ? normalized : 0;
};

const formatUsdtInputFromBalance = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const floored = Math.floor(value * 1_000_000) / 1_000_000;
  if (floored <= 0) return '';
  return floored.toFixed(6);
};

const formatUsdtInputFromNumber = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const floored = Math.floor(value * 1_000_000) / 1_000_000;
  if (floored <= 0) return '';
  return floored.toFixed(6);
};

const formatKrw = (value: number) => `${value.toLocaleString()}원`;
const formatKrwNumber = (value: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value) || 0);
const formatUsdtNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(Number(value) || 0);
const formatUsdt = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`;
const formatRate = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const waitFor = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), ms);
  });

const generatePrepareRequestKey = () => {
  const randomPart =
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `wallet-payment-${randomPart}`;
};

type PendingPaymentConfirm = {
  paymentRequestId: string;
  fromWalletAddress: string;
  storecode: string;
  chain: NetworkKey;
  usdtAmount: number;
  createdAt: string;
  productId?: string;
  transactionHash?: string;
  lastError?: string;
  lastTriedAt?: string;
};

const PENDING_PAYMENT_CONFIRM_STORAGE_KEY = 'wallet-usdt-pending-confirms:v1';
const PENDING_PAYMENT_CONFIRM_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const PENDING_PAYMENT_CONFIRM_RETRY_DELAYS_MS = [0, 1200, 2800] as const;

const readPendingPaymentConfirms = (): PendingPaymentConfirm[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(PENDING_PAYMENT_CONFIRM_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed
      .map((item) => {
        if (!isRecord(item)) return null;
        const paymentRequestId = String(item.paymentRequestId || '').trim();
        const fromWalletAddress = String(item.fromWalletAddress || '').trim();
        const storecode = String(item.storecode || '').trim();
        const chainCandidate = String(item.chain || '').trim().toLowerCase();
        const createdAt = String(item.createdAt || '').trim();
        const createdAtMs = new Date(createdAt).getTime();
        if (
          !paymentRequestId ||
          !isWalletAddress(fromWalletAddress) ||
          !storecode ||
          !isNetworkKey(chainCandidate) ||
          !Number.isFinite(createdAtMs) ||
          now - createdAtMs > PENDING_PAYMENT_CONFIRM_MAX_AGE_MS
        ) {
          return null;
        }

        const transactionHash = String(item.transactionHash || '').trim();
        const productId = String(item.productId || item.product_id || '').trim();
        const lastError = String(item.lastError || '').trim();
        const lastTriedAt = String(item.lastTriedAt || '').trim();
        const usdtAmount = toSafeNumber(item.usdtAmount);
        return {
          paymentRequestId,
          fromWalletAddress,
          storecode,
          chain: chainCandidate,
          usdtAmount,
          createdAt,
          ...(productId ? { productId } : {}),
          ...(transactionHash ? { transactionHash } : {}),
          ...(lastError ? { lastError } : {}),
          ...(lastTriedAt ? { lastTriedAt } : {}),
        } as PendingPaymentConfirm;
      })
      .filter((item): item is PendingPaymentConfirm => Boolean(item));
  } catch (error) {
    console.error('Failed to read pending payment confirm queue', error);
    return [];
  }
};

const writePendingPaymentConfirms = (items: PendingPaymentConfirm[]) => {
  if (typeof window === 'undefined') return;

  try {
    if (!Array.isArray(items) || items.length === 0) {
      window.localStorage.removeItem(PENDING_PAYMENT_CONFIRM_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_PAYMENT_CONFIRM_STORAGE_KEY, JSON.stringify(items.slice(0, 30)));
  } catch (error) {
    console.error('Failed to write pending payment confirm queue', error);
  }
};

const upsertPendingPaymentConfirm = (item: PendingPaymentConfirm) => {
  const current = readPendingPaymentConfirms();
  const deduped = current.filter((entry) => entry.paymentRequestId !== item.paymentRequestId);
  writePendingPaymentConfirms([item, ...deduped]);
};

const removePendingPaymentConfirm = (paymentRequestId: string) => {
  const normalizedPaymentRequestId = String(paymentRequestId || '').trim();
  if (!normalizedPaymentRequestId) return;
  const current = readPendingPaymentConfirms();
  writePendingPaymentConfirms(current.filter((entry) => entry.paymentRequestId !== normalizedPaymentRequestId));
};

const resolveBuyerBankInfo = (buyer: unknown): BuyerBankInfoSnapshot | null => {
  if (!isRecord(buyer)) return null;

  const bankInfoFromBuyer = buyer.bankInfo;
  if (isRecord(bankInfoFromBuyer)) {
    return bankInfoFromBuyer as BuyerBankInfoSnapshot;
  }

  const depositBankName = String(buyer.depositBankName || '').trim();
  const depositBankAccountNumber = String(buyer.depositBankAccountNumber || '').trim();
  const depositName = String(buyer.depositName || '').trim();

  if (!depositBankName && !depositBankAccountNumber && !depositName) {
    return null;
  }

  return {
    bankName: depositBankName,
    accountNumber: depositBankAccountNumber,
    accountHolder: depositName,
    depositBankName,
    depositBankAccountNumber,
    depositName,
  };
};

const formatPaymentMemberName = (member: PaymentRecord['member']) => {
  const nickname = String(member?.nickname || '').trim();
  const memberStorecode = String(member?.storecode || '').trim();
  if (nickname && memberStorecode) {
    return `${nickname} (${memberStorecode})`;
  }
  return nickname || memberStorecode || '-';
};

const isNetworkKey = (value: string): value is NetworkKey =>
  value === 'ethereum' || value === 'polygon' || value === 'arbitrum' || value === 'bsc';

const toSafeNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizePaymentRecord = (value: unknown): PaymentRecord | null => {
  if (!isRecord(value)) return null;

  const chainCandidate = String(value.chain || '').trim().toLowerCase();
  const chain = isNetworkKey(chainCandidate) ? chainCandidate : 'polygon';

  return {
    id: String(value.id || value._id || '').trim(),
    paymentId: String(value.paymentId || '').trim(),
    productId: String(value.productId || value.product_id || '').trim(),
    storecode: String(value.storecode || '').trim(),
    storeName: String(value.storeName || value.storecode || '').trim(),
    chain,
    fromWalletAddress: String(value.fromWalletAddress || '').trim(),
    toWalletAddress: String(value.toWalletAddress || '').trim(),
    usdtAmount: toSafeNumber(value.usdtAmount),
    krwAmount: toSafeNumber(value.krwAmount),
    exchangeRate: toSafeNumber(value.exchangeRate),
    transactionHash: String(value.transactionHash || '').trim(),
    createdAt: String(value.createdAt || '').trim(),
    confirmedAt: String(value.confirmedAt || '').trim(),
    member: isRecord(value.member) ? (value.member as PaymentRecord['member']) : null,
  };
};

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

const formatTimeAgo = (value: string, nowMs: number = Date.now()) => {
  if (!value) return '-';
  const parsedMs = new Date(value).getTime();
  if (Number.isNaN(parsedMs)) return '-';

  const diffMs = nowMs - parsedMs;
  const absSeconds = Math.floor(Math.abs(diffMs) / 1000);
  if (absSeconds < 10) {
    return diffMs >= 0 ? '방금 전' : '곧';
  }

  const units: Array<{ seconds: number; label: string }> = [
    { seconds: 60 * 60 * 24 * 365, label: '년' },
    { seconds: 60 * 60 * 24 * 30, label: '개월' },
    { seconds: 60 * 60 * 24, label: '일' },
    { seconds: 60 * 60, label: '시간' },
    { seconds: 60, label: '분' },
    { seconds: 1, label: '초' },
  ];

  const unit = units.find((item) => absSeconds >= item.seconds) || units[units.length - 1];
  const amount = Math.floor(absSeconds / unit.seconds);
  return diffMs >= 0 ? `${amount}${unit.label} 전` : `${amount}${unit.label} 후`;
};

type ExchangeRateItem = {
  id: string;
  name: string;
  price: number;
};

const resolveExchangeRate = (payload: any) => {
  const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
  const numericItems: ExchangeRateItem[] = items
    .filter((item: any) => Number.isFinite(item?.price) && Number(item?.price) > 0)
    .map((item: any): ExchangeRateItem => ({
      id: String(item.id || ''),
      name: String(item.name || item.id || ''),
      price: Number(item.price),
    }));

  if (numericItems.length === 0) {
    return null;
  }

  const preferredOrder = ['upbit', 'bithumb', 'korbit'];
  const preferred = preferredOrder
    .map((id) => numericItems.find((item) => item.id === id))
    .find((item): item is ExchangeRateItem => Boolean(item));

  if (preferred) {
    return {
      source: preferred.name,
      price: Number(preferred.price.toFixed(2)),
    };
  }

  const avgPrice =
    numericItems.reduce((sum, item) => sum + item.price, 0) / numericItems.length;

  return {
    source: 'Average',
    price: Number(avgPrice.toFixed(2)),
  };
};

export default function PaymentUsdtPage({
  params,
}: {
  params: { lang: string };
}) {
  const lang = params?.lang || 'ko';
  const searchParams = useSearchParams();
  const storecodeFromQuery = String(searchParams?.get('storecode') || '').trim();
  const memberIdFromQuery = String(searchParams?.get('mb_id') || '').trim().slice(0, 24);
  const amountKrwFromQuery = String(searchParams?.get('amount_krw') || '').trim().replace(/,/g, '').replace(/[^\d]/g, '');
  const productIdFromQuery = String(searchParams?.get('product_id') || '').trim().slice(0, 120);
  const hasStorecodeParam = Boolean(storecodeFromQuery);
  const shouldHideWalletSummaryForFixedPay = Boolean(amountKrwFromQuery);
  const disconnectRedirectPath = useMemo(() => {
    const query = new URLSearchParams();
    if (storecodeFromQuery) {
      query.set('storecode', storecodeFromQuery);
    }
    if (memberIdFromQuery) {
      query.set('mb_id', memberIdFromQuery);
    }
    if (amountKrwFromQuery) {
      query.set('amount_krw', amountKrwFromQuery);
    }
    if (productIdFromQuery) {
      query.set('product_id', productIdFromQuery);
    }
    const queryString = query.toString();
    return `/${lang}/wallet-management${queryString ? `?${queryString}` : ''}`;
  }, [amountKrwFromQuery, lang, memberIdFromQuery, productIdFromQuery, storecodeFromQuery]);
  const { chain } = useClientSettings();
  const rawActiveAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const connectedWallets = useConnectedWallets();
  const activeAccount = activeWallet?.getAccount?.() ?? rawActiveAccount;
  const { wallet, wallets, smartAccountEnabled } = useClientWallets({
    authOptions: WALLET_AUTH_OPTIONS,
    sponsorGas: true,
    defaultSmsCountryCode: 'KR',
  });
  const signatureAccount = useMemo(() => {
    const candidates: Array<unknown> = [
      activeWallet?.getAccount?.(),
      activeAccount,
      activeWallet?.getAdminAccount?.(),
    ];
    for (const walletItem of connectedWallets) {
      candidates.push(walletItem?.getAccount?.());
      candidates.push(walletItem?.getAdminAccount?.());
    }

    for (const candidate of candidates) {
      const account = candidate as {
        address?: string;
        signMessage?: (options: {
          message: string;
          originalMessage?: string;
          chainId?: number;
        }) => Promise<string>;
      } | null | undefined;

      if (account?.address && typeof account.signMessage === 'function') {
        return account;
      }
    }

    return null;
  }, [activeAccount, activeWallet, connectedWallets]);

  const activeNetwork = useMemo(
    () => NETWORK_BY_KEY[chain] ?? NETWORK_BY_KEY.polygon,
    [chain]
  );

  const contract = useMemo(
    () =>
      getContract({
        client,
        chain: activeNetwork.chain,
        address: activeNetwork.contractAddress,
      }),
    [activeNetwork]
  );

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedStorecode, setSelectedStorecode] = useState('');
  const buildSignedRequestBody = useCallback(
    async ({
      path,
      payload,
      requestStorecode,
    }: {
      path: string;
      payload: Record<string, unknown>;
      requestStorecode?: string;
    }) => {
      if (!signatureAccount?.address || typeof signatureAccount?.signMessage !== 'function') {
        throw new Error('서명 가능한 스마트 지갑을 먼저 연결해 주세요.');
      }

      const auth = await createWalletSignatureAuthPayload({
        account: signatureAccount,
        storecode: requestStorecode || selectedStorecode || storecodeFromQuery || 'admin',
        path,
        method: 'POST',
      });

      return {
        ...payload,
        auth,
      };
    },
    [signatureAccount, selectedStorecode, storecodeFromQuery],
  );

  const [balance, setBalance] = useState(0);

  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [exchangeRate, setExchangeRate] = useState(0);
  const [exchangeRateSource, setExchangeRateSource] = useState('');
  const [loadingRate, setLoadingRate] = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState('');
  const [isStorePickerOpen, setIsStorePickerOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentTab, setPaymentTab] = useState<'pay' | 'history'>('pay');

  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [latestPaymentRecord, setLatestPaymentRecord] = useState<PaymentRecord | null>(null);
  const [justPaidRecordId, setJustPaidRecordId] = useState('');
  const [myMemberProfile, setMyMemberProfile] = useState<MemberProfile | null>(null);
  const [loadingMemberProfile, setLoadingMemberProfile] = useState(false);
  const [memberProfileError, setMemberProfileError] = useState<string | null>(null);
  const [signupNickname, setSignupNickname] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signingUpMember, setSigningUpMember] = useState(false);
  const memberProfileRequestIdRef = useRef(0);
  const flushingPendingConfirmRef = useRef(false);
  const submitPaymentLockRef = useRef(false);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const memberStatusCardRef = useRef<HTMLDivElement | null>(null);

  const clampUsdtInputToBalance = useCallback((rawValue: string) => {
    const normalized = normalizeUsdtInput(rawValue);
    if (!normalized) return '';

    // Keep intermediate decimal input states (e.g. "0", "0.", "0.0") so users can continue typing.
    if (/^0(?:\.0*)?$/.test(normalized)) {
      return normalized;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return '';
    if (balance > 0 && parsed > balance) {
      return formatUsdtInputFromBalance(balance);
    }

    return normalized;
  }, [balance]);

  const selectedMerchant = useMemo(
    () => merchants.find((item) => item.storecode === selectedStorecode) || null,
    [merchants, selectedStorecode]
  );

  const filteredMerchants = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return merchants;
    return merchants.filter((item) => {
      return (
        item.storeName.toLowerCase().includes(keyword) ||
        item.storecode.toLowerCase().includes(keyword)
      );
    });
  }, [merchants, searchKeyword]);

  const fullBalanceAmountInput = useMemo(
    () => formatUsdtInputFromBalance(balance),
    [balance],
  );
  const fixedKrwAmount = useMemo(() => {
    const parsed = Number(amountKrwFromQuery);
    if (!Number.isFinite(parsed)) return 0;
    return parsed > 0 ? Math.floor(parsed) : 0;
  }, [amountKrwFromQuery]);
  const isFixedKrwPaymentMode = fixedKrwAmount > 0;
  const fixedKrwUsdtAmountInput = useMemo(() => {
    if (!isFixedKrwPaymentMode || exchangeRate <= 0) {
      return '';
    }
    return formatUsdtInputFromNumber(fixedKrwAmount / exchangeRate);
  }, [exchangeRate, fixedKrwAmount, isFixedKrwPaymentMode]);
  const shouldForceFullBalanceAmount = Boolean(!isFixedKrwPaymentMode && hasStorecodeParam && selectedMerchant);
  const shouldAutoSetAmount = isFixedKrwPaymentMode || shouldForceFullBalanceAmount;
  const usdtAmount = useMemo(() => {
    if (isFixedKrwPaymentMode) {
      return toSafeUsdtAmount(fixedKrwUsdtAmountInput);
    }
    if (shouldForceFullBalanceAmount) {
      return toSafeUsdtAmount(fullBalanceAmountInput);
    }
    return toSafeUsdtAmount(amountInput);
  }, [amountInput, fixedKrwUsdtAmountInput, fullBalanceAmountInput, isFixedKrwPaymentMode, shouldForceFullBalanceAmount]);
  const amountInputDisplay = isFixedKrwPaymentMode
    ? fixedKrwUsdtAmountInput
    : shouldForceFullBalanceAmount
      ? fullBalanceAmountInput
      : amountInput;
  const krwAmount = useMemo(() => {
    if (isFixedKrwPaymentMode) {
      return fixedKrwAmount;
    }
    if (exchangeRate <= 0 || usdtAmount <= 0) {
      return 0;
    }
    return Math.round(usdtAmount * exchangeRate);
  }, [exchangeRate, fixedKrwAmount, isFixedKrwPaymentMode, usdtAmount]);
  const hasEnoughBalance = usdtAmount > 0 && usdtAmount <= balance;
  const paymentTabLabel = useMemo(
    () => (paymentTab === 'pay' ? '결제하기' : '결제내역'),
    [paymentTab],
  );
  const memberBankInfoSnapshot = useMemo(
    () => resolveBuyerBankInfo(myMemberProfile?.buyer),
    [myMemberProfile?.buyer]
  );
  const hasMemberProfile = Boolean(myMemberProfile);
  const needsMerchantSelectionFirst = !hasStorecodeParam && !selectedMerchant;
  const needsMemberSignupFirst = Boolean(
    activeAccount?.address &&
      selectedMerchant &&
      !loadingMemberProfile &&
      !hasMemberProfile
  );
  const shouldLockAmountInputs =
    !selectedMerchant || loadingMemberProfile || needsMemberSignupFirst;
  const shouldDisableAmountEditing = shouldLockAmountInputs || shouldAutoSetAmount;
  const isPaymentReady = Boolean(
    activeAccount?.address &&
      selectedMerchant &&
      !loadingMemberProfile &&
      hasMemberProfile &&
      usdtAmount > 0 &&
      exchangeRate > 0 &&
      krwAmount > 0 &&
      hasEnoughBalance
  );
  const latestPaymentTxUrl = useMemo(() => {
    if (!latestPaymentRecord?.transactionHash) return '';
    return `${NETWORK_BY_KEY[latestPaymentRecord.chain]?.explorerBaseUrl || ''}${latestPaymentRecord.transactionHash}`;
  }, [latestPaymentRecord]);
  const primaryActionLabel = useMemo(() => {
    if (paying) {
      return '결제 처리 중...';
    }
    if (!activeAccount?.address) {
      return '지갑 연결 후 진행';
    }
    if (!selectedMerchant) {
      return hasStorecodeParam ? '상점 정보 확인 필요' : '가맹점 선택하고 계속';
    }
    if (loadingMemberProfile) {
      return '회원 정보 확인 중...';
    }
    if (!hasMemberProfile) {
      return '회원정보 연동하기';
    }
    if (isFixedKrwPaymentMode && exchangeRate <= 0) {
      return '환율 로딩 중...';
    }
    if (usdtAmount <= 0) {
      if (isFixedKrwPaymentMode) {
        return '결제 수량 계산 중...';
      }
      if (shouldForceFullBalanceAmount) {
        return 'USDT 잔액이 필요합니다';
      }
      return 'USDT 수량 입력하기';
    }
    if (exchangeRate <= 0) {
      return '환율 로딩 중...';
    }
    if (krwAmount <= 0) {
      return '수량 조정 필요';
    }
    if (!hasEnoughBalance) {
      return 'USDT 충전 후 결제';
    }
    return `${formatUsdt(usdtAmount)} 결제하기`;
  }, [
    paying,
    activeAccount?.address,
    selectedMerchant,
    hasStorecodeParam,
    loadingMemberProfile,
    hasMemberProfile,
    isFixedKrwPaymentMode,
    shouldForceFullBalanceAmount,
    usdtAmount,
    exchangeRate,
    krwAmount,
    hasEnoughBalance,
  ]);
  const primaryActionGuide = useMemo(() => {
    if (!activeAccount?.address) {
      return '지갑을 연결하면 상점 선택과 결제 진행이 가능합니다.';
    }
    if (!selectedMerchant) {
      return hasStorecodeParam
        ? '요청한 상점을 확인한 뒤 결제를 진행해 주세요.'
        : '먼저 결제할 가맹점을 선택해 주세요.';
    }
    if (loadingMemberProfile) {
      return '선택한 가맹점 회원 여부를 확인하고 있습니다.';
    }
    if (!hasMemberProfile) {
      return '가맹점 회원 아이디와 비밀번호를 입력해 회원정보 연동을 완료해야 결제를 진행할 수 있습니다.';
    }
    if (isFixedKrwPaymentMode && exchangeRate <= 0) {
      return '지정된 결제 금액에 맞는 USDT 수량을 계산하고 있습니다.';
    }
    if (usdtAmount <= 0) {
      if (isFixedKrwPaymentMode) {
        return '지정된 결제 금액 기준으로 결제 수량을 계산하고 있습니다.';
      }
      if (shouldForceFullBalanceAmount) {
        return '현재 모드에서는 잔고 전체만 전송할 수 있습니다. 먼저 USDT 잔고를 충전해 주세요.';
      }
      return '결제할 USDT 수량을 입력해 주세요.';
    }
    if (exchangeRate <= 0) {
      return '실시간 환율을 불러오는 중입니다. 잠시만 기다려 주세요.';
    }
    if (krwAmount <= 0) {
      return '환산 금액이 0원이 되지 않도록 USDT 수량을 조정해 주세요.';
    }
    if (!hasEnoughBalance) {
      return `잔액이 부족합니다. 현재 필요 수량은 ${formatUsdt(usdtAmount)} 입니다.`;
    }
    return '확인 모달에서 최종 금액을 확인한 뒤 결제를 완료할 수 있습니다.';
  }, [
    activeAccount?.address,
    selectedMerchant,
    hasStorecodeParam,
    loadingMemberProfile,
    hasMemberProfile,
    isFixedKrwPaymentMode,
    shouldForceFullBalanceAmount,
    usdtAmount,
    exchangeRate,
    krwAmount,
    hasEnoughBalance,
  ]);
  const paymentAmountDescription =
    isFixedKrwPaymentMode
      ? exchangeRate > 0 && usdtAmount > 0
        ? `${formatUsdt(usdtAmount)} · 환율 ${formatRate(exchangeRate)}`
        : '지정된 결제 금액 기준으로 USDT 수량을 계산하고 있습니다.'
      : usdtAmount > 0
      ? `${formatUsdt(usdtAmount)}${exchangeRate > 0 ? ` · 환율 ${formatRate(exchangeRate)}` : loadingRate ? ' · 환율 확인 중' : ''}`
      : shouldForceFullBalanceAmount
        ? balance > 0
          ? '잔고 기준으로 결제 수량이 자동 적용됩니다.'
          : '결제에 사용할 USDT 잔액이 없습니다.'
        : '결제 수량을 입력하면 예상 결제 금액이 표시됩니다.';
  const merchantStatusSummary = selectedMerchant
    ? `${selectedMerchant.storeName}${selectedMerchant.storecode ? ` · ${selectedMerchant.storecode}` : ''}`
    : hasStorecodeParam
      ? '상점 정보 확인 필요'
      : '상점 선택 필요';
  const memberStatusSummary = !selectedMerchant
    ? '상점 선택 후 확인'
    : loadingMemberProfile
      ? '확인 중...'
      : hasMemberProfile
        ? `${myMemberProfile?.nickname || '연동 완료'}${
            memberBankInfoSnapshot?.accountHolder || memberBankInfoSnapshot?.depositName
              ? ` · ${memberBankInfoSnapshot?.accountHolder || memberBankInfoSnapshot?.depositName}`
              : ''
          }`
        : '연동 필요';
  const balanceStatusSummary = !activeAccount?.address
    ? '지갑 연결 필요'
    : usdtAmount <= 0
      ? isFixedKrwPaymentMode
        ? exchangeRate > 0
          ? '결제 수량 계산 중'
          : '환율 확인 중'
        : shouldForceFullBalanceAmount
        ? balance > 0
          ? '자동 설정 준비'
          : '잔액 없음'
        : '수량 입력 필요'
      : hasEnoughBalance
        ? '결제 가능'
        : '잔액 부족';
  const paymentActionHint = isPaymentReady
    ? '결제 버튼을 누르면 최종 확인 후 전송됩니다.'
    : primaryActionGuide;

  const loadMerchants = useCallback(async () => {
    setLoadingMerchants(true);
    try {
      const response = await fetch('/api/store/getAllStores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 200,
          page: 1,
          searchStore: '',
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error('상점 목록을 불러오지 못했습니다.');
      }

      const source = Array.isArray(data?.result?.stores) ? data.result.stores : [];
      const nextMerchants: Merchant[] = source
        .map((store: any) => {
          const paymentWalletAddress = String(store?.paymentWalletAddress || '').trim();

          return {
            storecode: String(store?.storecode || '').trim(),
            storeName: String(store?.storeName || store?.storecode || '상점'),
            storeLogo: String(store?.storeLogo || ''),
            paymentWalletAddress,
            adminWalletAddress: String(store?.adminWalletAddress || '').trim(),
            usdtToKrwRate: toSafeNumber(store?.usdtToKrwRate),
          };
        })
        .filter((item: Merchant) => Boolean(item.storecode && item.paymentWalletAddress));

      setMerchants(nextMerchants);
      setSelectedStorecode((prev) => {
        if (storecodeFromQuery) {
          const matchedStore = nextMerchants.find(
            (item) => item.storecode.toLowerCase() === storecodeFromQuery.toLowerCase(),
          );
          return matchedStore?.storecode || storecodeFromQuery;
        }
        if (prev && nextMerchants.some((item) => item.storecode === prev)) {
          return prev;
        }
        return '';
      });
    } catch (error) {
      console.error('Failed to load merchants', error);
      toast.error('상점 목록 조회에 실패했습니다.');
    } finally {
      setLoadingMerchants(false);
    }
  }, [storecodeFromQuery]);

  const loadExchangeRate = useCallback(async () => {
    const storeConfiguredRate = toSafeNumber(selectedMerchant?.usdtToKrwRate);
    if (storeConfiguredRate > 0) {
      setExchangeRate(storeConfiguredRate);
      setExchangeRateSource('Store');
      setRateUpdatedAt(new Date().toISOString());
      setLoadingRate(false);
      return;
    }

    setLoadingRate(true);
    try {
      const response = await fetch('/api/markets/usdt-krw', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error('환율 조회 실패');
      }

      const resolved = resolveExchangeRate(data);
      if (!resolved) {
        throw new Error('유효한 환율 데이터가 없습니다.');
      }

      setExchangeRate(resolved.price);
      setExchangeRateSource(resolved.source);
      setRateUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
    } catch (error) {
      console.error('Failed to load exchange rate', error);
    } finally {
      setLoadingRate(false);
    }
  }, [selectedMerchant?.usdtToKrwRate]);

  const loadBalance = useCallback(async () => {
    if (!activeAccount?.address) {
      setBalance(0);
      return;
    }

    try {
      const result = await balanceOf({
        contract,
        address: activeAccount.address,
      });
      setBalance(Number(result) / 10 ** activeNetwork.tokenDecimals);
    } catch (error) {
      console.error('Failed to load balance', error);
      toast.error('USDT 잔액 조회에 실패했습니다.');
    }
  }, [activeAccount?.address, contract, activeNetwork.tokenDecimals]);

  const loadHistory = useCallback(async () => {
    if (!activeAccount?.address) {
      setHistory([]);
      setLatestPaymentRecord(null);
      setJustPaidRecordId('');
      return;
    }

    setLoadingHistory(true);
    try {
      const listHistoryRequestBody = await buildSignedRequestBody({
        path: '/api/wallet/payment-usdt',
        requestStorecode: selectedStorecode || storecodeFromQuery || 'admin',
        payload: {
          action: 'list',
          fromWalletAddress: activeAccount.address,
          ...((selectedStorecode || storecodeFromQuery)
            ? { storecode: selectedStorecode || storecodeFromQuery }
            : {}),
          limit: 8,
        },
      });
      const response = await fetch('/api/wallet/payment-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listHistoryRequestBody),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || '결제 내역 조회 실패');
      }

      const nextHistory = (Array.isArray(data?.result) ? data.result : [])
        .map((item: unknown) => normalizePaymentRecord(item))
        .filter((item: PaymentRecord | null): item is PaymentRecord => Boolean(item));

      setHistory(nextHistory);
      setLatestPaymentRecord(nextHistory[0] || null);
    } catch (error) {
      console.error('Failed to load payment history', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [activeAccount?.address, buildSignedRequestBody, selectedStorecode, storecodeFromQuery]);

  const confirmPreparedPayment = useCallback(async ({
    paymentRequestId,
    fromWalletAddress,
    transactionHash,
    requestStorecode,
    productId,
    retryDelaysMs = PENDING_PAYMENT_CONFIRM_RETRY_DELAYS_MS,
  }: {
    paymentRequestId: string;
    fromWalletAddress: string;
    transactionHash: string;
    requestStorecode?: string;
    productId?: string;
    retryDelaysMs?: readonly number[];
  }) => {
    let latestError: Error | null = null;
    const attempts = Array.isArray(retryDelaysMs) && retryDelaysMs.length > 0
      ? retryDelaysMs
      : [0];

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      const delayMs = Number(attempts[attemptIndex] || 0);
      if (delayMs > 0) {
        await waitFor(delayMs);
      }

      try {
        const confirmRequestBody = await buildSignedRequestBody({
          path: '/api/wallet/payment-usdt',
          requestStorecode,
          payload: {
            action: 'confirm',
            paymentRequestId,
            fromWalletAddress,
            transactionHash,
            ...(requestStorecode ? { storecode: requestStorecode } : {}),
            ...(productId ? { productId } : {}),
          },
        });
        const response = await fetch('/api/wallet/payment-usdt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(confirmRequestBody),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || '결제 기록 저장에 실패했습니다.'));
        }

        const confirmedPayment = normalizePaymentRecord(payload?.result);
        if (!confirmedPayment) {
          throw new Error('결제 확정 응답이 올바르지 않습니다.');
        }
        return confirmedPayment;
      } catch (error) {
        latestError =
          error instanceof Error
            ? error
            : new Error('결제 확정 요청 중 오류가 발생했습니다.');
      }
    }

    throw latestError || new Error('결제 확정 요청에 실패했습니다.');
  }, [buildSignedRequestBody]);

  const flushPendingPaymentConfirms = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (flushingPendingConfirmRef.current) return;

    const pendingItems = readPendingPaymentConfirms();
    if (pendingItems.length === 0) return;

    flushingPendingConfirmRef.current = true;
    try {
      const nowMs = Date.now();
      const nextPendingItems: PendingPaymentConfirm[] = [];
      let recoveredCount = 0;

      for (const item of pendingItems) {
        const createdAtMs = new Date(item.createdAt).getTime();
        if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > PENDING_PAYMENT_CONFIRM_MAX_AGE_MS) {
          continue;
        }
        if (!item.transactionHash) {
          nextPendingItems.push(item);
          continue;
        }

        try {
          await confirmPreparedPayment({
            paymentRequestId: item.paymentRequestId,
            fromWalletAddress: item.fromWalletAddress,
            transactionHash: item.transactionHash,
            requestStorecode: item.storecode,
            productId: item.productId,
            retryDelaysMs: [0, 1000],
          });
          recoveredCount += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : '결제 확정 요청 중 오류가 발생했습니다.';
          nextPendingItems.push({
            ...item,
            lastError: message,
            lastTriedAt: new Date().toISOString(),
          });
        }
      }

      writePendingPaymentConfirms(nextPendingItems);

      if (recoveredCount > 0) {
        if (!silent) {
          toast.success(`미확정 결제 ${recoveredCount}건을 자동 복구했습니다.`);
        }
        await loadHistory();
      }
    } finally {
      flushingPendingConfirmRef.current = false;
    }
  }, [confirmPreparedPayment, loadHistory]);

  const loadMemberProfile = useCallback(async () => {
    const requestId = memberProfileRequestIdRef.current + 1;
    memberProfileRequestIdRef.current = requestId;
    const loadingStartedAt = Date.now();

    if (!activeAccount?.address || !selectedStorecode) {
      setMyMemberProfile(null);
      setMemberProfileError(null);
      setLoadingMemberProfile(false);
      return;
    }

    setLoadingMemberProfile(true);
    try {
      const getUserRequestBody = await buildSignedRequestBody({
        path: '/api/user/getUser',
        requestStorecode: selectedStorecode,
        payload: {
          storecode: selectedStorecode,
          walletAddress: activeAccount.address,
        },
      });
      const response = await fetch('/api/user/getUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getUserRequestBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '회원 정보 조회 실패');
      }
      const user = data?.result;

      if (requestId !== memberProfileRequestIdRef.current) {
        return;
      }

      if (user && typeof user === 'object') {
        setMyMemberProfile({
          nickname: String(user?.nickname || '').trim(),
          storecode: String(user?.storecode || '').trim(),
          buyer: isRecord(user?.buyer) ? (user.buyer as MemberProfile['buyer']) : null,
        });
        setMemberProfileError(null);
        setSignupNickname('');
        setSignupPassword('');
      } else {
        setMyMemberProfile(null);
        setMemberProfileError(null);
      }
    } catch (error) {
      console.error('Failed to load member profile', error);
      if (requestId !== memberProfileRequestIdRef.current) {
        return;
      }
      setMyMemberProfile(null);
      setMemberProfileError(error instanceof Error ? error.message : '회원 정보를 불러오지 못했습니다.');
    } finally {
      const elapsed = Date.now() - loadingStartedAt;
      const remaining = Math.max(0, MEMBER_PROFILE_LOADING_MIN_MS - elapsed);
      if (remaining > 0) {
        await waitFor(remaining);
      }
      if (requestId === memberProfileRequestIdRef.current) {
        setLoadingMemberProfile(false);
      }
    }
  }, [activeAccount?.address, buildSignedRequestBody, selectedStorecode]);

  useEffect(() => {
    loadMerchants();
  }, [loadMerchants]);

  useEffect(() => {
    loadExchangeRate();

    const interval = setInterval(() => {
      loadExchangeRate();
    }, 45000);

    return () => clearInterval(interval);
  }, [loadExchangeRate]);

  useEffect(() => {
    loadBalance();

    if (!activeAccount?.address) {
      return;
    }

    const interval = setInterval(() => {
      loadBalance();
    }, 12000);

    return () => clearInterval(interval);
  }, [activeAccount?.address, loadBalance]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    void flushPendingPaymentConfirms({ silent: true });

    const timer = window.setInterval(() => {
      void flushPendingPaymentConfirms({ silent: true });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [flushPendingPaymentConfirms]);

  useEffect(() => {
    loadMemberProfile();
  }, [loadMemberProfile]);

  useEffect(() => {
    setSignupNickname(memberIdFromQuery);
    setSignupPassword('');
    setJustPaidRecordId('');
  }, [memberIdFromQuery, selectedStorecode]);

  const registerMemberForSelectedStore = async () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!selectedStorecode) {
      toast.error('상점을 먼저 선택해 주세요.');
      return;
    }

    const nickname = signupNickname.trim();
    if (nickname.length < 2) {
      toast.error('회원 아이디를 2자 이상 입력해 주세요.');
      return;
    }

    const password = signupPassword.trim();
    if (!password) {
      toast.error('비밀번호를 입력해 주세요.');
      return;
    }

    setSigningUpMember(true);
    setMemberProfileError(null);
    try {
      let thirdwebMobile = '';
      try {
        thirdwebMobile = String(await getUserPhoneNumber({ client }) || '').trim();
      } catch (phoneError) {
        console.warn('Failed to read thirdweb phone number for member link', phoneError);
      }

      ///console.log('thirdwebMobile=', thirdwebMobile);

      const linkMemberRequestBody = await buildSignedRequestBody({
        path: '/api/user/linkWalletByStorecodeNicknamePassword',
        requestStorecode: selectedStorecode,
        payload: {
          storecode: selectedStorecode,
          walletAddress: activeAccount.address,
          mobile: thirdwebMobile,
          nickname,
          password,
        },
      });
      const response = await fetch('/api/user/linkWalletByStorecodeNicknamePassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkMemberRequestBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.error || '회원 인증에 실패했습니다.');
      }

      toast.success('회원 인증이 완료되어 내 지갑으로 연결되었습니다.');
      await loadMemberProfile();
    } catch (error) {
      console.error('Failed to verify and link member', error);
      const message = error instanceof Error ? error.message : '회원 인증 중 오류가 발생했습니다.';
      setMemberProfileError(message);
      toast.error(message);
    } finally {
      setSigningUpMember(false);
    }
  };

  const openConfirmModal = () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!selectedMerchant) {
      toast.error(hasStorecodeParam ? '요청한 상점 정보를 찾을 수 없습니다.' : '결제할 상점을 선택해 주세요.');
      return;
    }
    if (loadingMemberProfile) {
      toast.error('회원 정보를 확인 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!hasMemberProfile) {
      toast.error('선택한 상점의 회원정보 연동을 완료해야 결제할 수 있습니다.');
      return;
    }
    if (usdtAmount <= 0) {
      toast.error(
        isFixedKrwPaymentMode
          ? '지정된 결제 금액 기준으로 USDT 수량을 계산 중입니다.'
          : shouldForceFullBalanceAmount
          ? 'USDT 잔고가 없어 결제를 진행할 수 없습니다.'
          : '결제 수량(USDT)을 입력해 주세요.',
      );
      return;
    }
    if (exchangeRate <= 0) {
      toast.error('환율 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (krwAmount <= 0) {
      toast.error('환산 금액이 너무 작습니다. USDT 수량을 늘려 주세요.');
      return;
    }
    if (!hasEnoughBalance) {
      toast.error('USDT 잔액이 부족합니다.');
      return;
    }

    setIsConfirmOpen(true);
  };

  const handlePrimaryAction = () => {
    if (paying) {
      return;
    }
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!selectedMerchant) {
      if (!hasStorecodeParam) {
        setSearchKeyword('');
        setIsStorePickerOpen(true);
        return;
      }
      toast.error('요청한 상점 정보를 찾을 수 없습니다.');
      return;
    }
    if (loadingMemberProfile) {
      toast.error('회원 정보를 확인 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!hasMemberProfile) {
      memberStatusCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error('회원정보 연동을 먼저 완료해 주세요.');
      return;
    }
    if (usdtAmount <= 0) {
      if (!shouldAutoSetAmount) {
        amountInputRef.current?.focus();
      }
      toast.error(
        isFixedKrwPaymentMode
          ? '지정된 결제 금액 기준으로 USDT 수량을 계산 중입니다.'
          : shouldForceFullBalanceAmount
          ? 'USDT 잔고가 없어 결제를 진행할 수 없습니다.'
          : '결제 수량(USDT)을 입력해 주세요.',
      );
      return;
    }
    if (exchangeRate <= 0) {
      toast.error('환율 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (krwAmount <= 0) {
      amountInputRef.current?.focus();
      toast.error('환산 금액이 너무 작습니다. USDT 수량을 늘려 주세요.');
      return;
    }
    if (!hasEnoughBalance) {
      toast.error('USDT 잔액이 부족합니다.');
      return;
    }

    openConfirmModal();
  };

  const submitPayment = async () => {
    if (
      !activeAccount?.address ||
      !selectedMerchant ||
      !hasMemberProfile ||
      usdtAmount <= 0 ||
      exchangeRate <= 0 ||
      krwAmount <= 0 ||
      paying ||
      submitPaymentLockRef.current
    ) {
      return;
    }

    const payerWalletAddress = String(activeAccount.address || '').trim();
    const selectedStoreCode = String(selectedMerchant.storecode || '').trim();
    const prepareRequestKey = generatePrepareRequestKey();
    let pendingConfirm: PendingPaymentConfirm | null = null;

    submitPaymentLockRef.current = true;
    setPaying(true);
    try {
      const prepareRequestBody = await buildSignedRequestBody({
        path: '/api/wallet/payment-usdt',
        requestStorecode: selectedMerchant.storecode,
        payload: {
          action: 'prepare',
          chain: activeNetwork.id,
          storecode: selectedMerchant.storecode,
          fromWalletAddress: activeAccount.address,
          krwAmount,
          exchangeRate,
          usdtAmount,
          ...(productIdFromQuery ? { productId: productIdFromQuery } : {}),
          prepareRequestKey,
          memberNickname: myMemberProfile?.nickname || '',
          memberStorecode: myMemberProfile?.storecode || '',
          memberBuyerBankInfo: memberBankInfoSnapshot,
        },
      });
      const prepareResponse = await fetch('/api/wallet/payment-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prepareRequestBody),
      });
      const prepareData = await prepareResponse.json();

      if (!prepareResponse.ok) {
        throw new Error(prepareData?.error || '결제 요청 생성에 실패했습니다.');
      }

      const paymentRequestId = String(prepareData?.result?.paymentRequestId || '');
      const toWalletAddress = String(prepareData?.result?.toWalletAddress || '').trim();

      if (!paymentRequestId || !isWalletAddress(toWalletAddress)) {
        throw new Error('결제 요청 정보가 올바르지 않습니다.');
      }

      pendingConfirm = {
        paymentRequestId,
        fromWalletAddress: payerWalletAddress,
        storecode: selectedStoreCode,
        chain: activeNetwork.id,
        usdtAmount,
        createdAt: new Date().toISOString(),
        ...(productIdFromQuery ? { productId: productIdFromQuery } : {}),
      };
      upsertPendingPaymentConfirm(pendingConfirm);

      const transaction = transfer({
        contract,
        to: toWalletAddress,
        amount: usdtAmount.toString(),
      });

      const txResult = await sendAndConfirmTransaction({
        transaction,
        account: activeAccount as any,
      });

      const transactionHash = String((txResult as any)?.transactionHash || '');
      if (!transactionHash) {
        throw new Error('트랜잭션 해시를 확인할 수 없습니다.');
      }

      pendingConfirm = {
        ...pendingConfirm,
        transactionHash,
      };
      upsertPendingPaymentConfirm(pendingConfirm);

      const confirmedPayment = await confirmPreparedPayment({
        paymentRequestId,
        fromWalletAddress: payerWalletAddress,
        transactionHash,
        requestStorecode: selectedStoreCode,
        productId: productIdFromQuery,
      });

      removePendingPaymentConfirm(paymentRequestId);

      setLatestPaymentRecord(confirmedPayment);
      setJustPaidRecordId(confirmedPayment.id || confirmedPayment.transactionHash);
      setHistory((previous) => {
        const deduped = previous.filter(
          (item) =>
            item.id !== confirmedPayment.id &&
            item.transactionHash !== confirmedPayment.transactionHash,
        );
        return [confirmedPayment, ...deduped].slice(0, 8);
      });

      toast.success('USDT 결제가 완료되었습니다.');
      setIsConfirmOpen(false);
      setAmountInput('');
      setSelectedPreset(null);
      setPaymentTab('history');
      await Promise.all([loadBalance(), loadHistory()]);
    } catch (error) {
      console.error('Failed to submit payment', error);
      const errorMessage = error instanceof Error ? error.message : '결제 처리 중 오류가 발생했습니다.';

      if (pendingConfirm?.paymentRequestId && pendingConfirm.transactionHash) {
        upsertPendingPaymentConfirm({
          ...pendingConfirm,
          lastError: errorMessage,
          lastTriedAt: new Date().toISOString(),
        });
        toast.error('온체인 전송은 완료되었으나 결제내역 확정이 지연되었습니다. 자동 재시도 중입니다.');
        void flushPendingPaymentConfirms({ silent: true });
      } else {
        if (pendingConfirm?.paymentRequestId) {
          removePendingPaymentConfirm(pendingConfirm.paymentRequestId);
        }
        toast.error(errorMessage);
      }
    } finally {
      setPaying(false);
      submitPaymentLockRef.current = false;
    }
  };

  return (
    <main
      className={`${displayFont.variable} ${bodyFont.variable} relative min-h-screen overflow-hidden bg-[radial-gradient(130%_130%_at_100%_0%,#cffafe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-900`}
      style={{ fontFamily: 'var(--font-body), "Avenir Next", "Segoe UI", sans-serif' }}
    >
      <AutoConnect client={client} wallets={[wallet]} />

      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-300/40 blur-3xl" />
      <div className="pointer-events-none absolute top-24 right-0 h-80 w-80 rounded-full bg-blue-300/30 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[430px] px-4 pb-28 pt-8">
        <div className="mb-8">
          <p className="mb-2 inline-flex rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
            {selectedMerchant ? `${selectedMerchant.storeName} PAY` : 'Secure Payment'}
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: '"SUIT Variable", "Pretendard", "Noto Sans KR", sans-serif' }}
          >
            {hasStorecodeParam && selectedMerchant ? (
              <span className="inline-flex max-w-full items-center gap-2.5">
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-cyan-200">
                  {selectedMerchant.storeLogo ? (
                    <span
                      className="block h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${encodeURI(selectedMerchant.storeLogo)})` }}
                      aria-label={selectedMerchant.storeName}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-cyan-700">
                      SHOP
                    </span>
                  )}
                </span>
                <span className="min-w-0 truncate">결제</span>
              </span>
            ) : (
              '결제'
            )}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {productIdFromQuery
              ? '상품번호와 결제 금액을 확인한 뒤 USDT로 결제하세요.'
              : '결제 금액을 확인한 뒤 USDT로 결제하세요.'}
          </p>
        </div>

        {activeAccount?.address ? (
          <>
            {!shouldHideWalletSummaryForFixedPay && (
              <WalletSummaryCard
                walletAddress={activeAccount.address}
                usdtBalanceDisplay={`${balance.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} USDT`}
                modeLabel={paymentTabLabel}
                smartAccountEnabled={smartAccountEnabled}
                disconnectRedirectPath={disconnectRedirectPath}
                showWalletAddressSection
              />
            )}
            {selectedMerchant && (!hasMemberProfile || loadingMemberProfile) && (
              <StoreMemberLinkCard
                ref={memberStatusCardRef}
                storeLabel={selectedMerchant.storeName || selectedStorecode}
                loading={loadingMemberProfile}
                memberIdValue={signupNickname}
                memberPasswordValue={signupPassword}
                onMemberIdChange={setSignupNickname}
                onMemberPasswordChange={setSignupPassword}
                onSubmit={registerMemberForSelectedStore}
                submitting={signingUpMember}
                error={memberProfileError}
                description={`${selectedMerchant.storeName || '이 상점'} 결제 전에 가맹점 회원 아이디와 비밀번호를 입력해 먼저 회원정보를 연동해 주세요.`}
              />
            )}
            {selectedMerchant && hasMemberProfile && !loadingMemberProfile && (
              <StoreMemberSummaryCard
                memberId={myMemberProfile?.nickname || ''}
                memberName={memberBankInfoSnapshot?.accountHolder || memberBankInfoSnapshot?.depositName || ''}
                storeLabel={selectedMerchant.storeName || selectedStorecode}
              />
            )}
          </>
        ) : (
          <div className="mb-6 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)] backdrop-blur">
            <WalletConnectPrompt
              wallets={wallets}
              chain={activeNetwork.chain}
              lang={lang}
              title="결제를 시작하려면 지갑을 연결하세요."
              description="연결 후 상점 선택, USDT 수량 입력, 환율 기반 결제가 활성화됩니다."
            />
          </div>
        )}

        <div className="grid gap-5">
          <section className="rounded-[32px] border border-white/80 bg-white/80 p-4 shadow-[0_30px_80px_-42px_rgba(15,23,42,0.45)] backdrop-blur sm:p-5">
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { key: 'pay', label: '결제하기' },
                  { key: 'history', label: '결제내역' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setPaymentTab(tab.key as 'pay' | 'history')}
                    className={`inline-flex h-11 items-center justify-center rounded-xl border text-xs font-semibold transition ${
                      paymentTab === tab.key
                        ? 'border-slate-900 bg-slate-900 text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.6)]'
                        : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentTab === 'pay' ? (
              <>
                <div
                  className="mb-4 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_28px_80px_-44px_rgba(15,23,42,0.32)]"
                >
                  <div className="bg-[linear-gradient(135deg,#082f49_0%,#0f172a_58%,#1e293b_100%)] px-5 py-5 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex h-8 items-center rounded-full border border-white/15 bg-white/10 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                        Secure Pay
                      </span>
                      <span className="inline-flex h-8 items-center rounded-full border border-white/15 bg-white/10 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200">
                        {activeNetwork.label}
                      </span>
                    </div>

                    <div className="mt-6">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Payment Amount
                      </p>
                      <div className="mt-2 flex items-end gap-2">
                        <p className="text-[2.8rem] font-black leading-none tracking-tight text-white tabular-nums sm:text-[3rem]">
                          {krwAmount > 0 ? formatKrwNumber(krwAmount) : '0'}
                        </p>
                        <span className="pb-1 text-xl font-bold text-slate-200">원</span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-200">
                        {paymentAmountDescription}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 px-5 py-4">
                    <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Merchant
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                          {selectedMerchant?.storeName || (hasStorecodeParam ? '상점 정보 확인 필요' : '결제할 가맹점 선택')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedMerchant?.storecode || storecodeFromQuery || '상점 선택 전'}
                        </p>
                      </div>
                      {selectedMerchant && (
                        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                          {selectedMerchant.storeLogo ? (
                            <span
                              className="block h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(selectedMerchant.storeLogo)})` }}
                              aria-label={selectedMerchant.storeName}
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-cyan-700">
                              SHOP
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {productIdFromQuery && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Product ID
                        </p>
                        <p className="mt-1 overflow-x-auto whitespace-nowrap font-mono text-sm font-semibold text-slate-900">
                          {productIdFromQuery}
                        </p>
                      </div>
                    )}

                    {selectedMerchant && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Pay To
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                              {shortAddress(selectedMerchant.paymentWalletAddress)}
                            </p>
                          </div>
                          <span className="inline-flex h-7 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-semibold text-emerald-700">
                            수신지갑 확인됨
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {!hasStorecodeParam && (
                  <div
                    className={`mb-4 rounded-[28px] border px-4 py-4 ${
                      selectedMerchant
                        ? 'border-slate-200 bg-white/90'
                        : 'border-cyan-300 bg-gradient-to-br from-cyan-50 via-white to-sky-50 shadow-[0_18px_45px_-25px_rgba(6,182,212,0.55)]'
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                      Merchant
                    </p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900">
                          {selectedMerchant ? selectedMerchant.storeName : '결제할 가맹점을 선택해 주세요.'}
                        </h3>
                        <p className="mt-1 text-xs text-slate-600">
                          {selectedMerchant
                            ? `${selectedMerchant.storecode} · 결제 준비가 완료되었습니다.`
                            : '상점을 먼저 선택하면 회원 확인과 결제 입력이 이어집니다.'}
                        </p>
                      </div>
                      {selectedMerchant && (
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                          {selectedMerchant.storeLogo ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(selectedMerchant.storeLogo)})` }}
                              aria-label={selectedMerchant.storeName}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-cyan-700">
                              SHOP
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchKeyword('');
                        setIsStorePickerOpen(true);
                      }}
                      disabled={loadingMerchants || merchants.length === 0}
                      className={`mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl text-sm font-semibold transition ${
                        selectedMerchant
                          ? 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                          : 'bg-cyan-700 text-white shadow-[0_14px_34px_-16px_rgba(14,116,144,0.8)] hover:bg-cyan-600'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {selectedMerchant ? '가맹점 변경' : '가맹점 선택'}
                    </button>
                  </div>
                )}

                {hasStorecodeParam && !loadingMerchants && !selectedMerchant && (
                  <div className="mb-4 rounded-[26px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                    <p className="font-semibold text-rose-700">요청한 가맹점 정보를 찾지 못했습니다.</p>
                    <p className="mt-1 text-xs text-rose-600">
                      잘못된 `storecode`이거나 결제지갑이 설정되지 않은 가맹점일 수 있습니다.
                    </p>
                  </div>
                )}

                <div className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.45)]">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0 pr-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Payment Input
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-900">USDT 결제 수량 입력</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        빠른 선택 또는 직접 입력으로 결제 금액을 바로 맞출 수 있습니다.
                      </p>
                    </div>
                    <div className="self-start rounded-[22px] bg-slate-900 px-4 py-3 text-right text-white shadow-[0_16px_32px_-24px_rgba(15,23,42,0.7)] sm:min-w-[148px]">
                      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        보유 잔액
                      </p>
                      <p className="mt-1 whitespace-nowrap text-lg font-black leading-none text-white tabular-nums sm:text-xl">
                        {formatUsdtNumber(balance)}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                        USDT
                      </p>
                    </div>
                  </div>

                  {needsMerchantSelectionFirst && (
                    <p className="mt-3 text-xs font-semibold text-cyan-700">
                      결제할 가맹점을 먼저 선택하면 아래 USDT 입력이 활성화됩니다.
                    </p>
                  )}
                  {needsMemberSignupFirst && (
                    <p className="mt-3 text-xs font-semibold text-amber-700">
                      회원정보 연동 완료 후 USDT 수량을 입력할 수 있습니다.
                    </p>
                  )}
                  {shouldAutoSetAmount && (
                    <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800">
                      {isFixedKrwPaymentMode
                        ? `결제 금액 ${formatKrw(fixedKrwAmount)} 기준으로 USDT 수량이 자동 계산됩니다.`
                        : '현재 설정에서는 결제 수량이 자동으로 적용됩니다.'}
                    </div>
                  )}

                  {!shouldAutoSetAmount && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {QUICK_USDT_AMOUNTS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          disabled={shouldDisableAmountEditing}
                          onClick={() => {
                            const nextAmount = clampUsdtInputToBalance(String(value));
                            const nextAmountNumeric = toSafeUsdtAmount(nextAmount);
                            setAmountInput(nextAmountNumeric > 0 ? nextAmountNumeric.toFixed(6) : '');
                            setSelectedPreset(nextAmountNumeric === value ? value : null);
                          }}
                          className={`h-10 rounded-2xl border text-sm font-semibold transition ${
                            selectedPreset === value
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                          } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                        >
                          {value.toLocaleString()} USDT
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    className={`mt-4 rounded-[24px] border px-4 py-3 ${
                      usdtAmount > 0
                        ? 'border-cyan-300 bg-[linear-gradient(135deg,rgba(236,254,255,0.9),rgba(255,255,255,0.96))]'
                        : 'border-slate-200 bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {isFixedKrwPaymentMode
                          ? '자동 계산 (지정 결제 금액 기준)'
                          : shouldForceFullBalanceAmount
                            ? '자동 설정 (잔고 전체 전송)'
                            : '직접 입력 (USDT)'}
                      </p>
                      {!shouldAutoSetAmount && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setAmountInput('');
                              setSelectedPreset(null);
                            }}
                            disabled={shouldDisableAmountEditing || !amountInput}
                            className="text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                          >
                            초기화
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAmountInput(formatUsdtInputFromBalance(balance));
                              setSelectedPreset(null);
                            }}
                            disabled={shouldDisableAmountEditing || balance <= 0}
                            className="text-xs font-semibold text-emerald-600 underline decoration-emerald-200 underline-offset-2 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                          >
                            최대
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <input
                        ref={amountInputRef}
                        disabled={shouldDisableAmountEditing}
                        value={amountInputDisplay}
                        onChange={(event) => {
                          if (shouldAutoSetAmount) return;
                          setAmountInput(clampUsdtInputToBalance(event.target.value));
                          setSelectedPreset(null);
                        }}
                        onBlur={() => {
                          if (shouldAutoSetAmount) return;
                          const normalized = toSafeUsdtAmount(clampUsdtInputToBalance(amountInput));
                          setAmountInput(normalized > 0 ? normalized.toFixed(6) : '');
                        }}
                        placeholder="0.000000"
                        className="w-full bg-transparent text-right text-5xl font-bold text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                        inputMode="decimal"
                      />
                      <span className="pb-1 text-sm font-semibold text-slate-500">USDT</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.28)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Payment Status
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-900">
                        {isPaymentReady ? '결제 준비가 완료되었습니다.' : '결제 전 확인이 필요합니다.'}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">{paymentActionHint}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        isPaymentReady ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                      }`}
                    >
                      {isPaymentReady ? 'Ready' : 'Check'}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {[
                      {
                        label: '상점',
                        value: merchantStatusSummary,
                        ready: Boolean(selectedMerchant),
                      },
                      {
                        label: '회원',
                        value: memberStatusSummary,
                        ready: Boolean(selectedMerchant && !loadingMemberProfile && hasMemberProfile),
                      },
                      {
                        label: '잔액 / 수량',
                        value: `${balanceStatusSummary}${activeAccount?.address ? ` · 보유 ${formatUsdt(balance)}` : ''}`,
                        ready: Boolean(activeAccount?.address && usdtAmount > 0 && hasEnoughBalance),
                      },
                      {
                        label: '결제 금액',
                        value:
                          krwAmount > 0
                            ? `${formatKrw(krwAmount)}${exchangeRate > 0 ? ` · ${formatUsdt(usdtAmount)}` : ''}`
                            : '금액 계산 전',
                        ready: Boolean(krwAmount > 0),
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-slate-500">{item.label}</p>
                          <p className="mt-0.5 break-all text-sm font-semibold text-slate-900">{item.value}</p>
                        </div>
                        <span
                          className={`inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[10px] font-semibold ${
                            item.ready
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                              : 'bg-slate-900 text-white'
                          }`}
                        >
                          {item.ready ? '완료' : '확인'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {!hasEnoughBalance && usdtAmount > 0 && (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                      잔액이 부족합니다. 입력한 전송 수량은 {formatUsdt(usdtAmount)} 입니다.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handlePrimaryAction}
                    disabled={paying || loadingMemberProfile}
                    className={`mt-4 inline-flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold text-white transition ${
                      isPaymentReady
                        ? 'bg-cyan-700 shadow-[0_20px_42px_-22px_rgba(14,116,144,0.88)] hover:-translate-y-0.5 hover:bg-cyan-600'
                        : 'bg-slate-900 shadow-[0_20px_42px_-28px_rgba(15,23,42,0.8)] hover:bg-slate-800'
                    } disabled:cursor-not-allowed disabled:bg-slate-300`}
                  >
                    {primaryActionLabel}
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <p className="min-w-0">{paymentActionHint}</p>
                    {latestPaymentRecord && (
                      <button
                        type="button"
                        onClick={() => setPaymentTab('history')}
                        className="shrink-0 font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2"
                      >
                        결제내역 보기
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">내 최근 결제 내역</h2>
                  <button
                    type="button"
                    onClick={loadHistory}
                    disabled={loadingHistory}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingHistory ? '조회 중...' : '새로고침'}
                  </button>
                </div>

                {loadingHistory && <p className="text-sm text-slate-500">결제 내역을 불러오는 중입니다...</p>}
                {!loadingHistory && history.length === 0 && (
                  <p className="text-sm text-slate-500">아직 완료된 결제 내역이 없습니다.</p>
                )}

                {!loadingHistory && history.length > 0 && (
                  <div className="space-y-2.5">
                    {history.map((item) => {
                      const isJustPaid =
                        Boolean(justPaidRecordId) &&
                        (justPaidRecordId === item.id || justPaidRecordId === item.transactionHash);
                      const txUrl = `${NETWORK_BY_KEY[item.chain]?.explorerBaseUrl || ''}${item.transactionHash}`;
                      return (
                        <div
                          key={item.id || item.transactionHash}
                          className={`rounded-xl border px-3 py-2.5 ${
                            isJustPaid ? 'border-emerald-300 bg-emerald-50/80' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">가맹점 정보</p>
                              <p className="text-xs font-semibold text-slate-900 sm:text-sm">
                                {item.storeName || '-'} ({item.storecode || '-'})
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-extrabold leading-none tabular-nums text-slate-900 sm:text-2xl">
                                {Number(item.usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT
                              </p>
                              <p className="text-[11px] font-semibold tabular-nums text-slate-600 sm:text-xs">
                                {item.krwAmount > 0 ? `${Number(item.krwAmount).toLocaleString()}원 · ` : ''}
                                {formatDateTime(item.confirmedAt || item.createdAt)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-1.5 grid gap-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-[11px] sm:grid-cols-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-slate-500">결제 번호</p>
                              <p className="truncate text-right text-slate-800">{item.paymentId || '-'}</p>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-slate-500">적용 환율</p>
                              <p className="text-right text-slate-800">
                                {item.exchangeRate > 0 ? formatRate(item.exchangeRate) : '-'}
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="whitespace-nowrap font-semibold text-slate-500">결제 지갑</p>
                              <p className="font-mono text-right text-slate-700">{shortAddress(item.toWalletAddress)}</p>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="whitespace-nowrap font-semibold text-slate-500">결제 회원</p>
                              <p className="truncate text-right text-slate-800">{formatPaymentMemberName(item.member)}</p>
                            </div>
                            <div className="flex items-center justify-between gap-2 sm:col-span-2">
                              <p className="font-semibold text-slate-500">회원 지갑</p>
                              <p className="font-mono text-right text-slate-700">{shortAddress(item.fromWalletAddress)}</p>
                            </div>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-500">네트워크: {NETWORK_BY_KEY[item.chain]?.label || item.chain}</span>
                            <div className="flex items-center gap-2">
                              {isJustPaid && (
                                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                                  방금 결제됨
                                </span>
                              )}
                              <a
                                href={txUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2"
                              >
                                TX 확인
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

        </div>
      </div>

      <WalletManagementBottomNav lang={lang} active="payment" />

      {isStorePickerOpen && !hasStorecodeParam && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_40px_100px_-45px_rgba(2,132,199,0.8)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                  결제 상점 선택
                </p>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">
                  결제할 상점을 선택해 주세요
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStorePickerOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                닫기
              </button>
            </div>

            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="상점명 또는 코드 검색"
              className="mt-4 h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-cyan-500"
            />

            <div className="mt-3 max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/85">
              {loadingMerchants && (
                <div className="px-4 py-5 text-sm text-slate-500">
                  상점 목록을 불러오는 중입니다...
                </div>
              )}

              {!loadingMerchants && filteredMerchants.length === 0 && (
                <div className="px-4 py-5 text-sm text-slate-500">
                  결제 가능한 상점이 없습니다.
                </div>
              )}

              {!loadingMerchants && filteredMerchants.map((merchant) => {
                const selected = merchant.storecode === selectedStorecode;
                return (
                  <button
                    key={merchant.storecode}
                    type="button"
                    onClick={() => {
                      setSelectedStorecode(merchant.storecode);
                      setIsStorePickerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 ${
                      selected ? 'bg-cyan-50/80' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                        {merchant.storeLogo ? (
                          <div
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${encodeURI(merchant.storeLogo)})` }}
                            aria-label={merchant.storeName}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-500">
                            SHOP
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{merchant.storeName}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {merchant.storecode} · {shortAddress(merchant.paymentWalletAddress)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${
                        selected
                          ? 'bg-cyan-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {selected ? '선택됨' : '선택'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isConfirmOpen && selectedMerchant && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_40px_100px_-45px_rgba(2,132,199,0.9)]">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
              결제 확인
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">USDT 결제를 진행할까요?</h3>

            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">상점</span>
                <span className="font-semibold text-slate-800">{selectedMerchant.storeName}</span>
              </div>
              {productIdFromQuery && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">상품번호</span>
                  <span className="break-all text-right font-semibold text-slate-800">{productIdFromQuery}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">입력 수량 (USDT)</span>
                <span className="font-semibold text-slate-800">{formatUsdt(usdtAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">환산 금액 (KRW)</span>
                <span className="font-semibold text-slate-800">
                  {formatKrw(krwAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">네트워크</span>
                <span className="font-semibold text-slate-800">{activeNetwork.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">적용 환율</span>
                <span className="text-base font-bold text-slate-900 tabular-nums sm:text-lg">{formatRate(exchangeRate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">실제 전송 (USDT)</span>
                <span className="font-semibold text-slate-800">{formatUsdt(usdtAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">수신지갑</span>
                <span className="font-semibold text-slate-800">{shortAddress(selectedMerchant.paymentWalletAddress)}</span>
              </div>
            </div>

            {paying && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                결제 진행 중입니다. 완료될 때까지 이 창을 닫지 마세요.
              </p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={paying}
                className="h-11 rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPayment}
                disabled={paying || !hasMemberProfile}
                className="h-11 rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {paying ? '결제 중...' : '확인하고 결제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
