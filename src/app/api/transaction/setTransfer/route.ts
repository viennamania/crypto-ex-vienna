import { NextResponse, type NextRequest } from "next/server";

import {
	insertOne,
} from '@lib/api/transaction';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import { getRequesterIpAddress, verifyWalletAuthFromBody } from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';


// Download the helper library from https://www.twilio.com/docs/node/install
import twilio from "twilio";

const toText = (value: unknown) => String(value ?? '').trim();

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const lang = toText(body.lang);
  const chain = toText(body.chain);
  const amount = Number(body.amount ?? 0);
  const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);
  const toWalletAddress = normalizeWalletAddress(body.toWalletAddress);
  const storecode = toText(body.storecode);
  const ipAddress = getRequesterIpAddress(request) || 'unknown';

  const rate = evaluateRateLimit({
    key: `api:transaction:setTransfer:${ipAddress}:${requestedWalletAddress || 'unknown'}`,
    limit: 20,
    windowMs: 60_000,
  });

  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(Math.ceil(rate.retryAfterMs / 1000), 1)),
        },
      },
    );
  }

  const signatureAuth = await verifyWalletAuthFromBody({
    body,
    path: '/api/transaction/setTransfer',
    method: 'POST',
    storecode: storecode || 'admin',
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const walletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : requestedWalletAddress;

  if (!isWalletAddress(walletAddress) || !isWalletAddress(toWalletAddress)) {
    return NextResponse.json(
      { error: 'walletAddress and toWalletAddress must be valid EVM addresses.' },
      { status: 400 },
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'amount must be greater than 0.' },
      { status: 400 },
    );
  }

  if (
    signatureAuth.ok === true &&
    requestedWalletAddress &&
    requestedWalletAddress !== signatureAuth.walletAddress
  ) {
    return NextResponse.json(
      {
        error: 'walletAddress must match the signed wallet.',
      },
      { status: 403 },
    );
  }

  console.log("lang", lang);
  console.log("chain", chain);
  console.log("walletAddress", walletAddress);
  console.log("amount", amount);
  console.log("toWalletAddress", toWalletAddress);

  const result = await insertOne({
    chain: chain,
    walletAddress: walletAddress,
    amount: amount,
    toWalletAddress: toWalletAddress,
  });

  //console.log("result", result);


  
  if (result) {

      // send sms to user mobile number


      // send sms

      const to = result.toMobileNumber;
      const fromUserNickname = result.fromUserNickname;



      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const client = twilio(accountSid, authToken);



      let message = null;


      try {

        let body = '';

        if (lang === 'en') {
          body = `[GTETHER] You have received ${amount} USDT from ${fromUserNickname}!`;
        } else if (lang === 'kr') {
          body = `[GTETHER] ${fromUserNickname}님으로부터 ${amount} USDT를 받았습니다!`;
        } else {
          body = `[GTETHER] You have received ${amount} USDT from ${fromUserNickname}!`;
        }

        message = await client.messages.create({
          ///body: "This is the ship that made the Kessel Run in fourteen parsecs?",
          body: body,
          from: "+17622254217",
          to: to,
        });

        console.log(message.sid);

      } catch (e) {
        console.error('Error sending SMS', e);
      }

  }


 
  return NextResponse.json({

    result,
    
  });
  
}
