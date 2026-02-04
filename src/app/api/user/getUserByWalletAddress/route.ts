import { NextResponse, type NextRequest } from "next/server";

import {
	getOneByWalletAddress,
} from '@lib/api/user';

import {
  createThirdwebClient,
  getUser
} from "thirdweb";

export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    storecode,
    walletAddress
  } = body;


  //console.log("walletAddress", walletAddress);



  // optional: verify existence on-chain via thirdweb, but do not block if it fails
  try {
    const client = createThirdwebClient({
      secretKey: process.env.THIRDWEB_SECRET_KEY || "",
    });
  
    const user = await getUser({
      client,
      walletAddress: walletAddress,
    });
  
    console.log("thirdweb user lookup", user);
  } catch (error) {
    console.warn("thirdweb user lookup failed (non-blocking)", error);
  }



  const result = await getOneByWalletAddress(
    storecode,
    walletAddress
  );


 
  return NextResponse.json({

    result,
    
  });
  
}
