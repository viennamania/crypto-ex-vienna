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
  let thirdwebUser: any = null;
  const secretKey = process.env.THIRDWEB_SECRET_KEY;
  if (!secretKey) {
    console.warn("thirdweb user lookup skipped: THIRDWEB_SECRET_KEY not set");
  } else if (!walletAddress) {
    console.warn("thirdweb user lookup skipped: walletAddress missing in request body");
  } else {
    try {
      const client = createThirdwebClient({
        secretKey,
      });
    
      thirdwebUser = await getUser({
        client,
        walletAddress: walletAddress,
      });
    
      console.log("thirdweb user lookup", thirdwebUser);
    } catch (error) {
      console.warn("thirdweb user lookup failed (non-blocking)", error);
    }
  }



  const result = await getOneByWalletAddress(
    storecode,
    walletAddress
  );


 
  return NextResponse.json({

    result,
    thirdwebUser,
    
  });
  
}
