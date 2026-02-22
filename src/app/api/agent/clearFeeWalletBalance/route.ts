import { NextResponse, type NextRequest } from 'next/server';
import { type ObjectId } from 'mongodb';
import { createThirdwebClient, Engine, getContract } from 'thirdweb';
import { balanceOf, transfer } from 'thirdweb/extensions/erc20';
import { ethereum, polygon, arbitrum, bsc } from 'thirdweb/chains';

import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';
import clientPromise, { dbName } from '@/lib/mongodb';
import {
  createEngineServerWallet,
} from '@/lib/engineServerWallet';

type AgentDoc = {
  agentcode?: string;
  agentName?: string;
  adminWalletAddress?: string;
  creditWallet?: {
    signerAddress?: string;
    smartAccountAddress?: string;
  };
  // Legacy fallback fields
  signerAddress?: string;
  smartAccountAddress?: string;
};

type FeeWalletHistoryStatus = 'REQUESTING' | 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
type AgentFeeWalletHistoryDoc = {
  _id?: ObjectId;
  agentcode: string;
  agentName: string;
  chain: string;
  actionType: 'RECOVER';
  status: FeeWalletHistoryStatus;
  fromWalletAddress: string;
  toWalletAddress: string;
  requestedByWalletAddress: string;
  amount: number;
  rawValue: string;
  transactionHash?: string;
  transactionId: string;
  onchainStatus?: string;
  error?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const normalizeAddress = (value: string) => String(value || '').trim().toLowerCase();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeErrorText = (value: unknown): string => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (value instanceof Error) {
    return String(value.message || '').trim();
  }

  if (typeof value === 'object') {
    const valueRecord = value as Record<string, unknown>;
    const message = typeof valueRecord.message === 'string' ? valueRecord.message.trim() : '';
    if (message) {
      return message;
    }

    const error = typeof valueRecord.error === 'string' ? valueRecord.error.trim() : '';
    if (error) {
      return error;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value).trim();
};

const toBigIntSafe = (value: unknown): bigint => {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string' && value.trim()) return BigInt(value.trim());
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return BigInt(Math.floor(value));
  } catch (_error) {
    // ignore parse errors and return zero
  }
  return 0n;
};

const formatTokenBalance = (rawValue: bigint, decimals: number, fractionDigits = 6): string => {
  const normalizedDecimals = Math.max(0, Math.floor(decimals));
  if (normalizedDecimals === 0) return rawValue.toString();

  const divider = 10n ** BigInt(normalizedDecimals);
  const whole = rawValue / divider;
  const remainder = rawValue % divider;
  const usedFractionDigits = Math.max(0, Math.min(normalizedDecimals, Math.floor(fractionDigits)));

  if (usedFractionDigits === 0) return whole.toString();

  const fractionText = remainder
    .toString()
    .padStart(normalizedDecimals, '0')
    .slice(0, usedFractionDigits)
    .replace(/0+$/, '');

  return fractionText ? `${whole.toString()}.${fractionText}` : whole.toString();
};

const normalizeHistoryStatus = (value: unknown): FeeWalletHistoryStatus => {
  const normalized = String(value || '').trim().toUpperCase();

  if (
    normalized === 'REQUESTING'
    || normalized === 'QUEUED'
    || normalized === 'SUBMITTED'
    || normalized === 'CONFIRMED'
    || normalized === 'FAILED'
  ) {
    return normalized;
  }

  if (
    normalized.includes('CONFIRM')
    || normalized.includes('MINED')
    || normalized.includes('COMPLETED')
    || normalized.includes('SUCCESS')
  ) {
    return 'CONFIRMED';
  }
  if (
    normalized.includes('FAIL')
    || normalized.includes('ERROR')
    || normalized.includes('REVERT')
    || normalized.includes('CANCEL')
  ) {
    return 'FAILED';
  }
  if (
    normalized.includes('SUBMIT')
    || normalized.includes('SENT')
    || normalized.includes('BROADCAST')
  ) {
    return 'SUBMITTED';
  }
  if (normalized.includes('REQUEST')) {
    return 'REQUESTING';
  }

  return 'QUEUED';
};

const resolveChainConfig = () => {
  const chainName = String(process.env.NEXT_PUBLIC_CHAIN || 'polygon').trim().toLowerCase();

  if (chainName === 'ethereum' || chainName === 'eth') {
    return {
      chainKey: 'ethereum',
      chain: ethereum,
      usdtContractAddress: ethereumContractAddressUSDT,
      decimals: 6,
    };
  }

  if (chainName === 'arbitrum' || chainName === 'arb') {
    return {
      chainKey: 'arbitrum',
      chain: arbitrum,
      usdtContractAddress: arbitrumContractAddressUSDT,
      decimals: 6,
    };
  }

  if (chainName === 'bsc' || chainName === 'bnb') {
    return {
      chainKey: 'bsc',
      chain: bsc,
      usdtContractAddress: bscContractAddressUSDT,
      decimals: 18,
    };
  }

  return {
    chainKey: 'polygon',
    chain: polygon,
    usdtContractAddress: polygonContractAddressUSDT,
    decimals: 6,
  };
};

const resolveFeeWallet = (agent: AgentDoc) => {
  const signerAddress = String(agent?.creditWallet?.signerAddress || agent?.signerAddress || '').trim();
  const smartAccountAddress = String(agent?.creditWallet?.smartAccountAddress || agent?.smartAccountAddress || '').trim();

  const normalizedSignerAddress = isWalletAddress(signerAddress) ? signerAddress : '';
  const normalizedSmartAccountAddress =
    isWalletAddress(smartAccountAddress) && normalizeAddress(smartAccountAddress) !== normalizeAddress(signerAddress)
      ? smartAccountAddress
      : '';
  const feeWalletAddress = normalizedSmartAccountAddress || normalizedSignerAddress;

  return {
    signerAddress: normalizedSignerAddress,
    smartAccountAddress: normalizedSmartAccountAddress,
    feeWalletAddress,
  };
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const agentcode = String(body?.agentcode || '').trim();
  const requesterWalletAddress = String(body?.requesterWalletAddress || '').trim();
  const requestedToWalletAddress = String(body?.toWalletAddress || '').trim();
  const toWalletAddress = requestedToWalletAddress || requesterWalletAddress;

  if (!agentcode) {
    return NextResponse.json({ error: 'agentcode is required' }, { status: 400 });
  }
  if (!isWalletAddress(requesterWalletAddress)) {
    return NextResponse.json({ error: 'requesterWalletAddress is invalid' }, { status: 400 });
  }
  if (!isWalletAddress(toWalletAddress)) {
    return NextResponse.json({ error: 'toWalletAddress is invalid' }, { status: 400 });
  }

  const mongodbClient = await clientPromise;
  const agentsCollection = mongodbClient.db(dbName).collection<AgentDoc>('agents');
  const historyCollection = mongodbClient.db(dbName).collection<AgentFeeWalletHistoryDoc>('agentFeeWalletHistories');
  const agent = await agentsCollection.findOne({
    agentcode: {
      $regex: `^${escapeRegex(agentcode)}$`,
      $options: 'i',
    },
  });

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const adminWalletAddress = String(agent?.adminWalletAddress || '').trim();
  if (!isWalletAddress(adminWalletAddress)) {
    return NextResponse.json({ error: 'Agent admin wallet address is not configured' }, { status: 400 });
  }
  if (normalizeAddress(adminWalletAddress) !== normalizeAddress(requesterWalletAddress)) {
    return NextResponse.json({ error: 'Only agent admin wallet can recover the fee wallet balance' }, { status: 403 });
  }

  const { signerAddress, smartAccountAddress, feeWalletAddress } = resolveFeeWallet(agent);
  if (!feeWalletAddress) {
    return NextResponse.json({ error: 'Fee wallet is not configured. Create the wallet first.' }, { status: 400 });
  }

  const secretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!secretKey) {
    return NextResponse.json({ error: 'THIRDWEB_SECRET_KEY is not configured' }, { status: 500 });
  }

  const { chainKey, chain, usdtContractAddress, decimals } = resolveChainConfig();

  try {
    const thirdwebClient = createThirdwebClient({ secretKey });
    const contract = getContract({
      client: thirdwebClient,
      chain,
      address: usdtContractAddress,
    });

    const feeWalletRawBalance = await balanceOf({
      contract,
      address: feeWalletAddress,
    });
    const rawBigInt = toBigIntSafe(feeWalletRawBalance);

    if (rawBigInt <= 0n) {
      return NextResponse.json({ error: '수수료 지급용 지갑에 회수할 USDT 잔고가 없습니다.' }, { status: 400 });
    }

    const transferredAmount = formatTokenBalance(rawBigInt, decimals, decimals);
    const transferredAmountForHistory = Number(formatTokenBalance(rawBigInt, decimals, 6));
    if (!transferredAmount || Number(transferredAmount) <= 0) {
      return NextResponse.json({ error: '회수 가능 잔고 계산에 실패했습니다.' }, { status: 500 });
    }

    const feeWallet = await createEngineServerWallet({
      client: thirdwebClient,
      walletAddress: feeWalletAddress,
      chain,
    });

    const transferTx = transfer({
      contract,
      to: toWalletAddress,
      amount: transferredAmount,
    });
    const { transactionId } = await feeWallet.enqueueTransaction({
      transaction: transferTx,
    });

    let status: FeeWalletHistoryStatus = 'QUEUED';
    let onchainStatus = '';
    let transactionHash = '';
    let executionError = '';
    try {
      const executionResult = await Engine.getTransactionStatus({
        client: thirdwebClient,
        transactionId,
      });
      status = normalizeHistoryStatus(executionResult?.status || 'QUEUED');
      onchainStatus =
        executionResult && typeof executionResult === 'object' && 'onchainStatus' in executionResult
          ? String(executionResult.onchainStatus || '')
          : '';
      transactionHash =
        executionResult && typeof executionResult === 'object' && 'transactionHash' in executionResult
          ? String(executionResult.transactionHash || '').trim()
          : '';
      executionError =
        executionResult && typeof executionResult === 'object' && 'error' in executionResult
          ? normalizeErrorText(executionResult.error)
          : '';
    } catch {
      status = 'QUEUED';
    }

    const now = new Date().toISOString();
    await historyCollection.updateOne(
      {
        actionType: 'RECOVER',
        transactionId,
      },
      {
        $set: {
          agentcode: String(agent.agentcode || agentcode),
          agentName: String(agent.agentName || ''),
          chain: chainKey,
          actionType: 'RECOVER',
          status,
          fromWalletAddress: feeWalletAddress,
          toWalletAddress,
          requestedByWalletAddress: requesterWalletAddress,
          amount: Number.isFinite(transferredAmountForHistory) ? transferredAmountForHistory : Number(transferredAmount),
          rawValue: rawBigInt.toString(),
          transactionHash,
          transactionId,
          onchainStatus,
          error: executionError,
          source: 'p2p-agent-fee-wallet',
          updatedAt: now,
          ...(status === 'CONFIRMED' ? { confirmedAt: now } : {}),
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );

    return NextResponse.json({
      result: {
        agentcode: String(agent.agentcode || agentcode),
        chain: chainKey,
        usdtContractAddress,
        fromWalletAddress: feeWalletAddress,
        toWalletAddress,
        signerAddress,
        smartAccountAddress,
        rawValue: rawBigInt.toString(),
        transferredAmount,
        transactionId,
        status,
        transactionHash,
        onchainStatus,
        error: executionError,
        requestedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const detail = normalizeErrorText(error);
    console.error('clearFeeWalletBalance error', {
      agentcode,
      signerAddress,
      smartAccountAddress,
      feeWalletAddress,
      toWalletAddress,
      detail,
      raw: error,
    });
    return NextResponse.json({
      error: 'Failed to recover fee wallet balance',
      detail: detail || 'unknown error',
    }, { status: 500 });
  }
}
