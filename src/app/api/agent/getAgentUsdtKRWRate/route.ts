import { NextResponse, type NextRequest } from "next/server";

import {
	getUsdtKRWRate,
} from '@lib/api/agent';

import {
  getOne
} from '@lib/api/client';

export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    agentcode,
  } = body;



  let rateKRW = 1400;

  const client = await getOne(agentcode);

  if (client?.exchangeRateUSDT?.KRW) {
    rateKRW = client.exchangeRateUSDT.KRW;
  }


  const result = await getUsdtKRWRate({
    agentcode,
  });

  if (result) {
    rateKRW = result;
  }




  return NextResponse.json({
    result: rateKRW,
  });
  
}
