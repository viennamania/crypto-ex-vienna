import { NextResponse, type NextRequest } from "next/server";

import {
    acceptBuyOrder,
} from '@lib/api/order';

/*
https://api.upbit.com/v1/ticker?markets=KRW-USDT


[
  {
    "market": "KRW-USDT",
    "trade_date": "20260109",
    "trade_time": "015907",
    "trade_date_kst": "20260109",
    "trade_time_kst": "105907",
    "trade_timestamp": 1767923947745,
    "opening_price": 1463,
    "high_price": 1464,
    "low_price": 1461,
    "trade_price": 1463,
    "prev_closing_price": 1463,
    "change": "EVEN",
    "change_price": 0,
    "change_rate": 0,
    "signed_change_price": 0,
    "signed_change_rate": 0,
    "trade_volume": 700.91182501,
    "acc_trade_price": 11292794491.7163,
    "acc_trade_price_24h": 78333795122.0447,
    "acc_trade_volume": 7719919.89470151,
    "acc_trade_volume_24h": 53625267.9108355,
    "highest_52_week_price": 1655,
    "highest_52_week_date": "2025-10-10",
    "lowest_52_week_price": 1339.5,
    "lowest_52_week_date": "2025-07-11",
    "timestamp": 1767923950982
  }
]

*/

export async function GET(request: NextRequest) {

    const upbitApiUrl = 'https://api.upbit.com/v1/ticker?markets=KRW-USDT';

    const response = await fetch(upbitApiUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const data = await response.json();

    //console.log("upbit ticker data:", data);

    return NextResponse.json({

        data,
        
    });
}


