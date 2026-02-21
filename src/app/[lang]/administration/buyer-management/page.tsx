'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';

type BuyerRecord = {
  _id?: string | { $oid?: string };
  walletAddress?: string;
  nickname?: string;
  avatar?: string;
  storecode?: string;
  verified?: boolean;
  createdAt?: string;
  buyer?: {
    status?: string;
    bankInfo?: {
      status?: string;
      bankName?: string;
      accountNumber?: string;
      submittedAt?: string;
    };
    kyc?: {
      status?: string;
      idImageUrl?: string;
      submittedAt?: string;
    };
  };
};

type BuyerDashboardMetrics = {
  totalBuyers: number;
  verifiedBuyers: number;
  unverifiedBuyers: number;
  confirmedBuyers: number;
  pendingBuyers: number;
  bankApprovedBuyers: number;
  bankReviewRequiredBuyers: number;
  kycApprovedBuyers: number;
  kycPendingBuyers: number;
  newBuyers7d: number;
  activeStoreCount: number;
  verifiedRate: number;
  updatedAt: string;
};

type VerifiedHistoryItem = {
  _id?: string;
  prevVerified?: boolean | null;
  newVerified?: boolean;
  changedAt?: string;
};

const PAGE_SIZE = 20;
const VERIFIED_HISTORY_PAGE_SIZE = 10;

const getBuyerId = (buyer: BuyerRecord) => {
  if (!buyer?._id) return '';
  if (typeof buyer._id === 'string') return buyer._id;
  if (typeof buyer._id === 'object' && buyer._id.$oid) return buyer._id.$oid;
  return String(buyer._id);
};

export default function BuyerManagementPage() {
  const params = useParams<{ lang?: string }>();
  const router = useRouter();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const [buyers, setBuyers] = useState<BuyerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [kycFilter, setKycFilter] = useState<'all' | 'approved' | 'pending' | 'none' | 'rejected'>('all');

  const [verifiedModalOpen, setVerifiedModalOpen] = useState(false);
  const [verifiedModalTarget, setVerifiedModalTarget] = useState<{ wallet: string; verified?: boolean } | null>(null);
  const [selectedVerified, setSelectedVerified] = useState<boolean | null>(null);
  const [verifiedHistory, setVerifiedHistory] = useState<VerifiedHistoryItem[]>([]);
  const [verifiedHistoryTotal, setVerifiedHistoryTotal] = useState(0);
  const [verifiedHistoryLoading, setVerifiedHistoryLoading] = useState(false);
  const [verifiedHistoryPage, setVerifiedHistoryPage] = useState(1);
  const [verifiedHistoryHasMore, setVerifiedHistoryHasMore] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalTarget, setDeleteModalTarget] = useState<BuyerRecord | null>(null);
  const [deletingBuyer, setDeletingBuyer] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [dashboard, setDashboard] = useState<BuyerDashboardMetrics | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const fetchBuyers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user/getAllUsersByStorecode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storecode: '',
          limit: PAGE_SIZE,
          page,
          includeUnverified: true,
          searchTerm,
          userType: 'buyer',
        }),
      });
      const data = await response.json();
      const users = data?.result?.users || [];
      setTotalCount(data?.result?.totalCount ?? users.length);
      const buyerUsers = users.filter((user: BuyerRecord) => Boolean(user?.buyer));
      buyerUsers.sort((a: BuyerRecord, b: BuyerRecord) => {
        const aTime = new Date(a?.createdAt || 0).getTime();
        const bTime = new Date(b?.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setBuyers(buyerUsers);
    } catch (error) {
      console.error('Error fetching buyers', error);
      setBuyers([]);
    }
    setLoading(false);
  };

  const fetchBuyerDashboard = async () => {
    setDashboardLoading(true);
    try {
      const response = await fetch('/api/user/getBuyerManagementDashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: '',
          includeUnverified: true,
          searchTerm,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error || '구매자 현황을 불러오지 못했습니다.'));
      }
      const summary = data?.result || {};
      setDashboard({
        totalBuyers: Number(summary.totalBuyers || 0),
        verifiedBuyers: Number(summary.verifiedBuyers || 0),
        unverifiedBuyers: Number(summary.unverifiedBuyers || 0),
        confirmedBuyers: Number(summary.confirmedBuyers || 0),
        pendingBuyers: Number(summary.pendingBuyers || 0),
        bankApprovedBuyers: Number(summary.bankApprovedBuyers || 0),
        bankReviewRequiredBuyers: Number(summary.bankReviewRequiredBuyers || 0),
        kycApprovedBuyers: Number(summary.kycApprovedBuyers || 0),
        kycPendingBuyers: Number(summary.kycPendingBuyers || 0),
        newBuyers7d: Number(summary.newBuyers7d || 0),
        activeStoreCount: Number(summary.activeStoreCount || 0),
        verifiedRate: Number(summary.verifiedRate || 0),
        updatedAt: String(summary.updatedAt || ''),
      });
    } catch (error) {
      console.error('Error fetching buyer dashboard', error);
      setDashboard({
        totalBuyers: 0,
        verifiedBuyers: 0,
        unverifiedBuyers: 0,
        confirmedBuyers: 0,
        pendingBuyers: 0,
        bankApprovedBuyers: 0,
        bankReviewRequiredBuyers: 0,
        kycApprovedBuyers: 0,
        kycPendingBuyers: 0,
        newBuyers7d: 0,
        activeStoreCount: 0,
        verifiedRate: 0,
        updatedAt: '',
      });
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    fetchBuyers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm]);

  useEffect(() => {
    void fetchBuyerDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  useEffect(() => {
    if (!verifiedModalOpen) {
      setVerifiedHistory([]);
      setVerifiedHistoryTotal(0);
      setVerifiedHistoryPage(1);
      setVerifiedHistoryHasMore(false);
      setVerifiedModalTarget(null);
      setSelectedVerified(null);
    }
  }, [verifiedModalOpen]);

  useEffect(() => {
    if (!deleteModalOpen) {
      setDeleteModalTarget(null);
      setDeleteError('');
      setDeletingBuyer(false);
    }
  }, [deleteModalOpen]);

  const filteredBuyers = useMemo(
    () =>
      buyers.filter((buyer) => {
        const q = searchTerm.trim().toLowerCase();
        const matchesSearch =
          !q ||
          `${buyer?.nickname || ''} ${buyer?.walletAddress || ''} ${buyer?.buyer?.bankInfo?.bankName || ''} ${buyer?.buyer?.status || ''}`
            .toLowerCase()
            .includes(q);
        const verified = buyer?.verified ?? false;
        const matchesVerified =
          verifiedFilter === 'all' ? true : verifiedFilter === 'verified' ? verified : !verified;
        const kycStatus =
          buyer?.buyer?.kyc?.status || (buyer?.buyer?.kyc?.idImageUrl ? 'pending' : 'none');
        const matchesKyc =
          kycFilter === 'all'
            ? true
            : kycFilter === 'pending'
            ? kycStatus === 'pending'
            : kycFilter === 'approved'
            ? kycStatus === 'approved'
            : kycFilter === 'rejected'
            ? kycStatus === 'rejected'
            : kycStatus === 'none';
        return matchesSearch && matchesVerified && matchesKyc;
      }),
    [buyers, kycFilter, searchTerm, verifiedFilter],
  );
  const sortedFilteredBuyers = useMemo(
    () =>
      [...filteredBuyers].sort((a, b) => {
        const aTime = new Date(a?.createdAt || 0).getTime();
        const bTime = new Date(b?.createdAt || 0).getTime();
        return bTime - aTime;
      }),
    [filteredBuyers],
  );

  const formatCount = (value: number) =>
    new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value) || 0);

  const dashboardCards = [
    {
      key: 'total',
      title: '전체 구매자',
      value: formatCount(dashboard?.totalBuyers || 0),
      subtitle: '현재 검색 조건 기준',
      tone: 'from-cyan-500 to-sky-500',
    },
    {
      key: 'verified',
      title: '인증 완료',
      value: formatCount(dashboard?.verifiedBuyers || 0),
      subtitle: `인증 비율 ${Number(dashboard?.verifiedRate || 0).toFixed(1)}%`,
      tone: 'from-emerald-500 to-teal-500',
    },
    {
      key: 'confirmed',
      title: '구매가능',
      value: formatCount(dashboard?.confirmedBuyers || 0),
      subtitle: `구매불가능 ${formatCount(dashboard?.pendingBuyers || 0)}명`,
      tone: 'from-indigo-500 to-blue-500',
    },
    {
      key: 'new',
      title: '최근 7일 신규',
      value: formatCount(dashboard?.newBuyers7d || 0),
      subtitle: `활성 스토어 ${formatCount(dashboard?.activeStoreCount || 0)}개`,
      tone: 'from-amber-500 to-orange-500',
    },
  ];

  const dashboardUpdatedAtLabel = dashboard?.updatedAt
    ? new Date(dashboard.updatedAt).toLocaleString()
    : '-';

  const fetchVerifiedHistory = async (wallet: string, nextPage = 1, append = false) => {
    if (verifiedHistoryLoading) return;
    setVerifiedHistoryLoading(true);
    try {
      const res = await fetch('/api/user/getBuyerVerifiedHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet,
          limit: VERIFIED_HISTORY_PAGE_SIZE,
          page: nextPage,
        }),
      });
      const data = await res.json();
      const items = (data?.result?.items || []) as VerifiedHistoryItem[];
      const count = Number(data?.result?.totalCount ?? items.length);
      setVerifiedHistoryTotal(count);
      setVerifiedHistoryPage(nextPage);
      if (append) {
        setVerifiedHistory((prev) => {
          const merged = [...prev, ...items];
          setVerifiedHistoryHasMore(merged.length < count);
          return merged;
        });
      } else {
        setVerifiedHistory(items);
        setVerifiedHistoryHasMore(items.length < count);
      }
    } catch (error) {
      console.error('Error fetching verified history', error);
      if (!append) setVerifiedHistory([]);
    }
    setVerifiedHistoryLoading(false);
  };

  const handleDeleteBuyer = async () => {
    if (!deleteModalTarget?.walletAddress) {
      setDeleteError('삭제할 구매자 정보를 찾을 수 없습니다.');
      return;
    }

    setDeletingBuyer(true);
    setDeleteError('');
    try {
      const response = await fetch('/api/user/deleteBuyer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buyerId: getBuyerId(deleteModalTarget),
          walletAddress: deleteModalTarget.walletAddress,
          storecode: deleteModalTarget.storecode || '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.result) {
        setDeleteError(data?.error || '구매자 삭제에 실패했습니다.');
        return;
      }

      setDeleteModalOpen(false);
      await fetchBuyers();
    } catch (error) {
      console.error('Failed to delete buyer:', error);
      setDeleteError('구매자 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingBuyer(false);
    }
  };

  return (
    <main className="container mx-auto flex min-h-[100vh] max-w-screen-2xl items-start justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 text-slate-800">
      <div className="w-full">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight text-slate-900">구매자 관리</span>
        </div>

        <section className="mb-4 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.55)]">
          <div className="relative">
            <div className="absolute -top-20 right-[-60px] h-56 w-56 rounded-full bg-sky-200/35 blur-3xl" />
            <div className="absolute -bottom-20 left-[-40px] h-56 w-56 rounded-full bg-emerald-200/30 blur-3xl" />
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Buyer Dashboard</p>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">구매자 현황</h1>
                  <p className="mt-1 text-sm text-slate-600">
                    구매자 인증, KYC, 계좌 심사 상태를 한 번에 확인할 수 있습니다.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-right shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Updated</p>
                  <p className="text-xs font-semibold text-slate-700">
                    {dashboardLoading ? '갱신 중...' : dashboardUpdatedAtLabel}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {dashboardCards.map((card) => (
                  <article
                    key={card.key}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className={`mb-3 h-1.5 w-16 rounded-full bg-gradient-to-r ${card.tone}`} />
                    <p className="text-[12px] font-semibold text-slate-600">{card.title}</p>
                    <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{card.value}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{card.subtitle}</p>
                  </article>
                ))}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800">
                  KYC 심사중 {formatCount(dashboard?.kycPendingBuyers || 0)}명
                </div>
                <div className="rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-800">
                  계좌 심사 필요 {formatCount(dashboard?.bankReviewRequiredBuyers || 0)}명
                </div>
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-3 py-2 text-xs font-semibold text-emerald-800">
                  계좌 승인 완료 {formatCount(dashboard?.bankApprovedBuyers || 0)}명
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="w-full rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Image src="/icon-buyer.png" alt="Buyer" width={24} height={24} className="h-6 w-6" />
              <h2 className="text-lg font-bold text-slate-900">구매자 목록</h2>
            </div>
            <span className="text-sm font-semibold text-slate-600">
              {totalCount === 0
                ? '0명'
                : `${(page - 1) * PAGE_SIZE + 1} - ${Math.min(page * PAGE_SIZE, totalCount)} / ${totalCount} 명`}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm sm:min-w-[260px]">
                <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="지갑주소, 닉네임, 은행, 상태 검색"
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                <span className="text-xs text-slate-600">인증</span>
                <select
                  value={verifiedFilter}
                  onChange={(event) =>
                    setVerifiedFilter(event.target.value as 'all' | 'verified' | 'unverified')
                  }
                  className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="all">전체</option>
                  <option value="verified">인증</option>
                  <option value="unverified">미인증</option>
                </select>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                <span className="text-xs text-slate-600">KYC</span>
                <select
                  value={kycFilter}
                  onChange={(event) =>
                    setKycFilter(event.target.value as 'all' | 'approved' | 'pending' | 'none' | 'rejected')
                  }
                  className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="all">전체</option>
                  <option value="approved">승인</option>
                  <option value="pending">심사중</option>
                  <option value="rejected">거절</option>
                  <option value="none">미제출</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  void fetchBuyers();
                  void fetchBuyerDashboard();
                }}
                disabled={loading || dashboardLoading}
                className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition ${
                  loading || dashboardLoading ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:shadow'
                }`}
              >
                {loading || dashboardLoading ? (
                  <svg
                    className="h-3.5 w-3.5 animate-spin text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" className="opacity-25" />
                    <path d="M12 2a10 10 0 0 1 10 10" className="opacity-75" />
                  </svg>
                ) : (
                  <svg
                    className="h-3.5 w-3.5 text-slate-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 2v6h-6" />
                    <path d="M3 22v-6h6" />
                    <path d="M21 8a9 9 0 0 0-15-6.7L3 5" />
                    <path d="M3 16a9 9 0 0 0 15 6.7L21 19" />
                  </svg>
                )}
                새로고침
              </button>
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Image src="/icon-loading.png" alt="Loading" width={18} height={18} className="h-4 w-4 animate-spin" />
                구매자 목록을 불러오는 중입니다.
              </div>
            ) : sortedFilteredBuyers.length === 0 ? (
              <div className="text-sm text-slate-500">구매자 정보가 있는 회원이 없습니다.</div>
            ) : (
              <table className="min-w-full overflow-hidden rounded-lg border border-slate-200 border-collapse shadow-sm">
                <thead className="border-b bg-slate-50 text-xs font-bold uppercase text-slate-700">
                  <tr>
                    <th className="px-4 py-2 text-left">프로필</th>
                    <th className="px-4 py-2 text-left">지갑주소</th>
                    <th className="px-4 py-2 text-left">등록시간</th>
                    <th className="px-4 py-2 text-left">인증</th>
                    <th className="px-4 py-2 text-left">상태</th>
                    <th className="px-4 py-2 text-left">계좌정보</th>
                    <th className="px-4 py-2 text-left">KYC</th>
                    <th className="px-4 py-2 text-left">상세</th>
                    <th className="px-4 py-2 text-left">삭제하기</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilteredBuyers.map((buyerUser, index) => {
                    const buyerStatus = buyerUser?.buyer?.status;
                    const normalizedBuyerStatus = buyerStatus === 'confirmed' ? 'confirmed' : 'pending';
                    const kycStatus =
                      buyerUser?.buyer?.kyc?.status ||
                      (buyerUser?.buyer?.kyc?.idImageUrl ? 'pending' : 'none');
                    const verified = buyerUser?.verified ?? false;
                    const createdAt = buyerUser?.createdAt;
                    const bankInfo = buyerUser?.buyer?.bankInfo;
                    const bankInfoStatus =
                      bankInfo?.status || (bankInfo?.accountNumber ? 'pending' : 'none');
                    const bankInfoLabel =
                      bankInfoStatus === 'approved'
                        ? '승인완료'
                        : bankInfoStatus === 'rejected'
                        ? '거절'
                        : bankInfoStatus === 'pending'
                        ? '심사중'
                        : '미제출';
                    const bankName = bankInfo?.bankName || '-';
                    const maskedAccount = bankInfo?.accountNumber
                      ? `${bankInfo.accountNumber.slice(0, 3)}****${bankInfo.accountNumber.slice(-2)}`
                      : '-';
                    const bankInfoSubmittedAt = bankInfo?.submittedAt;
                    const kycSubmittedAt = buyerUser?.buyer?.kyc?.submittedAt;
                    const avatar = buyerUser?.avatar || '/profile-default.png';
                    const initials = (buyerUser?.nickname || buyerUser?.walletAddress || 'NA')
                      .replace(/^0x/i, '')
                      .slice(0, 2)
                      .toUpperCase();
                    const walletAddress = buyerUser?.walletAddress || '';
                    const walletPreview = walletAddress
                      ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
                      : '-';

                    return (
                      <tr key={`${walletAddress}-${index}`} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white">
                              {buyerUser?.avatar ? (
                                <Image
                                  src={avatar}
                                  alt="Profile"
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-xs font-semibold tracking-[0.12em]">
                                  {initials}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-slate-900">{buyerUser?.nickname || '-'}</span>
                              <span className="text-[11px] text-slate-500">{initials}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-700">{walletPreview}</td>
                        <td className="px-4 py-2 text-xs text-slate-600">
                          {createdAt ? new Date(createdAt).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${
                                verified
                                  ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200/80 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {verified ? '인증' : '미인증'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (!buyerUser?.walletAddress) return;
                                setVerifiedModalTarget({ wallet: buyerUser.walletAddress, verified });
                                setVerifiedModalOpen(true);
                                setSelectedVerified(verified);
                                void fetchVerifiedHistory(buyerUser.walletAddress, 1, false);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                            >
                              변경하기
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex min-w-[160px] items-center justify-center rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm ${
                              normalizedBuyerStatus === 'confirmed'
                                ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                : 'border-amber-200/80 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {normalizedBuyerStatus === 'confirmed' ? '구매가능상태' : '구매불가능상태'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-semibold ${
                                bankInfoStatus === 'approved'
                                  ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                  : bankInfoStatus === 'rejected'
                                  ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                                  : bankInfoStatus === 'pending'
                                  ? 'border-amber-200/80 bg-amber-50 text-amber-700'
                                  : 'border-slate-200/80 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {bankInfoLabel}
                            </span>
                            <span className="text-xs text-slate-600">{bankName}</span>
                            <span className="text-xs text-slate-500">{maskedAccount}</span>
                            <span className="text-[11px] text-slate-500">
                              {bankInfoSubmittedAt ? new Date(bankInfoSubmittedAt).toLocaleString() : '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${
                                kycStatus === 'approved'
                                  ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                  : kycStatus === 'rejected'
                                  ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                                  : kycStatus === 'pending'
                                  ? 'border-amber-200/80 bg-amber-50 text-amber-700'
                                  : 'border-slate-200/80 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {kycStatus === 'approved'
                                ? '승인완료'
                                : kycStatus === 'rejected'
                                ? '거절'
                                : kycStatus === 'pending'
                                ? '심사중'
                                : '미제출'}
                            </span>
                            <span className="text-xs text-slate-600">
                              {kycSubmittedAt ? new Date(kycSubmittedAt).toLocaleString() : '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              router.push(
                                `/${lang}/administration/buyer/${buyerUser.walletAddress}?storecode=${buyerUser.storecode || ''}`,
                              );
                            }}
                            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                          >
                            상세보기
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteModalTarget(buyerUser);
                              setDeleteModalOpen(true);
                            }}
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100"
                          >
                            삭제하기
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {!loading && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span>
                {totalCount === 0
                  ? '0건'
                  : `${(page - 1) * PAGE_SIZE + 1} - ${Math.min(page * PAGE_SIZE, totalCount)} / ${totalCount}건`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
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
                    const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
                    setPage((prev) => Math.min(maxPage, prev + 1));
                  }}
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE) || loading}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    page >= Math.ceil(totalCount / PAGE_SIZE) || loading
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
      </div>

      {verifiedModalOpen && verifiedModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Verification</p>
                <h3 className="text-lg font-bold text-slate-900">인증 여부 변경</h3>
              </div>
              <button
                type="button"
                onClick={() => setVerifiedModalOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-hidden px-5 pb-5 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">현재</span>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      verifiedModalTarget.verified
                        ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200/80 bg-white text-slate-600'
                    }`}
                  >
                    {verifiedModalTarget.verified ? '인증' : '미인증'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedVerified(true)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      selectedVerified === true
                        ? 'border-emerald-200/80 bg-emerald-600 text-white shadow'
                        : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                    }`}
                  >
                    인증으로
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVerified(false)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      selectedVerified === false
                        ? 'border-rose-200/80 bg-rose-600 text-white shadow'
                        : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                    }`}
                  >
                    미인증으로
                  </button>
                </div>
                <button
                  type="button"
                  disabled={selectedVerified === null || selectedVerified === verifiedModalTarget.verified}
                  onClick={async () => {
                    if (!verifiedModalTarget?.wallet || selectedVerified === null) return;
                    try {
                      const response = await fetch('/api/user/updateBuyerVerified', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ walletAddress: verifiedModalTarget.wallet, verified: selectedVerified }),
                      });
                      if (!response.ok) {
                        const message = (await response.json())?.error || '변경에 실패했습니다';
                        alert(message);
                        return;
                      }

                      setBuyers((prev) =>
                        prev.map((buyer) =>
                          buyer.walletAddress === verifiedModalTarget.wallet
                            ? {
                                ...buyer,
                                verified: selectedVerified,
                              }
                            : buyer,
                        ),
                      );
                      setVerifiedModalTarget({
                        wallet: verifiedModalTarget.wallet,
                        verified: selectedVerified,
                      });
                      await fetchBuyers();
                      await fetchVerifiedHistory(verifiedModalTarget.wallet, 1, false);
                    } catch (error) {
                      console.error(error);
                      alert('변경에 실패했습니다');
                    }
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedVerified === null || selectedVerified === verifiedModalTarget.verified
                      ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                      : 'border border-slate-200 bg-slate-900 text-white hover:-translate-y-0.5 hover:shadow'
                  }`}
                >
                  적용
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 p-3">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                  <span>인증 이력</span>
                  {!verifiedHistoryLoading && (
                    <span className="font-mono text-[11px] text-slate-500">{verifiedHistoryTotal}건</span>
                  )}
                </div>
                <div
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
                  onScroll={(event) => {
                    const target = event.currentTarget;
                    if (
                      verifiedHistoryHasMore &&
                      !verifiedHistoryLoading &&
                      target.scrollTop + target.clientHeight >= target.scrollHeight - 20 &&
                      verifiedModalTarget?.wallet
                    ) {
                      void fetchVerifiedHistory(verifiedModalTarget.wallet, verifiedHistoryPage + 1, true);
                    }
                  }}
                >
                  {verifiedHistory.length === 0 && !verifiedHistoryLoading && (
                    <div className="text-xs text-slate-500">이력이 없습니다.</div>
                  )}
                  {verifiedHistory.map((item, idx) => (
                    <li
                      key={item._id || idx}
                      className="list-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {item.prevVerified === undefined || item.prevVerified === null
                            ? 'N/A'
                            : item.prevVerified
                            ? '인증'
                            : '미인증'}
                        </span>
                        <span className="text-[10px] text-slate-400">→</span>
                        <span className="font-semibold text-emerald-700">
                          {item.newVerified ? '인증' : '미인증'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.changedAt ? new Date(item.changedAt).toLocaleString() : ''}
                      </div>
                    </li>
                  ))}
                  {verifiedHistoryLoading && (
                    <div className="flex items-center gap-2 py-1 text-xs text-slate-500">
                      <svg
                        className="h-4 w-4 animate-spin text-slate-500"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" className="opacity-25" />
                        <path d="M12 2a10 10 0 0 1 10 10" className="opacity-75" />
                      </svg>
                      불러오는 중...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && deleteModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">Delete Buyer</p>
                <h3 className="text-lg font-bold text-slate-900">구매자 삭제 확인</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deletingBuyer}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                닫기
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <p className="text-sm leading-relaxed text-slate-700">
                선택한 구매자 정보를 삭제합니다. 삭제 후에는 되돌릴 수 없습니다.
              </p>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">닉네임</span>
                  <span className="text-right font-semibold text-slate-900">{deleteModalTarget.nickname || '-'}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">지갑주소</span>
                  <span className="max-w-[260px] break-all text-right font-semibold text-slate-900">
                    {deleteModalTarget.walletAddress || '-'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">스토어코드</span>
                  <span className="text-right font-semibold text-slate-900">{deleteModalTarget.storecode || '-'}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">등록시간</span>
                  <span className="text-right font-semibold text-slate-900">
                    {deleteModalTarget.createdAt ? new Date(deleteModalTarget.createdAt).toLocaleString() : '-'}
                  </span>
                </div>
              </div>

              {deleteError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {deleteError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deletingBuyer}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeleteBuyer();
                  }}
                  disabled={deletingBuyer}
                  className={`inline-flex min-w-[120px] items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white transition ${
                    deletingBuyer
                      ? 'cursor-not-allowed bg-rose-300'
                      : 'bg-rose-600 shadow-sm hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow'
                  }`}
                >
                  {deletingBuyer ? '삭제 중...' : '삭제하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
