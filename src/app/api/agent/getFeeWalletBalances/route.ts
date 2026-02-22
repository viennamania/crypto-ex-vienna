import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, getContract } from 'thirdweb';
import { balanceOf } from 'thirdweb/extensions/erc20';
import { ethereum, polygon, arbitrum, bsc } from 'thirdweb/chains';

import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';
import clientPromise, { dbName } from '@/lib/mongodb';

type AgentDoc = {
  agentcode?: string;
  creditWallet?: {
    smartAccountAddress?: string;
  };
  // Legacy fallback field
  smartAccountAddress?: string;
};

type BalanceTarget = {
  agentcode: string;
  walletAddress: string;
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const normalizeAddress = (value: string) => String(value || '').trim().toLowerCase();

const toBigIntSafe = (value: unknown): bigint => {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string' && value.trim()) return BigInt(value.trim());
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return BigInt(Math.floor(value));
  } catch (_error) {
    // ignore parsing error and return zero
  }
  return 0n;
};

const formatTokenBalance = (rawValue: bigint, decimals: number, fractionDigits = 6): string => {
  const normalizedDecimals = Math.max(0, Math.floor(decimals));
  const divider = 10n ** BigInt(normalizedDecimals);

  const whole = rawValue / divider;
  const remainder = rawValue % divider;

  if (normalizedDecimals === 0) {
    return whole.toString();
  }

  const usedFractionDigits = Math.max(0, Math.min(normalizedDecimals, Math.floor(fractionDigits)));
  if (usedFractionDigits === 0) {
    return whole.toString();
  }

  const fractionText = remainder
    .toString()
    .padStart(normalizedDecimals, '0')
    .slice(0, usedFractionDigits)
    .replace(/0+$/, '');

  return fractionText ? `${whole.toString()}.${fractionText}` : whole.toString();
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

const resolveBalanceTargets = async (body: any): Promise<BalanceTarget[]> => {
  const items = Array.isArray(body?.items) ? body.items : [];

  const targetsFromBody = items
    .map((item: unknown) => {
      const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
      const agentcode = String(source.agentcode || '').trim();
      const walletAddress = String(source.walletAddress || '').trim();
      return {
        agentcode,
        walletAddress,
      };
    })
    .filter((item: BalanceTarget) => item.agentcode && isWalletAddress(item.walletAddress));

  if (targetsFromBody.length > 0) {
    return targetsFromBody;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection<AgentDoc>('agents');
  const agents = await collection
    .find(
      {},
      {
        projection: {
          _id: 0,
          agentcode: 1,
          'creditWallet.smartAccountAddress': 1,
          smartAccountAddress: 1,
        },
      }
    )
    .limit(500)
    .toArray();

  return agents
    .map((agent) => {
      const smartAccountAddress = String(
        agent?.creditWallet?.smartAccountAddress || agent?.smartAccountAddress || ''
      ).trim();
      const walletAddress = isWalletAddress(smartAccountAddress) ? smartAccountAddress : '';

      return {
        agentcode: String(agent?.agentcode || '').trim(),
        walletAddress,
      };
    })
    .filter((item) => item.agentcode && isWalletAddress(item.walletAddress));
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const targets = await resolveBalanceTargets(body);

  if (targets.length === 0) {
    return NextResponse.json({
      result: {
        items: [],
        updatedAt: new Date().toISOString(),
      },
    });
  }

  const secretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!secretKey) {
    return NextResponse.json({ error: 'THIRDWEB_SECRET_KEY is not configured' }, { status: 500 });
  }

  const { chainKey, chain, usdtContractAddress, decimals } = resolveChainConfig();

  try {
    const thirdwebClient = createThirdwebClient({ secretKey });
    const usdtContract = getContract({
      client: thirdwebClient,
      chain,
      address: usdtContractAddress,
    });

    const walletAddressByKey = new Map<string, string>();
    targets.forEach((target) => {
      const key = normalizeAddress(target.walletAddress);
      if (!walletAddressByKey.has(key)) {
        walletAddressByKey.set(key, target.walletAddress);
      }
    });

    const balanceByWalletKey = new Map<
      string,
      {
        rawValue: string;
        displayValue: string;
        error?: string;
      }
    >();

    await Promise.all(
      Array.from(walletAddressByKey.entries()).map(async ([walletKey, walletAddress]) => {
        try {
          const rawBalance = await balanceOf({
            contract: usdtContract,
            address: walletAddress,
          });
          const rawBigInt = toBigIntSafe(rawBalance);
          balanceByWalletKey.set(walletKey, {
            rawValue: rawBigInt.toString(),
            displayValue: formatTokenBalance(rawBigInt, decimals, 6),
          });
        } catch (error) {
          balanceByWalletKey.set(walletKey, {
            rawValue: '0',
            displayValue: '0',
            error: error instanceof Error ? error.message : 'BALANCE_FETCH_FAILED',
          });
        }
      })
    );

    const items = targets.map((target) => {
      const walletKey = normalizeAddress(target.walletAddress);
      const balance = balanceByWalletKey.get(walletKey) || {
        rawValue: '0',
        displayValue: '0',
        error: 'BALANCE_NOT_FOUND',
      };

      return {
        agentcode: target.agentcode,
        walletAddress: target.walletAddress,
        rawValue: balance.rawValue,
        displayValue: balance.displayValue,
        error: balance.error,
      };
    });

    return NextResponse.json({
      result: {
        chain: chainKey,
        usdtContractAddress,
        items,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('getFeeWalletBalances error', error);
    return NextResponse.json({ error: 'Failed to fetch fee wallet balances' }, { status: 500 });
  }
}
