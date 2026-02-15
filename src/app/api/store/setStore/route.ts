import { NextResponse, type NextRequest } from "next/server";

import {
	insertStore,
} from '@lib/api/store';

const generateStoreCode = () => {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

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

 
  return NextResponse.json({

    result,
    
  });
  
}
