import { NextResponse, type NextRequest } from "next/server";

import {
  UserProps,
	cancelTradeByBuyer,
} from '@lib/api/order';

// Download the helper library from https://www.twilio.com/docs/node/install
import twilio from "twilio";

const toText = (value: unknown) => String(value ?? '').trim();

const getClientIp = (request: NextRequest) => {
  const xForwardedFor = toText(request.headers.get('x-forwarded-for'));
  if (xForwardedFor) {
    const [firstIp] = xForwardedFor.split(',');
    const normalizedFirstIp = toText(firstIp);
    if (normalizedFirstIp) {
      return normalizedFirstIp;
    }
  }

  const fallbackHeaders = [
    'x-real-ip',
    'cf-connecting-ip',
    'x-vercel-forwarded-for',
    'x-client-ip',
    'true-client-ip',
    'x-original-forwarded-for',
  ];
  for (const headerName of fallbackHeaders) {
    const headerValue = toText(request.headers.get(headerName));
    if (headerValue) {
      return headerValue;
    }
  }

  return '';
};

const getClientUserAgent = (request: NextRequest) =>
  toText(request.headers.get('user-agent'));

export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    orderId,
    walletAddress,
    cancelTradeReason,
    cancelledByIpAddress: rawCancelledByIpAddress,
    cancelledByUserAgent: rawCancelledByUserAgent,
   } = body;

  const cancelledByIpAddress =
    typeof rawCancelledByIpAddress === 'string' ? rawCancelledByIpAddress.trim() : '';
  const cancelledByUserAgent =
    typeof rawCancelledByUserAgent === 'string' ? rawCancelledByUserAgent.trim() : '';

  //console.log("orderId", orderId);
  //console.log("walletAddress", walletAddress);
  

  const result = await cancelTradeByBuyer({
    orderId: orderId,
    walletAddress: walletAddress,
    cancelTradeReason: cancelTradeReason,
    cancelledByIpAddress: cancelledByIpAddress || getClientIp(request),
    cancelledByUserAgent: cancelledByUserAgent || getClientUserAgent(request),
  });

  ////console.log("result", result);


  if (result) {


    const tradeId = result.updated?.tradeId;
    const to = result.updated?.mobile || "";
    const buyer = result.updated?.buyer;



    /*
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = twilio(accountSid, authToken);
    


    let message = null;

    try {

      const msgBody = `[GTETHER] TID[${tradeId}] Your sell order has been cancelled by ${buyer?.nickname}!`;

      message = await client.messages.create({
        ///body: "This is the ship that made the Kessel Run in fourteen parsecs?",
        body: msgBody,
        from: "+17622254217",
        to: to,
      });

      console.log(message.sid);

    } catch (e) {
      console.error('Error sending SMS', e);
    }
    */



    return NextResponse.json({

      result: true,
      
    });  
  } else {
 
    return NextResponse.json({

      result: false,
      
    });

  }
  
}
