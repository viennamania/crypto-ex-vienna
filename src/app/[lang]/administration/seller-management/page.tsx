'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';

export default function SellerManagementPage() {
  const params = useParams<{ lang?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);
  const [agentsMap, setAgentsMap] = useState<Record<string, { agentName?: string; agentLogo?: string }>>({});
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentModalTargetWallet, setAgentModalTargetWallet] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState('');
  const [agentFilterModalOpen, setAgentFilterModalOpen] = useState(false);
  const [agentFilterSearch, setAgentFilterSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'pending'>('all');
  const [agentHistory, setAgentHistory] = useState<any[]>([]);
  const [agentHistoryTotal, setAgentHistoryTotal] = useState(0);
  const [agentHistoryLoading, setAgentHistoryLoading] = useState(false);
  const [agentHistoryPage, setAgentHistoryPage] = useState(1);
  const [agentHistoryHasMore, setAgentHistoryHasMore] = useState(false);
  const HISTORY_PAGE_SIZE = 10;
  const [enabledHistory, setEnabledHistory] = useState<any[]>([]);
  const [enabledHistoryTotal, setEnabledHistoryTotal] = useState(0);
  const [enabledHistoryLoading, setEnabledHistoryLoading] = useState(false);
  const [enabledHistoryPage, setEnabledHistoryPage] = useState(1);
  const [enabledHistoryHasMore, setEnabledHistoryHasMore] = useState(false);
  const ENABLED_HISTORY_PAGE_SIZE = 10;
  const [enabledModalOpen, setEnabledModalOpen] = useState(false);
  const [enabledModalTarget, setEnabledModalTarget] = useState<{ wallet: string; enabled?: boolean } | null>(null);
  const [selectedEnabled, setSelectedEnabled] = useState<boolean | null>(null);
  const [initializedFromParams, setInitializedFromParams] = useState(false);

  const fetchSellers = async () => {
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
          agentcode: agentFilter || undefined,
          sortField: 'createdAt',
          userType: 'seller',
        }),
      });
      const data = await response.json();
      const users = data?.result?.users || [];
      setTotalCount(data?.result?.totalCount ?? users.length);
      const sellerUsers = users.filter((user: any) => Boolean(user?.seller));
      sellerUsers.sort((a: any, b: any) => {
        const aTime = new Date(a?.createdAt || 0).getTime();
        const bTime = new Date(b?.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setSellers(sellerUsers);
    } catch (error) {
      console.error('Error fetching sellers', error);
      setSellers([]);
    }
    setLoading(false);
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents?limit=500');
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, { agentName?: string; agentLogo?: string }> = {};
      const list: any[] = data?.items || [];
      list.forEach((agent: any) => {
        if (!agent?.agentcode) return;
        map[agent.agentcode] = {
          agentName: agent.agentName,
          agentLogo: agent.agentLogo,
        };
      });
      setAgentsMap(map);
      setAgentsList(list);
    } catch (e) {
      console.error('Error fetching agents', e);
    }
  };

  useEffect(() => {
    if (!initializedFromParams) return;
    fetchSellers();
  }, [page, searchTerm, agentFilter, initializedFromParams]);

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    if (initializedFromParams) return;
    const qParam = searchParams.get('q') ?? '';
    const agentParam = searchParams.get('agentcode') ?? searchParams.get('agent') ?? '';
    const pageParam = Number(searchParams.get('page') ?? '1');
    const statusParam = searchParams.get('status') ?? 'all';
    const normalizedStatus =
      statusParam === 'confirmed' || statusParam === 'pending' ? statusParam : 'all';
    setSearchTerm(qParam);
    setAgentFilter(agentParam);
    setStatusFilter(normalizedStatus as 'all' | 'confirmed' | 'pending');
    setPage(!Number.isNaN(pageParam) && pageParam > 0 ? pageParam : 1);
    setInitializedFromParams(true);
  }, [searchParams, initializedFromParams]);

  useEffect(() => {
    if (!initializedFromParams) return;
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set('q', searchTerm.trim());
    if (agentFilter) params.set('agentcode', agentFilter);
    if (page > 1) params.set('page', String(page));
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchTerm, agentFilter, statusFilter, page, initializedFromParams, pathname, router]);

  const filteredSellers = sellers.filter((seller) => {
    if (statusFilter === 'all') return true;
    const normalizedStatus = seller?.seller?.status === 'confirmed' ? 'confirmed' : 'pending';
    return normalizedStatus === statusFilter;
  }); // 서버 검색/필터 결과 사용 + 상태 필터
  const filteredAgents = agentsList.filter((agent) => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return true;
    const target = `${agent.agentName || ''} ${agent.agentcode || ''}`.toLowerCase();
    return target.includes(q);
  });
  const filteredAgentFilters = agentsList.filter((agent) => {
    const q = agentFilterSearch.trim().toLowerCase();
    if (!q) return true;
    const target = `${agent.agentName || ''} ${agent.agentcode || ''}`.toLowerCase();
    return target.includes(q);
  });
  const selectedAgentInfo = agentFilter
    ? agentsList.find((agent) => agent.agentcode === agentFilter) ||
      (agentsMap[agentFilter]
        ? { agentcode: agentFilter, ...agentsMap[agentFilter] }
        : { agentcode: agentFilter })
    : null;
  const selectedSellerForAgentModal = agentModalTargetWallet
    ? sellers.find((seller) => seller.walletAddress === agentModalTargetWallet)
    : null;
  const currentAgentcodeForModal =
    selectedSellerForAgentModal?.agentcode ||
    selectedSellerForAgentModal?.seller?.agentcode ||
    selectedSellerForAgentModal?.store?.agentcode ||
    '';
  const [selectedAgentcode, setSelectedAgentcode] = useState<string | null>(null);
  const currentAgentInfoForModal = currentAgentcodeForModal
    ? agentsMap[currentAgentcodeForModal] ||
      agentsList.find((a) => a.agentcode === currentAgentcodeForModal)
    : null;
  const selectedAgentInfoForModal = selectedAgentcode
    ? agentsMap[selectedAgentcode] || agentsList.find((a) => a.agentcode === selectedAgentcode)
    : null;

  const fetchAgentHistory = async (wallet: string, page = 1, append = false) => {
    if (agentHistoryLoading) return;
    setAgentHistoryLoading(true);
    try {
      const res = await fetch('/api/user/getAgentcodeChangeHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet, limit: HISTORY_PAGE_SIZE, page }),
      });
      const data = await res.json();
      const items = data?.result?.items || [];
      const totalCount = data?.result?.totalCount ?? items.length;
      setAgentHistory((prev) => (append ? [...prev, ...items] : items));
      setAgentHistoryTotal(totalCount);
      const nextCount = (append ? agentHistory.length : 0) + items.length;
      setAgentHistoryHasMore(nextCount < totalCount);
      setAgentHistoryPage(page);
    } catch (e) {
      console.error('Error fetching agent history', e);
      if (!append) setAgentHistory([]);
    }
    setAgentHistoryLoading(false);
  };

  const fetchEnabledHistory = async (wallet: string, page = 1, append = false) => {
    if (enabledHistoryLoading) return;
    setEnabledHistoryLoading(true);
    try {
      const res = await fetch('/api/user/getSellerEnabledHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet, limit: ENABLED_HISTORY_PAGE_SIZE, page }),
      });
      const data = await res.json();
      const items = data?.result?.items || [];
      const totalCount = data?.result?.totalCount ?? items.length;
      setEnabledHistory((prev) => (append ? [...prev, ...items] : items));
      setEnabledHistoryTotal(totalCount);
      const nextCount = (append ? enabledHistory.length : 0) + items.length;
      setEnabledHistoryHasMore(nextCount < totalCount);
      setEnabledHistoryPage(page);
    } catch (e) {
      console.error('Error fetching enabled history', e);
      if (!append) setEnabledHistory([]);
    }
    setEnabledHistoryLoading(false);
  };

  useEffect(() => {
    if (agentModalOpen && selectedSellerForAgentModal) {
      setSelectedAgentcode(
        selectedSellerForAgentModal.agentcode ||
          selectedSellerForAgentModal.seller?.agentcode ||
          selectedSellerForAgentModal.store?.agentcode ||
          null,
      );
      setAgentHistory([]);
      setAgentHistoryTotal(0);
      setAgentHistoryPage(1);
      setAgentHistoryHasMore(false);
      setEnabledHistory([]);
      setEnabledHistoryTotal(0);
      setEnabledHistoryPage(1);
      setEnabledHistoryHasMore(false);
      fetchAgentHistory(
        selectedSellerForAgentModal.walletAddress,
        1,
        false,
      );
      fetchEnabledHistory(selectedSellerForAgentModal.walletAddress, 1, false);
    } else {
      setSelectedAgentcode(null);
      setAgentHistory([]);
      setAgentHistoryTotal(0);
      setAgentHistoryPage(1);
      setAgentHistoryHasMore(false);
      setEnabledHistory([]);
      setEnabledHistoryTotal(0);
      setEnabledHistoryPage(1);
      setEnabledHistoryHasMore(false);
    }
  }, [agentModalOpen, selectedSellerForAgentModal]);

  useEffect(() => {
    if (!enabledModalOpen) {
      setEnabledHistory([]);
      setEnabledHistoryTotal(0);
      setEnabledHistoryPage(1);
      setEnabledHistoryHasMore(false);
      setEnabledModalTarget(null);
      setSelectedEnabled(null);
    }
  }, [enabledModalOpen]);

  return (
    <>
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
          <span className="font-semibold">판매자 관리</span>
          <button
            type="button"
            onClick={fetchSellers}
            disabled={loading}
            className={`ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition ${
              loading ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:shadow-md'
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

        <div className="w-full rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Image src="/icon-seller.png" alt="Seller" width={24} height={24} className="h-6 w-6" />
              <h2 className="text-lg font-bold text-slate-900">판매자 목록</h2>
            </div>
            <span className="text-sm font-semibold text-slate-600">
              {filteredSellers.length} / {totalCount} 명
            </span>
            <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm sm:min-w-[260px]">
                <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
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
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                <span className="text-xs whitespace-nowrap text-slate-600">상태</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setPage(1);
                    }}
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                      statusFilter === 'all'
                        ? 'bg-slate-900 text-white shadow'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    전체
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('confirmed');
                      setPage(1);
                    }}
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                      statusFilter === 'confirmed'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    판매가능
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('pending');
                      setPage(1);
                    }}
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                      statusFilter === 'pending'
                        ? 'bg-amber-500 text-white shadow'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    판매불가능
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAgentFilterModalOpen(true)}
                className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <span className="text-xs whitespace-nowrap text-slate-600">에이전트</span>
                <div className="flex items-center gap-2">
                  <div className="relative h-8 w-8 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                    {selectedAgentInfo?.agentLogo ? (
                      <Image
                        src={selectedAgentInfo.agentLogo}
                        alt={selectedAgentInfo.agentName || 'agent'}
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-slate-600">
                        {(selectedAgentInfo?.agentName || selectedAgentInfo?.agentcode || '전체').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-left">
                    <p className="text-xs font-semibold text-slate-800 truncate max-w-[120px]">
                      {selectedAgentInfo?.agentName || ''}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 truncate max-w-[120px]">
                      {selectedAgentInfo?.agentcode || ''}
                    </p>
                  </div>
                  
                </div>
              </button>
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Image src="/icon-loading.png" alt="Loading" width={18} height={18} className="h-4 w-4 animate-spin" />
                판매자 목록을 불러오는 중입니다.
              </div>
            ) : sellers.length === 0 ? (
              <div className="text-sm text-slate-500">판매자 정보가 있는 회원이 없습니다.</div>
            ) : (
              <table className="min-w-full border-collapse border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <thead className="bg-slate-50 text-slate-700 text-xs font-bold uppercase border-b">
                  <tr>
                    <th className="px-4 py-2 text-left">프로필</th>
                    <th className="px-4 py-2 text-left">에이전트</th>
                    <th className="px-4 py-2 text-left">지갑주소</th>
                    <th className="px-4 py-2 text-left">등록시간</th>
                    <th className="px-4 py-2 text-left">사용여부</th>
                    <th className="px-4 py-2 text-left">상태</th>
                    <th className="px-4 py-2 text-left">계좌정보</th>
                    <th className="px-4 py-2 text-left">KYC</th>
                    <th className="px-4 py-2 text-left">상세</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSellers.map((sellerUser, index) => {
                    const sellerStatus = sellerUser?.seller?.status;
                    const normalizedSellerStatus = sellerStatus === 'confirmed' ? 'confirmed' : 'pending';
                    const kycStatus =
                      sellerUser?.seller?.kyc?.status ||
                      (sellerUser?.seller?.kyc?.idImageUrl ? 'pending' : 'none');
                    const agentcode =
                      sellerUser?.agentcode ||
                      sellerUser?.seller?.agentcode ||
                      sellerUser?.store?.agentcode ||
                      '';
                    const agentInfo = agentcode ? agentsMap[agentcode] : undefined;
                    const bankInfo = sellerUser?.seller?.bankInfo;
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
                    const kycSubmittedAt = sellerUser?.seller?.kyc?.submittedAt;
                    const createdAt = sellerUser?.createdAt;
                    const enabled = sellerUser?.seller?.enabled;
                    const avatar = sellerUser?.avatar || '/profile-default.png';
                    const initials = (sellerUser?.nickname || sellerUser?.walletAddress || 'NA')
                      .replace(/^0x/i, '')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <tr key={index} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white">
                              {sellerUser?.avatar ? (
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
                              <span className="text-sm font-semibold text-slate-900">{sellerUser?.nickname || '-'}</span>
                              <span className="text-[11px] text-slate-500">{initials}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {agentInfo ? (
                            <div className="flex items-center gap-2">
                              <div className="relative h-8 w-8 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                                {agentInfo.agentLogo ? (
                                  <Image
                                    src={agentInfo.agentLogo}
                                    alt={agentInfo.agentName || 'agent'}
                                    fill
                                    sizes="32px"
                                    className="object-cover"
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-600">
                                    {agentcode.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {agentInfo.agentName || agentcode || '-'}
                                </p>
                                <p className="text-[11px] font-mono text-slate-500 truncate">{agentcode}</p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">-</span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setAgentModalTargetWallet(sellerUser.walletAddress);
                              setAgentModalOpen(true);
                              fetchAgentHistory(sellerUser.walletAddress);
                            }}
                            className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                          >
                            변경하기
                          </button>
                        </td>
                        <td className="px-4 py-2 text-slate-700 text-xs">
                          {sellerUser?.walletAddress?.substring(0, 6)}...
                          {sellerUser?.walletAddress?.substring(sellerUser?.walletAddress.length - 4)}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-600">
                          {createdAt ? new Date(createdAt).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
                                enabled
                                  ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200/80 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {enabled ? '사용중' : '미사용'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEnabledModalTarget({ wallet: sellerUser.walletAddress, enabled });
                                setEnabledModalOpen(true);
                                setSelectedEnabled(enabled ?? false);
                                fetchEnabledHistory(sellerUser.walletAddress, 1, false);
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
                              normalizedSellerStatus === 'confirmed'
                                ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                : 'border-amber-200/80 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {normalizedSellerStatus === 'confirmed' ? '판매가능상태' : '판매불가능상태'}
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
                              className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-semibold ${
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
                              router.push(`/${lang}/administration/seller/${sellerUser.walletAddress}?storecode=${sellerUser.storecode || ''}`);
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
    {agentModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-3xl max-h-[60vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)] flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Agent</p>
              <h3 className="text-lg font-bold text-slate-900">에이전트 변경</h3>
            </div>
            <button
              onClick={() => {
                setAgentModalOpen(false);
                setAgentModalTargetWallet(null);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div className="flex-1 overflow-auto px-5 pb-3 pt-3">
            {selectedSellerForAgentModal && (
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white">
                  {selectedSellerForAgentModal?.avatar ? (
                    <Image
                      src={selectedSellerForAgentModal.avatar}
                      alt="Profile"
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold tracking-[0.12em]">
                      {(selectedSellerForAgentModal?.nickname || selectedSellerForAgentModal?.walletAddress || 'NA')
                        .replace(/^0x/i, '')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-semibold text-slate-900">
                    {selectedSellerForAgentModal?.nickname || '닉네임 없음'}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 truncate">
                    {selectedSellerForAgentModal?.walletAddress}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-2 text-right text-xs text-slate-600">
                  <div className="relative h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {currentAgentInfoForModal?.agentLogo ? (
                      <Image
                        src={currentAgentInfoForModal.agentLogo}
                        alt={currentAgentInfoForModal.agentName || currentAgentcodeForModal || 'agent'}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-600">
                        {(currentAgentInfoForModal?.agentName || currentAgentcodeForModal || 'NA')
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-800">현재 에이전트</p>
                    <p className="text-[11px] font-semibold text-slate-700 truncate max-w-[140px]">
                      {currentAgentInfoForModal?.agentName || currentAgentcodeForModal || '없음'}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 truncate max-w-[140px]">
                      {currentAgentcodeForModal || ''}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="grid flex-1 min-h-0 gap-4 md:grid-cols-[2fr,1fr]">
              <div className="space-y-3 overflow-y-auto pr-1 py-1">
                <div className="sticky top-0 z-10 space-y-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
                    <input
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      placeholder="에이전트명 또는 코드 검색"
                      className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                    />
                    {agentSearch && (
                      <button
                        type="button"
                        onClick={() => setAgentSearch('')}
                        className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    {filteredAgents.length}개 결과
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 pb-3">
                  {filteredAgents.map((agent) => (
                    <button
                      key={agent.agentcode}
                      onClick={() => {
                        setSelectedAgentcode(agent.agentcode);
                      }}
                      className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 ${
                        selectedAgentcode === agent.agentcode
                          ? 'border-emerald-300 bg-emerald-50 shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                      }`}
                    >
                      <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {agent.agentLogo ? (
                          <Image
                            src={agent.agentLogo}
                            alt={agent.agentName}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                            {agent.agentName?.slice(0, 2)?.toUpperCase() || 'AG'}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{agent.agentName || agent.agentcode}</p>
                        <p className="text-[11px] font-mono text-slate-500">{agent.agentcode}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                          {agent.agentDescription || '설명 없음'}
                        </p>
                      </div>
                      {selectedAgentcode === agent.agentcode && (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                          선택됨
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {filteredAgents.length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-500">검색 결과가 없습니다.</div>
                )}
              </div>
              <div className="h-full min-h-0 rounded-xl border border-slate-200 bg-white/80 p-3 overflow-hidden flex flex-col gap-3">
                <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 pb-2 backdrop-blur">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span>변경 이력</span>
                    {agentHistoryLoading && (
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
                    )}
                  </div>
                  {!agentHistoryLoading && (
                    <span className="text-[11px] font-mono text-slate-500">
                      {agentHistoryTotal}건
                    </span>
                  )}
                </div>
                <div
                  className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 pb-2"
                  onScroll={(e) => {
                    const target = e.currentTarget;
                    if (
                      agentHistoryHasMore &&
                      !agentHistoryLoading &&
                      target.scrollTop + target.clientHeight >= target.scrollHeight - 20 &&
                      agentModalTargetWallet
                    ) {
                      fetchAgentHistory(agentModalTargetWallet, agentHistoryPage + 1, true);
                    }
                  }}
                >
                  {agentHistory.length === 0 && !agentHistoryLoading && (
                    <div className="text-xs text-slate-500">이력이 없습니다.</div>
                  )}
                  {agentHistory.map((item, idx) => (
                    <li
                      key={item._id || idx}
                      className="list-none rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm text-xs text-slate-700"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative h-6 w-6 flex-shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                            {item.prevAgent?.agentLogo ? (
                              <Image
                                src={item.prevAgent.agentLogo}
                                alt={item.prevAgent.agentName || item.prevAgent.agentcode || 'prev'}
                                fill
                                sizes="24px"
                                className="object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-slate-600">
                                {(item.prevAgent?.agentcode || 'NA').slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-slate-900 leading-tight">
                              {item.prevAgent?.agentName || item.prevAgent?.agentcode || '없음'}
                            </p>
                            <p className="truncate text-[10px] font-mono text-slate-500 leading-tight">
                              {item.prevAgent?.agentcode || ''}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">→</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative h-6 w-6 flex-shrink-0 overflow-hidden rounded-full border border-emerald-200 bg-emerald-50">
                            {item.newAgent?.agentLogo ? (
                              <Image
                                src={item.newAgent.agentLogo}
                                alt={item.newAgent.agentName || item.newAgent.agentcode || 'new'}
                                fill
                                sizes="24px"
                                className="object-cover"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-emerald-700">
                                {(item.newAgent?.agentcode || '').slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-emerald-700 leading-tight">
                              {item.newAgent?.agentName || item.newAgent?.agentcode || '-'}
                            </p>
                            <p className="truncate text-[10px] font-mono text-emerald-700 leading-tight">
                              {item.newAgent?.agentcode || ''}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {item.changedAt ? new Date(item.changedAt).toLocaleString() : ''}
                      </div>
                    </li>
                  ))}
                  {agentHistoryLoading && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
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
          <div className="border-t border-slate-200 bg-white px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">현재</span>
                  <div className="flex min-w-[200px] max-w-full items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2">
                    <div className="relative h-8 w-8 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex-shrink-0">
                      {currentAgentInfoForModal?.agentLogo ? (
                        <Image
                          src={currentAgentInfoForModal.agentLogo}
                          alt={currentAgentInfoForModal.agentName || currentAgentcodeForModal || 'current agent'}
                          fill
                          sizes="32px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-600">
                          {(currentAgentInfoForModal?.agentName ||
                            currentAgentcodeForModal ||
                            'NA')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-slate-900 truncate max-w-[200px]">
                        {currentAgentInfoForModal?.agentName || currentAgentcodeForModal || '없음'}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500 truncate max-w-[200px]">
                        {currentAgentcodeForModal || ''}
                      </p>
                    </div>
                  </div>
                </div>
                <span className="text-xs text-slate-500">→</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">선택</span>
                  <div className="flex min-w-[200px] max-w-full items-center gap-3 rounded-full border border-emerald-200 bg-white px-3 py-2">
                    <div className="relative h-8 w-8 overflow-hidden rounded-full border border-emerald-200 bg-emerald-50 flex-shrink-0">
                      {selectedAgentInfoForModal?.agentLogo ? (
                        <Image
                          src={selectedAgentInfoForModal.agentLogo}
                          alt={selectedAgentInfoForModal.agentName || selectedAgentcode || 'selected agent'}
                          fill
                          sizes="32px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-emerald-700">
                          {(selectedAgentInfoForModal?.agentName || selectedAgentcode || 'NA')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-emerald-700 truncate max-w-[200px]">
                        {selectedAgentInfoForModal?.agentName || selectedAgentcode || '없음'}
                      </p>
                      <p className="text-[10px] font-mono text-emerald-700 truncate max-w-[200px]">
                        {selectedAgentcode || ''}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!agentModalTargetWallet || !selectedAgentcode) return;
                  if (selectedAgentcode === currentAgentcodeForModal) return;
                  try {
                    const res = await fetch('/api/user/updateAgentcode', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        walletAddress: agentModalTargetWallet,
                        agentcode: selectedAgentcode,
                      }),
                    });
                    if (!res.ok) {
                      const msg = (await res.json())?.error || '변경에 실패했습니다';
                      alert(msg);
                      return;
                    }
                    const resJson = await res.json();
                    const updatedUser = resJson?.user;
                    // 서버 응답 성공 시 선택/현재도 최신화
                    setSelectedAgentcode(selectedAgentcode);
                    setAgentHistoryPage(1);
                    setAgentHistoryHasMore(false);
                    setAgentHistory([]);
                    // Optimistic UI update
                    setSellers((prev) =>
                      prev.map((s) =>
                        s.walletAddress === agentModalTargetWallet
                          ? {
                              ...s,
                              ...updatedUser,
                              agentcode: updatedUser?.agentcode ?? selectedAgentcode,
                              seller: updatedUser?.seller ?? {
                                ...s.seller,
                                agentcode: selectedAgentcode,
                              },
                              store: updatedUser?.store ?? (s.store
                                ? { ...s.store, agentcode: selectedAgentcode }
                                : s.store),
                              storeInfo: updatedUser?.storeInfo ?? (s.storeInfo
                                ? { ...s.storeInfo, agentcode: selectedAgentcode }
                                : s.storeInfo),
                            }
                          : s,
                      ),
                    );
                    await fetchSellers();
                    await fetchAgentHistory(agentModalTargetWallet, 1, false);
                  } catch (e) {
                    console.error(e);
                    alert('변경에 실패했습니다');
                  }
                }}
                disabled={
                  !agentModalTargetWallet ||
                  !selectedAgentcode ||
                  selectedAgentcode === currentAgentcodeForModal
                }
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold tracking-tight transition ${
                  !agentModalTargetWallet ||
                  !selectedAgentcode ||
                  selectedAgentcode === currentAgentcodeForModal
                    ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 shadow-sm'
                    : 'border border-emerald-200 bg-emerald-600 text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.8)] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-12px_rgba(16,185,129,0.9)]'
                }`}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M7 12h10" />
                  <path d="M11 18h6" />
                </svg>
                변경하기
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {enabledModalOpen && enabledModalTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)] flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Enabled</p>
              <h3 className="text-lg font-bold text-slate-900">사용여부 변경</h3>
            </div>
            <button
              onClick={() => setEnabledModalOpen(false)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div className="flex-1 overflow-hidden px-5 pb-5 pt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">현재</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${enabledModalTarget.enabled ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700' : 'border-slate-200/80 bg-white text-slate-600'}`}>
                  {enabledModalTarget.enabled ? '사용중' : '미사용'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEnabled(true)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                    selectedEnabled === true
                      ? 'border-emerald-200/80 bg-emerald-600 text-white shadow'
                      : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                  }`}
                >
                  사용중으로
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEnabled(false)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                    selectedEnabled === false
                      ? 'border-rose-200/80 bg-rose-600 text-white shadow'
                      : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                  }`}
                >
                  미사용으로
                </button>
              </div>
              <button
                type="button"
                disabled={selectedEnabled === null || selectedEnabled === enabledModalTarget.enabled}
                onClick={async () => {
                  if (!enabledModalTarget?.wallet || selectedEnabled === null) return;
                  try {
                    const res = await fetch('/api/user/updateSellerEnabled', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ walletAddress: enabledModalTarget.wallet, enabled: selectedEnabled }),
                    });
                    if (!res.ok) {
                      const msg = (await res.json())?.error || '변경에 실패했습니다';
                      alert(msg);
                      return;
                    }
                    const resJson = await res.json();
                    const updatedUser = resJson?.user;
                    setSellers((prev) =>
                      prev.map((s) =>
                        s.walletAddress === enabledModalTarget.wallet
                          ? {
                              ...s,
                              ...updatedUser,
                              seller: {
                                ...s.seller,
                                ...(updatedUser?.seller || {}),
                                enabled: selectedEnabled,
                              },
                            }
                          : s,
                      ),
                    );
                    setEnabledModalTarget({ wallet: enabledModalTarget.wallet, enabled: selectedEnabled });
                    await fetchSellers();
                    await fetchEnabledHistory(enabledModalTarget.wallet, 1, false);
                  } catch (e) {
                    console.error(e);
                    alert('변경에 실패했습니다');
                  }
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedEnabled === null || selectedEnabled === enabledModalTarget.enabled
                    ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                    : 'border border-slate-200 bg-slate-900 text-white hover:-translate-y-0.5 hover:shadow'
                }`}
              >
                적용
              </button>
            </div>
            <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white/80 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                <span>사용여부 이력</span>
                {!enabledHistoryLoading && (
                  <span className="text-[11px] font-mono text-slate-500">{enabledHistoryTotal}건</span>
                )}
              </div>
              <div
                className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"
                onScroll={(e) => {
                  const target = e.currentTarget;
                  if (
                    enabledHistoryHasMore &&
                    !enabledHistoryLoading &&
                    target.scrollTop + target.clientHeight >= target.scrollHeight - 20 &&
                    enabledModalTarget?.wallet
                  ) {
                    fetchEnabledHistory(enabledModalTarget.wallet, enabledHistoryPage + 1, true);
                  }
                }}
              >
                {enabledHistory.length === 0 && !enabledHistoryLoading && (
                  <div className="text-xs text-slate-500">이력이 없습니다.</div>
                )}
                {enabledHistory.map((item, idx) => (
                  <li
                    key={item._id || idx}
                    className="list-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {item.prevEnabled === undefined || item.prevEnabled === null
                          ? 'N/A'
                          : item.prevEnabled
                          ? '사용중'
                          : '미사용'}
                      </span>
                      <span className="text-[10px] text-slate-400">→</span>
                      <span className="font-semibold text-emerald-700">
                        {item.newEnabled ? '사용중' : '미사용'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {item.changedAt ? new Date(item.changedAt).toLocaleString() : ''}
                    </div>
                  </li>
                ))}
                {enabledHistoryLoading && (
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
    {agentFilterModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Agent Filter</p>
              <h3 className="text-lg font-bold text-slate-900">에이전트 선택</h3>
            </div>
            <div className="flex items-center gap-2">
              {agentFilter && (
                <button
                  onClick={() => {
                    setAgentFilter('');
                    setPage(1);
                    setAgentFilterModalOpen(false);
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  전체
                </button>
              )}
              <button
                onClick={() => setAgentFilterModalOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 pb-5 pt-3">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
              <input
                value={agentFilterSearch}
                onChange={(e) => setAgentFilterSearch(e.target.value)}
                placeholder="에이전트명 또는 코드 검색"
                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
              {agentFilterSearch && (
                <button
                  type="button"
                  onClick={() => setAgentFilterSearch('')}
                  className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mb-3 text-xs font-semibold text-slate-500">
              {filteredAgentFilters.length}개 결과
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredAgentFilters.map((agent) => (
                <button
                  key={agent.agentcode}
                  onClick={() => {
                    setAgentFilter(agent.agentcode);
                    setPage(1);
                    setAgentFilterModalOpen(false);
                  }}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {agent.agentLogo ? (
                      <Image
                        src={agent.agentLogo}
                        alt={agent.agentName}
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                        {agent.agentName?.slice(0, 2)?.toUpperCase() || 'AG'}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{agent.agentName || agent.agentcode}</p>
                    <p className="text-[11px] font-mono text-slate-500">{agent.agentcode}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                      {agent.agentDescription || '설명 없음'}
                    </p>
                  </div>
                  {agentFilter === agent.agentcode && (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                      선택됨
                    </span>
                  )}
                </button>
              ))}
            </div>
            {filteredAgentFilters.length === 0 && (
              <div className="py-6 text-center text-sm text-slate-500">검색 결과가 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
