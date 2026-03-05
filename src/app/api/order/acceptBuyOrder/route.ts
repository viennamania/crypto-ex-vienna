import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import {
	acceptBuyOrder,
} from '@lib/api/order';
import clientPromise, { dbName } from '@lib/mongodb';

const APPLICATION_ID =
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID || process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || '';
const API_BASE = APPLICATION_ID ? `https://api-${APPLICATION_ID}.sendbird.com/v3` : '';
const REQUEST_TIMEOUT_MS = Number(process.env.SENDBIRD_REQUEST_TIMEOUT_MS ?? 8000);

const toTrimmedString = (value: unknown) => String(value ?? '').trim();

const toNormalizedSendbirdUserIds = (values: string[]): string[] => {
  const byLowerValue = new Map<string, string>();
  for (const source of values) {
    const normalized = toTrimmedString(source);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!byLowerValue.has(key)) {
      byLowerValue.set(key, normalized);
    }
  }
  return Array.from(byLowerValue.values());
};

const parseCenterAdminChatUserIds = () =>
  toNormalizedSendbirdUserIds([
    toTrimmedString(process.env.NEXT_PUBLIC_SENDBIRD_MANAGER_ID),
    toTrimmedString(process.env.SENDBIRD_MANAGER_ID),
    ...String(process.env.SENDBIRD_CENTER_ADMIN_USER_IDS || '')
      .split(',')
      .map((item) => toTrimmedString(item))
      .filter(Boolean),
  ]);

const fetchSendbirdWithTimeout = async (
  label: string,
  url: string,
  init: RequestInit,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    throw new Error(
      isTimeout
        ? `[${label}] Sendbird request timed out`
        : `[${label}] Sendbird request failed`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

const createSendbirdUserIfNeeded = async (
  headers: Record<string, string>,
  userId: string,
) => {
  const response = await fetchSendbirdWithTimeout(
    `create-user:${userId}`,
    `${API_BASE}/users`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId,
        nickname: userId,
      }),
    },
  );

  if (response.ok) {
    return;
  }

  const error = await response.json().catch(() => null);
  const message = toTrimmedString(error?.message).toLowerCase();
  if (message.includes('already') || message.includes('exist') || message.includes('unique constraint')) {
    return;
  }

  throw new Error(toTrimmedString(error?.message) || 'Failed to create Sendbird user');
};

const ensureSendbirdTradeGroupChannel = async ({
  headers,
  orderId,
  tradeId,
  buyerWalletAddress,
  sellerWalletAddress,
  sellerStorecode,
  participantUserIds,
}: {
  headers: Record<string, string>;
  orderId: string;
  tradeId: string;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  sellerStorecode: string;
  participantUserIds: string[];
}): Promise<{ channelUrl: string; created: boolean }> => {
  const preferredChannelUrl = toTrimmedString(orderId);

  const response = await fetchSendbirdWithTimeout(
    `group-channel:${tradeId || preferredChannelUrl || `${buyerWalletAddress}:${sellerWalletAddress}`}`,
    `${API_BASE}/group_channels`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: `거래번호: #${tradeId || preferredChannelUrl || 'unknown'}`,
        channel_url: preferredChannelUrl || undefined,
        cover_url: 'https://stable.makeup/icon-trade.png',
        custom_type: 'trade',
        user_ids: participantUserIds,
        is_distinct: false,
        data: JSON.stringify({
          tradeId,
          buyerWalletAddress,
          sellerWalletAddress,
          sellerStorecode,
        }),
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = toTrimmedString(error?.message).toLowerCase();

    if (
      preferredChannelUrl
      && (message.includes('already') || message.includes('exist') || message.includes('unique'))
    ) {
      const getResponse = await fetchSendbirdWithTimeout(
        `group-channel-get:${preferredChannelUrl}`,
        `${API_BASE}/group_channels/${encodeURIComponent(preferredChannelUrl)}`,
        {
          method: 'GET',
          headers,
        },
      );

      if (getResponse.ok) {
        const getData = await getResponse.json().catch(() => null);
        const existingChannelUrl = toTrimmedString(getData?.channel_url);
        if (existingChannelUrl) {
          return {
            channelUrl: existingChannelUrl,
            created: false,
          };
        }
      }
    }

    throw new Error(toTrimmedString(error?.message) || 'Failed to create Sendbird group channel');
  }

  const data = await response.json().catch(() => null);
  const channelUrl = toTrimmedString(data?.channel_url);
  if (!channelUrl) {
    throw new Error('channel_url missing from Sendbird response');
  }

  return {
    channelUrl,
    created: true,
  };
};

type ChatChannelResult = {
  attempted: boolean;
  created: boolean;
  channelUrl: string;
  participants: string[];
  reason: string;
};

const persistOrderChatChannelUrl = async ({
  orderId,
  channelUrl,
}: {
  orderId: string;
  channelUrl: string;
}) => {
  const normalizedOrderId = toTrimmedString(orderId);
  const normalizedChannelUrl = toTrimmedString(channelUrl);
  if (!ObjectId.isValid(normalizedOrderId) || !normalizedChannelUrl) {
    return;
  }

  const client = await clientPromise;
  const collection = client.db(dbName).collection('buyorders');
  await collection.updateOne(
    { _id: new ObjectId(normalizedOrderId) },
    {
      $set: {
        'buyerConsent.channelUrl': normalizedChannelUrl,
      },
    },
  );
};


export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    lang,
    storecode,
    
    orderId,

    sellerWalletAddress,
    sellerStorecode,
    sellerMemo,
    //sellerNickname, sellerAvatar, sellerMobile, seller

    tradeId: tradeIdFromBody,
    buyerWalletAddress,
  } = body;

  ///console.log("acceptBuyOrder body", body);


  /*
  {
    lang: 'ko',
    storecode: 'suroggyc',
    orderId: new ObjectId('6827479e460e1b9e73417ebc'),
    sellerWalletAddress: '0x98773aF65AE660Be4751ddd09C4350906e9D88F3',
    sellerStorecode: 'admin'
  }
  */

  

  const result = await acceptBuyOrder({
    lang: lang,
    storecode: storecode,
    orderId: orderId,
    sellerWalletAddress: sellerWalletAddress,
    sellerStorecode: sellerStorecode || "admin",
    sellerMemo: sellerMemo,

    /*
    sellerNickname: sellerNickname,
    sellerAvatar: sellerAvatar,
    sellerMobile: sellerMobile,
    seller: seller,
    */

  });

  //console.log("result", result);

  const chatChannel: ChatChannelResult = {
    attempted: false,
    created: false,
    channelUrl: '',
    participants: [],
    reason: 'not_attempted',
  };

  if (result) {
    const acceptedOrder = result as Record<string, any>;
    const resolvedOrderId =
      toTrimmedString(orderId)
      || toTrimmedString(acceptedOrder?._id)
      || toTrimmedString(acceptedOrder?.orderId);
    const resolvedTradeId =
      toTrimmedString(acceptedOrder?.tradeId)
      || toTrimmedString(tradeIdFromBody);
    const resolvedBuyerWalletAddress =
      toTrimmedString(acceptedOrder?.walletAddress)
      || toTrimmedString(acceptedOrder?.buyer?.walletAddress)
      || toTrimmedString(buyerWalletAddress);
    const resolvedSellerWalletAddress =
      toTrimmedString(acceptedOrder?.seller?.walletAddress)
      || toTrimmedString(sellerWalletAddress);
    const resolvedSellerStorecode =
      toTrimmedString(acceptedOrder?.seller?.storecode)
      || toTrimmedString(sellerStorecode)
      || 'admin';
    const participantUserIds = toNormalizedSendbirdUserIds([
      resolvedBuyerWalletAddress,
      resolvedSellerWalletAddress,
      ...parseCenterAdminChatUserIds(),
    ]);

    chatChannel.participants = participantUserIds;

    if (participantUserIds.length < 2) {
      chatChannel.reason = 'insufficient_participants';
    } else if (!APPLICATION_ID) {
      chatChannel.reason = 'sendbird_application_id_missing';
    } else {
      const apiToken = process.env.SENDBIRD_API_TOKEN;
      if (!apiToken) {
        chatChannel.reason = 'sendbird_api_token_missing';
      } else {
        const sendbirdHeaders = {
          'Content-Type': 'application/json',
          'Api-Token': apiToken,
        };
        chatChannel.attempted = true;
        try {
          for (const participantUserId of participantUserIds) {
            await createSendbirdUserIfNeeded(sendbirdHeaders, participantUserId);
          }

          const ensuredChannel = await ensureSendbirdTradeGroupChannel({
            headers: sendbirdHeaders,
            orderId: resolvedOrderId,
            tradeId: resolvedTradeId,
            buyerWalletAddress: resolvedBuyerWalletAddress,
            sellerWalletAddress: resolvedSellerWalletAddress,
            sellerStorecode: resolvedSellerStorecode,
            participantUserIds,
          });

          chatChannel.created = ensuredChannel.created;
          chatChannel.channelUrl = ensuredChannel.channelUrl;
          chatChannel.reason = ensuredChannel.created ? 'created' : 'already_exists';
          try {
            await persistOrderChatChannelUrl({
              orderId: resolvedOrderId,
              channelUrl: ensuredChannel.channelUrl,
            });
          } catch (persistError) {
            console.error('Failed to persist buyorder chat channel url:', persistError);
          }
        } catch (error) {
          chatChannel.reason =
            error instanceof Error
              ? error.message
              : 'failed_to_create_sendbird_group_channel';
          console.error('Error creating Sendbird group channel:', error);
        }
      }
    }
  }


  /*
  const {
    mobile: mobile,
    buyer: buyer,
    tradeId: tradeId,
  } = result as UserProps;
  */

  // if mobile number is not prefix with country code don't send sms
  /*
  if (!mobile || !mobile.startsWith('+')) {
    return NextResponse.json({
      result,
    });
  }
    */


    // send sms
    /*
    const to = mobile;


    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = twilio(accountSid, authToken);



    let message = null;

   

    try {

      let msgBody = '';

      if (lang === 'en') {
        msgBody = `[GTETHER] TID[${tradeId}] Your buy order has been accepted by ${seller?.nickname}! You must escrow USDT to proceed with the trade in 10 minutes!`;
      } else if (lang === 'kr') {
        msgBody = `[GTETHER] TID[${tradeId}] ${seller?.nickname}님이 구매 주문을 수락했습니다! 거래를 계속하기 위해 USDT를 에스크로해야 합니다!`;
      } else {
        msgBody = `[GTETHER] TID[${tradeId}] Your buy order has been accepted by ${seller?.nickname}! You must escrow USDT to proceed with the trade in 10 minutes!`;
      }



      message = await client.messages.create({
        body: msgBody,
        from: "+17622254217",
        to: to,
      });

      console.log(message.sid);



    } catch (e) {
      console.error('error', e);
    }

    */





 
  return NextResponse.json({

    result,
    chatChannel,
    
  });
  
}
