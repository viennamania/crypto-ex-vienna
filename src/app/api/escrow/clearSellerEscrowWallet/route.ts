import { NextResponse, type NextRequest } from 'next/server';


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
} from "thirdweb";

import { balanceOf, transfer } from "thirdweb/extensions/erc20";
 

import {
  ethereum,
  polygon,
  arbitrum,
  bsc,
} from "thirdweb/chains";

import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from "@/app/config/contractAddresses";
import { createEngineServerWallet, primeEngineServerWalletResolution } from "@/lib/engineServerWallet";



// clear seller escrow wallet balance
// This endpoint clears the escrow balance for a seller

const toText = (value: unknown) => String(value ?? '').trim();
const ALLOWED_CHAINS = new Set(['ethereum', 'polygon', 'arbitrum', 'bsc']);
const TOKEN_DECIMALS_BY_CHAIN: Record<string, number> = {
    ethereum: 6,
    polygon: 6,
    arbitrum: 6,
    bsc: 18,
};

const toBigIntSafe = (value: unknown) => {
    if (typeof value === 'bigint') {
        return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return BigInt(Math.trunc(value));
    }
    try {
        return BigInt(String(value ?? '0'));
    } catch {
        return 0n;
    }
};

const formatTokenAmount = (value: bigint, decimals: number) => {
    const safeDecimals = Number.isInteger(decimals) && decimals >= 0 ? decimals : 6;
    const base = 10n ** BigInt(safeDecimals);
    const whole = value / base;
    const fractionRaw = (value % base).toString().padStart(safeDecimals, '0');
    const fraction = fractionRaw.replace(/0+$/, '');
    return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
};

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
        seller?.seller?.escrowWalletAddress
        || seller?.seller?.escrowWallet?.smartAccountAddress
        || '',
    );
    const escrowWalletSignerAddress = normalizeWalletAddress(
        seller?.seller?.escrowWalletSignerAddress
        || seller?.seller?.escrowWallet?.signerAddress
        || '',
    );
    const escrowWalletSmartAccountAddress = normalizeWalletAddress(
        seller?.seller?.escrowWallet?.smartAccountAddress
        || seller?.seller?.escrowWalletAddress
        || '',
    );
    if (!isWalletAddress(escrowWalletAddress)) {
        return NextResponse.json({ error: 'Seller escrow wallet address not found' }, { status: 400 });
    }

    // transfer all balance from escrow wallet to seller main wallet
    const sellerMainWalletAddress = normalizeWalletAddress(walletAddress || seller.walletAddress || '');
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

        const tokenDecimals = TOKEN_DECIMALS_BY_CHAIN[selectedChain] || 6;

        // get balance of escrow wallet
        const escrowBalanceRaw = toBigIntSafe(await balanceOf({
            contract,
            address: escrowWalletAddress,
        }));

        if (escrowBalanceRaw <= 0n) {
            return NextResponse.json({ error: 'Escrow wallet balance is zero' }, { status: 400 });
        }

        const transferAmount = formatTokenAmount(escrowBalanceRaw, tokenDecimals);
        if (!transferAmount || transferAmount === '0') {
            return NextResponse.json({ error: 'Escrow wallet transfer amount is invalid' }, { status: 500 });
        }

        // Prefer explicit signer/smart mapping from DB to avoid wallet resolution miss in Engine list.
        if (isWalletAddress(escrowWalletSignerAddress)) {
            primeEngineServerWalletResolution({
                signerAddress: escrowWalletSignerAddress,
                ...(isWalletAddress(escrowWalletSmartAccountAddress)
                    ? { smartAccountAddress: escrowWalletSmartAccountAddress }
                    : {}),
            });
        }

        const engineWalletAddress = isWalletAddress(escrowWalletSignerAddress)
            ? escrowWalletSignerAddress
            : escrowWalletAddress;

        const wallet = await createEngineServerWallet({
            client,
            walletAddress: engineWalletAddress,
            chain: chainInfo,
        });

        const transaction = transfer({
            contract,
            to: sellerMainWalletAddress,
            amount: transferAmount,
        });

        // enqueue the transaction
        const { transactionId } = await wallet.enqueueTransaction({
            transaction,
        });


        return NextResponse.json({
            result: {
                transactionId,
                transferredAmount: transferAmount,
                transferredAmountRaw: escrowBalanceRaw.toString(),
                escrowWalletAddress,
                escrowWalletSignerAddress: isWalletAddress(escrowWalletSignerAddress)
                    ? escrowWalletSignerAddress
                    : '',
                escrowWalletSmartAccountAddress: isWalletAddress(escrowWalletSmartAccountAddress)
                    ? escrowWalletSmartAccountAddress
                    : '',
                toWalletAddress: sellerMainWalletAddress,
            },
            error: null,
        }, { status: 200 });

    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error || '');
        console.error('Error clearing escrow wallet:', error);
        return NextResponse.json(
            {
                error: 'Error clearing escrow wallet',
                detail,
            },
            { status: 500 },
        );
    }

}
