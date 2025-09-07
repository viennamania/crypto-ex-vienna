import { NextResponse, type NextRequest } from "next/server";

import {
	getUserByNickname,
} from '@lib/api/user';



export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    storecode,
    telegramId,
  } = body;


  //console.log("walletAddress", walletAddress);


  const result = await getUserByNickname(
    storecode,
    telegramId,
  );

  //console.log("getUserByNickname result", result);

 
  return NextResponse.json({

    result,
    
  });
  
}
