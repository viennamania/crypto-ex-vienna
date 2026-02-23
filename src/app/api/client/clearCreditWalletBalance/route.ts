import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, Engine, getContract } from 'thirdweb';
import { transfer, balanceOf } from 'thirdweb/extensions/erc20';
import { ethereum, polygon, arbitrum, bsc } from 'thirdweb/chains';

import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';
import { getOne } from '@/lib/api/client';
import { createEngineServerWallet } from '@/lib/engineServerWallet';

type ClientDoc = {
  creditWallet?: {
    signerAddress?: string;
    smartAccountAddress?: string;
  };
  // Legacy fallback fields
  signerAddress?: string;
  smartAccountAddress?: string;
};

const clientId = process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '';

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const normalizeAddress = (value: string) => String(value || '').trim().toLowerCase();

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
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return BigInt(Math.floor(value));
    }
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

const normalizeHistoryStatus = (
  value: unknown,
): 'REQUESTING' | 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' => {
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

const resolveCreditWallet = (clientInfo: ClientDoc | null) => {
  const signerAddress = String(
    clientInfo?.creditWallet?.signerAddress || clientInfo?.signerAddress || ''
  ).trim();
  const smartAccountAddress = String(
    clientInfo?.creditWallet?.smartAccountAddress || clientInfo?.smartAccountAddress || ''
  ).trim();

  const normalizedSignerAddress = isWalletAddress(signerAddress) ? signerAddress : '';
  const normalizedSmartAccountAddress =
    isWalletAddress(smartAccountAddress)
    && normalizeAddress(smartAccountAddress) !== normalizeAddress(signerAddress)
      ? smartAccountAddress
      : '';
  const walletAddress = normalizedSmartAccountAddress || normalizedSignerAddress;

  return {
    signerAddress: normalizedSignerAddress,
    smartAccountAddress: normalizedSmartAccountAddress,
    walletAddress,
  };
};

export async function POST(request: NextRequest) {
  if (!clientId) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_TEMPLATE_CLIENT_ID is not configured' },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const requesterWalletAddress = String(body?.requesterWalletAddress || '').trim();
  const requestedToWalletAddress = String(body?.toWalletAddress || '').trim();
  const toWalletAddress = requestedToWalletAddress || requesterWalletAddress;

  if (!isWalletAddress(requesterWalletAddress)) {
    return NextResponse.json({ error: 'requesterWalletAddress is invalid' }, { status: 400 });
  }
  if (!isWalletAddress(toWalletAddress)) {
    return NextResponse.json({ error: 'toWalletAddress is invalid' }, { status: 400 });
  }

  const clientInfo = (await getOne(clientId)) as ClientDoc | null;
  const { signerAddress, smartAccountAddress, walletAddress } = resolveCreditWallet(clientInfo);

  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Client credit wallet is not configured. Create the wallet first.' },
      { status: 400 },
    );
  }

  const secretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!secretKey) {
    return NextResponse.json(
      { error: 'THIRDWEB_SECRET_KEY is not configured' },
      { status: 500 },
    );
  }

  const { chainKey, chain, usdtContractAddress, decimals } = resolveChainConfig();

  try {
    const thirdwebClient = createThirdwebClient({ secretKey });
    const contract = getContract({
      client: thirdwebClient,
      chain,
      address: usdtContractAddress,
    });

    const rawBalance = await balanceOf({
      contract,
      address: walletAddress,
    });
    const rawBigInt = toBigIntSafe(rawBalance);

    if (rawBigInt <= 0n) {
      return NextResponse.json(
        { error: '센터 수수료 수납지갑에 회수할 USDT 잔고가 없습니다.' },
        { status: 400 },
      );
    }

    const transferredAmount = formatTokenBalance(rawBigInt, decimals, decimals);
    if (!transferredAmount || Number(transferredAmount) <= 0) {
      return NextResponse.json(
        { error: '회수 가능 잔고 계산에 실패했습니다.' },
        { status: 500 },
      );
    }

    const centerCreditWallet = await createEngineServerWallet({
      client: thirdwebClient,
      walletAddress,
      chain,
    });

    const transferTx = transfer({
      contract,
      to: toWalletAddress,
      amount: transferredAmount,
    });

    const { transactionId } = await centerCreditWallet.enqueueTransaction({
      transaction: transferTx,
    });

    let status: 'REQUESTING' | 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' = 'QUEUED';
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

    return NextResponse.json({
      result: {
        clientId,
        chain: chainKey,
        usdtContractAddress,
        fromWalletAddress: walletAddress,
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
    console.error('clearCreditWalletBalance error', {
      clientId,
      signerAddress,
      smartAccountAddress,
      walletAddress,
      toWalletAddress,
      detail,
      raw: error,
    });
    return NextResponse.json(
      {
        error: 'Failed to recover client credit wallet balance',
        detail: detail || 'unknown error',
      },
      { status: 500 },
    );
  }
}

