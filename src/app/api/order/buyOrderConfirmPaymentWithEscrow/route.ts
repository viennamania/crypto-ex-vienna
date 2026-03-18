import { NextResponse, type NextRequest } from "next/server";

import {
  UserProps,
	buyOrderConfirmPayment,
  buyOrderGetOrderById,

  //buyOrderWebhook,

} from '@lib/api/order';


import {
  getOneByWalletAddress 
} from '@lib/api/user';

// Download the helper library from https://www.twilio.com/docs/node/install
import twilio from "twilio";
import { webhook } from "twilio/lib/webhooks/webhooks";
import { create } from "domain";




import {
  createThirdwebClient,
  eth_getTransactionByHash,
  getContract,
  sendAndConfirmTransaction,
  
  sendTransaction,
  sendBatchTransaction,
  eth_maxPriorityFeePerGas,


} from "thirdweb";

//import { polygonAmoy } from "thirdweb/chains";
import {
  ethereum,
  polygon,
  arbitrum,
  bsc,
 } from "thirdweb/chains";

import {
  privateKeyToAccount,
  smartWallet,
  getWalletBalance,
  
 } from "thirdweb/wallets";


import {
  mintTo,
  totalSupply,
  transfer,
  
  getBalance,

  balanceOf,

} from "thirdweb/extensions/erc20";




// NEXT_PUBLIC_CHAIN
const chain = process.env.NEXT_PUBLIC_CHAIN || "arbitrum";

import {
  bscContractAddressMKRW,
} from "../../../config/contractAddresses";



export const maxDuration = 60; // This function can run for a maximum of 60 seconds

const failureResponse = (
  message: string,
  status = 400,
  error = "BUY_ORDER_CONFIRM_PAYMENT_WITH_ESCROW_FAILED",
) => NextResponse.json(
  {
    result: null,
    message,
    error,
  },
  { status },
);


export async function POST(request: NextRequest) {

  console.log("buyOrderConfirmPaymentWithEscrow route.ts called");


  const body = await request.json();

  const {
    lang,
    storecode,
    orderId,
    paymentAmount,
    transactionHash,
    isSmartAccount
  } = body;


  console.log("lang", lang);
  console.log("storecode", storecode);

  console.log("orderId", orderId);

  console.log("paymentAmount", paymentAmount);






  
  try {



    // get buyer wallet address


    const order = await buyOrderGetOrderById( orderId );

    if (!order) {

      console.log("order not found");
      console.log("orderId", orderId);
      
      return failureResponse(
        "주문을 찾지 못했습니다.",
        404,
        "BUY_ORDER_NOT_FOUND",
      );
    }
    

    const {
      nickname: orderNickname,
      storecode: orderStorecode,
      seller: seller,
      walletAddress: walletAddress,
      usdtAmount: usdtAmount,
      buyer: buyer,
    } = order as UserProps;



    const sellerWalletAddress = seller.walletAddress;

    if (!sellerWalletAddress) {
      return failureResponse(
        "판매자 지갑 주소를 찾지 못했습니다.",
        400,
        "SELLER_WALLET_ADDRESS_NOT_FOUND",
      );
    }

    const user = await getOneByWalletAddress(
      storecode,
      sellerWalletAddress
    );

    ///console.log("user", user);

    if (!user) {
      return failureResponse(
        "가맹점 관리자 회원정보를 찾지 못했습니다.",
        404,
        "SELLER_USER_NOT_FOUND",
      );
    }







    const escrowWalletPrivateKey = order.escrowWallet.privateKey;

    if (!escrowWalletPrivateKey) {
      return failureResponse(
        "에스크로 지갑 개인키를 찾지 못했습니다.",
        400,
        "ESCROW_PRIVATE_KEY_NOT_FOUND",
      );
    }


    const client = createThirdwebClient({
      secretKey: process.env.THIRDWEB_SECRET_KEY || "",
    });

    if (!client) {
      return failureResponse(
        "지갑 클라이언트를 초기화하지 못했습니다.",
        500,
        "THIRDWEB_CLIENT_INIT_FAILED",
      );
    }


    const personalAccount = privateKeyToAccount({
      client,
      privateKey: escrowWalletPrivateKey,
    });
  
    if (!personalAccount) {
      return failureResponse(
        "에스크로 개인지갑 계정을 만들지 못했습니다.",
        500,
        "ESCROW_PERSONAL_ACCOUNT_FAILED",
      );
    }


    const wallet = smartWallet({
      chain: chain === "bsc" ? bsc : chain === "arbitrum" ? arbitrum : polygon,
      sponsorGas: true,
    });

    // Connect the smart wallet
    const account = await wallet.connect({
      client: client,
      personalAccount: personalAccount,
    });

    if (!account) {
      return failureResponse(
        "에스크로 스마트지갑 연결에 실패했습니다.",
        500,
        "ESCROW_SMART_ACCOUNT_CONNECT_FAILED",
      );
    }


    //const escrowWalletAddress = account.address;



    const contract = getContract({
      client,
      chain: chain === "bsc" ? bsc : chain === "arbitrum" ? arbitrum : polygon,
      address: bscContractAddressMKRW, // MKRW on BSC
    });

    const transaction = transfer({
      contract,
      to: sellerWalletAddress,
      amount: paymentAmount,
    });


    const transferReault = await sendTransaction({
      account: account,
      transaction: transaction,
    });

    const escrowTransactionHash = transferReault.transactionHash;


    console.log("escrowTransactionHash", escrowTransactionHash);


    const queueId = null; // no queueId for with escrow payment

    const result = await buyOrderConfirmPayment({
      lang: lang,
      storecode: storecode,
      orderId: orderId,
      paymentAmount: paymentAmount,
      
      queueId: queueId,

      transactionHash: transactionHash,

      escrowTransactionHash: escrowTransactionHash,

    });

    if (!result) {
      return failureResponse(
        "주문 결제확인 상태 저장에 실패했습니다.",
        500,
        "BUY_ORDER_CONFIRM_PAYMENT_UPDATE_FAILED",
      );
    }
  
  
    //console.log("result", JSON.stringify(result));
  
    /*
    const {
      nickname: nickname,
      tradeId: tradeId,
    } = result as UserProps;
  
  
  
    const amount = usdtAmount;
    */
  
  
      // send sms
    /*

    if (!buyer?.mobile) {
      return NextResponse.json({
        result,
      });
    }


    // check buyer.mobile is prefixed with +
    if (!buyer?.mobile.startsWith("+")) {
      return NextResponse.json({
        result,
      });
    }



    const to = buyer.mobile;


    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = twilio(accountSid, authToken);



    let message = null;


    try {

      const msgBody = `[GTETHER] TID[${tradeId}] You received ${amount} USDT from ${nickname}! https://gold.goodtether.com/${lang}/${chain}/sell-usdt/${orderId}`;
  
      message = await client.messages.create({
        ///body: "This is the ship that made the Kessel Run in fourteen parsecs?",
        body: msgBody,
        from: "+17622254217",
        to: to,
      });
  
      console.log(message.sid);

    } catch (error) {
        
      console.log("error", error);
  
    }

    */
  
  
    /*
    // order storecode가 매니의 storecode인 경우에만 webhook을 보냄
    if (orderStorecode === "dtwuzgst") { // 가맹점 이름 매니


      // http://3.112.81.28/?userid=test1234&amount=10000

      const userid = orderNickname; // 매니의 userid는 orderNickname
      const amount = paymentAmount;

      // https://my-9999.com/api/deposit?userid=test1234&amount=10000
      const webhookUrl = "http://3.112.81.28"; // 매니의 웹훅 URL

      const fetchUrl = `${webhookUrl}/?userid=${userid}&amount=${amount}`;

      try {

        
        //const response = await fetch(fetchUrl, {
        //  method: "GET",
        //  headers: {
        //    "Content-Type": "application/json",
        //  },
        //});

        // GET 요청
        const response = await fetch(fetchUrl);

        console.log("fetchUrl", fetchUrl);
        console.log("response", response);



        if (!response.ok) {
          console.error("Failed to send webhook for user:", userid, "with status:", response.status);
        } else {


          
          //성공: {result: success), 실패: {result: fail}
          

          try {
            const data = await response.json();
            console.log("Webhook sent for user:", userid, "with response:", data);

            await buyOrderWebhook({
              orderId: orderId,
              webhookData: {
                createdAt: new Date().toISOString(),
                url: webhookUrl,
                userid: userid,
                amount: amount,
                response: data,
              }
            });


          } catch (jsonError) {


            await buyOrderWebhook({
              orderId: orderId,
              webhookData: {
                createdAt: new Date().toISOString(),
                url: webhookUrl,
                userid: userid,
                amount: amount,
                response: response.text(), // response를 JSON으로 파싱하지 못한 경우
              }
            });

          }

        }

      } catch (error) {
        console.error("Error sending webhook:", error);
      }

    }
    */


  
    
    return NextResponse.json({
      result,
    });









  } catch (error) {
      
    console.log(" error=====>" + error);



  }

  


 
  return failureResponse(
    "결제확인 처리 중 서버 오류가 발생했습니다.",
    500,
    "BUY_ORDER_CONFIRM_PAYMENT_WITH_ESCROW_SERVER_ERROR",
  );
  
}
