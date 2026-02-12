'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';

export default function BuyerManagementPage() {
  const params = useParams<{ lang?: string }>();
  const router = useRouter();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [kycFilter, setKycFilter] = useState<'all' | 'approved' | 'pending' | 'none' | 'rejected'>('all');
  const [verifiedModalOpen, setVerifiedModalOpen] = useState(false);
  const [verifiedModalTarget, setVerifiedModalTarget] = useState<{ wallet: string; verified?: boolean } | null>(null);
  const [selectedVerified, setSelectedVerified] = useState<boolean | null>(null);
  const [verifiedHistory, setVerifiedHistory] = useState<any[]>([]);
  const [verifiedHistoryTotal, setVerifiedHistoryTotal] = useState(0);
  const [verifiedHistoryLoading, setVerifiedHistoryLoading] = useState(false);
  const [verifiedHistoryPage, setVerifiedHistoryPage] = useState(1);
  const [verifiedHistoryHasMore, setVerifiedHistoryHasMore] = useState(false);
  const VERIFIED_HISTORY_PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [totalCount, setTotalCount] = useState(0);

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
          limit: pageSize,
          page,
          includeUnverified: true,
          searchTerm,
          userType: 'buyer',
        }),
      });
      const data = await response.json();
      const users = data?.result?.users || [];
      setTotalCount(data?.result?.totalCount ?? users.length);
      const buyerUsers = users.filter((user: any) => Boolean(user?.buyer));
      buyerUsers.sort((a: any, b: any) => {
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

  useEffect(() => {
    fetchBuyers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm]);

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

  const filteredBuyers = buyers.filter((b) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      `${b?.nickname || ''} ${b?.walletAddress || ''} ${b?.buyer?.bankInfo?.bankName || ''} ${b?.buyer?.status || ''}`
        .toLowerCase()
        .includes(q);
    const verified = b?.verified ?? false;
    const matchesVerified =
      verifiedFilter === 'all' ? true : verifiedFilter === 'verified' ? verified : !verified;
    const kycStatus =
      b?.buyer?.kyc?.status || (b?.buyer?.kyc?.idImageUrl ? 'pending' : 'none');
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
  });

  const fetchVerifiedHistory = async (wallet: string, page = 1, append = false) => {
    if (verifiedHistoryLoading) return;
    setVerifiedHistoryLoading(true);
    try {
      const res = await fetch('/api/user/getBuyerVerifiedHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet, limit: VERIFIED_HISTORY_PAGE_SIZE, page }),
      });
      const data = await res.json();
      const items = data?.result?.items || [];
      const totalCount = data?.result?.totalCount ?? items.length;
      setVerifiedHistory((prev) => (append ? [...prev, ...items] : items));
      setVerifiedHistoryTotal(totalCount);
      const nextCount = (append ? verifiedHistory.length : 0) + items.length;
      setVerifiedHistoryHasMore(nextCount < totalCount);
      setVerifiedHistoryPage(page);
    } catch (e) {
      console.error('Error fetching verified history', e);
      if (!append) setVerifiedHistory([]);
    }
    setVerifiedHistoryLoading(false);
  };

  return (
    <main className="p-6 min-h-[100vh] flex items-start justify-center container max-w-screen-2xl mx-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <div className="w-full">
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center justify-center rounded-full border border-slate-200/70 bg-white/90 p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Image src="/icon-back.png" alt="Back" width={20} height={20} className="rounded-full" />
          </button>
          <span className="font-semibold">구매자 관리</span>
        </div>

        <div className="w-full rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Image src="/icon-buyer.png" alt="Buyer" width={24} height={24} className="h-6 w-6" />
              <h2 className="text-lg font-bold text-slate-900">구매자 목록</h2>
            </div>
            <span className="text-sm font-semibold text-slate-600">
              {totalCount === 0
                ? '0명'
                : `${(page - 1) * pageSize + 1} - ${Math.min(page * pageSize, totalCount)} / ${totalCount} 명`}
            </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm sm:min-w-[260px]">
                  <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
                  <input
                    type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                  }}
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
    {verifiedModalOpen && verifiedModalTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)] flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Verification</p>
              <h3 className="text-lg font-bold text-slate-900">인증 여부 변경</h3>
            </div>
            <button
              onClick={() => setVerifiedModalOpen(false)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div className="flex-1 overflow-hidden px-5 pb-5 pt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">현재</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold border ${
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
                  className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
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
                  className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
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
                    const res = await fetch('/api/user/updateBuyerVerified', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ walletAddress: verifiedModalTarget.wallet, verified: selectedVerified }),
                    });
                    if (!res.ok) {
                      const msg = (await res.json())?.error || '변경에 실패했습니다';
                      alert(msg);
                      return;
                    }
                    const resJson = await res.json();
                    const updatedUser = resJson?.user;
                    setBuyers((prev) =>
                      prev.map((b) =>
                        b.walletAddress === verifiedModalTarget.wallet
                          ? {
                              ...b,
                              ...updatedUser,
                              verified: selectedVerified,
                            }
                          : b,
                      ),
                    );
                    setVerifiedModalTarget({ wallet: verifiedModalTarget.wallet, verified: selectedVerified });
                    await fetchBuyers();
                    await fetchVerifiedHistory(verifiedModalTarget.wallet, 1, false);
                  } catch (e) {
                    console.error(e);
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
            <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white/80 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                <span>인증 이력</span>
                {!verifiedHistoryLoading && (
                  <span className="text-[11px] font-mono text-slate-500">{verifiedHistoryTotal}건</span>
                )}
              </div>
              <div
                className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"
                onScroll={(e) => {
                  const target = e.currentTarget;
                  if (
                    verifiedHistoryHasMore &&
                    !verifiedHistoryLoading &&
                    target.scrollTop + target.clientHeight >= target.scrollHeight - 20 &&
                    verifiedModalTarget?.wallet
                  ) {
                    fetchVerifiedHistory(verifiedModalTarget.wallet, verifiedHistoryPage + 1, true);
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
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
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
              </div>
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  <span className="text-xs text-slate-600">인증</span>
                  <select
                    value={verifiedFilter}
                    onChange={(e) => setVerifiedFilter(e.target.value as any)}
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
                    onChange={(e) => setKycFilter(e.target.value as any)}
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
                  onClick={fetchBuyers}
                disabled={loading}
                className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition ${
                  loading ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:shadow'
                }`}
              >
                {loading ? (
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
            ) : buyers.length === 0 ? (
              <div className="text-sm text-slate-500">구매자 정보가 있는 회원이 없습니다.</div>
                ) : (
                  <table className="min-w-full border-collapse border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    <thead className="bg-slate-50 text-slate-700 text-xs font-bold uppercase border-b">
                      <tr>
                        <th className="px-4 py-2 text-left">프로필</th>
                    <th className="px-4 py-2 text-left">지갑주소</th>
                    <th className="px-4 py-2 text-left">등록시간</th>
                    <th className="px-4 py-2 text-left">인증</th>
                    <th className="px-4 py-2 text-left">상태</th>
                    <th className="px-4 py-2 text-left">계좌정보</th>
                    <th className="px-4 py-2 text-left">KYC</th>
                    <th className="px-4 py-2 text-left">상세</th>
                  </tr>
                    </thead>
                    <tbody>
                  {filteredBuyers.map((buyerUser, index) => {
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
                    return (
                      <tr key={index} className="border-b hover:bg-slate-50">
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
                        <td className="px-4 py-2 text-slate-700 text-xs">
                          {buyerUser?.walletAddress?.substring(0, 6)}...
                          {buyerUser?.walletAddress?.substring(buyerUser?.walletAddress.length - 4)}
                        </td>
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
                                setVerifiedModalTarget({ wallet: buyerUser.walletAddress, verified });
                                setVerifiedModalOpen(true);
                                setSelectedVerified(verified);
                                fetchVerifiedHistory(buyerUser.walletAddress, 1, false);
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
                            onClick={() => {
                              router.push(`/${lang}/administration/buyer/${buyerUser.walletAddress}?storecode=${buyerUser.storecode || ''}`);
                            }}
                            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                          >
                            상세보기
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
                    const maxPage = Math.max(1, Math.ceil(totalCount / pageSize));
                    setPage((p) => Math.min(maxPage, p + 1));
                  }}
                  disabled={page >= Math.ceil(totalCount / pageSize) || loading}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    page >= Math.ceil(totalCount / pageSize) || loading
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
    </main>
  );
}
