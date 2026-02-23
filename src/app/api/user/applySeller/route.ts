import { NextResponse, type NextRequest } from "next/server";


import {
    updateUserForSeller,
} from '@lib/api/user';


import {
    createThirdwebClient,
    Engine
} from "thirdweb";
 
const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

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

    const body = await request.json();

    const {
        storecode,
        walletAddress,
        //contactEmail,
        //businessRegistrationNumber,
    } = body;

    //console.log("applySeller request body", body);

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
