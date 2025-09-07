import { NextResponse, type NextRequest } from "next/server";


import { chain } from "@/app/config/contractAddresses";




export async function POST(request: NextRequest) {



  const result = {
    chain: chain,
    clientId: process.env.NEXT_PUBLIC_TEMPLATE_CLIENT_ID || '',
  };

  return NextResponse.json({

    result,
    
  });
  
}
