import { NextResponse, type NextRequest } from 'next/server';

import {
  cancelPrivateBuyOrderByAdminToBuyer,
  type CancelPrivateBuyOrderByAdminToBuyerProgressEvent,
} from '@lib/api/order';

const toText = (value: unknown) => String(value ?? '').trim();

const getClientIp = (request: NextRequest) => {
  const xForwardedFor = toText(request.headers.get('x-forwarded-for'));
  if (xForwardedFor) {
    const [firstIp] = xForwardedFor.split(',');
    return toText(firstIp);
  }
  return toText(request.headers.get('x-real-ip'));
};

const getClientUserAgent = (request: NextRequest) =>
  toText(request.headers.get('user-agent'));

type RequestPayload = {
  orderId: string;
  adminWalletAddress: string;
  cancelledByRole: string;
  cancelledByNickname: string;
  cancelledByIpAddress: string;
  cancelledByUserAgent: string;
  liveProgress: boolean;
};

type CancelResultPayload = {
  result: {
    success: boolean;
    transactionHash?: string;
    cancelledAt?: string;
    transferSkipped?: boolean;
    transferSkipReason?: string;
    error?: string;
  };
};

type CancelProgressResponse = {
  type: 'progress';
} & CancelPrivateBuyOrderByAdminToBuyerProgressEvent;

type CancelResultResponse = {
  type: 'result';
  payload: CancelResultPayload;
};

type CancelErrorResponse = {
  type: 'error';
  status: number;
  payload: Record<string, unknown>;
};

type CancelStreamEvent =
  | CancelProgressResponse
  | CancelResultResponse
  | CancelErrorResponse;

class RouteError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload?.error || payload?.message || 'ROUTE_ERROR'));
    this.name = 'RouteError';
    this.status = status;
    this.payload = payload;
  }
}

const toErrorDetailMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';

const parseRequestPayload = (body: any, request: NextRequest): RequestPayload => {
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const adminWalletAddress =
    typeof body?.adminWalletAddress === 'string' ? body.adminWalletAddress.trim() : '';
  const cancelledByRole =
    typeof body?.cancelledByRole === 'string' ? body.cancelledByRole.trim() : '';
  const cancelledByNickname =
    typeof body?.cancelledByNickname === 'string' ? body.cancelledByNickname.trim() : '';
  const cancelledByIpAddress =
    typeof body?.cancelledByIpAddress === 'string' ? body.cancelledByIpAddress.trim() : '';
  const cancelledByUserAgent =
    typeof body?.cancelledByUserAgent === 'string' ? body.cancelledByUserAgent.trim() : '';
  const liveProgress = body?.liveProgress === true;

  return {
    orderId,
    adminWalletAddress,
    cancelledByRole,
    cancelledByNickname,
    cancelledByIpAddress: cancelledByIpAddress || getClientIp(request),
    cancelledByUserAgent: cancelledByUserAgent || getClientUserAgent(request),
    liveProgress,
  };
};

const executeCancelPrivateBuyOrderByAdminToBuyer = async (
  payload: RequestPayload,
  onProgress?: (
    event: CancelPrivateBuyOrderByAdminToBuyerProgressEvent,
  ) => void | Promise<void>,
): Promise<CancelResultPayload> => {
  if (!payload.orderId) {
    throw new RouteError(400, { error: 'orderId is required.' });
  }

  const result = await cancelPrivateBuyOrderByAdminToBuyer({
    orderId: payload.orderId,
    adminWalletAddress: payload.adminWalletAddress,
    cancelledByRole: payload.cancelledByRole,
    cancelledByNickname: payload.cancelledByNickname,
    cancelledByIpAddress: payload.cancelledByIpAddress,
    cancelledByUserAgent: payload.cancelledByUserAgent,
    onProgress,
  });

  if (!result.success) {
    throw new RouteError(400, {
      error: result.error || 'FAILED_TO_CANCEL_BUY_ORDER',
      message: '주문 취소 처리에 실패했습니다.',
    });
  }

  return { result };
};

const handleLiveProgressResponse = (payload: RequestPayload): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const write = (event: CancelStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          const result = await executeCancelPrivateBuyOrderByAdminToBuyer(payload, async (event) => {
            write({
              type: 'progress',
              ...event,
            });
          });

          write({
            type: 'result',
            payload: result,
          });
        } catch (error) {
          if (error instanceof RouteError) {
            write({
              type: 'error',
              status: error.status,
              payload: error.payload,
            });
          } else {
            write({
              type: 'error',
              status: 500,
              payload: {
                error: 'INTERNAL_SERVER_ERROR',
                message: '주문 취소 처리 중 서버 오류가 발생했습니다.',
                detail: toErrorDetailMessage(error),
              },
            });
          }
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = parseRequestPayload(body, request);

    if (payload.liveProgress) {
      return handleLiveProgressResponse(payload);
    }

    const result = await executeCancelPrivateBuyOrderByAdminToBuyer(payload);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json(error.payload, { status: error.status });
    }

    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: '주문 취소 처리 중 서버 오류가 발생했습니다.',
        detail: toErrorDetailMessage(error),
      },
      { status: 500 },
    );
  }
}
