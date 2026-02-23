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
import { getOne } from '@/lib/api/client';

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

const resolveCreditWalletAddress = (clientInfo: ClientDoc | null): string => {
  const smartAccountAddress = String(
    clientInfo?.creditWallet?.smartAccountAddress || clientInfo?.smartAccountAddress || ''
  ).trim();
  if (isWalletAddress(smartAccountAddress)) {
    return smartAccountAddress;
  }

  const signerAddress = String(
    clientInfo?.creditWallet?.signerAddress || clientInfo?.signerAddress || ''
  ).trim();
  if (isWalletAddress(signerAddress)) {
    return signerAddress;
  }

  return '';
};

export async function POST(request: NextRequest) {
  if (!clientId) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_TEMPLATE_CLIENT_ID is not configured' },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const requestedWalletAddress = String(body?.walletAddress || '').trim();

  const clientInfo = (await getOne(clientId)) as ClientDoc | null;
  const walletAddress = isWalletAddress(requestedWalletAddress)
    ? requestedWalletAddress
    : resolveCreditWalletAddress(clientInfo);

  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Client credit wallet is not configured' },
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
    const usdtContract = getContract({
      client: thirdwebClient,
      chain,
      address: usdtContractAddress,
    });

    const rawBalance = await balanceOf({
      contract: usdtContract,
      address: walletAddress,
    });
    const rawBigInt = toBigIntSafe(rawBalance);

    return NextResponse.json({
      result: {
        chain: chainKey,
        usdtContractAddress,
        walletAddress,
        rawValue: rawBigInt.toString(),
        displayValue: formatTokenBalance(rawBigInt, decimals, 6),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('getCreditWalletBalance error', error);
    return NextResponse.json(
      { error: 'Failed to fetch client credit wallet balance' },
      { status: 500 },
    );
  }
}

