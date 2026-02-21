import { NextResponse, type NextRequest } from 'next/server';

import clientPromise, { dbName } from '@/lib/mongodb';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toText = (value: unknown) => String(value ?? '').trim();

const buildMatchQuery = async ({
  storecode,
  searchTerm,
  agentcode,
  includeUnverified,
}: {
  storecode: string;
  searchTerm: string;
  agentcode: string;
  includeUnverified: boolean;
}) => {
  const client = await clientPromise;
  const storeCollection = client.db(dbName).collection('stores');

  const conditions: Record<string, unknown>[] = [
    { walletAddress: { $exists: true, $ne: null } },
    { seller: { $exists: true } },
  ];

  if (!includeUnverified) {
    conditions.push({ verified: true });
  }

  const normalizedStorecode = toText(storecode);
  const normalizedAgentcode = toText(agentcode);

  if (normalizedAgentcode) {
    const agentcodeRegex = { $regex: `^${escapeRegExp(normalizedAgentcode)}$`, $options: 'i' };
    const stores = await storeCollection
      .find(
        {
          agentcode: normalizedAgentcode,
          storecode: { $nin: ['admin', 'agent'] },
        },
        {
          projection: { _id: 0, storecode: 1 },
        },
      )
      .toArray();

    const allowedStorecodes = stores
      .map((store) => toText((store as { storecode?: unknown })?.storecode))
      .filter(Boolean);

    if (normalizedStorecode) {
      const allowedStorecodeSet = new Set(allowedStorecodes.map((code) => code.toLowerCase()));
      if (!allowedStorecodeSet.has(normalizedStorecode.toLowerCase())) {
        return { _id: null };
      }
      conditions.push({ storecode: normalizedStorecode });
    } else {
      const agentScopeConditions: Record<string, unknown>[] = [
        { agentcode: agentcodeRegex },
        { 'seller.agentcode': agentcodeRegex },
        { 'store.agentcode': agentcodeRegex },
        { 'storeInfo.agentcode': agentcodeRegex },
      ];
      if (allowedStorecodes.length > 0) {
        agentScopeConditions.unshift({ storecode: { $in: allowedStorecodes } });
      }
      conditions.push({ $or: agentScopeConditions });
    }
  } else {
    conditions.push({ storecode: { $regex: normalizedStorecode, $options: 'i' } });
  }

  const normalizedSearchTerm = toText(searchTerm);
  if (normalizedSearchTerm) {
    const searchRegex = { $regex: escapeRegExp(normalizedSearchTerm), $options: 'i' };
    conditions.push({
      $or: [
        { nickname: searchRegex },
        { walletAddress: searchRegex },
        { 'seller.bankInfo.bankName': searchRegex },
        { 'seller.bankInfo.accountNumber': searchRegex },
        { 'seller.status': searchRegex },
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
    const agentcode = toText(body?.agentcode);
    const includeUnverified = body?.includeUnverified !== false;

    const matchQuery = await buildMatchQuery({
      storecode,
      searchTerm,
      agentcode,
      includeUnverified,
    });

    const client = await clientPromise;
    const collection = client.db(dbName).collection('users');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await collection
      .aggregate<{
        totalSellers: number;
        confirmedSellers: number;
        pendingSellers: number;
        enabledSellers: number;
        disabledSellers: number;
        bankApprovedSellers: number;
        bankReviewRequiredSellers: number;
        newSellers7d: number;
        activeAgentCount: number;
      }>([
        { $match: matchQuery },
        {
          $addFields: {
            sellerStatusNormalized: { $toLower: { $ifNull: ['$seller.status', 'pending'] } },
            sellerEnabledNormalized: { $eq: ['$seller.enabled', true] },
            bankStatusNormalized: { $toLower: { $ifNull: ['$seller.bankInfo.status', 'none'] } },
            createdAtDate: {
              $dateFromString: {
                dateString: { $ifNull: ['$createdAt', ''] },
                onError: new Date(0),
                onNull: new Date(0),
              },
            },
            agentcodeResolved: {
              $trim: {
                input: {
                  $ifNull: [
                    '$agentcode',
                    {
                      $ifNull: [
                        '$seller.agentcode',
                        {
                          $ifNull: ['$store.agentcode', { $ifNull: ['$storeInfo.agentcode', ''] }],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalSellers: { $sum: 1 },
            confirmedSellers: {
              $sum: {
                $cond: [{ $eq: ['$sellerStatusNormalized', 'confirmed'] }, 1, 0],
              },
            },
            pendingSellers: {
              $sum: {
                $cond: [{ $ne: ['$sellerStatusNormalized', 'confirmed'] }, 1, 0],
              },
            },
            enabledSellers: {
              $sum: {
                $cond: ['$sellerEnabledNormalized', 1, 0],
              },
            },
            disabledSellers: {
              $sum: {
                $cond: ['$sellerEnabledNormalized', 0, 1],
              },
            },
            bankApprovedSellers: {
              $sum: {
                $cond: [{ $eq: ['$bankStatusNormalized', 'approved'] }, 1, 0],
              },
            },
            bankReviewRequiredSellers: {
              $sum: {
                $cond: [{ $ne: ['$bankStatusNormalized', 'approved'] }, 1, 0],
              },
            },
            newSellers7d: {
              $sum: {
                $cond: [{ $gte: ['$createdAtDate', sevenDaysAgo] }, 1, 0],
              },
            },
            activeAgentCodes: { $addToSet: '$agentcodeResolved' },
          },
        },
        {
          $project: {
            _id: 0,
            totalSellers: 1,
            confirmedSellers: 1,
            pendingSellers: 1,
            enabledSellers: 1,
            disabledSellers: 1,
            bankApprovedSellers: 1,
            bankReviewRequiredSellers: 1,
            newSellers7d: 1,
            activeAgentCount: {
              $size: {
                $filter: {
                  input: '$activeAgentCodes',
                  as: 'agentCode',
                  cond: {
                    $gt: [
                      { $strLenCP: { $trim: { input: { $ifNull: ['$$agentCode', ''] } } } },
                      0,
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
      totalSellers: 0,
      confirmedSellers: 0,
      pendingSellers: 0,
      enabledSellers: 0,
      disabledSellers: 0,
      bankApprovedSellers: 0,
      bankReviewRequiredSellers: 0,
      newSellers7d: 0,
      activeAgentCount: 0,
    };

    const confirmedRate =
      summary.totalSellers > 0
        ? Number(((summary.confirmedSellers / summary.totalSellers) * 100).toFixed(1))
        : 0;

    return NextResponse.json({
      result: {
        ...summary,
        confirmedRate,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('getSellerManagementDashboard failed', error);
    return NextResponse.json(
      { error: 'failed to fetch seller management dashboard' },
      { status: 500 },
    );
  }
}
