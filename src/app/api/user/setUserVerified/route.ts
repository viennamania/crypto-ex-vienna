import { NextResponse, type NextRequest } from "next/server";

import {
	insertOneVerified,
} from '@lib/api/user';



export async function POST(request: NextRequest) {

  const body = await request.json();

  const { storecode, walletAddress, nickname, mobile, email, telegramId } = body;




  const result = await insertOneVerified({
    storecode: storecode,
    walletAddress: walletAddress,
    nickname: nickname,
    mobile: mobile,
    email: email,
    telegramId: telegramId,
  });


 
  return NextResponse.json({
    
    result,
    
  });
  
}
