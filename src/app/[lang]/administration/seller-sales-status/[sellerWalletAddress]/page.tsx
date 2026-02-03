'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';

type SellerUser = {
  _id?: string;
  nickname?: string;
  walletAddress: string;
  avatar?: string;
  seller?: {
    status?: string;
    enabled?: boolean;
    escrowWalletAddress?: string;
    buyOrder?: {
      _id?: string;
      status?: string;
      tradeId?: string;
      krwAmount?: number;
      usdtAmount?: number;
      rate?: number;
      createdAt?: string;
      paymentRequestedAt?: string;
      paymentConfirmedAt?: string;
      transactionHash?: string;
      cancelledAt?: string;
      paymentMethod?: string;
      buyer?: {
        nickname?: string;
        walletAddress?: string;
        depositName?: string;
        mobile?: string;
        depositBankName?: string;
        depositBankAccountNumber?: string;
        depositBankAccountHolder?: string;
      };
    };
    totalPaymentConfirmedCount?: number;
    totalPaymentConfirmedUsdtAmount?: number;
    totalPaymentConfirmedKrwAmount?: number;
    promotionText?: string;
  };
  currentUsdtBalance?: number;
};

const toneStyles: Record<string, { badge: string; bar: string }> = {
  idle: {
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
    bar: 'bg-slate-400',
  },
  accepted: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    bar: 'bg-sky-500',
  },
  paymentRequested: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    bar: 'bg-amber-500',
  },
  paymentConfirmed: {
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    bar: 'bg-blue-500',
  },
  done: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    bar: 'bg-emerald-500',
  },
  cancelled: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    bar: 'bg-rose-400',
  },
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
};

const truncate = (value?: string, front = 6, back = 4) => {
  if (!value) return '-';
  if (value.length <= front + back) return value;
  return `${value.slice(0, front)}...${value.slice(-back)}`;
};

const formatDuration = (ms: number) => {
  if (ms < 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const getSaleState = (seller: SellerUser) => {
  const order = seller?.seller?.buyOrder;
  if (!order) {
    return { key: 'idle', label: '대기중', note: '진행중인 판매 없음', progress: 8 };
  }

  const txDone = order.transactionHash && order.transactionHash !== '0x';

  switch (order.status) {
    case 'ordered':
    case 'accepted':
      return { key: 'accepted', label: '매칭됨', note: '입금요청 전 단계', progress: 25 };
    case 'paymentRequested':
      return { key: 'paymentRequested', label: '입금요청', note: '입금 확인 대기', progress: 50 };
    case 'paymentConfirmed':
      if (txDone) {
        return { key: 'done', label: '판매완료', note: 'USDT 전송 완료', progress: 100 };
      }
      return { key: 'paymentConfirmed', label: '전송중', note: 'USDT 전송 처리중', progress: 75 };
    case 'cancelled':
      return { key: 'cancelled', label: '취소됨', note: '거래가 취소되었습니다', progress: 12 };
    default:
      return { key: 'idle', label: '대기중', note: '진행중인 판매 없음', progress: 8 };
  }
};

export default function SellerSalesStatusDetailPage() {
  const params = useParams<{ lang?: string; sellerWalletAddress?: string }>();
  const router = useRouter();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';
  const sellerWalletAddressParam = params?.sellerWalletAddress;
  const sellerWalletAddress = Array.isArray(sellerWalletAddressParam)
    ? sellerWalletAddressParam[0]
    : sellerWalletAddressParam || '';

  const [seller, setSeller] = useState<SellerUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [canceling, setCanceling] = useState(false);
  const [cancelLogs, setCancelLogs] = useState<
    { time: string; reason: string; orderId?: string; status: 'success' | 'fail' }[]
  >([]);

  const fetchSeller = async () => {
    if (!sellerWalletAddress) return;
    setLoading(true);
    try {
      const response = await fetch('/api/user/getAllSellersForBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: '',
          limit: 400,
          page: 1,
        }),
      });
      const data = await response.json();
      const users: SellerUser[] = data?.result?.users || [];
      const found =
        users.find(
          (u) =>
            u.walletAddress?.toLowerCase() === sellerWalletAddress.toLowerCase() ||
            u?.seller?.escrowWalletAddress?.toLowerCase() === sellerWalletAddress.toLowerCase(),
        ) || null;
      setSeller(found);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching seller sales status detail', error);
      setSeller(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeller();
  }, [sellerWalletAddress]);

  // 취소 이력 서버에서 조회
  const fetchCancelLogs = async () => {
    if (!sellerWalletAddress) return;
    try {
      const res = await fetch(
        `/api/cancel-log?sellerWalletAddress=${sellerWalletAddress}&limit=100`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (data?.result) {
        setCancelLogs(data.result);
      }
    } catch (e) {
      console.error('Failed to fetch cancel logs', e);
    }
  };

  useEffect(() => {
    fetchCancelLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerWalletAddress]);

  const state = useMemo(() => getSaleState(seller || ({} as SellerUser)), [seller]);
  const tone = toneStyles[state.key] || toneStyles.idle;
  const order = seller?.seller?.buyOrder;
  const requestTimestamp = order?.paymentRequestedAt || order?.createdAt;

  const minutesSincePaymentRequest = useMemo(() => {
    if (!requestTimestamp) return null;
    const diffMs = Date.now() - new Date(requestTimestamp).getTime();
    return Math.floor(diffMs / 60000);
  }, [requestTimestamp]);

  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    const requestedAt = requestTimestamp;
    if (!requestedAt) {
      setElapsedMs(null);
      return;
    }
    const calc = () => {
      setElapsedMs(Date.now() - new Date(requestedAt).getTime());
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [requestTimestamp]);

  const elapsedBadge = useMemo(() => {
    if (minutesSincePaymentRequest === null) return null;
    if (minutesSincePaymentRequest < 10) {
      return {
        label: `${minutesSincePaymentRequest}분 경과`,
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    }
    if (minutesSincePaymentRequest < 30) {
      return {
        label: `${minutesSincePaymentRequest}분 경과`,
        className: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    }
    return {
      label: `${minutesSincePaymentRequest}분 경과 (지연)`,
      className: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse',
    };
  }, [minutesSincePaymentRequest]);

  // 주기적 상태 갱신 (활성 거래 있을 때)
  useEffect(() => {
    if (!order) return;
    const interval = setInterval(() => {
      fetchSeller();
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.tradeId]);

  const canCancel =
    order && ['ordered', 'accepted', 'paymentRequested', 'paymentConfirmed'].includes(order.status || '');

  const cancelOrder = async () => {
    if (!order?._id || !seller?.walletAddress) {
      alert('취소할 거래 정보가 부족합니다.');
      return;
    }
    if (!cancelReason.trim()) {
      alert('취소 사유를 입력해주세요.');
      return;
    }
    setCanceling(true);
    try {
      const res = await fetch('/api/order/cancelBuyOrderByAdmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order._id,
          storecode: 'admin',
          walletAddress: seller.walletAddress,
          cancelTradeReason: cancelReason.trim(),
        }),
      });
      const data = await res.json();
      if (data?.result) {
        setCancelLogs((prev) => [
          { time: new Date().toISOString(), reason: cancelReason.trim(), orderId: order._id, status: 'success' },
          ...prev,
        ]);
        await fetchSeller();
        // 서버 기록
        fetch('/api/cancel-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sellerWalletAddress: seller.walletAddress,
            orderId: order._id,
            reason: cancelReason.trim(),
            status: 'success',
            actor: 'admin',
          }),
        }).catch((e) => console.error('Failed to save cancel log', e));
        fetchCancelLogs();
        setShowCancelModal(false);
        setCancelReason('');
        alert('거래가 취소되었습니다.');
      } else {
        setCancelLogs((prev) => [
          { time: new Date().toISOString(), reason: cancelReason.trim(), orderId: order._id, status: 'fail' },
          ...prev,
        ]);
        fetch('/api/cancel-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sellerWalletAddress: seller.walletAddress,
            orderId: order._id,
            reason: cancelReason.trim(),
            status: 'fail',
            actor: 'admin',
          }),
        }).catch((e) => console.error('Failed to save cancel log', e));
        fetchCancelLogs();
        alert('취소 처리에 실패했습니다.');
      }
    } catch (err) {
      console.error(err);
      setCancelLogs((prev) => [
        { time: new Date().toISOString(), reason: cancelReason.trim(), orderId: order?._id, status: 'fail' },
        ...prev,
      ]);
      fetch('/api/cancel-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerWalletAddress: seller?.walletAddress,
          orderId: order?._id,
          reason: cancelReason.trim(),
          status: 'fail',
          actor: 'admin',
        }),
      }).catch((e) => console.error('Failed to save cancel log', e));
      fetchCancelLogs();
      alert('취소 처리 중 오류가 발생했습니다.');
    } finally {
      setCanceling(false);
    }
  };

  return (
    <main className="p-4 min-h-[100vh] flex items-start justify-center container max-w-screen-md mx-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <div className="w-full space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <button
            type="button"
            onClick={() => router.push(`/${lang}/administration/seller-sales-status`)}
            className="flex items-center justify-center rounded-full border border-slate-200/70 bg-white/95 p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Image src="/icon-back.png" alt="Back" width={20} height={20} className="rounded-full" />
          </button>
          <span className="font-semibold">판매자 판매현황 상세</span>
          {seller && (
            <>
              <span className="text-slate-400">/</span>
              <span className="text-slate-500 font-mono text-[11px]">{truncate(seller.walletAddress)}</span>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
          {loading && (
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <Image src="/icon-loading.png" alt="Loading" width={18} height={18} className="h-4 w-4 animate-spin" />
              불러오는 중입니다... (정보는 아래에서 계속 볼 수 있어요)
            </div>
          )}

          {!seller && !loading && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
              <Image src="/icon-info.png" alt="Empty" width={36} height={36} className="h-9 w-9 opacity-70" />
              판매자 정보를 찾을 수 없습니다.
            </div>
          )}

          {seller && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white">
                    {seller?.avatar ? (
                      <Image src={seller.avatar} alt="Profile" fill sizes="48px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-semibold tracking-[0.12em]">
                        {(seller?.nickname || seller.walletAddress || 'NA').replace(/^0x/i, '').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-lg font-bold text-slate-900">{seller?.nickname || '미등록 닉네임'}</span>
                    <span className="text-xs font-mono text-slate-500">{truncate(seller.walletAddress)}</span>
                    <span className="text-xs text-slate-500">에스크로: {truncate(seller?.seller?.escrowWalletAddress)}</span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {lastUpdated ? `업데이트: ${formatDateTime(lastUpdated.toISOString())}` : '업데이트 대기중'}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">진행상태</p>
                  <div className="mt-1 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold text-slate-900">
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full ${tone.bar}`}></span>
                    {state.label}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{state.note}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">에스크로 잔고</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {(seller.currentUsdtBalance || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    USDT
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">실시간 에스크로 USDT</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">누적 완료</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {(seller?.seller?.totalPaymentConfirmedCount || 0).toLocaleString()} 건
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {(seller?.seller?.totalPaymentConfirmedUsdtAmount || 0).toLocaleString()} USDT /{' '}
                    {(seller?.seller?.totalPaymentConfirmedKrwAmount || 0).toLocaleString()} KRW
                  </p>
                </div>
              </div>

              {order && ['ordered', 'paymentRequested'].includes(order.status || '') && (
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Image src="/icon-trade.png" alt="Trade" width={20} height={20} className="h-5 w-5" />
                      <h3 className="text-sm font-semibold text-slate-900">진행중 거래</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => setShowCancelModal(true)}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
                        >
                          진행 취소하기
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {elapsedMs !== null && (
                      <div className="rounded-lg border border-slate-200 bg-slate-900 text-white px-4 py-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white/80">입금요청 이후 경과</span>
                          <span className="text-[11px] text-white/60">
                            {requestTimestamp ? formatDateTime(requestTimestamp) : '-'}
                          </span>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-2">
                          <span className="text-3xl sm:text-4xl font-mono font-bold tracking-tight">
                            {formatDuration(elapsedMs)}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${
                              elapsedBadge?.className || 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {elapsedBadge?.label || '진행중'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1 text-sm text-slate-700">
                        <div className="flex justify-between">
                          <span className="text-slate-500">상태</span>
                          <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${tone.badge}`}>
                            {state.label}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">거래번호</span>
                        <span className="font-mono text-slate-900">{order.tradeId || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">금액</span>
                        <span className="text-slate-900">{order.krwAmount?.toLocaleString() || 0} KRW</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">수량</span>
                        <span className="text-slate-900">{order.usdtAmount?.toLocaleString() || 0} USDT</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">단가</span>
                        <span className="text-slate-900">{order.rate?.toLocaleString() || 0} KRW</span>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-slate-700">
                      <div className="flex justify-between">
                        <span className="text-slate-500">주문시간</span>
                        <span>{formatDateTime(order.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">입금요청</span>
                        <span>{formatDateTime(order.paymentRequestedAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">입금확인</span>
                        <span>{formatDateTime(order.paymentConfirmedAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">거래 Tx</span>
                        <span className="font-mono text-[11px] text-slate-600">
                          {truncate(order.transactionHash, 8, 6)}
                        </span>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              )}

              {order && ['ordered', 'paymentRequested'].includes(order.status || '') && (
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Image src="/icon-buyer.png" alt="Buyer" width={18} height={18} className="h-4 w-4" />
                    <h3 className="text-sm font-semibold text-slate-900">구매자 정보</h3>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2 text-sm text-slate-700">
                      <div className="flex justify-between">
                        <span className="text-slate-500">구매자 닉네임</span>
                        <span className="font-semibold text-slate-900">{order.buyer?.nickname || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">구매자 지갑</span>
                        <span className="font-mono text-[11px] text-slate-700">
                          {truncate(order.buyer?.walletAddress)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">입금자명</span>
                        <span className="font-semibold text-slate-900">{order.buyer?.depositName || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">연락처</span>
                        <span className="text-slate-900">{order.buyer?.mobile || '-'}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-slate-700">
                      <div className="flex justify-between">
                        <span className="text-slate-500">결제방법</span>
                        <span className="font-semibold text-slate-900">{order.paymentMethod || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">입금 은행</span>
                        <span className="text-slate-900">{order.buyer?.depositBankName || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">계좌번호</span>
                        <span className="font-mono text-[11px] text-slate-700">
                          {order.buyer?.depositBankAccountNumber || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">예금주</span>
                        <span className="text-slate-900">{order.buyer?.depositBankAccountHolder || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Image src="/icon-memo.png" alt="Memo" width={18} height={18} className="h-4 w-4" />
                  <h3 className="text-sm font-semibold text-slate-900">프로모션 메모</h3>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {seller?.seller?.promotionText?.trim() ? seller.seller.promotionText : '등록된 프로모션 문구가 없습니다.'}
                </p>
              </div>

              {/* 취소 모달 */}
              <Modal open={showCancelModal} onClose={() => setShowCancelModal(false)}>
                <div className="space-y-3">
                  <h4 className="text-lg font-semibold text-slate-900">거래 취소</h4>
                  <p className="text-sm text-slate-600">
                    취소 사유를 입력하고 확인을 누르면 거래가 즉시 취소됩니다.
                  </p>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                    placeholder="예: 입금 확인이 지연되어 취소합니다 / 구매자 정보 불일치 / 잘못된 금액으로 접수됨"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(false)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      disabled={canceling || !cancelReason.trim()}
                      onClick={cancelOrder}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                        canceling || !cancelReason.trim() ? 'bg-rose-300' : 'bg-rose-600 hover:bg-rose-500'
                      }`}
                    >
                      {canceling ? '취소 중...' : '취소하기'}
                    </button>
                  </div>
                </div>
              </Modal>

              {/* 취소 이력 */}
              {cancelLogs.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Image src="/icon-cancelled.png" alt="Log" width={18} height={18} className="h-4 w-4" />
                    <h4 className="text-sm font-semibold text-slate-900">취소 이력</h4>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {cancelLogs.map((log, idx) => (
                      <li key={idx} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px] text-slate-500">{formatDateTime(log.time)}</span>
                          <span className="text-slate-900">{log.reason}</span>
                          {log.orderId && (
                            <span className="text-[11px] font-mono text-slate-500">Order: {truncate(log.orderId, 8, 6)}</span>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            log.status === 'success'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-rose-200 bg-rose-50 text-rose-700'
                          }`}
                        >
                          {log.status === 'success' ? '성공' : '실패'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// 간단한 모달 컴포넌트 (파일 하단에 정의해 재사용)
const Modal = ({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
          aria-label="close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
};
