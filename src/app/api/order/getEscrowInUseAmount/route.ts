import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { dbName } from '@lib/mongodb';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  getRoleForWalletAddress,
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveTargetWalletAddress = async ({
  storecode,
  requestedWalletAddress,
  signerWalletAddress,
}: {
  storecode: string;
  requestedWalletAddress: string;
  signerWalletAddress: string;
}) => {
  if (!isWalletAddress(signerWalletAddress)) {
    return '';
  }
  if (!isWalletAddress(requestedWalletAddress) || requestedWalletAddress === signerWalletAddress) {
    return signerWalletAddress;
  }

  const requester = await getRoleForWalletAddress({
    storecode,
    walletAddress: signerWalletAddress,
  });
  if (requester?.role === 'admin') {
    return requestedWalletAddress;
  }

  const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
    expectedWalletAddress: requestedWalletAddress,
    candidateWalletAddress: signerWalletAddress,
  });
  return isAuthorized ? requestedWalletAddress : '';
};

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => ({}));
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? (bodyRaw as Record<string, unknown>)
        : {};

    const storecode = toText(body.storecode) || 'admin';
    const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);
    const requestedEscrowWalletAddress = normalizeWalletAddress(body.escrowWalletAddress);

    const signatureAuth = await verifyWalletAuthFromBody({
      body,
      path: '/api/order/getEscrowInUseAmount',
      method: 'POST',
      storecode,
      consumeNonceValue: true,
    });
    if (signatureAuth.ok === false) {
      return signatureAuth.response;
    }
    if (signatureAuth.ok !== true) {
      return NextResponse.json(
        { error: 'wallet signature is required.' },
        { status: 401 },
      );
    }

    const walletAddress = await resolveTargetWalletAddress({
      storecode,
      requestedWalletAddress,
      signerWalletAddress: signatureAuth.walletAddress,
    });
    if (!isWalletAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'walletAddress is not authorized.' },
        { status: 403 },
      );
    }

    const ipAddress = getRequesterIpAddress(request) || 'unknown';
    const rate = evaluateRateLimit({
      key: `api:order:getEscrowInUseAmount:${ipAddress}:${walletAddress}`,
      limit: 60,
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

    const client = await clientPromise;
    const usersCollection = client.db(dbName).collection('users');
    const collection = client.db(dbName).collection('buyorders');

    const sellerUser = await usersCollection.findOne<{
      seller?: {
        escrowWalletAddress?: string;
        escrowWallet?: {
          smartAccountAddress?: string;
        };
      };
    }>(
      {
        storecode,
        walletAddress: {
          $regex: `^${escapeRegex(walletAddress)}$`,
          $options: 'i',
        },
      },
      {
        projection: {
          'seller.escrowWalletAddress': 1,
          'seller.escrowWallet.smartAccountAddress': 1,
        },
      },
    );
    if (!sellerUser) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 },
      );
    }

    const sellerEscrowWalletAddress = normalizeWalletAddress(
      sellerUser?.seller?.escrowWalletAddress
      || sellerUser?.seller?.escrowWallet?.smartAccountAddress
      || '',
    );
    if (!isWalletAddress(sellerEscrowWalletAddress)) {
      return NextResponse.json(
        { error: 'Seller escrow wallet is not configured.' },
        { status: 400 },
      );
    }

    if (
      isWalletAddress(requestedEscrowWalletAddress)
      && requestedEscrowWalletAddress !== sellerEscrowWalletAddress
    ) {
      return NextResponse.json(
        { error: 'escrowWalletAddress is not authorized.' },
        { status: 403 },
      );
    }

    const escrowWalletRegex = {
      $regex: `^${escapeRegex(sellerEscrowWalletAddress)}$`,
      $options: 'i',
    };

    const cursor = await collection
      .aggregate([
        {
          $match: {
            status: { $in: ['ordered', 'accepted', 'paymentRequested'] },
            $or: [
              { 'seller.escrowWalletAddress': escrowWalletRegex },
              { 'escrowWallet.address': escrowWalletRegex },
            ],
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $ifNull: [
                  '$escrowLockUsdtAmount',
                  {
                    $ifNull: [
                      '$seller.escrowLockedUsdtAmount',
                      {
                        $ifNull: ['$escrowWallet.balance', 0],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      ])
      .toArray();

    const inUseAmount = cursor[0]?.total ?? 0;

    return NextResponse.json({
      result: {
        inUseAmount,
        escrowWalletAddress: sellerEscrowWalletAddress,
      },
    });
  } catch (error) {
    console.error('getEscrowInUseAmount error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
