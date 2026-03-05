import { NextResponse, type NextRequest } from 'next/server';

import {
  updateStorePaymentWalletAddress,
  insertStore,
} from '@lib/api/store';
import clientPromise, { dbName } from '@/lib/mongodb';
import {
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';

import {
  createThirdwebClient,
  Engine,
} from 'thirdweb';

const toText = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const generateStoreCode = () => {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const resolveEngineWalletAddress = (createdWallet: any): string =>
  String(
    createdWallet?.smartAccountAddress
      || createdWallet?.address
      || createdWallet?.walletAddress
      || createdWallet?.account?.address
      || '',
  ).trim();

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const walletAddress = toText(body.walletAddress || body.requesterWalletAddress);
  const normalizedAgentcode = toText(body.agentcode || body.agetcode) || 'head';
  const normalizedStoreName = toText(body.storeName);

  if (!normalizedStoreName) {
    return NextResponse.json({
      result: null,
    });
  }

  const signatureAuth = await verifyWalletAuthFromBody({
    body,
    path: '/api/store/setStore',
    method: 'POST',
    storecode: normalizedAgentcode || 'admin',
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  if (signatureAuth.ok === true) {
    const client = await clientPromise;
    const agentCollection = client.db(dbName).collection('agents');
    const agent = await agentCollection.findOne<Record<string, unknown>>(
      {
        agentcode: {
          $regex: `^${escapeRegex(normalizedAgentcode)}$`,
          $options: 'i',
        },
      },
      {
        projection: {
          _id: 0,
          adminWalletAddress: 1,
        },
      },
    );

    if (!agent) {
      return NextResponse.json({ error: 'agent not found' }, { status: 404 });
    }

    const adminWalletAddress = toText(agent.adminWalletAddress);
    if (!isWalletAddress(adminWalletAddress)) {
      return NextResponse.json({ error: 'agent admin wallet address is not configured' }, { status: 400 });
    }

    const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
      expectedWalletAddress: adminWalletAddress,
      candidateWalletAddress: signatureAuth.walletAddress,
    });

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Only agent admin wallet can create store' }, { status: 403 });
    }
  }

  let result = null;
  const requesterWalletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : walletAddress;

  // storecode is always generated server-side.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const generatedStoreCode = generateStoreCode();
    result = await insertStore({
      walletAddress: requesterWalletAddress,
      agentcode: normalizedAgentcode,
      storecode: generatedStoreCode,
      storeName: normalizedStoreName,
      storeType: body.storeType,
      storeUrl: body.storeUrl,
      storeDescription: body.storeDescription,
      storeLogo: body.storeLogo,
      storeBanner: body.storeBanner,
    });
    if (result) {
      break;
    }
  }

  if (!result) {
    return NextResponse.json({
      result,
    });
  }

  const createdStorecode = String((result as Record<string, unknown>)?.storecode || '').trim();
  let paymentWalletAddress = '';
  let paymentWalletCreated = false;
  let paymentWalletError = '';

  if (createdStorecode) {
    const thirdwebSecretKey = process.env.THIRDWEB_SECRET_KEY || '';

    if (!thirdwebSecretKey) {
      paymentWalletError = 'THIRDWEB_SECRET_KEY is not configured';
    } else {
      try {
        const thirdwebClient = createThirdwebClient({
          secretKey: thirdwebSecretKey,
        });

        const createdWallet = await Engine.createServerWallet({
          client: thirdwebClient,
          label: `store-${createdStorecode}-payment-${Date.now()}`,
        }) as any;

        const resolvedAddress = resolveEngineWalletAddress(createdWallet);
        if (!isWalletAddress(resolvedAddress)) {
          throw new Error('failed to create payment wallet address');
        }

        const updated = await updateStorePaymentWalletAddress({
          storecode: createdStorecode,
          paymentWalletAddress: resolvedAddress,
        });

        if (!updated) {
          throw new Error('failed to update store payment wallet address');
        }

        paymentWalletAddress = resolvedAddress;
        paymentWalletCreated = true;
      } catch (error) {
        paymentWalletError = error instanceof Error ? error.message : 'failed to create payment wallet address';
        console.error('setStore payment wallet create error', {
          storecode: createdStorecode,
          error,
        });
      }
    }
  }

  return NextResponse.json({
    result: {
      ...result,
      paymentWalletAddress,
      paymentWalletCreated,
      paymentWalletError,
    },
  });
}
