'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';
import { arbitrum, bsc, ethereum, polygon } from 'thirdweb/chains';

import { client } from '@/app/client';
import { ConnectButton } from '@/components/OrangeXConnectButton';
import { useClientWallets } from '@/lib/useClientWallets';

type DashboardStore = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  paymentWalletAddress: string;
  adminWalletAddress: string;
};

type PaymentMember = {
  id: string;
  nickname: string;
  walletAddress: string;
  createdAt: string;
  verified: boolean;
  hasBuyer: boolean;
  hasSeller: boolean;
  role: string;
  userType: string;
  email: string;
  mobile: string;
  avatar: string;
  hasPaymentInfo: boolean;
  bankInfoLabel: string;
};

type MemberStatus = 'all' | 'verified' | 'pending';

const shortAddress = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const toDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const extractBankInfoLabel = (buyer: unknown) => {
  if (!isRecord(buyer)) return '';
  const bankInfo = buyer.bankInfo;
  if (isRecord(bankInfo)) {
    const bankName = String(bankInfo.bankName || bankInfo.depositBankName || '').trim();
    const accountNumber = String(bankInfo.accountNumber || bankInfo.depositBankAccountNumber || '').trim();
    const accountHolder = String(bankInfo.accountHolder || bankInfo.depositName || '').trim();
    return [bankName, accountNumber, accountHolder].filter(Boolean).join(' ');
  }

  const bankName = String(buyer.depositBankName || '').trim();
  const accountNumber = String(buyer.depositBankAccountNumber || '').trim();
  const accountHolder = String(buyer.depositName || '').trim();
  return [bankName, accountNumber, accountHolder].filter(Boolean).join(' ');
};

const resolveMemberType = (member: PaymentMember) => {
  if (member.hasBuyer && member.hasSeller) return 'Buyer+Seller';
  if (member.hasBuyer) return 'Buyer';
  if (member.hasSeller) return 'Seller';
  return 'Profile';
};

const PAGE_SIZE = 20;

const toPositivePage = (value: string | null) => {
  const parsed = Number(value || 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
};

const toMemberStatus = (value: string | null): MemberStatus =>
  value === 'verified' || value === 'pending' ? value : 'all';

export default function P2PPaymentUserManagementPage() {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const pageFromQuery = toPositivePage(searchParams?.get('memberPage'));
  const keywordFromQuery = String(searchParams?.get('memberKeyword') || '').trim();
  const statusFromQuery = toMemberStatus(searchParams?.get('memberStatus'));
  const storecodeQuery = storecode ? `?storecode=${encodeURIComponent(storecode)}` : '';
  const paymentManagementPath = `/${lang}/p2p/payment-management${storecodeQuery}`;
  const paymentUserManagementPath = `/${lang}/p2p/payment-user-management${storecodeQuery}`;

  const activeAccount = useActiveAccount();
  const walletAddress = activeAccount?.address || '';
  const { wallet, chain } = useClientWallets();

  const activeChain =
    chain === 'ethereum'
      ? ethereum
      : chain === 'arbitrum'
      ? arbitrum
      : chain === 'bsc'
      ? bsc
      : polygon;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<DashboardStore | null>(null);
  const [members, setMembers] = useState<PaymentMember[]>([]);
  const [keyword, setKeyword] = useState(keywordFromQuery);
  const [currentPage, setCurrentPage] = useState(pageFromQuery);
  const [memberStatus, setMemberStatus] = useState<MemberStatus>(statusFromQuery);

  useEffect(() => {
    setKeyword(keywordFromQuery);
  }, [keywordFromQuery]);

  useEffect(() => {
    setCurrentPage(pageFromQuery);
  }, [pageFromQuery]);

  useEffect(() => {
    setMemberStatus(statusFromQuery);
  }, [statusFromQuery]);

  const updateQueryState = useCallback(
    (next: { page?: number; keyword?: string; status?: MemberStatus }) => {
      const query = new URLSearchParams(searchParams?.toString() || '');
      const nextPage = next.page ?? currentPage;
      const nextKeyword = (next.keyword ?? keyword).trim();
      const nextStatus = next.status ?? memberStatus;

      query.set('memberPage', String(Math.max(1, nextPage)));
      if (nextKeyword) {
        query.set('memberKeyword', nextKeyword);
      } else {
        query.delete('memberKeyword');
      }
      if (nextStatus === 'all') {
        query.delete('memberStatus');
      } else {
        query.set('memberStatus', nextStatus);
      }

      const queryString = query.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [currentPage, keyword, memberStatus, pathname, router, searchParams],
  );

  const loadData = useCallback(async () => {
    if (!walletAddress || !storecode) {
      setStore(null);
      setMembers([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, membersResponse] = await Promise.all([
        fetch('/api/wallet/payment-usdt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'store-dashboard',
            storecode,
            adminWalletAddress: walletAddress,
            limit: 1,
          }),
        }),
        fetch('/api/user/getAllUsersByStorecode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode,
            limit: 1000,
            page: 1,
            includeUnverified: true,
            sortField: 'createdAt',
            requireProfile: false,
            userType: 'all',
          }),
        }),
      ]);

      const dashboardPayload = await dashboardResponse.json().catch(() => ({}));
      if (!dashboardResponse.ok) {
        throw new Error(
          typeof dashboardPayload?.error === 'string'
            ? dashboardPayload.error
            : '가맹점 정보를 불러오지 못했습니다.',
        );
      }

      const nextStore = dashboardPayload?.result?.store || null;
      setStore(
        nextStore
          ? {
              storecode: String(nextStore.storecode || storecode),
              storeName: String(nextStore.storeName || storecode),
              storeLogo: String(nextStore.storeLogo || ''),
              paymentWalletAddress: String(nextStore.paymentWalletAddress || ''),
              adminWalletAddress: String(nextStore.adminWalletAddress || ''),
            }
          : null,
      );

      const membersPayload = await membersResponse.json().catch(() => ({}));
      if (!membersResponse.ok) {
        throw new Error(
          typeof membersPayload?.error === 'string'
            ? membersPayload.error
            : '회원 가입현황을 불러오지 못했습니다.',
        );
      }

      const source = Array.isArray(membersPayload?.result?.users)
        ? membersPayload.result.users
        : [];
      const normalizedMembers: PaymentMember[] = source
        .map((item: any, index: number) => {
          const bankInfoLabel = extractBankInfoLabel(item?.buyer);
          return {
            id: String(item?._id || item?.id || `${index}`),
            nickname: String(item?.nickname || '').trim() || '-',
            walletAddress: String(item?.walletAddress || '').trim(),
            createdAt: String(item?.createdAt || ''),
            verified: Boolean(item?.verified),
            hasBuyer: Boolean(item?.buyer),
            hasSeller: Boolean(item?.seller),
            role: String(item?.role || '').trim(),
            userType: String(item?.userType || '').trim(),
            email: String(item?.email || '').trim(),
            mobile: String(item?.mobile || '').trim(),
            avatar: String(item?.avatar || '').trim(),
            hasPaymentInfo: Boolean(item?.paymentInfo),
            bankInfoLabel,
          };
        })
        .filter((item: PaymentMember) => Boolean(item.walletAddress));

      setMembers(normalizedMembers);
    } catch (fetchError: unknown) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : '회원 가입현황 조회 중 오류가 발생했습니다.';
      setError(message);
      setStore(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [storecode, walletAddress]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredMembers = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return members.filter((item) => {
      const isStatusMatched =
        memberStatus === 'all'
          ? true
          : memberStatus === 'verified'
          ? item.verified
          : !item.verified;

      if (!isStatusMatched) return false;
      if (!search) return true;

      return (
        item.nickname.toLowerCase().includes(search) ||
        item.walletAddress.toLowerCase().includes(search) ||
        item.email.toLowerCase().includes(search) ||
        item.mobile.toLowerCase().includes(search)
      );
    });
  }, [keyword, memberStatus, members]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE)),
    [filteredMembers.length],
  );

  useEffect(() => {
    if (currentPage <= totalPages) return;
    setCurrentPage(totalPages);
    updateQueryState({ page: totalPages });
  }, [currentPage, totalPages, updateQueryState]);

  const pagedMembers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredMembers.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredMembers]);

  const visiblePages = useMemo(() => {
    const maxButtons = 5;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + maxButtons - 1);
    const adjustedStart = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [currentPage, totalPages]);

  const summary = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;

    const verifiedCount = members.filter((item) => item.verified).length;
    const buyerCount = members.filter((item) => item.hasBuyer).length;
    const sellerCount = members.filter((item) => item.hasSeller).length;
    const paymentInfoCount = members.filter((item) => item.hasPaymentInfo).length;
    const todayJoinedCount = members.filter((item) => String(item.createdAt || '').startsWith(today)).length;

    return {
      totalCount: members.length,
      verifiedCount,
      buyerCount,
      sellerCount,
      paymentInfoCount,
      todayJoinedCount,
    };
  }, [members]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ecfeff_0%,#f8fafc_45%,#eef2ff_100%)] px-2.5 py-4 md:px-3 md:py-4 lg:px-4">
      <AutoConnect client={client} wallets={[wallet]} />

      <div className="mx-auto w-full max-w-5xl space-y-3">
        <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-3.5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">Store Member Desk</p>
              <h1 className="mt-1 text-xl font-bold text-slate-900 md:text-[22px]">가맹점 결제 회원 관리</h1>
              <p className="mt-1 text-xs text-slate-600 md:text-sm">
                가맹점 결제 회원의 가입 현황과 결제정보 등록 상태를 대시보드로 확인합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white p-0.5">
                <Link
                  href={paymentManagementPath}
                  className="inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold text-slate-600 transition hover:text-slate-900"
                >
                  결제 관리
                </Link>
                <Link
                  href={paymentUserManagementPath}
                  className="inline-flex h-7 items-center rounded-full bg-slate-900 px-2.5 text-[11px] font-semibold text-white"
                >
                  회원 관리
                </Link>
              </div>
              <Link
                href={`/${lang}/p2p`}
                className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                P2P 홈으로
              </Link>
              <button
                type="button"
                onClick={() => {
                  void loadData();
                }}
                className="inline-flex h-8 items-center rounded-full bg-slate-900 px-2.5 text-[11px] font-semibold text-white transition hover:bg-slate-800"
              >
                새로고침
              </button>
            </div>
          </div>
        </section>

        {!walletAddress ? (
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 text-sm text-slate-700 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.45)]">
            <p className="font-semibold">관리 페이지를 보려면 지갑 연결이 필요합니다.</p>
            <div className="mt-3">
              <ConnectButton
                client={client}
                wallets={[wallet]}
                chain={activeChain}
                connectButton={{
                  label: '지갑 연결',
                  className:
                    'inline-flex h-9 items-center justify-center rounded-full bg-slate-900 px-3.5 text-sm font-semibold text-white transition hover:bg-slate-800',
                }}
              />
            </div>
          </section>
        ) : !storecode ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm font-semibold text-amber-800">
            storecode 쿼리가 없습니다. P2P 홈에서 가맹점을 선택해 진입해 주세요.
          </section>
        ) : (
          <>
            {error && (
              <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                {error}
              </section>
            )}

            {loading ? (
              <section className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.45)]">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`loading-${index}`} className="h-10 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </section>
            ) : (
              <>
                {store && (
                  <section className="rounded-2xl border border-slate-200/80 bg-white/92 p-3.5 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.45)]">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                        {store.storeLogo ? (
                          <Image
                            src={store.storeLogo}
                            alt={store.storeName || store.storecode}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-700">
                            {(store.storeName || store.storecode).slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-slate-900 md:text-lg">
                          {store.storeName || store.storecode}
                        </p>
                        <p className="text-xs font-mono text-slate-500">{store.storecode}</p>
                      </div>
                      <div className="text-xs text-slate-600">
                        <p>결제지갑 {shortAddress(store.paymentWalletAddress)}</p>
                        <p>관리자 {shortAddress(store.adminWalletAddress)}</p>
                      </div>
                    </div>
                  </section>
                )}

                <section className="grid grid-cols-2 gap-2 xl:grid-cols-6">
                  <article className="rounded-2xl border border-cyan-100 bg-[linear-gradient(145deg,#ecfeff,#cffafe)] p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">총 회원</p>
                    <p className="mt-1 text-lg font-bold text-cyan-900 md:text-xl">{summary.totalCount.toLocaleString()}명</p>
                  </article>
                  <article className="rounded-2xl border border-emerald-100 bg-[linear-gradient(145deg,#ecfdf5,#d1fae5)] p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">검증 회원</p>
                    <p className="mt-1 text-lg font-bold text-emerald-900 md:text-xl">{summary.verifiedCount.toLocaleString()}명</p>
                  </article>
                  <article className="rounded-2xl border border-indigo-100 bg-[linear-gradient(145deg,#eef2ff,#e0e7ff)] p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Buyer</p>
                    <p className="mt-1 text-lg font-bold text-indigo-900 md:text-xl">{summary.buyerCount.toLocaleString()}명</p>
                  </article>
                  <article className="rounded-2xl border border-amber-100 bg-[linear-gradient(145deg,#fffbeb,#fef3c7)] p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Seller</p>
                    <p className="mt-1 text-lg font-bold text-amber-900 md:text-xl">{summary.sellerCount.toLocaleString()}명</p>
                  </article>
                  <article className="rounded-2xl border border-fuchsia-100 bg-[linear-gradient(145deg,#fdf4ff,#fae8ff)] p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-700">결제정보</p>
                    <p className="mt-1 text-lg font-bold text-fuchsia-900 md:text-xl">{summary.paymentInfoCount.toLocaleString()}명</p>
                  </article>
                  <article className="rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,#f8fafc,#f1f5f9)] p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">오늘 가입</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 md:text-xl">{summary.todayJoinedCount.toLocaleString()}명</p>
                  </article>
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_56px_-42px_rgba(15,23,42,0.45)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-900">회원 가입현황 목록</p>
                    <div className="flex w-full max-w-[420px] items-center gap-1.5">
                      <select
                        value={memberStatus}
                        onChange={(event) => {
                          const nextStatus = toMemberStatus(event.target.value);
                          setMemberStatus(nextStatus);
                          setCurrentPage(1);
                          updateQueryState({ page: 1, status: nextStatus });
                        }}
                        className="h-8 shrink-0 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-cyan-500"
                      >
                        <option value="all">전체</option>
                        <option value="verified">검증완료</option>
                        <option value="pending">검증대기</option>
                      </select>
                      <input
                        value={keyword}
                        onChange={(event) => {
                          const nextKeyword = event.target.value;
                          setKeyword(nextKeyword);
                          setCurrentPage(1);
                          updateQueryState({ page: 1, keyword: nextKeyword });
                        }}
                        placeholder="닉네임/지갑/이메일/모바일 검색"
                        className="h-8 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  {filteredMembers.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-slate-500">회원 데이터가 없습니다.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[930px]">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                          <tr>
                            <th className="px-3 py-2">가입일시</th>
                            <th className="px-3 py-2">닉네임</th>
                            <th className="px-3 py-2">지갑주소</th>
                            <th className="px-3 py-2">회원유형</th>
                            <th className="px-3 py-2">검증</th>
                            <th className="px-3 py-2">결제정보</th>
                            <th className="px-3 py-2">연락처</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                          {pagedMembers.map((member) => (
                            <tr key={member.id}>
                              <td className="px-3 py-2 text-xs text-slate-500">{toDateTime(member.createdAt)}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  {member.avatar ? (
                                    <Image
                                      src={member.avatar}
                                      alt={member.nickname}
                                      width={24}
                                      height={24}
                                      className="h-6 w-6 rounded-full object-cover"
                                    />
                                  ) : (
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                                      {member.nickname.slice(0, 1).toUpperCase()}
                                    </span>
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-slate-800">{member.nickname}</p>
                                    {(member.role || member.userType) && (
                                      <p className="truncate text-[11px] text-slate-500">
                                        {[member.role, member.userType].filter(Boolean).join(' · ')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-slate-700">{shortAddress(member.walletAddress)}</td>
                              <td className="px-3 py-2 text-xs font-semibold text-slate-800">{resolveMemberType(member)}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold ${
                                    member.verified
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {member.verified ? 'Verified' : 'Pending'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-700">
                                <p>{member.hasPaymentInfo ? '등록됨' : '미등록'}</p>
                                {member.bankInfoLabel && (
                                  <p className="mt-0.5 text-[11px] text-slate-500">{member.bankInfoLabel}</p>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600">
                                <p>{member.mobile || '-'}</p>
                                <p className="mt-0.5">{member.email || '-'}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5">
                        <p className="text-xs text-slate-500">
                          총 {filteredMembers.length.toLocaleString()}명 중 {(Math.min(filteredMembers.length, (currentPage - 1) * PAGE_SIZE + 1)).toLocaleString()}-
                          {Math.min(filteredMembers.length, currentPage * PAGE_SIZE).toLocaleString()}명 표시
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => {
                              const nextPage = Math.max(1, currentPage - 1);
                              setCurrentPage(nextPage);
                              updateQueryState({ page: nextPage });
                            }}
                            className="inline-flex h-7 items-center rounded-full border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            이전
                          </button>
                          {visiblePages.map((page) => (
                            <button
                              key={page}
                              type="button"
                              onClick={() => {
                                setCurrentPage(page);
                                updateQueryState({ page });
                              }}
                              className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[11px] font-semibold transition ${
                                page === currentPage
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => {
                              const nextPage = Math.min(totalPages, currentPage + 1);
                              setCurrentPage(nextPage);
                              updateQueryState({ page: nextPage });
                            }}
                            className="inline-flex h-7 items-center rounded-full border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            다음
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
