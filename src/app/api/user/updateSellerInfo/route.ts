import { NextResponse, type NextRequest } from 'next/server';

import { updateSeller } from '@lib/api/user';
import { evaluateRateLimit } from '@/lib/security/rateLimit';
import {
  getRequesterIpAddress,
  getRoleForWalletAddress,
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress, normalizeWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();
const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const normalizeRole = (value: unknown) => toText(value).toLowerCase();
const normalizeStatus = (value: unknown) => toText(value).toLowerCase();

const sanitizeSellerPayloadForNonAdmin = (sellerPayload: Record<string, unknown>) => {
  const sanitizedSellerPayload: Record<string, unknown> = {
    ...sellerPayload,
  };

  // Admin-only fields
  delete sanitizedSellerPayload.status;
  delete sanitizedSellerPayload.statusHistory;
  delete sanitizedSellerPayload.enabled;
  delete sanitizedSellerPayload.platformFee;
  delete sanitizedSellerPayload.agentcode;

  if (isObjectRecord(sanitizedSellerPayload.kyc)) {
    const sanitizedKyc: Record<string, unknown> = {
      ...sanitizedSellerPayload.kyc,
    };
    const kycStatus = normalizeStatus(sanitizedKyc.status);
    if (kycStatus && kycStatus !== 'pending') {
      delete sanitizedKyc.status;
    }
    delete sanitizedKyc.reviewedAt;
    delete sanitizedKyc.approvedAt;
    delete sanitizedKyc.rejectionReason;
    sanitizedSellerPayload.kyc = sanitizedKyc;
  }

  if (isObjectRecord(sanitizedSellerPayload.bankInfo)) {
    const sanitizedBankInfo: Record<string, unknown> = {
      ...sanitizedSellerPayload.bankInfo,
      status: 'pending',
    };
    delete sanitizedBankInfo.reviewedAt;
    delete sanitizedBankInfo.approvedAt;
    delete sanitizedBankInfo.rejectionReason;
    sanitizedSellerPayload.bankInfo = sanitizedBankInfo;
  }

  return sanitizedSellerPayload;
};

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
  const bodyRaw = await request.json().catch(() => ({}));
  const body =
    bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
      ? (bodyRaw as Record<string, unknown>)
      : {};

  const storecode = toText(body.storecode) || 'admin';
  const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);
  const sellerStatus = toText(body.sellerStatus);
  const bankName = toText(body.bankName);
  const accountNumber = toText(body.accountNumber);
  const accountHolder = toText(body.accountHolder);
  const contactMemo = toText(body.contactMemo);
  const sellerPayload = isObjectRecord(body.seller) ? body.seller : {};

  const ipAddress = getRequesterIpAddress(request) || 'unknown';
  const rate = evaluateRateLimit({
    key: `api:user:updateSellerInfo:${ipAddress}:${requestedWalletAddress || 'unknown'}`,
    limit: 30,
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
    path: '/api/user/updateSellerInfo',
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
  const requesterRole = normalizeRole(requester?.role);
  const isRequesterAdmin = requesterRole === 'admin';
  const requesterStorecode = toText(requester?.storecode);
  const signerWalletAddress = toText(requester?.walletAddress) || signatureAuth.walletAddress;
  const normalizedSignerWalletAddress = normalizeWalletAddress(signerWalletAddress);

  const walletAddress = await resolveTargetWalletAddress({
    storecode,
    requestedWalletAddress,
    signerWalletAddress,
  });
  if (!isWalletAddress(walletAddress)) {
    return NextResponse.json(
      {
        error: 'walletAddress is not authorized.',
      },
      {
        status: 403,
      },
    );
  }

  const effectiveStorecode = isRequesterAdmin
    ? storecode
    : requesterStorecode || storecode;
  const isAdminUpdatingAnotherWallet =
    isRequesterAdmin
    && isWalletAddress(normalizedSignerWalletAddress)
    && walletAddress !== normalizedSignerWalletAddress;
  const effectiveSellerStatus = isRequesterAdmin ? sellerStatus : '';
  const effectiveSellerPayload = isRequesterAdmin
    ? sellerPayload
    : sanitizeSellerPayloadForNonAdmin(sellerPayload);
  const sellerBankInfo = isObjectRecord(effectiveSellerPayload.bankInfo) ? effectiveSellerPayload.bankInfo : {};
  const bankInfoStatusForNonAdmin = !isRequesterAdmin && (bankName || accountNumber || accountHolder || contactMemo)
    ? 'pending'
    : undefined;
  const result = await updateSeller({
    storecode: effectiveStorecode,
    walletAddress,
    allowWalletOnlyFallback: !isAdminUpdatingAnotherWallet,
    seller: {
      ...effectiveSellerPayload,
      ...(effectiveSellerStatus ? { status: effectiveSellerStatus } : {}),
      bankInfo: {
        ...sellerBankInfo,
        bankName,
        accountNumber,
        accountHolder,
        contactMemo,
        ...(bankInfoStatusForNonAdmin ? { status: bankInfoStatusForNonAdmin } : {}),
      },
    },
  });

  return NextResponse.json({
    result,
  });
}
