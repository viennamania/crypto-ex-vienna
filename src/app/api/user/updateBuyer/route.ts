import { NextResponse, type NextRequest } from "next/server";

import {
    updateBuyer,
} from '@lib/api/user';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import { getRequesterIpAddress, verifyWalletAuthFromBody } from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as any)
      : ({} as any);

  const {
    storecode: rawStorecode,
    buyerStatus,
    bankName,
    accountNumber,
    accountHolder
  } = body;
  const storecode = toText(rawStorecode);
  const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);
  const ipAddress = getRequesterIpAddress(request) || 'unknown';

  const rate = evaluateRateLimit({
    key: `api:user:updateBuyer:${ipAddress}:${requestedWalletAddress || 'unknown'}`,
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
    path: '/api/user/updateBuyer',
    method: 'POST',
    storecode,
    consumeNonceValue: true,
  });

  if (signatureAuth.ok === false) {
    return signatureAuth.response;
  }

  const walletAddress =
    signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : requestedWalletAddress;

  if (!isWalletAddress(walletAddress)) {
    return NextResponse.json(
      {
        error: 'walletAddress is invalid.',
      },
      {
        status: 400,
      },
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
      {
        status: 403,
      },
    );
  }

  const nowIso = new Date().toISOString();
  const bankNameValue = bankName ?? body?.buyer?.bankInfo?.bankName ?? body?.buyer?.depositBankName;
  const accountNumberValue = accountNumber ?? body?.buyer?.bankInfo?.accountNumber ?? body?.buyer?.depositBankAccountNumber;
  const accountHolderValue = accountHolder ?? body?.buyer?.bankInfo?.accountHolder ?? body?.buyer?.depositName;
  const hasBankInfo = Boolean(bankNameValue && accountNumberValue && accountHolderValue);
  const isExplicitRejected = buyerStatus === 'rejected' || body?.buyer?.status === 'rejected';
  const resolvedBuyerStatus = isExplicitRejected
    ? 'rejected'
    : hasBankInfo
    ? 'confirmed'
    : (buyerStatus || body?.buyer?.status || 'pending');

  const resolvedBankInfo = {
    ...(body.buyer?.bankInfo || {}),
    bankName: bankNameValue,
    accountNumber: accountNumberValue,
    accountHolder: accountHolderValue,
    ...(hasBankInfo
      ? {
          status: 'approved',
          approvedAt: body?.buyer?.bankInfo?.approvedAt || nowIso,
          rejectionReason: '',
        }
      : {}),
  };

  const hasKycImage = Boolean(body?.buyer?.kyc?.idImageUrl);
  const resolvedKyc = body?.buyer?.kyc
    ? {
        ...(body.buyer.kyc || {}),
        ...(hasKycImage
          ? {
              status: 'approved',
              reviewedAt: body?.buyer?.kyc?.reviewedAt || nowIso,
            }
          : {}),
      }
    : undefined;

  
  const result = await updateBuyer({
    storecode: storecode,
    walletAddress: walletAddress,
    buyer: {
        ...(body.buyer || {}),
        status: resolvedBuyerStatus,
        bankInfo: resolvedBankInfo,
        depositBankName: bankNameValue ?? body?.buyer?.depositBankName,
        depositBankAccountNumber: accountNumberValue ?? body?.buyer?.depositBankAccountNumber,
        depositName: accountHolderValue ?? body?.buyer?.depositName,
        ...(resolvedKyc ? { kyc: resolvedKyc } : {}),
    },
  });

  return NextResponse.json({
    result,
  });


  /*
  const {
    storecode,
    walletAddress,
    buyer
  } = body;


  //console.log("walletAddress", walletAddress);
  //console.log("sellerStatus", sellerStatus);




 // https://na.winglobalpay.com/api/v1/vactFcs
  

  //const bankCd = '035';

  const bankCd =
    buyer?.bankInfo?.bankName === '카카오뱅크' ? '090' :
    buyer?.bankInfo?.bankName === '케이뱅크' ? '089' :
    buyer?.bankInfo?.bankName === '토스뱅크' ? '092' :

    buyer?.bankInfo?.bankName === '국민은행' ? '004' :
    buyer?.bankInfo?.bankName === '우리은행' ? '020' :
    buyer?.bankInfo?.bankName === '신한은행' ? '088' :
    buyer?.bankInfo?.bankName === '농협' ? '011' :
    buyer?.bankInfo?.bankName === '기업은행' ? '003' :
    buyer?.bankInfo?.bankName === '하나은행' ? '081' :
    buyer?.bankInfo?.bankName === '외환은행' ? '002' :
    buyer?.bankInfo?.bankName === '부산은행' ? '032' :
    buyer?.bankInfo?.bankName === '경남은행' ? '039' :
    buyer?.bankInfo?.bankName === '대구은행' ? '031' :
    buyer?.bankInfo?.bankName === '전북은행' ? '037' :
    buyer?.bankInfo?.bankName === '경북은행' ? '071' :
    buyer?.bankInfo?.bankName === '광주은행' ? '034' :
    buyer?.bankInfo?.bankName === '우체국' ? '071' :
    buyer?.bankInfo?.bankName === '수협' ? '007' :
    buyer?.bankInfo?.bankName === '씨티은행' ? '027' :
    buyer?.bankInfo?.bankName === '대신은행' ? '055' :
    buyer?.bankInfo?.bankName === '동양종합금융' ? '054'
    : '034';





  //const bankCd = '034';
  const recvBankCd = '035'; // 제주은행


  //const bankAccount = '110019648787';

  const bankAccount = buyer?.bankInfo?.accountNumber || '';



  //const payerName = '박승현';

  const payerName = buyer?.bankInfo?.accountHolder || '';


  //const payerTel = '01098551647';

  const payerTel = buyer?.bankInfo?.phoneNum || '';


  //const dob = '691120';

  const dob = buyer?.bankInfo?.birth || '';



  ///const gender = '1';

  const gender = buyer?.bankInfo?.gender || '1';
  */

  /*
  {
    "vact":{
            "tmnId":"sorhkrj",
            "mchtId":"sorhkrj",
            "trackId":"",
            "bankCd":"004",
            "account":"111122223333",
            "payerName":"홍길동",
            "payerTel":"01012345678",
            "dob":"880101",
            "gender":"1",
            "recvBankCd":"",
      "itndAmount":"20000",
            "holderName":""
            }
}
  */

  /*

  const response2 = await fetch('https://na.winglobalpay.com/api/v1/vactFcs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': process.env.WINGLOBALPAY_API_KEY || '',
    },
    body: JSON.stringify({
      "vact": {
        tmnId: '',
        mchtId: 'w63791online',
        trackId: '',
        bankCd: bankCd,
        account: bankAccount,
        payerName: payerName,
        payerTel: payerTel,
        dob: dob,
        gender: gender,
        recvBankCd: recvBankCd,
        itndAmount: '20000',
        holderName: '',

      },
    })
  });

  const response2Json = await response2.json();
  */

  /*
  const response2Json = {
    result: {
      resultCd: '0000',
      advanceMsg: '정상처리',
    },
    vact: {
      account: '111122223333',
    },
  };
  

  console.log("response2Json: ", response2Json);


  // 성공
  if (response2Json.result.resultCd === '0000') {

    //console.log("account: ", response2Json.vact.account);


    const virtualAccount = response2Json.vact.account;


    const updatedBuyer = {
        ...buyer,
        bankInfo: {
            ...buyer.bankInfo,
            virtualAccount: virtualAccount,
        }
    };


    const result = await updateBuyer({
      storecode: storecode,
      walletAddress: walletAddress,
      buyer: updatedBuyer,
    });

    //console.log("result: ", result);


    if (!result) {
      return NextResponse.json({
        result: null,
        error: "Failed to update buyer",
      });
    }

    return NextResponse.json({
      result,
      error: "",
    });

  }


  return NextResponse.json({
    result: null,
    error: response2Json.result.advanceMsg,
  });
  */


  
}
