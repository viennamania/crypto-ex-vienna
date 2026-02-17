import { NextResponse, type NextRequest } from "next/server";

import {
  updateStorePaymentWalletAddress,
	insertStore,
} from '@lib/api/store';

import {
  createThirdwebClient,
  Engine,
} from "thirdweb";

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
      || ''
  ).trim();

export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    walletAddress,
    agentcode,
    storeName,
    storeType,
    storeUrl,
    storeDescription,
    storeLogo,
    storeBanner,
  } = body;



  console.log("body", body);

  const normalizedStoreName = String(storeName || '').trim();
  if (!normalizedStoreName) {
    return NextResponse.json({
      result: null,
    });
  }

  let result = null;

  // storecode is always generated server-side.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const generatedStoreCode = generateStoreCode();
    result = await insertStore({
      walletAddress,
      agentcode,
      storecode: generatedStoreCode,
      storeName: normalizedStoreName,
      storeType,
      storeUrl,
      storeDescription,
      storeLogo,
      storeBanner,
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

  const createdStorecode = String(result?.storecode || '').trim();
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
