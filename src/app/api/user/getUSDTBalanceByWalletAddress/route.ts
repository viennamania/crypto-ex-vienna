import { NextResponse, type NextRequest } from 'next/server';

import { createThirdwebClient, getContract } from 'thirdweb';
import { balanceOf } from 'thirdweb/extensions/erc20';
import { polygon, arbitrum, bsc, ethereum } from 'thirdweb/chains';

import {
  chain as defaultChain,
  thirdwebClientId as fallbackThirdwebClientId,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
  ethereumContractAddressUSDT,
} from '@/app/config/contractAddresses';

const parsedBalanceReadTimeoutMs = Number(process.env.USDT_BALANCE_READ_TIMEOUT_MS ?? '12000');
const BALANCE_READ_TIMEOUT_MS = Number.isFinite(parsedBalanceReadTimeoutMs)
  ? Math.max(3000, Math.floor(parsedBalanceReadTimeoutMs))
  : 12000;
const SUPPORTED_CHAIN_KEYS = ['polygon', 'bsc', 'arbitrum', 'ethereum'] as const;

const formatTokenDisplayValue = (rawValue: bigint, decimals: number) => {
  if (rawValue <= 0n) return '0';
  const denominator = BigInt(10) ** BigInt(decimals);
  const whole = rawValue / denominator;
  const fraction = rawValue % denominator;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
};

const normalizeChainKey = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'eth') return 'ethereum';
  if (normalized === 'matic') return 'polygon';
  if (normalized === 'arb') return 'arbitrum';
  if (normalized === 'bnb') return 'bsc';
  if (normalized === 'ethereum' || normalized === 'polygon' || normalized === 'arbitrum' || normalized === 'bsc') {
    return normalized;
  }
  return String(defaultChain || 'polygon').trim().toLowerCase() || 'polygon';
};

const resolveUsdtContractConfig = (chainKey: string) => {
  if (chainKey === 'ethereum') {
    return {
      chain: ethereum,
      contractAddress: ethereumContractAddressUSDT,
      decimals: 6,
      chainKey: 'ethereum',
    };
  }
  if (chainKey === 'arbitrum') {
    return {
      chain: arbitrum,
      contractAddress: arbitrumContractAddressUSDT,
      decimals: 6,
      chainKey: 'arbitrum',
    };
  }
  if (chainKey === 'bsc') {
    return {
      chain: bsc,
      contractAddress: bscContractAddressUSDT,
      decimals: 18,
      chainKey: 'bsc',
    };
  }
  return {
    chain: polygon,
    contractAddress: polygonContractAddressUSDT,
    decimals: 6,
    chainKey: 'polygon',
  };
};

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[${label}] timed out after ${BALANCE_READ_TIMEOUT_MS}ms`));
    }, BALANCE_READ_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

type ChainBalanceSnapshot = {
  chain: string;
  balance: string;
  displayValue: string;
  decimals: number;
  rawBalance: string;
  error: string | null;
};

const readBalanceByChain = async ({
  walletAddress,
  chainKey,
  thirdwebClient,
}: {
  walletAddress: string;
  chainKey: string;
  thirdwebClient: ReturnType<typeof createThirdwebClient>;
}): Promise<ChainBalanceSnapshot> => {
  const contractConfig = resolveUsdtContractConfig(chainKey);
  const usdtContract = getContract({
    client: thirdwebClient,
    chain: contractConfig.chain,
    address: contractConfig.contractAddress,
  });

  const rawBalanceResult = await withTimeout(
    balanceOf({
      contract: usdtContract,
      address: walletAddress,
    }),
    `balanceOf:${contractConfig.chainKey}:${walletAddress}`,
  );
  const rawBalanceBigInt = BigInt(rawBalanceResult.toString());
  const displayValue = formatTokenDisplayValue(rawBalanceBigInt, contractConfig.decimals);

  return {
    chain: contractConfig.chainKey,
    balance: displayValue,
    displayValue,
    decimals: contractConfig.decimals,
    rawBalance: rawBalanceBigInt.toString(),
    error: null,
  };
};

const formatUsdtAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  return rounded.toFixed(6).replace(/\.?0+$/, '');
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const walletAddress = String(body?.walletAddress || '').trim();
    const requestedChainInput = String(body?.chain || '').trim();
    const normalizedRequestedChainKey = normalizeChainKey(requestedChainInput);
    const chainKeysToQuery: string[] = requestedChainInput
      ? [normalizedRequestedChainKey]
      : [...SUPPORTED_CHAIN_KEYS];

    if (!walletAddress) {
      return NextResponse.json(
        {
          result: {
            balance: '0',
            displayValue: '0',
            currency: 'USDT',
            walletAddress: '',
            chain: requestedChainInput || 'multi',
          },
          error: 'walletAddress is required.',
        },
        { status: 400 },
      );
    }
    if (!isWalletAddress(walletAddress)) {
      return NextResponse.json(
        {
          result: {
            balance: '0',
            displayValue: '0',
            currency: 'USDT',
            walletAddress,
            chain: requestedChainInput || 'multi',
          },
          error: 'walletAddress format is invalid.',
        },
        { status: 400 },
      );
    }

    const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';
    const thirdwebClientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || fallbackThirdwebClientId || '';
    if (!thirdwebSecretKey && !thirdwebClientId) {
      return NextResponse.json(
        {
          result: {
            balance: '0',
            displayValue: '0',
            currency: 'USDT',
            walletAddress,
            chain: requestedChainInput || 'multi',
          },
          error: 'THIRDWEB client configuration is missing.',
        },
        { status: 500 },
      );
    }

    const thirdwebClient = thirdwebSecretKey
      ? createThirdwebClient({ secretKey: thirdwebSecretKey })
      : createThirdwebClient({ clientId: thirdwebClientId });

    const balancesByChain = await Promise.all(
      chainKeysToQuery.map(async (chainKey) => {
        try {
          return await readBalanceByChain({
            walletAddress,
            chainKey,
            thirdwebClient,
          });
        } catch (error) {
          const fallbackConfig = resolveUsdtContractConfig(chainKey);
          return {
            chain: fallbackConfig.chainKey,
            balance: '0',
            displayValue: '0',
            decimals: fallbackConfig.decimals,
            rawBalance: '0',
            error: error instanceof Error ? error.message : String(error || 'failed to fetch balance'),
          } satisfies ChainBalanceSnapshot;
        }
      }),
    );

    const resolvedBalances = balancesByChain.filter((item) => !item.error);
    if (resolvedBalances.length <= 0) {
      const errorMessage = balancesByChain
        .map((item) => item.error)
        .filter((item): item is string => Boolean(item))
        .join(' | ') || 'failed to fetch balance';
      return NextResponse.json(
        {
          result: {
            balance: '0',
            displayValue: '0',
            currency: 'USDT',
            walletAddress,
            chain: requestedChainInput || 'multi',
            balancesByChain,
          },
          error: errorMessage,
        },
        { status: 502 },
      );
    }

    const totalUsdtAmount = resolvedBalances.reduce((sum, item) => {
      const numeric = Number(item.displayValue || 0);
      if (!Number.isFinite(numeric)) return sum;
      return sum + numeric;
    }, 0);
    const displayValue = formatUsdtAmount(totalUsdtAmount);

    return NextResponse.json({
      result: {
        balance: displayValue,
        displayValue,
        currency: 'USDT',
        walletAddress,
        chain: requestedChainInput ? normalizedRequestedChainKey : 'multi',
        balancesByChain,
      },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'unknown error');
    console.error('getUSDTBalanceByWalletAddress error', error);
    const statusCode = message.toLowerCase().includes('timed out') ? 504 : 500;
    return NextResponse.json({
      result: {
        balance: '0',
        displayValue: '0',
        currency: 'USDT',
        walletAddress: '',
      },
      error: message,
    }, { status: statusCode });
  }
}
