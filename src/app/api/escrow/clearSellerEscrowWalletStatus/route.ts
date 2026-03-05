import { NextResponse, type NextRequest } from 'next/server';
import { createThirdwebClient, Engine } from 'thirdweb';

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

const isFinalStatus = (status: EscrowRecoveryStatus) =>
  status === 'CONFIRMED' || status === 'FAILED';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const transactionId = String(body?.transactionId || '').trim();

  if (!transactionId) {
    return NextResponse.json({ error: 'transactionId is required' }, { status: 400 });
  }

  const secretKey = String(process.env.THIRDWEB_SECRET_KEY || '').trim();
  if (!secretKey) {
    return NextResponse.json({ error: 'THIRDWEB_SECRET_KEY is not configured' }, { status: 500 });
  }

  try {
    const client = createThirdwebClient({ secretKey });
    const executionResult = await Engine.getTransactionStatus({
      client,
      transactionId,
    });

    const status = normalizeRecoveryStatus(executionResult?.status || 'QUEUED');
    const onchainStatus =
      executionResult && typeof executionResult === 'object' && 'onchainStatus' in executionResult
        ? String(executionResult.onchainStatus || '')
        : '';
    const transactionHash =
      executionResult && typeof executionResult === 'object' && 'transactionHash' in executionResult
        ? String(executionResult.transactionHash || '').trim()
        : '';
    const error =
      executionResult && typeof executionResult === 'object' && 'error' in executionResult
        ? normalizeErrorText(executionResult.error)
        : '';

    return NextResponse.json({
      result: {
        transactionId,
        status,
        onchainStatus,
        transactionHash,
        error,
        isFinal: isFinalStatus(status),
      },
    });
  } catch (statusError) {
    const detail = normalizeErrorText(statusError);
    const lowerDetail = detail.toLowerCase();
    if (lowerDetail.includes('not found') || lowerDetail.includes('404')) {
      return NextResponse.json({
        result: {
          transactionId,
          status: 'QUEUED' as EscrowRecoveryStatus,
          onchainStatus: '',
          transactionHash: '',
          error: '',
          isFinal: false,
        },
      });
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch escrow recovery status',
        detail,
      },
      { status: 500 },
    );
  }
}
