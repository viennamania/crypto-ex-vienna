import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, Engine } from 'thirdweb';

import { getOne, upsertOne } from '@/lib/api/client';

type ClientDoc = {
  clientId?: string;
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

const resolveSignerAddress = (createdWallet: any): string => {
  const candidates = [
    createdWallet?.address,
    createdWallet?.walletAddress,
    createdWallet?.serverWalletAddress,
    createdWallet?.account?.address,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
};

const resolveSmartAccountAddress = (createdWallet: any): string => {
  const value = createdWallet?.smartAccountAddress;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return '';
};

const resolveCreditWallet = (clientInfo: ClientDoc | null) => {
  const signerAddress = String(
    clientInfo?.creditWallet?.signerAddress || clientInfo?.signerAddress || ''
  ).trim();
  const smartAccountAddress = String(
    clientInfo?.creditWallet?.smartAccountAddress || clientInfo?.smartAccountAddress || ''
  ).trim();

  return {
    signerAddress: isWalletAddress(signerAddress) ? signerAddress : '',
    smartAccountAddress: isWalletAddress(smartAccountAddress) ? smartAccountAddress : '',
  };
};

export async function POST(_request: NextRequest) {
  if (!clientId) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_TEMPLATE_CLIENT_ID is not configured' },
      { status: 500 },
    );
  }

  const clientInfo = (await getOne(clientId)) as ClientDoc | null;
  const existingWallet = resolveCreditWallet(clientInfo);

  const hasExistingWallet =
    isWalletAddress(existingWallet.smartAccountAddress)
    || isWalletAddress(existingWallet.signerAddress);

  if (hasExistingWallet) {
    const normalizedSmartAccountAddress = isWalletAddress(existingWallet.smartAccountAddress)
      ? existingWallet.smartAccountAddress
      : existingWallet.signerAddress;
    const normalizedSignerAddress = isWalletAddress(existingWallet.signerAddress)
      ? existingWallet.signerAddress
      : normalizedSmartAccountAddress;

    const nowIso = new Date().toISOString();
    await upsertOne(clientId, {
      creditWallet: {
        signerAddress: normalizedSignerAddress,
        smartAccountAddress: normalizedSmartAccountAddress,
      },
      updatedAt: nowIso,
    });

    return NextResponse.json({
      result: {
        clientId,
        creditWallet: {
          signerAddress: normalizedSignerAddress,
          smartAccountAddress: normalizedSmartAccountAddress,
        },
        created: false,
      },
    });
  }

  const secretKey = process.env.THIRDWEB_SECRET_KEY || '';
  if (!secretKey) {
    return NextResponse.json(
      { error: 'THIRDWEB_SECRET_KEY is not configured' },
      { status: 500 },
    );
  }

  try {
    const thirdwebClient = createThirdwebClient({ secretKey });
    const createdWallet = (await Engine.createServerWallet({
      client: thirdwebClient,
      label: `client-${clientId}-credit-${Date.now()}`,
    })) as any;

    const signerAddress = resolveSignerAddress(createdWallet);
    const maybeSmartAccountAddress = resolveSmartAccountAddress(createdWallet);
    const smartAccountAddress = isWalletAddress(maybeSmartAccountAddress)
      ? maybeSmartAccountAddress
      : signerAddress;

    if (!isWalletAddress(signerAddress) || !isWalletAddress(smartAccountAddress)) {
      return NextResponse.json(
        { error: 'Failed to create client credit wallet address' },
        { status: 500 },
      );
    }

    const nowIso = new Date().toISOString();
    await upsertOne(clientId, {
      creditWallet: {
        signerAddress,
        smartAccountAddress,
      },
      updatedAt: nowIso,
    });

    return NextResponse.json({
      result: {
        clientId,
        creditWallet: {
          signerAddress,
          smartAccountAddress,
        },
        created: true,
      },
    });
  } catch (error) {
    console.error('createCreditWalletAddress error', error);
    return NextResponse.json(
      { error: 'Failed to create client credit wallet address' },
      { status: 500 },
    );
  }
}
