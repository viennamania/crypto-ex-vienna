import { NextResponse, type NextRequest } from "next/server";

import {
	getPayUserByTelegramId,
} from '@lib/api/user';



export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    telegramId,
  } = body;


  //console.log("walletAddress", walletAddress);


  const result = await getPayUserByTelegramId(
    telegramId,
  );

  //console.log("getPayUserByTelegramId result", result);

 
  return NextResponse.json({

    result,
    
  });
  
}
