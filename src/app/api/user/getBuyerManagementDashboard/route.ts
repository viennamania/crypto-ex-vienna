import { NextResponse, type NextRequest } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toText = (value: unknown) => String(value ?? '').trim();

const buildMatchQuery = ({
  storecode,
  searchTerm,
  includeUnverified,
}: {
  storecode: string;
  searchTerm: string;
  includeUnverified: boolean;
}) => {
  const conditions: Record<string, unknown>[] = [
    { walletAddress: { $exists: true, $ne: null } },
    { buyer: { $exists: true } },
  ];

  if (!includeUnverified) {
    conditions.push({ verified: true });
  }

  const normalizedStorecode = toText(storecode);
  conditions.push({ storecode: { $regex: normalizedStorecode, $options: 'i' } });

  const normalizedSearchTerm = toText(searchTerm);
  if (normalizedSearchTerm) {
    const searchRegex = { $regex: escapeRegExp(normalizedSearchTerm), $options: 'i' };
    conditions.push({
      $or: [
        { nickname: searchRegex },
        { walletAddress: searchRegex },
        { 'buyer.bankInfo.bankName': searchRegex },
        { 'buyer.bankInfo.accountNumber': searchRegex },
        { 'buyer.status': searchRegex },
      ],
    });
  }

  if (conditions.length === 1) {
    return conditions[0];
  }
  return { $and: conditions };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const storecode = toText(body?.storecode);
    const searchTerm = toText(body?.searchTerm);
    const includeUnverified = body?.includeUnverified !== false;

    const matchQuery = buildMatchQuery({
      storecode,
      searchTerm,
      includeUnverified,
    });

    const client = await clientPromise;
    const collection = client.db(dbName).collection('users');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await collection
      .aggregate<{
        totalBuyers: number;
        verifiedBuyers: number;
        unverifiedBuyers: number;
        confirmedBuyers: number;
        pendingBuyers: number;
        bankApprovedBuyers: number;
        bankReviewRequiredBuyers: number;
        kycApprovedBuyers: number;
        kycPendingBuyers: number;
        newBuyers7d: number;
        activeStoreCount: number;
      }>([
        { $match: matchQuery },
        {
          $addFields: {
            buyerStatusNormalized: { $toLower: { $ifNull: ['$buyer.status', 'pending'] } },
            bankStatusNormalized: { $toLower: { $ifNull: ['$buyer.bankInfo.status', 'none'] } },
            kycStatusNormalized: {
              $toLower: {
                $ifNull: [
                  '$buyer.kyc.status',
                  {
                    $cond: [
                      {
                        $gt: [
                          { $strLenCP: { $ifNull: ['$buyer.kyc.idImageUrl', ''] } },
                          0,
                        ],
                      },
                      'pending',
                      'none',
                    ],
                  },
                ],
              },
            },
            createdAtDate: {
              $dateFromString: {
                dateString: { $ifNull: ['$createdAt', ''] },
                onError: new Date(0),
                onNull: new Date(0),
              },
            },
            normalizedStorecode: { $trim: { input: { $ifNull: ['$storecode', ''] } } },
          },
        },
        {
          $group: {
            _id: null,
            totalBuyers: { $sum: 1 },
            verifiedBuyers: { $sum: { $cond: [{ $eq: ['$verified', true] }, 1, 0] } },
            unverifiedBuyers: { $sum: { $cond: [{ $eq: ['$verified', true] }, 0, 1] } },
            confirmedBuyers: {
              $sum: { $cond: [{ $eq: ['$buyerStatusNormalized', 'confirmed'] }, 1, 0] },
            },
            pendingBuyers: {
              $sum: { $cond: [{ $ne: ['$buyerStatusNormalized', 'confirmed'] }, 1, 0] },
            },
            bankApprovedBuyers: {
              $sum: { $cond: [{ $eq: ['$bankStatusNormalized', 'approved'] }, 1, 0] },
            },
            bankReviewRequiredBuyers: {
              $sum: { $cond: [{ $ne: ['$bankStatusNormalized', 'approved'] }, 1, 0] },
            },
            kycApprovedBuyers: {
              $sum: { $cond: [{ $eq: ['$kycStatusNormalized', 'approved'] }, 1, 0] },
            },
            kycPendingBuyers: {
              $sum: { $cond: [{ $eq: ['$kycStatusNormalized', 'pending'] }, 1, 0] },
            },
            newBuyers7d: {
              $sum: { $cond: [{ $gte: ['$createdAtDate', sevenDaysAgo] }, 1, 0] },
            },
            activeStorecodes: { $addToSet: '$normalizedStorecode' },
          },
        },
        {
          $project: {
            _id: 0,
            totalBuyers: 1,
            verifiedBuyers: 1,
            unverifiedBuyers: 1,
            confirmedBuyers: 1,
            pendingBuyers: 1,
            bankApprovedBuyers: 1,
            bankReviewRequiredBuyers: 1,
            kycApprovedBuyers: 1,
            kycPendingBuyers: 1,
            newBuyers7d: 1,
            activeStoreCount: {
              $size: {
                $filter: {
                  input: '$activeStorecodes',
                  as: 'storecode',
                  cond: {
                    $and: [
                      {
                        $gt: [
                          { $strLenCP: { $trim: { input: { $ifNull: ['$$storecode', ''] } } } },
                          0,
                        ],
                      },
                      { $ne: ['$$storecode', 'admin'] },
                      { $ne: ['$$storecode', 'agent'] },
                    ],
                  },
                },
              },
            },
          },
        },
      ])
      .toArray();

    const summary = rows[0] || {
      totalBuyers: 0,
      verifiedBuyers: 0,
      unverifiedBuyers: 0,
      confirmedBuyers: 0,
      pendingBuyers: 0,
      bankApprovedBuyers: 0,
      bankReviewRequiredBuyers: 0,
      kycApprovedBuyers: 0,
      kycPendingBuyers: 0,
      newBuyers7d: 0,
      activeStoreCount: 0,
    };

    const verifiedRate =
      summary.totalBuyers > 0
        ? Number(((summary.verifiedBuyers / summary.totalBuyers) * 100).toFixed(1))
        : 0;

    return NextResponse.json({
      result: {
        ...summary,
        verifiedRate,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('getBuyerManagementDashboard failed', error);
    return NextResponse.json(
      { error: 'failed to fetch buyer management dashboard' },
      { status: 500 },
    );
  }
}
