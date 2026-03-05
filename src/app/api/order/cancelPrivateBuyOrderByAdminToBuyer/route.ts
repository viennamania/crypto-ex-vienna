import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

import {
  cancelPrivateBuyOrderByAdminToBuyer,
  type CancelPrivateBuyOrderByAdminToBuyerProgressEvent,
} from '@lib/api/order';
import clientPromise, { dbName } from '@/lib/mongodb';
import {
  isWalletAddressAuthorizedForExpectedWallet,
  verifyWalletAuthFromBody,
} from '@/lib/security/requestAuth';
import { isWalletAddress } from '@/lib/security/walletSignature';

const toText = (value: unknown) => String(value ?? '').trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  agentcode: string;
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
  const agentcode =
    typeof body?.agentcode === 'string' ? body.agentcode.trim() : '';
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
    agentcode,
    orderId,
    adminWalletAddress,
    cancelledByRole,
    cancelledByNickname,
    cancelledByIpAddress: cancelledByIpAddress || getClientIp(request),
    cancelledByUserAgent: cancelledByUserAgent || getClientUserAgent(request),
    liveProgress,
  };
};

const verifyAdminPermissionForOrder = async ({
  orderId,
  agentcode,
  requesterWalletAddress,
}: {
  orderId: string;
  agentcode: string;
  requesterWalletAddress: string;
}): Promise<
  | { ok: true; agentcode: string; adminWalletAddress: string }
  | { ok: false; status: number; payload: Record<string, unknown> }
> => {
  if (!isWalletAddress(requesterWalletAddress)) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: 'ADMIN_WALLET_ADDRESS_INVALID',
        message: '관리자 지갑 주소 형식이 올바르지 않습니다.',
      },
    };
  }

  const client = await clientPromise;
  const buyordersCollection = client.db(dbName).collection('buyorders');
  const agentsCollection = client.db(dbName).collection('agents');

  let resolvedAgentcode = toText(agentcode);
  if (!resolvedAgentcode) {
    if (!ObjectId.isValid(orderId)) {
      return {
        ok: false,
        status: 400,
        payload: {
          error: 'INVALID_ORDER_ID',
          message: '유효한 주문 번호가 필요합니다.',
        },
      };
    }

    const order = await buyordersCollection.findOne<Record<string, unknown>>(
      { _id: new ObjectId(orderId) },
      {
        projection: {
          _id: 0,
          agentcode: 1,
          agent: 1,
          store: 1,
        },
      },
    );

    const orderAgent =
      order?.agent && typeof order.agent === 'object' && !Array.isArray(order.agent)
        ? (order.agent as Record<string, unknown>)
        : {};
    const orderStore =
      order?.store && typeof order.store === 'object' && !Array.isArray(order.store)
        ? (order.store as Record<string, unknown>)
        : {};

    resolvedAgentcode = toText(order?.agentcode || orderAgent.agentcode || orderStore.agentcode);
  }

  if (!resolvedAgentcode) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: 'AGENTCODE_REQUIRED',
        message: '에이전트 코드가 없어 주문 취소 권한을 확인할 수 없습니다.',
      },
    };
  }

  const agent = await agentsCollection.findOne<Record<string, unknown>>(
    {
      agentcode: {
        $regex: `^${escapeRegex(resolvedAgentcode)}$`,
        $options: 'i',
      },
    },
    {
      projection: {
        _id: 0,
        adminWalletAddress: 1,
      },
    },
  );

  if (!agent) {
    return {
      ok: false,
      status: 404,
      payload: {
        error: 'AGENT_NOT_FOUND',
        message: '에이전트 정보를 찾지 못했습니다.',
      },
    };
  }

  const adminWalletAddress = toText(agent.adminWalletAddress);
  if (!isWalletAddress(adminWalletAddress)) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: 'AGENT_ADMIN_WALLET_MISSING',
        message: '에이전트 관리자 지갑이 설정되지 않았습니다.',
      },
    };
  }

  const isAuthorized = await isWalletAddressAuthorizedForExpectedWallet({
    expectedWalletAddress: adminWalletAddress,
    candidateWalletAddress: requesterWalletAddress,
  });

  if (!isAuthorized) {
    return {
      ok: false,
      status: 403,
      payload: {
        error: 'FORBIDDEN',
        message: '에이전트 관리자 지갑만 주문 취소를 수행할 수 있습니다.',
      },
    };
  }

  return {
    ok: true,
    agentcode: resolvedAgentcode,
    adminWalletAddress,
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
    const bodyRaw = await request.json().catch(() => ({}));
    const body =
      bodyRaw && typeof bodyRaw === 'object' && !Array.isArray(bodyRaw)
        ? (bodyRaw as Record<string, unknown>)
        : {};

    const signatureAuth = await verifyWalletAuthFromBody({
      body,
      path: '/api/order/cancelPrivateBuyOrderByAdminToBuyer',
      method: 'POST',
      storecode: toText(body.agentcode) || 'admin',
      consumeNonceValue: true,
    });
    if (signatureAuth.ok === false) {
      return signatureAuth.response;
    }

    const payload = parseRequestPayload(body, request);
    const requesterWalletAddress = signatureAuth.ok === true
      ? signatureAuth.walletAddress
      : payload.adminWalletAddress;

    const permission = await verifyAdminPermissionForOrder({
      orderId: payload.orderId,
      agentcode: payload.agentcode,
      requesterWalletAddress,
    });

    if (!permission.ok) {
      return NextResponse.json(permission.payload, { status: permission.status });
    }

    payload.agentcode = permission.agentcode;
    payload.adminWalletAddress = requesterWalletAddress;

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
