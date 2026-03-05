import { NextResponse, type NextRequest } from "next/server";


import {
  getOneByWalletAddress,
} from '@lib/api/user';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  getRoleForWalletAddress,
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';



import {
  createThirdwebClient,
  getContract,
  sendAndConfirmTransaction,
  sendTransaction,
} from "thirdweb";

import {
  privateKeyToAccount,
  smartWallet,
} from "thirdweb/wallets";

import { balanceOf, transfer } from "thirdweb/extensions/erc20";
 

import {
  ethereum,
  polygon,
  arbitrum,
  bsc,
} from "thirdweb/chains";

import {
  chain,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,

  bscContractAddressMKRW,
} from "@/app/config/contractAddresses";
import { createEngineServerWallet } from "@/lib/engineServerWallet";



// clear seller escrow wallet balance
// This endpoint clears the escrow balance for a seller

const toText = (value: unknown) => String(value ?? '').trim();
const ALLOWED_CHAINS = new Set(['ethereum', 'polygon', 'arbitrum', 'bsc']);

export async function POST(request: NextRequest) {

    const bodyRaw = await request.json().catch(() => ({}));
    const body =
        bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
            ? (bodyRaw as Record<string, unknown>)
            : {};
    
    const storecode = toText(body.storecode) || 'admin';
    const selectedChain = toText(body.selectedChain).toLowerCase();
    const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);

    if (!ALLOWED_CHAINS.has(selectedChain)) {
        return NextResponse.json({ error: 'selectedChain is invalid' }, { status: 400 });
    }

    const signatureAuth = await verifyWalletAuthFromBody({
        body,
        path: '/api/escrow/clearSellerEscrowWallet',
        method: 'POST',
        storecode,
        consumeNonceValue: true,
    });
    if (signatureAuth.ok === false) {
        return signatureAuth.response;
    }
    if (signatureAuth.ok !== true) {
        return NextResponse.json({ error: 'wallet signature is required.' }, { status: 401 });
    }

    const signerWalletAddress = signatureAuth.walletAddress;
    let walletAddress = signerWalletAddress;
    if (isWalletAddress(requestedWalletAddress) && requestedWalletAddress !== signerWalletAddress) {
        const requester = await getRoleForWalletAddress({
            storecode,
            walletAddress: signerWalletAddress,
        });
        if (requester?.role === 'admin') {
            walletAddress = requestedWalletAddress;
        } else {
            const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
                expectedWalletAddress: requestedWalletAddress,
                candidateWalletAddress: signerWalletAddress,
            });
            if (!isAuthorized) {
                return NextResponse.json({ error: 'walletAddress is not authorized.' }, { status: 403 });
            }
            walletAddress = requestedWalletAddress;
        }
    }
    if (!isWalletAddress(walletAddress)) {
        return NextResponse.json({ error: 'walletAddress is invalid.' }, { status: 400 });
    }

    const ipAddress = getRequesterIpAddress(request) || 'unknown';
    const rate = evaluateRateLimit({
        key: `api:escrow:clearSellerEscrowWallet:${ipAddress}:${walletAddress}`,
        limit: 6,
        windowMs: 60_000,
    });
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.max(Math.ceil(rate.retryAfterMs / 1000), 1)),
                },
            },
        );
    }

    // get seller info
    const seller = await getOneByWalletAddress(storecode, walletAddress);
    if (!seller) {
        return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
    }



    const escrowWalletAddress = normalizeWalletAddress(
        seller?.seller?.escrowWalletAddress || seller?.seller?.escrowWallet?.smartAccountAddress || '',
    );
    if (!isWalletAddress(escrowWalletAddress)) {
        return NextResponse.json({ error: 'Seller escrow wallet address not found' }, { status: 400 });
    }

    // transfer all balance from escrow wallet to seller main wallet
    const sellerMainWalletAddress = normalizeWalletAddress(seller.walletAddress || '');
    if (!isWalletAddress(sellerMainWalletAddress)) {
        return NextResponse.json({ error: 'Seller wallet address is invalid' }, { status: 400 });
    }

    try {


        const client = createThirdwebClient({
            secretKey: process.env.THIRDWEB_SECRET_KEY || "",
        });

        if (!client) {
            return NextResponse.json({ error: 'Thirdweb client not created' }, { status: 500 });
        }
        
        const chainInfo = selectedChain === 'ethereum' ? ethereum :
               selectedChain === 'polygon' ? polygon :
               selectedChain === 'arbitrum' ? arbitrum :
               selectedChain === 'bsc' ? bsc :
               polygon;
        const usdtContractAddress = selectedChain === 'ethereum' ? ethereumContractAddressUSDT :
                 selectedChain === 'polygon' ? polygonContractAddressUSDT :
                 selectedChain === 'arbitrum' ? arbitrumContractAddressUSDT :
                 selectedChain === 'bsc' ? bscContractAddressUSDT :
                 polygonContractAddressUSDT;

        const contract = getContract({
            client: client,
            chain: chainInfo,
            address: usdtContractAddress,
        });

        // get balance of escrow wallet
        const escrowBalance = await balanceOf({
            contract,
            address: escrowWalletAddress,
        });

        // Number(result) / 10 ** 6 )
        let escrowBalanceFormatted = Number(escrowBalance) / (10 ** 6);
        if (selectedChain === 'bsc') {
            escrowBalanceFormatted = Number(escrowBalance) / (10 ** 18);
        }

        if (escrowBalanceFormatted <= 0) {
            return NextResponse.json({ error: 'Escrow wallet balance is zero' }, { status: 400 });
        }

        // create server wallet for escrow wallet

        const wallet = await createEngineServerWallet({
            client,
            walletAddress: escrowWalletAddress,
            chain: chainInfo,
        });

        const transaction = transfer({
            contract,
            to: sellerMainWalletAddress,
            amount: escrowBalanceFormatted,
        });

        // enqueue the transaction
        const { transactionId } = await wallet.enqueueTransaction({
            transaction,
        });


        return NextResponse.json({
            result: {
                transactionId,
                transferredAmount: escrowBalanceFormatted,
            },
            error: null,
        }, { status: 200 });

    } catch (error) {
        console.error("Error clearing escrow wallet:", error);
        return NextResponse.json({ error: 'Error clearing escrow wallet' }, { status: 500 });
    }

}
