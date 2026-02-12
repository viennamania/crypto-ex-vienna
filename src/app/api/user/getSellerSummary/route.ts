import { NextResponse, type NextRequest } from 'next/server';

import { getOneByWalletAddress } from '@lib/api/user';

import { createThirdwebClient, getContract } from 'thirdweb';
import { balanceOf } from 'thirdweb/extensions/erc20';

import { ethereum, polygon, arbitrum, bsc } from 'thirdweb/chains';

import {
  chain,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
  bscContractAddressMKRW,
} from '@/app/config/contractAddresses';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  let { storecode, walletAddress } = body || {};

  storecode = typeof storecode === 'string' ? storecode.trim() : storecode;
  walletAddress = typeof walletAddress === 'string' ? walletAddress.trim() : walletAddress;

  if (!storecode || !walletAddress) {
    return NextResponse.json(
      { error: 'storecode and walletAddress are required.' },
      { status: 400 },
    );
  }

  let user = await getOneByWalletAddress(storecode, walletAddress);
  // fallback: 일부 판매자가 storecode 없이 저장된 경우를 대비해 전체에서 검색
  if (!user) {
    user = await getOneByWalletAddress(undefined, walletAddress);
  }
  // fallback2: 입력 주소를 소문자로 변환해 재검색
  if (!user && typeof walletAddress === 'string') {
    const lower = walletAddress.toLowerCase();
    user = await getOneByWalletAddress(storecode, lower);
    if (!user) {
      user = await getOneByWalletAddress(undefined, lower);
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });
  }


  //console.log('Fetched user:', JSON.stringify(user));
  // 온체인 에스크로 잔액 조회 (타임아웃 5초, 실패 시 0 반환)
  const fetchOnchainBalance = async () => {
    const secret = process.env.THIRDWEB_SECRET_KEY;
    const escrowWalletAddress = (user as any)?.seller?.escrowWalletAddress || walletAddress;
    if (!secret || !escrowWalletAddress) return 0;

    const client = createThirdwebClient({ secretKey: secret });
    const chainObj =
      chain === 'ethereum'
        ? ethereum
        : chain === 'polygon'
        ? polygon
        : chain === 'arbitrum'
        ? arbitrum
        : chain === 'bsc'
        ? bsc
        : bsc;
    const usdtAddress =
      chain === 'ethereum'
        ? ethereumContractAddressUSDT
        : chain === 'polygon'
        ? polygonContractAddressUSDT
        : chain === 'arbitrum'
        ? arbitrumContractAddressUSDT
        : chain === 'bsc'
        ? bscContractAddressUSDT
        : bscContractAddressMKRW;

    const contract = getContract({ client, chain: chainObj, address: usdtAddress });
    try {
      const bal = await balanceOf({ contract, address: escrowWalletAddress });
      return chain === 'bsc' ? Number(bal) / 10 ** 18 : Number(bal) / 10 ** 6;
    } catch (e) {
      console.error('getSellerSummary balance fetch failed', e);
      return 0;
    }
  };

  const currentUsdtBalance = await fetchOnchainBalance();

  return NextResponse.json({
    result: {
      user,
      currentUsdtBalance,
    },
  });
}
