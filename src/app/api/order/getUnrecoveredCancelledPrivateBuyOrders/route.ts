import { NextResponse, type NextRequest } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

export const runtime = 'nodejs';
export const maxDuration = 120;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_LIMIT = 500;

const isWalletAddress = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const toPositiveIntegerOrDefault = (value: unknown, fallback: number, maxValue: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(maxValue, Math.floor(numeric));
};

const normalizeLookbackDays = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LOOKBACK_DAYS;
  if (numeric <= 1) return 1;
  if (numeric <= 7) return 7;
  if (numeric <= 30) return 30;
  if (numeric <= 90) return 90;
  return 180;
};

const toUsdtAmountOrZero = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor((numeric + Number.EPSILON) * 1_000_000) / 1_000_000;
};

const resolveRollbackTxHash = (order: any) => {
  const candidates = [
    order?.cancelReleaseTransactionHash,
    order?.buyer?.releaseTransactionHash,
    order?.buyer?.rollbackTransactionHash,
    order?.seller?.releaseTransactionHash,
    order?.seller?.rollbackTransactionHash,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const resolveExpectedRollbackUsdtAmount = (order: any) => {
  const candidates = [
    order?.escrowLockUsdtAmount,
    order?.settlement?.escrowLockUsdtAmount,
    order?.buyer?.escrowLockedUsdtAmount,
    order?.seller?.escrowLockedUsdtAmount,
    order?.platformFee?.escrowLockAmount,
    order?.platformFee?.totalEscrowAmount,
    order?.usdtAmount,
  ];
  for (const candidate of candidates) {
    const normalized = toUsdtAmountOrZero(candidate);
    if (normalized > 0) return normalized;
  }
  return 0;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const lookbackDays = normalizeLookbackDays(body?.lookbackDays);
    const limit = toPositiveIntegerOrDefault(body?.limit, DEFAULT_LIMIT, 2000);
    const lookbackStartIso = new Date(Date.now() - lookbackDays * DAY_MS).toISOString();

    const client = await clientPromise;
    const buyordersCollection = client.db(dbName).collection('buyorders');

    const rows = await buyordersCollection
      .find(
        {
          privateSale: true,
          status: 'cancelled',
          cancelledAt: { $gte: lookbackStartIso },
        },
        {
          projection: {
            _id: 1,
            tradeId: 1,
            privateSale: 1,
            status: 1,
            createdAt: 1,
            acceptedAt: 1,
            paymentRequestedAt: 1,
            cancelledAt: 1,
            cancelTradeReason: 1,
            cancelledByRole: 1,
            canceller: 1,
            usdtAmount: 1,
            escrowLockUsdtAmount: 1,
            settlement: 1,
            platformFee: 1,
            rollbackUsdtAmount: 1,
            rollbackRawAmount: 1,
            cancelReleaseTransactionHash: 1,
            buyer: 1,
            seller: 1,
          },
        },
      )
      .sort({ cancelledAt: -1 })
      .limit(limit)
      .toArray();

    let excludedWithRollbackTxHashCount = 0;
    let missingEscrowAddressCount = 0;
    let missingExpectedRollbackAmountCount = 0;

    const candidates = rows.flatMap((order) => {
      const rollbackTxHash = resolveRollbackTxHash(order);
      if (rollbackTxHash) {
        excludedWithRollbackTxHashCount += 1;
        return [];
      }

      const orderId = String(order?._id || '').trim();
      const tradeId = String(order?.tradeId || '').trim();
      const sellerWalletAddress = String(order?.seller?.walletAddress || '').trim();
      const sellerNickname = String(order?.seller?.nickname || '').trim();
      const sellerEscrowWalletAddress = String(order?.seller?.escrowWalletAddress || '').trim();
      const buyerWalletAddress = String(order?.buyer?.walletAddress || order?.walletAddress || '').trim();
      const buyerEscrowWalletAddress = String(order?.buyer?.escrowWalletAddress || '').trim();
      const expectedRollbackUsdtAmount = resolveExpectedRollbackUsdtAmount(order);

      const issueCodes: string[] = ['missing-rollback-tx-hash'];
      if (!isWalletAddress(sellerEscrowWalletAddress) || !isWalletAddress(buyerEscrowWalletAddress)) {
        issueCodes.push('missing-escrow-wallet-address');
        missingEscrowAddressCount += 1;
      }
      if (!(expectedRollbackUsdtAmount > 0)) {
        issueCodes.push('missing-expected-rollback-amount');
        missingExpectedRollbackAmountCount += 1;
      }

      return [
        {
          candidateId: orderId,
          orderId,
          tradeId,
          createdAt: String(order?.createdAt || ''),
          acceptedAt: String(order?.acceptedAt || ''),
          paymentRequestedAt: String(order?.paymentRequestedAt || ''),
          cancelledAt: String(order?.cancelledAt || ''),
          cancelTradeReason: String(order?.cancelTradeReason || ''),
          cancelledByRole: String(order?.cancelledByRole || order?.canceller || ''),
          sellerWalletAddress,
          sellerNickname,
          sellerEscrowWalletAddress,
          buyerWalletAddress,
          buyerEscrowWalletAddress,
          usdtAmount: toUsdtAmountOrZero(order?.usdtAmount),
          expectedRollbackUsdtAmount,
          rollbackUsdtAmount: toUsdtAmountOrZero(order?.rollbackUsdtAmount),
          rollbackRawAmount: String(order?.rollbackRawAmount || ''),
          rollbackTxHash: '',
          issueCodes,
        },
      ];
    });

    return NextResponse.json({
      result: {
        candidates,
        meta: {
          lookbackDays,
          scannedCancelledOrders: rows.length,
          missingRollbackTransferCount: candidates.length,
          excludedWithRollbackTxHashCount,
          missingEscrowAddressCount,
          missingExpectedRollbackAmountCount,
          inspectedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: '취소 주문 회수 누락 후보 조회 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
