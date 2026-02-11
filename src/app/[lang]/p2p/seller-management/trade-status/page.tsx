'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';

import { useClientWallets } from '@/lib/useClientWallets';
import { client } from '@/app/client';

type BuyOrder = {
  _id: string;
  orderId?: string;
  tradeId?: string;
  status?: string;
  createdAt?: string;
  acceptedAt?: string;
  paymentRequestedAt?: string;
  paymentConfirmedAt?: string;
  krwAmount?: number;
  usdtAmount?: number;
  rate?: number;
  buyer?: {
    walletAddress?: string;
    nickname?: string;
    depositName?: string;
  };
  seller?: {
    walletAddress?: string;
    nickname?: string;
  };
};

const STATUS_LABEL: Record<string, string> = {
  ordered: '주문접수',
  accepted: '판매자수락',
  paymentRequested: '입금요청',
  paymentConfirmed: '입금완료',
  completed: '정산완료',
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function SellerTradeStatusPage() {
  const params = useParams<{ lang?: string }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';
  const searchParams = useSearchParams();
  const agentcodeParam = searchParams?.get('agentcode') || null;

  const { wallet } = useClientWallets();
  const activeAccount = useActiveAccount();
  const walletAddress = activeAccount?.address ?? '';

  const [agentcode, setAgentcode] = useState<string | null>(agentcodeParam || null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [agentLogo, setAgentLogo] = useState<string | null>(null);
  const [agentDescription, setAgentDescription] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ nickname?: string; avatar?: string } | null>(null);

  const [orders, setOrders] = useState<BuyOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalKrwAmount, setTotalKrwAmount] = useState(0);
  const [totalUsdtAmount, setTotalUsdtAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [searchTerm, setSearchTerm] = useState('');
  const [depositingId, setDepositingId] = useState<string | null>(null);

  const isConnected = Boolean(walletAddress);

  const fetchUser = async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch('/api/user/getUserByWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storecode: 'admin', walletAddress }),
      });
      if (!res.ok) throw new Error('유저 정보를 불러오지 못했습니다.');
      const data = await res.json();
      const code =
        agentcodeParam ||
        data?.result?.agentcode ||
        data?.result?.user?.agentcode ||
        data?.result?.seller?.agentcode ||
        null;
      const nickname =
        data?.result?.nickname ||
        data?.result?.user?.nickname ||
        data?.result?.seller?.nickname ||
        undefined;
      const avatar =
        data?.result?.avatar ||
        data?.result?.user?.avatar ||
        data?.result?.seller?.avatar ||
        undefined;
      setAgentcode(code);
      setAgentName(data?.result?.agentName || null);
      setAgentLogo(data?.result?.agentLogo || null);
      setUserProfile({ nickname, avatar });
    } catch (e) {
      setError(e instanceof Error ? e.message : '유저 정보를 불러오지 못했습니다.');
    }
  };

  const fetchAgentDetail = async () => {
    if (!agentcode) return;
    try {
      const res = await fetch('/api/agent/getOneAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentcode }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const agent = data?.result;
      setAgentName(agent?.agentName || agentName);
      setAgentLogo(agent?.agentLogo || agentLogo);
      setAgentDescription(agent?.agentDescription || null);
    } catch {
      /* ignore */
    }
  };

  const fetchOrders = async () => {
    if (!agentcode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/get-buyorders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentcode,
          page,
          limit: pageSize,
          searchTerm: searchTerm.trim(),
        }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error || '거래 상태를 불러오지 못했습니다.';
        throw new Error(msg);
      }
      const data = await res.json();
      setOrders(data?.items || []);
      setTotalCount(data?.totalCount ?? 0);
      setTotalKrwAmount(data?.totalKrwAmount ?? 0);
      setTotalUsdtAmount(data?.totalUsdtAmount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '거래 상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDepositComplete = async (orderId?: string) => {
    if (!orderId) return;
    try {
      setDepositingId(orderId);
      const res = await fetch('/api/order/buyOrderDepositCompleted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.error || '입금 완료 처리에 실패했습니다.';
        throw new Error(msg);
      }
      await fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : '입금 완료 처리에 실패했습니다.');
    } finally {
      setDepositingId(null);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [walletAddress, agentcodeParam]);

  useEffect(() => {
    if (agentcodeParam) {
      setAgentcode(agentcodeParam);
    }
  }, [agentcodeParam]);

  useEffect(() => {
    fetchOrders();
  }, [agentcode, page, searchTerm]);

  useEffect(() => {
    fetchAgentDetail();
  }, [agentcode]);

  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.status !== 'paymentConfirmed' && o.status !== 'completed').length;
    const confirmed = orders.filter((o) => o.status === 'paymentConfirmed').length;
    return { pending, confirmed };
  }, [orders]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <AutoConnect client={client} wallets={[wallet]} />
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/${lang}/p2p`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
          >
            ← P2P 홈
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">소속 판매자 거래 상태</h1>
          {agentcode && (
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 shadow-sm">
              <div className="relative h-8 w-8 overflow-hidden rounded-full border border-emerald-200 bg-white">
                {agentLogo ? (
                  <Image src={agentLogo} alt={agentName || 'agent'} fill sizes="32px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-emerald-700">
                    {agentName?.slice(0, 2)?.toUpperCase() || 'AG'}
                  </span>
                )}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-semibold text-emerald-800">
                  {agentName || '에이전트'}
                </span>
                <span className="text-[11px] font-mono text-emerald-700">{agentcode}</span>
              </div>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/${lang}/p2p/seller-management${agentcode ? `?agentcode=${encodeURIComponent(agentcode)}` : ''}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              ← 소속 판매자 관리
            </Link>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
              연결 상태: {isConnected ? '연결됨' : '미연결'}
            </span>
          </div>
        </div>

        {!isConnected && (
          <div className="mt-6 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            지갑을 연결하면 거래 상태를 조회할 수 있습니다.
          </div>
        )}

        {isConnected && !agentcode && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            에이전트 권한이 없습니다. 관리자에게 문의하세요.
          </div>
        )}

        {isConnected && agentcode && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">총 대기 건수</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{stats.pending} 건</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-emerald-600">입금완료</p>
                <p className="mt-2 text-2xl font-bold text-emerald-800">{stats.confirmed} 건</p>
              </div>
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-indigo-600">대기 총액 (원)</p>
                <p className="mt-2 text-2xl font-bold text-indigo-900">
                  {totalKrwAmount.toLocaleString()}
                </p>
                <p className="text-xs font-semibold text-indigo-700">
                  ≈ {totalUsdtAmount.toLocaleString()} USDT
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm sm:min-w-[260px]">
                <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
                <input
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  placeholder="닉네임, 지갑주소 검색"
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setPage(1);
                    }}
                    className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>
              <span className="text-xs font-semibold text-slate-600">
                {orders.length} / {totalCount || orders.length} 건
              </span>
              <div className="ml-auto flex items-center gap-2 text-xs">
                <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                  입금요청/대기 건 관리
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {error}
              </div>
            )}

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">입금 대기/진행 거래</p>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">거래</th>
                      <th className="px-4 py-2 text-left">구매자</th>
                      <th className="px-4 py-2 text-left">금액</th>
                      <th className="px-4 py-2 text-left">상태</th>
                      <th className="px-4 py-2 text-left">시간</th>
                      <th className="px-4 py-2 text-right">입금 완료</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-slate-500">
                          불러오는 중...
                        </td>
                      </tr>
                    ) : orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-slate-500">
                          진행중인 거래가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      orders.map((order) => {
                        const statusLabel = STATUS_LABEL[order.status || ''] || '진행중';
                        const isDone = order.status === 'paymentConfirmed' || order.status === 'completed';
                        return (
                          <tr key={order._id} className="border-b border-slate-100 hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <div className="flex flex-col text-xs font-mono text-slate-600">
                                <span className="font-semibold text-slate-900">
                                  #{order.orderId || order.tradeId || order._id}
                                </span>
                                <span>USDT: {order.usdtAmount?.toLocaleString() ?? '-'}</span>
                                <span>KRW: {order.krwAmount?.toLocaleString() ?? '-'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <span className="text-sm font-semibold text-slate-900">
                                  {order.buyer?.nickname || '닉네임 없음'}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                  {order.buyer?.walletAddress
                                    ? `${order.buyer.walletAddress.slice(0, 6)}...${order.buyer.walletAddress.slice(-4)}`
                                    : '-'}
                                </span>
                                {order.buyer?.depositName && (
                                  <span className="text-[11px] text-slate-600">입금자명: {order.buyer.depositName}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-semibold text-slate-900">
                                {order.krwAmount?.toLocaleString() ?? '-'} 원
                              </div>
                              <div className="text-xs text-slate-600">
                                {order.usdtAmount?.toLocaleString() ?? '-'} USDT · 환율 {order.rate?.toLocaleString() ?? '-'}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                  isDone
                                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-200/80 bg-amber-50 text-amber-700'
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              <div>접수: {formatDateTime(order.createdAt)}</div>
                              {order.paymentRequestedAt && <div>입금요청: {formatDateTime(order.paymentRequestedAt)}</div>}
                              {order.paymentConfirmedAt && <div>입금완료: {formatDateTime(order.paymentConfirmedAt)}</div>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleDepositComplete(order.orderId || order.tradeId || order._id)}
                                  disabled={isDone || depositingId === (order.orderId || order.tradeId || order._id)}
                                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                                    isDone
                                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:-translate-y-0.5 hover:shadow'
                                  }`}
                                >
                                  {depositingId === (order.orderId || order.tradeId || order._id)
                                    ? '처리 중...'
                                    : isDone
                                    ? '완료됨'
                                    : '입금완료 처리'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {!loading && orders.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                  <span>
                    {totalCount === 0
                      ? '0건'
                      : `${(page - 1) * pageSize + 1} - ${Math.min(page * pageSize, totalCount)} / ${totalCount}건`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || loading}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        page <= 1 || loading
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                      }`}
                    >
                      ← 이전
                    </button>
                    <span className="px-2 text-xs font-semibold text-slate-500">페이지 {page}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const maxPage = Math.max(1, Math.ceil((totalCount || orders.length) / pageSize));
                        setPage((p) => Math.min(maxPage, p + 1));
                      }}
                      disabled={page >= Math.ceil((totalCount || orders.length) / pageSize) || loading}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        page >= Math.ceil((totalCount || orders.length) / pageSize) || loading
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                      }`}
                    >
                      다음 →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
