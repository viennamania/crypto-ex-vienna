import { NextResponse, type NextRequest } from 'next/server';


import {
  getOneByWalletAddress,
} from '@lib/api/user';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  getRoleForWalletAddress,
  isWalletAddressAuthorizedForExpectedWallet,
  resolvePrimaryWalletAddress,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';



import {
  createThirdwebClient,
  Engine,
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

type EscrowRecoveryStatus = 'REQUESTING' | 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';

const normalizeErrorText = (value: unknown): string => {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (value instanceof Error) return String(value.message || '').trim();
    if (typeof value === 'object') {
        const valueRecord = value as Record<string, unknown>;
        const message = typeof valueRecord.message === 'string' ? valueRecord.message.trim() : '';
        if (message) return message;
        const error = typeof valueRecord.error === 'string' ? valueRecord.error.trim() : '';
        if (error) return error;
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value).trim();
};

const normalizeRecoveryStatus = (value: unknown): EscrowRecoveryStatus => {
    const normalized = String(value || '').trim().toUpperCase();
    if (
        normalized === 'REQUESTING'
        || normalized === 'QUEUED'
        || normalized === 'SUBMITTED'
        || normalized === 'CONFIRMED'
        || normalized === 'FAILED'
    ) {
        return normalized;
    }
    if (
        normalized.includes('CONFIRM')
        || normalized.includes('MINED')
        || normalized.includes('COMPLETED')
        || normalized.includes('SUCCESS')
    ) {
        return 'CONFIRMED';
    }
    if (
        normalized.includes('FAIL')
        || normalized.includes('REVERT')
        || normalized.includes('DROPPED')
        || normalized.includes('CANCEL')
        || normalized.includes('REJECT')
        || normalized.includes('ERROR')
    ) {
        return 'FAILED';
    }
    if (
        normalized.includes('SUBMIT')
        || normalized.includes('SENT')
        || normalized.includes('PENDING')
        || normalized.includes('BROADCAST')
    ) {
        return 'SUBMITTED';
    }
    if (normalized.includes('REQUEST')) return 'REQUESTING';
    return 'QUEUED';
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

    // Resolve seller owner wallet from smart/wallet variants before DB lookup.
    let resolvedSellerWalletAddress = walletAddress;
    const requester = await getRoleForWalletAddress({
        storecode,
        walletAddress,
    });
    const requesterOwnerWalletAddress = normalizeWalletAddress(requester?.walletAddress || '');
    if (isWalletAddress(requesterOwnerWalletAddress)) {
        resolvedSellerWalletAddress = requesterOwnerWalletAddress;
    }

    let seller = await getOneByWalletAddress(storecode, resolvedSellerWalletAddress);
    if (!seller) {
        const primaryWalletAddress = normalizeWalletAddress(await resolvePrimaryWalletAddress(walletAddress));
        if (isWalletAddress(primaryWalletAddress) && primaryWalletAddress !== resolvedSellerWalletAddress) {
            resolvedSellerWalletAddress = primaryWalletAddress;
            seller = await getOneByWalletAddress(storecode, primaryWalletAddress);
        }
    }
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
    const transferSourceWalletAddress = normalizeWalletAddress(
        (isWalletAddress(escrowWalletSmartAccountAddress) ? escrowWalletSmartAccountAddress : '')
        || (isWalletAddress(escrowWalletAddress) ? escrowWalletAddress : '')
        || (isWalletAddress(escrowWalletSignerAddress) ? escrowWalletSignerAddress : '')
        || '',
    );
    if (!isWalletAddress(transferSourceWalletAddress)) {
        return NextResponse.json({ error: 'Seller escrow wallet address not found' }, { status: 400 });
    }

    // transfer all balance from escrow wallet to seller main wallet
    const sellerMainWalletAddress = normalizeWalletAddress(
        seller.walletAddress || resolvedSellerWalletAddress || walletAddress || '',
    );
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
            address: transferSourceWalletAddress,
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

        const engineWalletAddress = transferSourceWalletAddress;

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

        let status: EscrowRecoveryStatus = 'QUEUED';
        let onchainStatus = '';
        let transactionHash = '';
        let executionError = '';
        try {
            const executionResult = await Engine.getTransactionStatus({
                client,
                transactionId,
            });
            status = normalizeRecoveryStatus(executionResult?.status || 'QUEUED');
            onchainStatus =
                executionResult && typeof executionResult === 'object' && 'onchainStatus' in executionResult
                    ? String(executionResult.onchainStatus || '')
                    : '';
            transactionHash =
                executionResult && typeof executionResult === 'object' && 'transactionHash' in executionResult
                    ? String(executionResult.transactionHash || '').trim()
                    : '';
            executionError =
                executionResult && typeof executionResult === 'object' && 'error' in executionResult
                    ? normalizeErrorText(executionResult.error)
                    : '';
        } catch (executionStatusError) {
            const statusErrorText = normalizeErrorText(executionStatusError).toLowerCase();
            if (
                statusErrorText.includes('not found')
                || statusErrorText.includes('404')
            ) {
                status = 'QUEUED';
                executionError = '';
            } else {
                executionError = normalizeErrorText(executionStatusError);
            }
        }

        return NextResponse.json({
            result: {
                transactionId,
                transferredAmount: transferAmount,
                transferredAmountRaw: escrowBalanceRaw.toString(),
                escrowWalletAddress,
                sourceWalletAddress: transferSourceWalletAddress,
                escrowWalletSignerAddress: isWalletAddress(escrowWalletSignerAddress)
                    ? escrowWalletSignerAddress
                    : '',
                escrowWalletSmartAccountAddress: isWalletAddress(escrowWalletSmartAccountAddress)
                    ? escrowWalletSmartAccountAddress
                    : '',
                toWalletAddress: sellerMainWalletAddress,
                status,
                onchainStatus,
                transactionHash,
                error: executionError,
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
