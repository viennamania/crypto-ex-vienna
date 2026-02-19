'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useActiveAccount } from 'thirdweb/react';

type ActiveTradeOrder = {
  orderId: string;
  tradeId: string;
  status: string;
  createdAt: string;
  acceptedAt: string;
  paymentRequestedAt: string;
  paymentConfirmedAt: string;
  cancelledAt: string;
  krwAmount: number;
  usdtAmount: number;
  buyerWalletAddress: string;
  sellerWalletAddress: string;
  sellerNickname: string;
  storeName: string;
  storecode: string;
};

type ActiveTradeResult = {
  isTrading: boolean;
  status: string | null;
  order: ActiveTradeOrder | null;
};

const TRADABLE_STATUSES = new Set(['ordered', 'accepted', 'paymentRequested']);
const STATUS_LABEL: Record<string, string> = {
  ordered: '주문 접수',
  accepted: '판매자 수락',
  paymentRequested: '입금 요청',
};
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

const toTrimmedString = (value: unknown) => String(value || '').trim();

const formatCountdownClock = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const shortAddress = (value: string) => {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const normalizeActiveTradeResult = (value: unknown): ActiveTradeResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const orderRaw =
    payload.order && typeof payload.order === 'object' && !Array.isArray(payload.order)
      ? (payload.order as Record<string, unknown>)
      : null;
  if (payload.isTrading !== true || !orderRaw) {
    return null;
  }

  const status = toTrimmedString(orderRaw.status);
  if (!status || !TRADABLE_STATUSES.has(status)) {
    return null;
  }

  const order: ActiveTradeOrder = {
    orderId: toTrimmedString(orderRaw.orderId),
    tradeId: toTrimmedString(orderRaw.tradeId),
    status,
    createdAt: toTrimmedString(orderRaw.createdAt),
    acceptedAt: toTrimmedString(orderRaw.acceptedAt),
    paymentRequestedAt: toTrimmedString(orderRaw.paymentRequestedAt),
    paymentConfirmedAt: toTrimmedString(orderRaw.paymentConfirmedAt),
    cancelledAt: toTrimmedString(orderRaw.cancelledAt),
    krwAmount: Number(orderRaw.krwAmount || 0),
    usdtAmount: Number(orderRaw.usdtAmount || 0),
    buyerWalletAddress: toTrimmedString(orderRaw.buyerWalletAddress),
    sellerWalletAddress: toTrimmedString(orderRaw.sellerWalletAddress),
    sellerNickname: toTrimmedString(orderRaw.sellerNickname),
    storeName: toTrimmedString(orderRaw.storeName),
    storecode: toTrimmedString(orderRaw.storecode),
  };

  if (!order.orderId) {
    return null;
  }

  return {
    isTrading: true,
    status,
    order,
  };
};

export default function WalletActiveTradeNotice() {
  const params = useParams<{ lang?: string }>();
  const searchParams = useSearchParams();
  const activeAccount = useActiveAccount();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';
  const storecodeFromQuery = toTrimmedString(searchParams?.get('storecode'));

  const [activeTrade, setActiveTrade] = useState<ActiveTradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdownNowMs, setCountdownNowMs] = useState<number>(() => Date.now());
  const [collapsed, setCollapsed] = useState(false);

  const activeOrder = activeTrade?.order || null;
  const pollingMs = activeOrder?.status === 'paymentRequested' ? 4000 : 12000;
  const statusLabel = activeOrder ? STATUS_LABEL[activeOrder.status] || '진행중' : '';
  const orderStorecode = toTrimmedString(activeOrder?.storecode);
  const effectiveStorecode =
    storecodeFromQuery || (orderStorecode && orderStorecode !== 'admin' ? orderStorecode : '');

  const buyPagePath = useMemo(() => {
    const query = new URLSearchParams();
    if (effectiveStorecode) {
      query.set('storecode', effectiveStorecode);
    }
    if (activeOrder?.sellerWalletAddress) {
      query.set('seller', activeOrder.sellerWalletAddress);
    }
    const queryString = query.toString();
    const basePath = `/${lang}/wallet-management/buy-usdt`;
    return queryString ? `${basePath}?${queryString}` : basePath;
  }, [activeOrder?.sellerWalletAddress, effectiveStorecode, lang]);

  const paymentRequestCountdown = useMemo(() => {
    if (!activeOrder || activeOrder.status !== 'paymentRequested') {
      return null;
    }

    const startedAtRaw = activeOrder.paymentRequestedAt || activeOrder.createdAt || '';
    const startedAtMs = Date.parse(startedAtRaw);
    if (!Number.isFinite(startedAtMs)) {
      return null;
    }

    const deadlineMs = startedAtMs + PAYMENT_WINDOW_MS;
    const remainingMs = Math.max(0, deadlineMs - countdownNowMs);
    return {
      remainingMs,
      isExpired: remainingMs <= 0,
    };
  }, [activeOrder, countdownNowMs]);

  const loadActiveTrade = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!activeAccount?.address) {
        setActiveTrade(null);
        setCollapsed(false);
        setLoading(false);
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      try {
        const response = await fetch('/api/order/getActivePrivateTradeByBuyer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyerWalletAddress: activeAccount.address,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(data?.error || '진행중 주문을 조회하지 못했습니다.'));
        }

        const nextActiveTrade = normalizeActiveTradeResult(data?.result);
        setActiveTrade(nextActiveTrade);
        if (!nextActiveTrade) {
          setCollapsed(false);
        }
      } catch (error) {
        console.error('Failed to load active private trade for wallet-management banner', error);
        setActiveTrade(null);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [activeAccount?.address],
  );

  useEffect(() => {
    loadActiveTrade();
  }, [loadActiveTrade]);

  useEffect(() => {
    if (!activeAccount?.address) return;

    const timer = window.setInterval(() => {
      loadActiveTrade({ silent: true });
    }, pollingMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeAccount?.address, loadActiveTrade, pollingMs]);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== 'paymentRequested') {
      return;
    }
    const timer = window.setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeOrder]);

  if (!activeAccount?.address) {
    return null;
  }

  if (loading && !activeOrder) {
    return null;
  }

  if (!activeOrder) {
    return null;
  }

  const sellerLabel = activeOrder.sellerNickname || shortAddress(activeOrder.sellerWalletAddress) || '판매자';
  const tradeCode = activeOrder.tradeId || activeOrder.orderId.slice(-6);

  return (
    <>
      <div className={collapsed ? 'h-14' : 'h-[92px]'} aria-hidden />

      <section className="fixed top-2 left-1/2 z-[95] w-[calc(100%-1rem)] max-w-[430px] -translate-x-1/2 px-1">
        <div
          className={`rounded-2xl border border-cyan-200/90 bg-[linear-gradient(135deg,rgba(236,254,255,0.96)_0%,rgba(255,255,255,0.96)_45%,rgba(240,249,255,0.98)_100%)] shadow-[0_20px_45px_-30px_rgba(2,132,199,0.7)] backdrop-blur ${
            collapsed ? 'px-3 py-2.5' : 'px-3 py-3'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 items-center rounded-full border border-cyan-300 bg-cyan-50 px-2 text-[10px] font-semibold text-cyan-700">
                  구매 진행중
                </span>
                <span className="text-[11px] font-semibold text-slate-600">{statusLabel}</span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                {sellerLabel} · #{tradeCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              aria-label={collapsed ? '진행중 주문 알림 펼치기' : '진행중 주문 알림 접기'}
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                {collapsed ? (
                  <path d="m5 12 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          </div>

          {!collapsed && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/80 bg-white/85 px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">구매 수량</p>
                  <p className="mt-1 text-base font-extrabold text-slate-900">
                    {activeOrder.usdtAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT
                  </p>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/85 px-2.5 py-2 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">구매 금액</p>
                  <p className="mt-1 text-base font-extrabold text-slate-900">
                    {activeOrder.krwAmount.toLocaleString()}원
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-600">
                  {paymentRequestCountdown
                    ? paymentRequestCountdown.isExpired
                      ? '입금 확인이 지연되고 있습니다.'
                      : `입금 마감까지 ${formatCountdownClock(paymentRequestCountdown.remainingMs)}`
                    : '거래 상태를 실시간으로 확인 중입니다.'}
                </p>
                <Link
                  href={buyPagePath}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300 bg-cyan-600 px-2.5 text-xs font-semibold text-white transition hover:bg-cyan-500"
                >
                  상세 보기
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
