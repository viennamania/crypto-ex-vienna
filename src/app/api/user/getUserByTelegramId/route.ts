import { NextResponse, type NextRequest } from "next/server";

import {
	getOneByTelegramId,
} from '@lib/api/user';



export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    telegramId,
    storecode,
  } = body;


  //console.log("walletAddress", walletAddress);


  const result = await getOneByTelegramId(
    telegramId,
    storecode,
  );


 
  return NextResponse.json({

    result,
    
  });
  
}
