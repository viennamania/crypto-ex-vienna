import { NextResponse, type NextRequest } from "next/server";

import {
    acceptBuyOrderPrivateSale,
} from '@lib/api/order';



export async function POST(request: NextRequest) {

    const body = await request.json();

    const {
        buyerWalletAddress,
        sellerWalletAddress,
        usdtAmount,
    } = body;

    //console.log('acceptBuyOrderPrivateSale body', body);

    

    const result = await acceptBuyOrderPrivateSale({
        buyerWalletAddress,
        sellerWalletAddress,
        usdtAmount,
    });

    return NextResponse.json({ result });


}
