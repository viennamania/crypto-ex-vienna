import { NextResponse, type NextRequest } from "next/server";


import {
    updateUserForSeller,
} from '@lib/api/user';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
    getRequesterIpAddress,
    getRoleForWalletAddress,
    isWalletAddressAuthorizedForExpectedWallet,
    verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { normalizeWalletAddress } from '@/lib/security/walletSignature';


import {
    createThirdwebClient,
    Engine
} from "thirdweb";
 
const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const toText = (value: unknown) => String(value ?? '').trim();

const resolveSignerAddress = (wallet: any): string => {
    const candidates = [
        wallet?.address,
        wallet?.walletAddress,
        wallet?.serverWalletAddress,
        wallet?.account?.address,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
};

const resolveSmartAccountAddress = (wallet: any): string => {
    const value = wallet?.smartAccountAddress;
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }
    return '';
};

const resolveSignerAddressFromEngineList = async ({
    client,
    smartAccountAddress,
}: {
    client: any;
    smartAccountAddress: string;
}) => {
    const normalizedSmartAccountAddress = String(smartAccountAddress || '').trim().toLowerCase();
    if (!isWalletAddress(normalizedSmartAccountAddress)) {
        return '';
    }

    const limit = 200;
    let page = 1;
    while (page <= 100) {
        const response = await Engine.getServerWallets({
            client,
            page,
            limit,
        });
        const accounts = Array.isArray((response as any)?.accounts) ? (response as any).accounts : [];
        for (const account of accounts) {
            const signerAddress = String(account?.address || '').trim();
            const accountSmartAddress = String(account?.smartAccountAddress || '').trim().toLowerCase();
            if (accountSmartAddress === normalizedSmartAccountAddress && isWalletAddress(signerAddress)) {
                return signerAddress;
            }
        }

        const totalCount = Number((response as any)?.pagination?.totalCount || 0);
        const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : page;
        if (page >= totalPages) {
            break;
        }
        page += 1;
    }

    return '';
};



export async function POST(request: NextRequest) {
    const bodyRaw = await request.json().catch(() => ({}));
    const body =
        bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
            ? (bodyRaw as Record<string, unknown>)
            : {};

    const storecode = toText(body.storecode) || 'admin';
    const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);

    //console.log("applySeller request body", body);

    const ipAddress = getRequesterIpAddress(request) || 'unknown';
    const rate = evaluateRateLimit({
        key: `api:user:applySeller:${ipAddress}:${requestedWalletAddress || 'unknown'}`,
        limit: 10,
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
        path: '/api/user/applySeller',
        method: 'POST',
        storecode,
        consumeNonceValue: true,
    });

    if (signatureAuth.ok === false) {
        return signatureAuth.response;
    }

    if (signatureAuth.ok !== true) {
        return NextResponse.json(
            {
                error: 'wallet signature is required.',
            },
            {
                status: 401,
            },
        );
    }

    const requester = await getRoleForWalletAddress({
        storecode,
        walletAddress: signatureAuth.walletAddress,
    });
    const signerWalletAddress = toText(requester?.walletAddress) || signatureAuth.walletAddress;
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
                return NextResponse.json(
                    {
                        error: 'walletAddress is not authorized.',
                    },
                    {
                        status: 403,
                    },
                );
            }
            walletAddress = requestedWalletAddress;
        }
    }

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

    const client = createThirdwebClient({
        secretKey: process.env.THIRDWEB_SECRET_KEY || "",
    });

    if (!client) {
        return NextResponse.json({
            error: "Thirdweb client not initialized",
        }, { status: 500 });
    }

    try {
        const createdWallet = await Engine.createServerWallet({
            client,
            label: `escrow-${walletAddress}`,
        });

        let signerAddress = resolveSignerAddress(createdWallet);
        const maybeSmartAccountAddress = resolveSmartAccountAddress(createdWallet);
        if (!isWalletAddress(signerAddress) && isWalletAddress(maybeSmartAccountAddress)) {
            try {
                signerAddress = await resolveSignerAddressFromEngineList({
                    client,
                    smartAccountAddress: maybeSmartAccountAddress,
                });
            } catch (error) {
                console.error('Failed to resolve signer address from engine list', error);
            }
        }
        const smartAccountAddress = isWalletAddress(maybeSmartAccountAddress)
            ? maybeSmartAccountAddress
            : signerAddress;
        const escrowWalletAddress = smartAccountAddress || signerAddress;

        if (!isWalletAddress(signerAddress) || !isWalletAddress(escrowWalletAddress)) {
            return NextResponse.json({
                error: "Failed to create escrow wallet",
            }, { status: 500 });
        }

        const result = await updateUserForSeller({
            storecode,
            walletAddress,
            escrowWalletAddress,
            escrowWalletSignerAddress: signerAddress,
            escrowWalletSmartAccountAddress: smartAccountAddress,
        });

        if (!result) {
            return NextResponse.json({
                error: "Failed to update user for seller",
            }, { status: 500 });
        }

        //console.log("applySeller result", result);
        
        return NextResponse.json({
            result,
        });

    } catch (error) {
        console.error("Error in applySeller:", error);
        return NextResponse.json({
            error: "Internal server error",
        }, { status: 500 });
    }
    
}
