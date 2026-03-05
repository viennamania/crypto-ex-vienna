import { NextResponse, type NextRequest } from 'next/server';
import {
  cancelPrivateBuyOrderByBuyer,
  type CancelPrivateBuyOrderByBuyerProgressEvent,
} from '@lib/api/order';
import { verifyWalletAuthFromBody } from '@/lib/security/requestAuth';

const toText = (value: unknown) => String(value ?? '').trim();

const getClientIp = (request: NextRequest) => {
  const xForwardedFor = toText(request.headers.get('x-forwarded-for'));
  if (xForwardedFor) {
    const [firstIp] = xForwardedFor.split(',');
    const normalizedFirstIp = toText(firstIp);
    if (normalizedFirstIp) {
      return normalizedFirstIp;
    }
  }

  const fallbackHeaders = [
    'x-real-ip',
    'cf-connecting-ip',
    'x-vercel-forwarded-for',
    'x-client-ip',
    'true-client-ip',
    'x-original-forwarded-for',
  ];
  for (const headerName of fallbackHeaders) {
    const headerValue = toText(request.headers.get(headerName));
    if (headerValue) {
      return headerValue;
    }
  }

  return '';
};

const getClientUserAgent = (request: NextRequest) =>
  toText(request.headers.get('user-agent'));

type RequestPayload = {
  orderId: string;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  cancelledByIpAddress: string;
  cancelledByUserAgent: string;
  liveProgress: boolean;
};

type CancelPrivateBuyOrderSuccessResponse = {
  result: true;
};

type CancelPrivateBuyOrderProgressResponse = {
  type: 'progress';
} & CancelPrivateBuyOrderByBuyerProgressEvent;

type CancelPrivateBuyOrderResultResponse = {
  type: 'result';
  payload: CancelPrivateBuyOrderSuccessResponse;
};

type CancelPrivateBuyOrderErrorResponse = {
  type: 'error';
  status: number;
  payload: Record<string, unknown>;
};

type CancelPrivateBuyOrderStreamEvent =
  | CancelPrivateBuyOrderProgressResponse
  | CancelPrivateBuyOrderResultResponse
  | CancelPrivateBuyOrderErrorResponse;

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
  const orderId =
    typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const buyerWalletAddress =
    typeof body?.buyerWalletAddress === 'string' ? body.buyerWalletAddress.trim() : '';
  const sellerWalletAddress =
    typeof body?.sellerWalletAddress === 'string' ? body.sellerWalletAddress.trim() : '';
  const cancelledByIpAddress =
    typeof body?.cancelledByIpAddress === 'string' ? body.cancelledByIpAddress.trim() : '';
  const cancelledByUserAgent =
    typeof body?.cancelledByUserAgent === 'string' ? body.cancelledByUserAgent.trim() : '';
  const liveProgress = body?.liveProgress === true;

  return {
    orderId,
    buyerWalletAddress,
    sellerWalletAddress,
    cancelledByIpAddress: cancelledByIpAddress || getClientIp(request),
    cancelledByUserAgent: cancelledByUserAgent || getClientUserAgent(request),
    liveProgress,
  };
};

const executeCancelPrivateBuyOrderByBuyer = async (
  payload: RequestPayload,
  onProgress?: (
    event: CancelPrivateBuyOrderByBuyerProgressEvent,
  ) => void | Promise<void>,
): Promise<CancelPrivateBuyOrderSuccessResponse> => {
  const {
    orderId,
    buyerWalletAddress,
    sellerWalletAddress,
    cancelledByIpAddress,
    cancelledByUserAgent,
  } = payload;

  if (!orderId || !buyerWalletAddress) {
    throw new RouteError(400, {
      error: 'orderId and buyerWalletAddress are required.',
    });
  }

  const emitProgress = async (
    event: Omit<CancelPrivateBuyOrderByBuyerProgressEvent, 'occurredAt'>,
  ) => {
    if (!onProgress) {
      return;
    }
    await onProgress({
      ...event,
      occurredAt: new Date().toISOString(),
    });
  };

  await emitProgress({
    step: 'REQUEST_VALIDATED',
    title: '요청 검증',
    description: '거래 취소 요청 정보를 확인했습니다.',
    status: 'completed',
    data: {
      orderId,
    },
  });

  const result = await cancelPrivateBuyOrderByBuyer({
    orderId,
    buyerWalletAddress,
    sellerWalletAddress,
    cancelledByIpAddress,
    cancelledByUserAgent,
    onProgress,
  });

  if (!result) {
    throw new RouteError(400, {
      error: 'FAILED_TO_CANCEL_BUY_ORDER',
      message: '거래 취소에 실패했습니다.',
    });
  }

  await emitProgress({
    step: 'CANCEL_RESULT_READY',
    title: '취소 결과 반영',
    description: '거래 취소 요청이 정상 처리되었습니다.',
    status: 'completed',
  });

  return { result: true };
};

const handleLiveProgressResponse = (
  payload: RequestPayload,
): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const write = (event: CancelPrivateBuyOrderStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          const result = await executeCancelPrivateBuyOrderByBuyer(payload, async (event) => {
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
                message: '거래 취소 처리 중 서버 오류가 발생했습니다.',
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
    const bodyRaw = await request.json().catch(() => ({}));
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? (bodyRaw as Record<string, unknown>)
        : {};
    const payload = parseRequestPayload(body, request);
    const storecode =
      typeof body?.storecode === 'string' ? body.storecode.trim() : 'admin';

    const signatureAuth = await verifyWalletAuthFromBody({
      body,
      path: '/api/order/cancelPrivateBuyOrderByBuyer',
      method: 'POST',
      storecode: storecode || 'admin',
      consumeNonceValue: true,
    });

    if (signatureAuth.ok === false) {
      return signatureAuth.response;
    }

    if (signatureAuth.ok === true) {
      if (
        payload.buyerWalletAddress &&
        payload.buyerWalletAddress.toLowerCase() !== signatureAuth.walletAddress
      ) {
        return NextResponse.json(
          {
            error: 'buyerWalletAddress must match the signed wallet.',
          },
          { status: 403 },
        );
      }
      payload.buyerWalletAddress = signatureAuth.walletAddress;
    }

    if (payload.liveProgress) {
      return handleLiveProgressResponse(payload);
    }

    const result = await executeCancelPrivateBuyOrderByBuyer(payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json(error.payload, { status: error.status });
    }
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: '거래 취소 처리 중 서버 오류가 발생했습니다.',
        detail: toErrorDetailMessage(error),
      },
      { status: 500 },
    );
  }
}
