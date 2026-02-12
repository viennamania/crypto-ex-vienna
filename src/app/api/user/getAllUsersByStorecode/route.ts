import { NextResponse, type NextRequest } from "next/server";

import { getAllUsersByStorecode } from '@lib/api/user';



export async function POST(request: NextRequest) {

  const body = await request.json();

  const {
    walletAddress,
    storecode,
    limit,
    page,
    includeUnverified = false,
    searchTerm = '',
    sortField = 'nickname',
    agentcode = '',
    userType = 'all',
    role = '',
    requireProfile = true,
  } = body;


  //console.log("walletAddress", walletAddress);


  const result = await getAllUsersByStorecode({
    storecode,
    limit: limit || 100,
    page: page || 1,
    includeUnverified,
    searchTerm,
    sortField,
    agentcode,
    userType,
    role,
    requireProfile,
  });

 
  return NextResponse.json({

    result,
    
  });
  
}
