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

  const state = useMemo(() => getSaleState(seller || ({} as SellerUser)), [seller]);
  const tone = toneStyles[state.key] || toneStyles.idle;
  const order = seller?.seller?.buyOrder;

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
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Image src="/icon-loading.png" alt="Loading" width={18} height={18} className="h-4 w-4 animate-spin" />
              불러오는 중입니다...
            </div>
          )}

          {!loading && !seller && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-sm text-slate-500">
              <Image src="/icon-info.png" alt="Empty" width={36} height={36} className="h-9 w-9 opacity-70" />
              판매자 정보를 찾을 수 없습니다.
            </div>
          )}

          {!loading && seller && (
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

              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Image src="/icon-trade.png" alt="Trade" width={20} height={20} className="h-5 w-5" />
                    <h3 className="text-sm font-semibold text-slate-900">진행중 거래</h3>
                  </div>
                  {!order && <span className="text-xs text-slate-500">없음</span>}
                </div>

                {order && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                        <span className="font-mono text-[11px] text-slate-600">{truncate(order.transactionHash, 8, 6)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Image src="/icon-memo.png" alt="Memo" width={18} height={18} className="h-4 w-4" />
                  <h3 className="text-sm font-semibold text-slate-900">프로모션 메모</h3>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {seller?.seller?.promotionText?.trim() ? seller.seller.promotionText : '등록된 프로모션 문구가 없습니다.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
