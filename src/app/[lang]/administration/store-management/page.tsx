'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';

type StoreItem = {
  _id: string;
  createdAt: string;
  storecode: string;
  storeName: string;
  storeLogo: string;
  agentcode: string;
  agentName: string;
  agentLogo: string;
  backgroundColor: string;
  totalPaymentConfirmedCount: number;
  totalKrwAmount: number;
  totalUsdtAmount: number;
  totalSettlementCount: number;
  totalSettlementAmountKRW: number;
  settlementFeePercent: number;
  escrowAmountUSDT: number;
  adminWalletAddress: string;
  adminNickname: string;
  sellerWalletAddress: string;
  settlementWalletAddress: string;
  paymentWalletAddress: string;
};

type StoreCreateForm = {
  storeName: string;
  storeDescription: string;
  storeLogo: string;
  storeBanner: string;
};

type AdminWalletMemberItem = {
  id: string;
  nickname: string;
  role: string;
  walletAddress: string;
  createdAt: string;
};

type StoreAdminWalletRoleHistoryItem = {
  id: string;
  prevAdminWalletAddress: string;
  nextAdminWalletAddress: string;
  changedByWalletAddress: string;
  changedByName: string;
  changedAt: string;
};

type AgentItem = {
  agentcode: string;
  agentName: string;
  agentLogo: string;
  adminWalletAddress: string;
  totalStoreCount: number;
};

type FetchMode = 'initial' | 'query' | 'polling';

type RiskLevel = 'stable' | 'watch' | 'alert';

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
const POLLING_INTERVAL_MS = 15000;

const toFiniteNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toText = (value: unknown) => (typeof value === 'string' ? value : '');
const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const createInitialStoreForm = (): StoreCreateForm => ({
  storeName: '',
  storeDescription: '',
  storeLogo: '',
  storeBanner: '',
});

const normalizeStore = (value: unknown): StoreItem => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    _id: toText(source._id),
    createdAt: toText(source.createdAt),
    storecode: toText(source.storecode),
    storeName: toText(source.storeName),
    storeLogo: toText(source.storeLogo),
    agentcode: toText(source.agentcode),
    agentName: toText(source.agentName),
    agentLogo: toText(source.agentLogo),
    backgroundColor: toText(source.backgroundColor),
    totalPaymentConfirmedCount: toFiniteNumber(source.totalPaymentConfirmedCount),
    totalKrwAmount: toFiniteNumber(source.totalKrwAmount),
    totalUsdtAmount: toFiniteNumber(source.totalUsdtAmount),
    totalSettlementCount: toFiniteNumber(source.totalSettlementCount),
    totalSettlementAmountKRW: toFiniteNumber(source.totalSettlementAmountKRW),
    settlementFeePercent: toFiniteNumber(source.settlementFeePercent),
    escrowAmountUSDT: toFiniteNumber(source.escrowAmountUSDT),
    adminWalletAddress: toText(source.adminWalletAddress),
    adminNickname: toText(source.adminNickname),
    sellerWalletAddress: toText(source.sellerWalletAddress),
    settlementWalletAddress: toText(source.settlementWalletAddress),
    paymentWalletAddress: toText(source.paymentWalletAddress),
  };
};

const formatKrw = (value: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(toFiniteNumber(value));

const formatUsdt = (value: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(toFiniteNumber(value));

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const shortWallet = (value: string) => {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const toRoleLabel = (role: string) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!normalizedRole) return 'member';
  if (normalizedRole === 'admin') return 'admin';
  if (normalizedRole === 'seller') return 'seller';
  if (normalizedRole === 'buyer') return 'buyer';
  return normalizedRole;
};

const normalizeAdminWalletMember = (value: unknown): AdminWalletMemberItem | null => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const walletAddress = toText(source.walletAddress).trim();
  if (!walletAddress) {
    return null;
  }
  const nickname = toText(source.nickname).trim() || toText(source.name).trim() || '이름없음';
  const role = toText(source.role).trim() || (
    source.seller ? 'seller' : source.buyer ? 'buyer' : 'member'
  );
  const id = toText(source._id).trim() || walletAddress;

  return {
    id,
    nickname,
    role: toRoleLabel(role),
    walletAddress,
    createdAt: toText(source.createdAt).trim(),
  };
};

const normalizeAgentItem = (value: unknown): AgentItem | null => {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const agentcode = toText(source.agentcode).trim();
  if (!agentcode) {
    return null;
  }

  return {
    agentcode,
    agentName: toText(source.agentName).trim() || agentcode,
    agentLogo: toText(source.agentLogo).trim(),
    adminWalletAddress: toText(source.adminWalletAddress).trim(),
    totalStoreCount: toFiniteNumber(source.totalStoreCount),
  };
};

const getRiskLevel = (store: StoreItem): RiskLevel => {
  const hasCriticalWalletGap =
    !store.adminWalletAddress.trim() ||
    !store.sellerWalletAddress.trim() ||
    !store.settlementWalletAddress.trim();
  if (hasCriticalWalletGap || store.settlementFeePercent >= 4.5) {
    return 'alert';
  }

  if (store.totalPaymentConfirmedCount === 0 || store.totalSettlementCount === 0 || store.totalKrwAmount === 0) {
    return 'watch';
  }

  return 'stable';
};

const getRiskBadge = (level: RiskLevel) => {
  if (level === 'alert') {
    return {
      label: 'Alert',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }
  if (level === 'watch') {
    return {
      label: 'Watch',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }
  return {
    label: 'Stable',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
};

export default function StoreManagementPage() {
  const params = useParams<{ lang?: string | string[] }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? (langParam[0] || 'ko') : (langParam || 'ko');

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [creatingPaymentWalletStorecode, setCreatingPaymentWalletStorecode] = useState('');
  const [isAdminWalletModalOpen, setIsAdminWalletModalOpen] = useState(false);
  const [adminWalletModalStore, setAdminWalletModalStore] = useState<StoreItem | null>(null);
  const [adminWalletMembers, setAdminWalletMembers] = useState<AdminWalletMemberItem[]>([]);
  const [adminWalletHistory, setAdminWalletHistory] = useState<StoreAdminWalletRoleHistoryItem[]>([]);
  const [adminWalletSearchTerm, setAdminWalletSearchTerm] = useState('');
  const [selectedAdminWalletAddress, setSelectedAdminWalletAddress] = useState('');
  const [loadingAdminWalletMembers, setLoadingAdminWalletMembers] = useState(false);
  const [loadingAdminWalletHistory, setLoadingAdminWalletHistory] = useState(false);
  const [updatingAdminWallet, setUpdatingAdminWallet] = useState(false);
  const [adminWalletModalError, setAdminWalletModalError] = useState<string | null>(null);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [agentModalStore, setAgentModalStore] = useState<StoreItem | null>(null);
  const [agentOptions, setAgentOptions] = useState<AgentItem[]>([]);
  const [agentSearchTerm, setAgentSearchTerm] = useState('');
  const [selectedAgentcode, setSelectedAgentcode] = useState('');
  const [loadingAgentOptions, setLoadingAgentOptions] = useState(false);
  const [updatingStoreAgent, setUpdatingStoreAgent] = useState(false);
  const [agentModalError, setAgentModalError] = useState<string | null>(null);
  const [createModalError, setCreateModalError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<StoreCreateForm>(() => createInitialStoreForm());
  const [draftFilters, setDraftFilters] = useState({
    searchStore: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    searchStore: '',
  });

  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const initializedRef = useRef(false);

  const fetchStoreDashboard = useCallback(async (mode: FetchMode = 'query') => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    if (mode === 'polling') {
      setPolling(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/store/getAllStores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: pageSize,
          page: pageNumber,
          searchStore: appliedFilters.searchStore,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '가맹점 대시보드 데이터를 불러오지 못했습니다.',
        );
      }

      const rawStores = Array.isArray(payload?.result?.stores) ? payload.result.stores : [];
      const normalizedStores = rawStores.map(normalizeStore);
      const normalizedTotalCount = toFiniteNumber(payload?.result?.totalCount);

      if (!mountedRef.current) return;
      setStores(normalizedStores);
      setTotalCount(normalizedTotalCount);
      setLastUpdatedAt(new Date().toISOString());
      setError(null);
    } catch (fetchError: unknown) {
      if (!mountedRef.current) return;
      setError(fetchError instanceof Error ? fetchError.message : '가맹점 데이터를 조회하는 중 오류가 발생했습니다.');
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setPolling(false);
      }
    }
  }, [appliedFilters.searchStore, pageNumber, pageSize]);

  useEffect(() => {
    mountedRef.current = true;
    fetchStoreDashboard(initializedRef.current ? 'query' : 'initial');
    initializedRef.current = true;

    const intervalId = window.setInterval(() => {
      fetchStoreDashboard('polling');
    }, POLLING_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [fetchStoreDashboard]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  useEffect(() => {
    if (pageNumber > totalPages) {
      setPageNumber(totalPages);
    }
  }, [pageNumber, totalPages]);

  const stats = useMemo(() => {
    const totalKrwAmount = stores.reduce((sum, store) => sum + store.totalKrwAmount, 0);
    const totalUsdtAmount = stores.reduce((sum, store) => sum + store.totalUsdtAmount, 0);
    const totalSettlementAmountKRW = stores.reduce((sum, store) => sum + store.totalSettlementAmountKRW, 0);
    const activeStores = stores.filter((store) => store.totalPaymentConfirmedCount > 0).length;
    const avgFeePercent =
      stores.length > 0
        ? stores.reduce((sum, store) => sum + store.settlementFeePercent, 0) / stores.length
        : 0;
    const settlementCoverage =
      totalKrwAmount > 0 ? (totalSettlementAmountKRW / totalKrwAmount) * 100 : 0;

    return {
      totalKrwAmount,
      totalUsdtAmount,
      totalSettlementAmountKRW,
      activeStores,
      avgFeePercent,
      settlementCoverage,
    };
  }, [stores]);

  const topStores = useMemo(() => (
    [...stores]
      .sort((a, b) => b.totalKrwAmount - a.totalKrwAmount)
      .slice(0, 5)
  ), [stores]);

  const riskWatchlist = useMemo(() => {
    const rank: Record<RiskLevel, number> = {
      stable: 1,
      watch: 2,
      alert: 3,
    };

    return stores
      .map((store) => ({ store, risk: getRiskLevel(store) }))
      .sort((a, b) => {
        if (rank[b.risk] !== rank[a.risk]) {
          return rank[b.risk] - rank[a.risk];
        }
        return b.store.totalKrwAmount - a.store.totalKrwAmount;
      })
      .slice(0, 6);
  }, [stores]);

  const filteredAdminWalletMembers = useMemo(() => {
    const normalizedSearchTerm = adminWalletSearchTerm.trim().toLowerCase();
    if (!normalizedSearchTerm) {
      return adminWalletMembers;
    }
    return adminWalletMembers.filter((member) => {
      return (
        member.nickname.toLowerCase().includes(normalizedSearchTerm) ||
        member.walletAddress.toLowerCase().includes(normalizedSearchTerm) ||
        member.role.toLowerCase().includes(normalizedSearchTerm)
      );
    });
  }, [adminWalletMembers, adminWalletSearchTerm]);

  const filteredAgentOptions = useMemo(() => {
    const normalizedSearchTerm = agentSearchTerm.trim().toLowerCase();
    if (!normalizedSearchTerm) {
      return agentOptions;
    }
    return agentOptions.filter((agent) => {
      return (
        agent.agentName.toLowerCase().includes(normalizedSearchTerm) ||
        agent.agentcode.toLowerCase().includes(normalizedSearchTerm) ||
        agent.adminWalletAddress.toLowerCase().includes(normalizedSearchTerm)
      );
    });
  }, [agentOptions, agentSearchTerm]);

  const selectedAgentOption = useMemo(() => {
    const normalizedSelectedAgentcode = selectedAgentcode.trim().toLowerCase();
    if (!normalizedSelectedAgentcode) {
      return null;
    }
    return agentOptions.find((agent) => agent.agentcode.toLowerCase() === normalizedSelectedAgentcode) || null;
  }, [agentOptions, selectedAgentcode]);

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageNumber(1);
    setAppliedFilters({
      searchStore: draftFilters.searchStore.trim(),
    });
  };

  const handleFilterReset = () => {
    setDraftFilters({ searchStore: '' });
    setAppliedFilters({ searchStore: '' });
    setPageNumber(1);
  };

  const openCreateModal = () => {
    setCreateModalError(null);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = useCallback(() => {
    if (creatingStore) return;
    setIsCreateModalOpen(false);
    setCreateModalError(null);
    setCreateForm(createInitialStoreForm());
  }, [creatingStore]);

  const closeAdminWalletModal = useCallback(() => {
    if (updatingAdminWallet) return;
    setIsAdminWalletModalOpen(false);
    setAdminWalletModalStore(null);
    setAdminWalletMembers([]);
    setAdminWalletHistory([]);
    setAdminWalletSearchTerm('');
    setSelectedAdminWalletAddress('');
    setAdminWalletModalError(null);
  }, [updatingAdminWallet]);

  const closeAgentModal = useCallback(() => {
    if (updatingStoreAgent) return;
    setIsAgentModalOpen(false);
    setAgentModalStore(null);
    setAgentOptions([]);
    setAgentSearchTerm('');
    setSelectedAgentcode('');
    setAgentModalError(null);
  }, [updatingStoreAgent]);

  const loadAgentOptions = useCallback(async () => {
    setLoadingAgentOptions(true);
    try {
      const response = await fetch('/api/agent/getAllAgents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 300,
          page: 1,
          searchStore: '',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '에이전트 목록 조회에 실패했습니다.',
        );
      }

      const rawAgents: unknown[] = Array.isArray(payload?.result?.agents) ? payload.result.agents : [];
      const normalizedAgents = rawAgents
        .map((agent) => normalizeAgentItem(agent))
        .filter((agent: AgentItem | null): agent is AgentItem => agent !== null);

      const uniqueAgents = new Map<string, AgentItem>();
      normalizedAgents.forEach((agent) => {
        const key = agent.agentcode.toLowerCase();
        if (uniqueAgents.has(key)) return;
        uniqueAgents.set(key, agent);
      });

      const sortedAgents = Array.from(uniqueAgents.values()).sort((a, b) => (
        a.agentName.localeCompare(b.agentName, 'ko')
      ));
      setAgentOptions(sortedAgents);
    } catch (agentError: unknown) {
      const message = agentError instanceof Error ? agentError.message : '에이전트 목록 조회 중 오류가 발생했습니다.';
      setAgentModalError(message);
      setAgentOptions([]);
    } finally {
      setLoadingAgentOptions(false);
    }
  }, []);

  const openAgentModal = useCallback((store: StoreItem) => {
    const normalizedStorecode = store.storecode.trim();
    if (!normalizedStorecode) {
      toast.error('가맹점 코드가 없습니다.');
      return;
    }

    setAgentModalStore(store);
    setSelectedAgentcode(store.agentcode.trim());
    setAgentSearchTerm('');
    setAgentModalError(null);
    setIsAgentModalOpen(true);

    void loadAgentOptions();
  }, [loadAgentOptions]);

  const updateStoreAgentcode = useCallback(async () => {
    if (!agentModalStore) {
      return;
    }

    const nextAgentcode = selectedAgentcode.trim();
    if (!nextAgentcode) {
      setAgentModalError('변경할 에이전트를 선택해 주세요.');
      return;
    }

    setUpdatingStoreAgent(true);
    setAgentModalError(null);
    try {
      const response = await fetch('/api/store/updateAgentcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: agentModalStore.storecode,
          agentcode: nextAgentcode,
          changedByName: 'store-management-dashboard',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '에이전트 변경에 실패했습니다.',
        );
      }

      const isChanged = Boolean(payload?.changed);
      const resolvedNextAgentcode = toText(payload?.nextAgentcode).trim() || nextAgentcode;
      const resolvedNextAgentName = toText(payload?.nextAgentName).trim();
      const nextAgent = agentOptions.find((agent) => (
        agent.agentcode.toLowerCase() === resolvedNextAgentcode.toLowerCase()
      ));

      setStores((prev) => prev.map((store) => (
        store.storecode === agentModalStore.storecode
          ? {
            ...store,
            agentcode: resolvedNextAgentcode,
            agentName: resolvedNextAgentName || nextAgent?.agentName || store.agentName,
            agentLogo: nextAgent?.agentLogo || store.agentLogo,
          }
          : store
      )));
      setAgentModalStore((prev) => (
        prev
          ? {
            ...prev,
            agentcode: resolvedNextAgentcode,
            agentName: resolvedNextAgentName || nextAgent?.agentName || prev.agentName,
            agentLogo: nextAgent?.agentLogo || prev.agentLogo,
          }
          : prev
      ));
      setSelectedAgentcode(resolvedNextAgentcode);

      await fetchStoreDashboard('query');

      if (isChanged) {
        toast.success('가맹점 에이전트가 변경되었습니다.');
      } else {
        toast.success('변경할 내용이 없어 기존 에이전트를 유지했습니다.');
      }
    } catch (updateError: unknown) {
      const message = updateError instanceof Error ? updateError.message : '에이전트 변경 중 오류가 발생했습니다.';
      setAgentModalError(message);
      toast.error(message);
    } finally {
      setUpdatingStoreAgent(false);
    }
  }, [agentModalStore, agentOptions, fetchStoreDashboard, selectedAgentcode]);

  const loadAdminWalletMembers = useCallback(async (store: StoreItem) => {
    const normalizedStorecode = store.storecode.trim();
    const adminStorecode = 'admin';
    if (!normalizedStorecode) {
      setAdminWalletMembers([]);
      return;
    }

    setLoadingAdminWalletMembers(true);
    try {
      const response = await fetch('/api/user/getAllUsersByStorecode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: adminStorecode,
          limit: 300,
          page: 1,
          includeUnverified: true,
          requireProfile: false,
          userType: 'all',
          searchTerm: '',
          sortField: 'nickname',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '회원 목록 조회에 실패했습니다.',
        );
      }

      const users: unknown[] = Array.isArray(payload?.result?.users) ? payload.result.users : [];
      const normalizedMembers = users
        .map((user) => normalizeAdminWalletMember(user))
        .filter((member: AdminWalletMemberItem | null): member is AdminWalletMemberItem => member !== null);

      const uniqueMembersMap = new Map<string, AdminWalletMemberItem>();
      normalizedMembers.forEach((member) => {
        const key = member.walletAddress.trim().toLowerCase();
        if (!key || uniqueMembersMap.has(key)) return;
        uniqueMembersMap.set(key, member);
      });

      const currentAdminWalletAddress = store.adminWalletAddress.trim();
      if (isWalletAddress(currentAdminWalletAddress)) {
        const normalizedCurrentWalletAddress = currentAdminWalletAddress.toLowerCase();
        if (!uniqueMembersMap.has(normalizedCurrentWalletAddress)) {
          uniqueMembersMap.set(normalizedCurrentWalletAddress, {
            id: `current-admin-${normalizedStorecode}`,
            nickname: '현재 관리자',
            role: 'admin',
            walletAddress: currentAdminWalletAddress,
            createdAt: '',
          });
        }
      }

      const uniqueMembers = Array.from(uniqueMembersMap.values()).sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        return a.nickname.localeCompare(b.nickname, 'ko');
      });

      setAdminWalletMembers(uniqueMembers);
    } catch (membersError: unknown) {
      const message = membersError instanceof Error ? membersError.message : '회원 목록 조회 중 오류가 발생했습니다.';
      setAdminWalletModalError(message);
      setAdminWalletMembers([]);
    } finally {
      setLoadingAdminWalletMembers(false);
    }
  }, []);

  const loadAdminWalletHistory = useCallback(async (storecode: string) => {
    const normalizedStorecode = storecode.trim();
    if (!normalizedStorecode) {
      setAdminWalletHistory([]);
      return;
    }

    setLoadingAdminWalletHistory(true);
    try {
      const response = await fetch('/api/store/getStoreAdminWalletRoleHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: normalizedStorecode,
          limit: 20,
          page: 1,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '변경이력 조회에 실패했습니다.',
        );
      }

      const items = Array.isArray(payload?.result?.items) ? payload.result.items : [];
      const normalizedHistory = items.map((item: any, index: number) => ({
        id: toText(item?._id) || `${normalizedStorecode}-${index}`,
        prevAdminWalletAddress: toText(item?.prevAdminWalletAddress),
        nextAdminWalletAddress: toText(item?.nextAdminWalletAddress),
        changedByWalletAddress: toText(item?.changedByWalletAddress),
        changedByName: toText(item?.changedByName),
        changedAt: toText(item?.changedAt),
      }));

      setAdminWalletHistory(normalizedHistory);
    } catch (historyError: unknown) {
      const message = historyError instanceof Error ? historyError.message : '변경이력 조회 중 오류가 발생했습니다.';
      setAdminWalletModalError((prev) => prev || message);
      setAdminWalletHistory([]);
    } finally {
      setLoadingAdminWalletHistory(false);
    }
  }, []);

  const openAdminWalletModal = useCallback((store: StoreItem) => {
    if (!store.storecode.trim()) {
      toast.error('가맹점 코드가 없습니다.');
      return;
    }
    setAdminWalletModalStore(store);
    setSelectedAdminWalletAddress(store.adminWalletAddress.trim());
    setAdminWalletSearchTerm('');
    setAdminWalletModalError(null);
    setIsAdminWalletModalOpen(true);

    void Promise.all([
      loadAdminWalletMembers(store),
      loadAdminWalletHistory(store.storecode),
    ]);
  }, [loadAdminWalletHistory, loadAdminWalletMembers]);

  const updateAdminWalletAddress = useCallback(async () => {
    if (!adminWalletModalStore) {
      return;
    }

    const nextAdminWalletAddress = selectedAdminWalletAddress.trim();
    if (!isWalletAddress(nextAdminWalletAddress)) {
      setAdminWalletModalError('유효한 지갑주소를 선택해 주세요.');
      return;
    }

    setUpdatingAdminWallet(true);
    setAdminWalletModalError(null);
    try {
      const response = await fetch('/api/store/updateStoreAdminWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: adminWalletModalStore.storecode,
          adminWalletAddress: nextAdminWalletAddress,
          changedByName: 'store-management-dashboard',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '관리자 지갑 변경에 실패했습니다.',
        );
      }

      const isChanged = Boolean(payload?.changed);

      setStores((prev) => prev.map((store) => (
        store.storecode === adminWalletModalStore.storecode
          ? { ...store, adminWalletAddress: nextAdminWalletAddress }
          : store
      )));
      setAdminWalletModalStore((prev) => (
        prev ? { ...prev, adminWalletAddress: nextAdminWalletAddress } : prev
      ));

      await Promise.all([
        fetchStoreDashboard('query'),
        loadAdminWalletHistory(adminWalletModalStore.storecode),
      ]);

      if (isChanged) {
        toast.success('가맹점 관리자 지갑이 변경되었습니다.');
      } else {
        toast.success('변경할 내용이 없어 기존 관리자 지갑을 유지했습니다.');
      }
    } catch (updateError: unknown) {
      const message = updateError instanceof Error ? updateError.message : '관리자 지갑 변경 중 오류가 발생했습니다.';
      setAdminWalletModalError(message);
      toast.error(message);
    } finally {
      setUpdatingAdminWallet(false);
    }
  }, [adminWalletModalStore, fetchStoreDashboard, loadAdminWalletHistory, selectedAdminWalletAddress]);

  const submitCreateStore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingStore) return;

    const storeName = createForm.storeName.trim();
    const storeType = 'store';
    const storeUrl = '';
    const storeDescription = createForm.storeDescription.trim();
    const storeLogo = createForm.storeLogo.trim();
    const storeBanner = createForm.storeBanner.trim();

    if (storeName.length < 2) {
      setCreateModalError('가맹점 이름은 2자 이상이어야 합니다.');
      return;
    }
    if (storeName.length > 24) {
      setCreateModalError('가맹점 이름은 24자 이하여야 합니다.');
      return;
    }
    if (!storeLogo) {
      setCreateModalError('가맹점 로고를 업로드해주세요.');
      return;
    }
    if (!storeBanner) {
      setCreateModalError('가맹점 배너를 업로드해주세요.');
      return;
    }

    setCreatingStore(true);
    setCreateModalError(null);

    try {
      const response = await fetch('/api/store/setStore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName,
          storeType,
          storeUrl,
          storeDescription,
          storeLogo,
          storeBanner,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error('가맹점 생성 요청에 실패했습니다.');
      }
      if (!payload?.result) {
        throw new Error('동일한 가맹점 코드 또는 이름이 이미 존재합니다.');
      }

      const createdStoreCode = toText(payload?.result?.storecode) || '-';
      toast.success(`가맹점이 생성되었습니다 (${createdStoreCode})`);
      setIsCreateModalOpen(false);
      setCreateForm(createInitialStoreForm());
      setPageNumber(1);
      await fetchStoreDashboard('query');
    } catch (createError: unknown) {
      const message = createError instanceof Error ? createError.message : '가맹점 생성 중 오류가 발생했습니다.';
      setCreateModalError(message);
      toast.error(message);
    } finally {
      setCreatingStore(false);
    }
  };

  const handleCreatePaymentWallet = useCallback(async (storecode: string) => {
    const normalizedStorecode = storecode.trim();
    if (!normalizedStorecode) {
      toast.error('가맹점 코드가 없습니다.');
      return;
    }
    if (creatingPaymentWalletStorecode) {
      return;
    }

    setCreatingPaymentWalletStorecode(normalizedStorecode);

    try {
      const response = await fetch('/api/store/createPaymentWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: normalizedStorecode,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '결제 지갑 생성 요청에 실패했습니다.',
        );
      }

      const paymentWalletAddress = toText(payload?.result?.paymentWalletAddress).trim();
      if (!isWalletAddress(paymentWalletAddress)) {
        throw new Error('생성된 결제 지갑주소가 유효하지 않습니다.');
      }

      setStores((prev) => prev.map((store) => (
        store.storecode === normalizedStorecode
          ? { ...store, paymentWalletAddress }
          : store
      )));

      const created = Boolean(payload?.result?.created);
      toast.success(created ? '결제용 서버지갑이 생성되었습니다.' : '이미 생성된 결제지갑을 불러왔습니다.');
      await fetchStoreDashboard('query');
    } catch (createError: unknown) {
      const message = createError instanceof Error ? createError.message : '결제 지갑 생성 중 오류가 발생했습니다.';
      toast.error(message);
    } finally {
      setCreatingPaymentWalletStorecode('');
    }
  }, [creatingPaymentWalletStorecode, fetchStoreDashboard]);

  const uploadImageToBlob = useCallback(async (file: File, kind: 'logo' | 'banner') => {
    if (!file.type.startsWith('image/')) {
      setCreateModalError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    if (kind === 'logo') {
      setUploadingLogo(true);
    } else {
      setUploadingBanner(true);
    }
    setCreateModalError(null);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || '이미지 업로드에 실패했습니다.');
      }

      const payload = await response.json().catch(() => ({}));
      const uploadedUrl = toText(payload?.url);
      if (!uploadedUrl) {
        throw new Error('업로드 URL을 받지 못했습니다.');
      }

      setCreateForm((prev) => (
        kind === 'logo'
          ? { ...prev, storeLogo: uploadedUrl }
          : { ...prev, storeBanner: uploadedUrl }
      ));
      toast.success(kind === 'logo' ? '로고 업로드 완료' : '배너 업로드 완료');
    } catch (uploadError: unknown) {
      const message = uploadError instanceof Error ? uploadError.message : '이미지 업로드 중 오류가 발생했습니다.';
      setCreateModalError(message);
      toast.error(message);
    } finally {
      if (kind === 'logo') {
        setUploadingLogo(false);
      } else {
        setUploadingBanner(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isCreateModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creatingStore) {
        closeCreateModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeCreateModal, creatingStore, isCreateModalOpen]);

  useEffect(() => {
    if (!isAdminWalletModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !updatingAdminWallet) {
        closeAdminWalletModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeAdminWalletModal, isAdminWalletModalOpen, updatingAdminWallet]);

  useEffect(() => {
    if (!isAgentModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !updatingStoreAgent) {
        closeAgentModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeAgentModal, isAgentModalOpen, updatingStoreAgent]);

  return (
    <main className="store-management-shell relative min-h-screen overflow-hidden px-4 pb-20 pt-6 lg:px-6 lg:pt-8">
      <div className="decor-orb decor-orb-a" />
      <div className="decor-orb decor-orb-b" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
        <section className="reveal-up rounded-3xl border border-teal-100/80 bg-white/85 p-5 shadow-[0_34px_84px_-60px_rgba(13,148,136,0.72)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="frosted-mark inline-flex h-12 w-12 items-center justify-center rounded-2xl">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-teal-900" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 12h16" />
                  <path d="M6 7h12" />
                  <path d="M8 17h8" />
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-teal-700">Merchant Finance Desk</p>
                <h1 className="text-xl font-bold text-slate-900">가맹점 관리 대시보드</h1>
                <p className="text-sm text-slate-600">
                  금융앱 스타일 모니터링 화면으로 가맹점 흐름, 정산 비중, 위험 신호를 한 번에 확인합니다.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <span className={`h-2.5 w-2.5 rounded-full ${polling ? 'animate-pulse bg-emerald-500' : 'bg-emerald-400'}`} />
                {polling ? '동기화 중' : '15초 자동 동기화'}
              </span>
              <button
                type="button"
                onClick={() => fetchStoreDashboard('query')}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                수동 새로고침
              </button>
            </div>
          </div>
        </section>

        <section className="reveal-up rounded-2xl border border-slate-200/80 bg-white/88 p-4 shadow-[0_18px_42px_-30px_rgba(15,23,42,0.35)] backdrop-blur" style={{ animationDelay: '90ms' }}>
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-12" onSubmit={handleFilterSubmit}>
            <div className="lg:col-span-7">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                가맹점명 / 코드
              </label>
              <input
                type="text"
                value={draftFilters.searchStore}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchStore: event.target.value }))}
                placeholder="예: 서울센터 또는 STORE001"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                페이지 크기
              </label>
              <select
                value={pageSize}
                onChange={(event) => {
                  const nextSize = toFiniteNumber(event.target.value) || DEFAULT_PAGE_SIZE;
                  setPageSize(nextSize);
                  setPageNumber(1);
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-500"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}개
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3 flex items-end justify-end gap-2">
              <button
                type="button"
                onClick={handleFilterReset}
                className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                초기화
              </button>
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-600"
              >
                조회
              </button>
            </div>
          </form>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="reveal-up rounded-2xl border border-teal-100 bg-[linear-gradient(145deg,#f0fdfa_0%,#ccfbf1_100%)] p-4 shadow-[0_20px_40px_-30px_rgba(15,118,110,0.5)]" style={{ animationDelay: '160ms' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">등록 가맹점</p>
            <p className="mt-2 text-3xl font-bold text-teal-950">{totalCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-teal-700/90">필터 기준 전체 건수</p>
          </article>
          <article className="reveal-up rounded-2xl border border-emerald-100 bg-[linear-gradient(145deg,#f0fdf4_0%,#dcfce7_100%)] p-4 shadow-[0_20px_40px_-30px_rgba(22,163,74,0.45)]" style={{ animationDelay: '220ms' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">활성 가맹점</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{stats.activeStores.toLocaleString()}</p>
            <p className="mt-1 text-xs text-emerald-700/90">결제확정 거래가 있는 가맹점</p>
          </article>
          <article className="reveal-up rounded-2xl border border-sky-100 bg-[linear-gradient(145deg,#f0f9ff_0%,#dbeafe_100%)] p-4 shadow-[0_20px_40px_-30px_rgba(14,116,144,0.45)]" style={{ animationDelay: '280ms' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">페이지 거래금액</p>
            <p className="mt-2 text-3xl font-bold text-sky-900">{formatKrw(stats.totalKrwAmount)}</p>
            <p className="mt-1 text-xs text-sky-700/90">{formatUsdt(stats.totalUsdtAmount)} USDT</p>
          </article>
          <article className="reveal-up rounded-2xl border border-amber-100 bg-[linear-gradient(145deg,#fffbeb_0%,#fef3c7_100%)] p-4 shadow-[0_20px_40px_-30px_rgba(217,119,6,0.5)]" style={{ animationDelay: '340ms' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">정산 커버리지</p>
            <p className="mt-2 text-3xl font-bold text-amber-900">{stats.settlementCoverage.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-amber-700/90">평균 수수료 {stats.avgFeePercent.toFixed(2)}%</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <article className="reveal-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_22px_52px_-34px_rgba(15,23,42,0.42)] xl:col-span-7" style={{ animationDelay: '420ms' }}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Top 5 거래 가맹점</p>
                <p className="text-xs text-slate-500">현재 조회 페이지 기준 KRW 거래금액 순</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                정산합계 {formatKrw(stats.totalSettlementAmountKRW)}원
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {topStores.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">표시할 가맹점이 없습니다.</div>
              ) : (
                topStores.map((store, index) => (
                  <div key={`${store.storecode || store._id || 'store'}-${index}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                          {index + 1}
                        </span>
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {store.storeName || '-'}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        코드 {store.storecode || '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{formatKrw(store.totalKrwAmount)}원</p>
                      <p className="text-xs text-slate-500">{formatUsdt(store.totalUsdtAmount)} USDT</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="reveal-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_22px_52px_-34px_rgba(15,23,42,0.42)] xl:col-span-5" style={{ animationDelay: '500ms' }}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">리스크 워치리스트</p>
                <p className="text-xs text-slate-500">지갑 누락/낮은 활동/높은 수수료 감시</p>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {riskWatchlist.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">감시 대상이 없습니다.</div>
              ) : (
                riskWatchlist.map(({ store, risk }, index) => {
                  const badge = getRiskBadge(risk);
                  return (
                    <div key={`${store.storecode || store._id || 'risk'}-${index}`} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{store.storeName || '-'}</p>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        수수료 {store.settlementFeePercent.toFixed(2)}% · 결제확정 {store.totalPaymentConfirmedCount.toLocaleString()}건
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        정산지갑 {shortWallet(store.settlementWalletAddress)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>

        <section className="reveal-up overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_28px_60px_-42px_rgba(15,23,42,0.45)]" style={{ animationDelay: '560ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">가맹점 거래/정산 현황</p>
              <p className="text-xs text-slate-500">
                마지막 갱신 {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'} · {polling ? '자동 동기화 중' : '대기 중'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center rounded-full bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-600"
              >
                가맹점 추가
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={`loading-skeleton-${index}`} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : stores.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">조회 조건에 맞는 가맹점이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-[220px] px-4 py-3">가맹점</th>
                    <th className="w-[130px] px-4 py-3">에이전트</th>
                    <th className="px-4 py-3 text-right">결제확정</th>
                    <th className="px-4 py-3 text-right">거래금액</th>
                    <th className="px-4 py-3 text-right">정산금액</th>
                    <th className="px-4 py-3 text-right">수수료율</th>
                    <th className="px-4 py-3">관리자</th>
                    <th className="px-4 py-3">지갑상태</th>
                    <th className="w-[260px] px-4 py-3 text-right whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stores.map((store, index) => {
                    const risk = getRiskLevel(store);
                    const badge = getRiskBadge(risk);
                    const hasStoreCode = !!store.storecode.trim();
                    const hasAllWallets =
                      !!store.adminWalletAddress.trim() &&
                      !!store.sellerWalletAddress.trim() &&
                      !!store.settlementWalletAddress.trim();
                    const hasPaymentWallet = isWalletAddress(store.paymentWalletAddress.trim());
                    const isCreatingPaymentWallet = creatingPaymentWalletStorecode === store.storecode;

                    return (
                      <tr key={`${store.storecode || store._id || 'table-store'}-${index}`} className="bg-white text-sm text-slate-700">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-3">
                            <span
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
                              style={{ backgroundColor: store.backgroundColor || '#f1f5f9' }}
                            >
                              {store.storeLogo ? (
                                <div
                                  className="h-full w-full bg-cover bg-center"
                                  style={{ backgroundImage: `url(${encodeURI(store.storeLogo)})` }}
                                  aria-label={store.storeName || store.storecode || 'store logo'}
                                />
                              ) : (
                                (store.storeName || store.storecode || 'S').slice(0, 1)
                              )}
                            </span>
                            <div className="min-w-0 space-y-1.5">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">가맹점정보</p>
                                <p className="break-all whitespace-normal font-semibold text-slate-900">{store.storeName || '-'}</p>
                                <p className="text-xs text-slate-500">코드 {store.storecode || '-'}</p>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                <p className="font-semibold uppercase tracking-[0.08em] text-slate-500">등록일</p>
                                <p>{formatDateTime(store.createdAt)}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                                {store.agentLogo ? (
                                  <div
                                    className="h-full w-full bg-cover bg-center"
                                    style={{ backgroundImage: `url(${encodeURI(store.agentLogo)})` }}
                                    aria-label={store.agentName || store.agentcode || 'agent logo'}
                                  />
                                ) : (
                                  (store.agentName || store.agentcode || 'A').slice(0, 1)
                                )}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {store.agentName || '-'}
                                </p>
                                <p className="truncate text-[11px] text-slate-500">
                                  코드 {store.agentcode || '-'}
                                </p>
                              </div>
                            </div>
                            {hasStoreCode && (
                              <button
                                type="button"
                                onClick={() => openAgentModal(store)}
                                className="inline-flex w-fit items-center rounded-full border border-violet-300 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100"
                              >
                                변경하기
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-slate-900">{store.totalPaymentConfirmedCount.toLocaleString()}건</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-slate-900">{formatKrw(store.totalKrwAmount)}원</span>
                            <span className="text-xs text-slate-500">{formatUsdt(store.totalUsdtAmount)} USDT</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-slate-900">{formatKrw(store.totalSettlementAmountKRW)}원</span>
                            <span className="text-xs text-slate-500">{store.totalSettlementCount.toLocaleString()}건</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-slate-900">{store.settlementFeePercent.toFixed(2)}%</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-slate-900">
                              {store.adminNickname || '-'}
                            </span>
                            <span className={`break-all text-[11px] font-medium ${isWalletAddress(store.adminWalletAddress.trim()) ? 'text-sky-700' : 'text-amber-700'}`}>
                              {store.adminWalletAddress ? shortWallet(store.adminWalletAddress) : '지갑 미설정'}
                            </span>
                            {hasStoreCode && (
                              <button
                                type="button"
                                onClick={() => openAdminWalletModal(store)}
                                className="mt-1 inline-flex w-fit items-center rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100"
                              >
                                관리자 변경
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                            <span className={`text-xs font-medium ${hasAllWallets ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {hasAllWallets ? '핵심 지갑 정상' : '지갑 정보 점검 필요'}
                            </span>
                            <span className={`text-xs font-medium ${hasPaymentWallet ? 'text-emerald-700' : 'text-amber-700'}`}>
                              결제지갑 {hasPaymentWallet ? shortWallet(store.paymentWalletAddress) : '미설정'}
                            </span>
                            {!hasPaymentWallet && hasStoreCode && (
                              <button
                                type="button"
                                onClick={() => handleCreatePaymentWallet(store.storecode)}
                                disabled={isCreatingPaymentWallet}
                                className="inline-flex w-fit items-center rounded-full border border-cyan-300 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isCreatingPaymentWallet ? '생성 중...' : '결제지갑 생성하기'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="w-[260px] px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex flex-wrap justify-end gap-2">
                            {hasStoreCode ? (
                              <>
                                <Link
                                  href={`/${lang}/administration/store-management/${store.storecode}/seller-settings`}
                                  className="inline-flex shrink-0 items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                >
                                  판매자 설정
                                </Link>
                                <Link
                                  href={`/${lang}/administration/store/${store.storecode}`}
                                  className="inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  상세
                                </Link>
                                <Link
                                  href={`/${lang}/administration/store/${store.storecode}/settings`}
                                  className="inline-flex shrink-0 items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                                >
                                  설정
                                </Link>
                              </>
                            ) : (
                              <span className="inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">
                                코드 없음
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <div className="text-xs text-slate-500">
              페이지 {pageNumber.toLocaleString()} / {totalPages.toLocaleString()} · 총 {totalCount.toLocaleString()}건
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageNumber(1)}
                disabled={pageNumber <= 1 || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                처음
              </button>
              <button
                type="button"
                onClick={() => setPageNumber((prev) => Math.max(1, prev - 1))}
                disabled={pageNumber <= 1 || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-sm font-semibold text-slate-700">
                {pageNumber.toLocaleString()} / {totalPages.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setPageNumber((prev) => Math.min(totalPages, prev + 1))}
                disabled={pageNumber >= totalPages || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => setPageNumber(totalPages)}
                disabled={pageNumber >= totalPages || loading}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                마지막
              </button>
            </div>
          </div>
        </section>
      </div>

      {isAgentModalOpen && agentModalStore && (
        <div className="fixed inset-0 z-[132] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
            aria-label="가맹점 에이전트 변경 모달 닫기"
            onClick={closeAgentModal}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="가맹점 에이전트 변경"
            className="modal-pop relative z-[133] max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-violet-100 bg-white shadow-[0_40px_90px_-42px_rgba(15,23,42,0.75)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-700">Store Agent Control</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">가맹점 에이전트 변경</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {agentModalStore.storeName || '-'} · 코드 {agentModalStore.storecode || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAgentModal}
                disabled={updatingStoreAgent}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="닫기"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-12">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">변경할 에이전트 목록</p>
                    <p className="text-xs text-slate-500">에이전트를 선택하고 변경하기를 눌러 적용하세요.</p>
                  </div>
                  <span className="inline-flex rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                    현재 코드 {agentModalStore.agentcode || '-'}
                  </span>
                </div>

                <div className="mt-3">
                  <input
                    type="text"
                    value={agentSearchTerm}
                    onChange={(event) => setAgentSearchTerm(event.target.value)}
                    placeholder="에이전트명/코드/관리자지갑 검색"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-500"
                  />
                </div>

                <div className="mt-3 max-h-[380px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {loadingAgentOptions ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={`agent-loading-${index}`} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                      ))}
                    </div>
                  ) : filteredAgentOptions.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-slate-500">표시할 에이전트가 없습니다.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filteredAgentOptions.map((agent) => {
                        const isSelected = agent.agentcode.toLowerCase() === selectedAgentcode.trim().toLowerCase();
                        return (
                          <button
                            type="button"
                            key={agent.agentcode}
                            onClick={() => setSelectedAgentcode(agent.agentcode)}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                              isSelected ? 'bg-violet-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                                {agent.agentLogo ? (
                                  <div
                                    className="h-full w-full bg-cover bg-center"
                                    style={{ backgroundImage: `url(${encodeURI(agent.agentLogo)})` }}
                                    aria-label={agent.agentName || agent.agentcode || 'agent logo'}
                                  />
                                ) : (
                                  (agent.agentName || agent.agentcode || 'A').slice(0, 1)
                                )}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{agent.agentName}</p>
                                <p className="truncate text-xs text-slate-500">
                                  코드 {agent.agentcode} · 가맹점 {agent.totalStoreCount.toLocaleString()}개
                                </p>
                              </div>
                            </div>
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-violet-600 bg-violet-600 text-white'
                                : 'border-slate-300 bg-white text-transparent'
                            }`}>
                              ✓
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-5">
                <p className="text-sm font-semibold text-slate-900">변경 요약</p>
                <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <span>현재 에이전트</span>
                    <span className="font-semibold text-slate-800">
                      {agentModalStore.agentName || '-'} ({agentModalStore.agentcode || '-'})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>선택 에이전트</span>
                    <span className="font-semibold text-slate-800">
                      {selectedAgentOption ? `${selectedAgentOption.agentName} (${selectedAgentOption.agentcode})` : '-'}
                    </span>
                  </div>
                </div>

                {agentModalError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    {agentModalError}
                  </p>
                )}

                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeAgentModal}
                    disabled={updatingStoreAgent}
                    className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={updateStoreAgentcode}
                    disabled={updatingStoreAgent || !selectedAgentcode.trim()}
                    className="inline-flex h-10 items-center rounded-full bg-violet-700 px-3.5 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingStoreAgent ? '변경 중...' : '에이전트 변경'}
                  </button>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}

      {isAdminWalletModalOpen && adminWalletModalStore && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
            aria-label="관리자 지갑 변경 모달 닫기"
            onClick={closeAdminWalletModal}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="가맹점 관리자 지갑 변경"
            className="modal-pop relative z-[131] max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-sky-100 bg-white shadow-[0_40px_90px_-42px_rgba(15,23,42,0.75)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-700">Admin Wallet Control</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">가맹점 관리자 지갑 변경</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {adminWalletModalStore.storeName || '-'} · 코드 {adminWalletModalStore.storecode || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAdminWalletModal}
                disabled={updatingAdminWallet}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="닫기"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-12">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">회원 지갑 목록</p>
                    <p className="text-xs text-slate-500">회원 중에서 관리자 지갑으로 사용할 주소를 선택하세요.</p>
                  </div>
                  <span className="inline-flex rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                    현재 {shortWallet(adminWalletModalStore.adminWalletAddress)}
                  </span>
                </div>

                <div className="mt-3">
                  <input
                    type="text"
                    value={adminWalletSearchTerm}
                    onChange={(event) => setAdminWalletSearchTerm(event.target.value)}
                    placeholder="닉네임/지갑주소/role 검색"
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-500"
                  />
                </div>

                <div className="mt-3 max-h-[380px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {loadingAdminWalletMembers ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={`admin-wallet-member-loading-${index}`} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                      ))}
                    </div>
                  ) : filteredAdminWalletMembers.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-slate-500">표시할 회원 지갑이 없습니다.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filteredAdminWalletMembers.map((member) => {
                        const isSelected = member.walletAddress.toLowerCase() === selectedAdminWalletAddress.trim().toLowerCase();
                        return (
                          <button
                            type="button"
                            key={`${member.id}-${member.walletAddress}`}
                            onClick={() => setSelectedAdminWalletAddress(member.walletAddress)}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                              isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{member.nickname}</p>
                              <p className="truncate text-xs text-slate-500">
                                {shortWallet(member.walletAddress)} · role {member.role}
                                {member.createdAt ? ` · ${formatDateTime(member.createdAt)}` : ''}
                              </p>
                            </div>
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-sky-600 bg-sky-600 text-white'
                                : 'border-slate-300 bg-white text-transparent'
                            }`}>
                              ✓
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-5">
                <p className="text-sm font-semibold text-slate-900">변경 요약</p>
                <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <span>현재 관리자</span>
                    <span className="font-semibold text-slate-800">{shortWallet(adminWalletModalStore.adminWalletAddress)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>선택 지갑</span>
                    <span className="font-semibold text-slate-800">
                      {selectedAdminWalletAddress ? shortWallet(selectedAdminWalletAddress) : '-'}
                    </span>
                  </div>
                </div>

                {adminWalletModalError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    {adminWalletModalError}
                  </p>
                )}

                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeAdminWalletModal}
                    disabled={updatingAdminWallet}
                    className="inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={updateAdminWalletAddress}
                    disabled={updatingAdminWallet || !isWalletAddress(selectedAdminWalletAddress)}
                    className="inline-flex h-10 items-center rounded-full bg-sky-700 px-3.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingAdminWallet ? '변경 중...' : '관리자 지갑 변경'}
                  </button>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-3">
                  <p className="text-sm font-semibold text-slate-900">관리자 역할 변경이력</p>
                  <p className="mt-1 text-xs text-slate-500">최근 변경 순으로 표시됩니다.</p>

                  <div className="mt-2 max-h-[230px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                    {loadingAdminWalletHistory ? (
                      <div className="space-y-2 p-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div key={`admin-wallet-history-loading-${index}`} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                        ))}
                      </div>
                    ) : adminWalletHistory.length === 0 ? (
                      <div className="px-3 py-6 text-center text-xs text-slate-500">변경이력이 없습니다.</div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {adminWalletHistory.map((item) => (
                          <div key={item.id} className="px-3 py-2.5 text-xs text-slate-600">
                            <p className="font-semibold text-slate-800">
                              {shortWallet(item.prevAdminWalletAddress)} → {shortWallet(item.nextAdminWalletAddress)}
                            </p>
                            <p className="mt-0.5">
                              {item.changedByName ? `${item.changedByName}` : 'dashboard'}{item.changedByWalletAddress ? ` (${shortWallet(item.changedByWalletAddress)})` : ''}
                            </p>
                            <p className="mt-0.5 text-slate-500">{formatDateTime(item.changedAt)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="가맹점 추가 모달 닫기"
            onClick={closeCreateModal}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="가맹점 추가"
            className="modal-pop relative z-[121] max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-teal-100 bg-white shadow-[0_40px_90px_-42px_rgba(15,23,42,0.7)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-teal-700">Merchant Onboarding</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">가맹점 추가</h2>
                <p className="mt-1 text-sm text-slate-500">로고/배너 업로드 후 즉시 가맹점 코드를 발급합니다.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creatingStore}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="닫기"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </header>

            <form className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2" onSubmit={submitCreateStore}>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  가맹점 이름 *
                </label>
                <input
                  type="text"
                  maxLength={24}
                  value={createForm.storeName}
                  disabled={creatingStore}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, storeName: event.target.value }))}
                  placeholder="예: 서울강남센터"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  설명
                </label>
                <textarea
                  rows={2}
                  value={createForm.storeDescription}
                  disabled={creatingStore}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, storeDescription: event.target.value }))}
                  placeholder="가맹점 소개"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  로고 *
                </label>
                <div className="space-y-2 rounded-xl border border-slate-300 bg-white p-2">
                  <div className="relative h-24 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {createForm.storeLogo ? (
                      <Image
                        src={createForm.storeLogo}
                        alt="Store logo"
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="300px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-400">
                        로고 미리보기
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={creatingStore || uploadingLogo || uploadingBanner}
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      await uploadImageToBlob(file, 'logo');
                      input.value = '';
                    }}
                    className="w-full text-xs text-slate-700 file:mr-2 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
                  />
                  <p className="text-[11px] text-slate-500">
                    {uploadingLogo ? '로고 업로드 중...' : '이미지 선택 시 Vercel Blob으로 업로드됩니다.'}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  배너 *
                </label>
                <div className="space-y-2 rounded-xl border border-slate-300 bg-white p-2">
                  <div className="relative h-24 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {createForm.storeBanner ? (
                      <Image
                        src={createForm.storeBanner}
                        alt="Store banner"
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="300px"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-400">
                        배너 미리보기
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={creatingStore || uploadingLogo || uploadingBanner}
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (!file) return;
                      await uploadImageToBlob(file, 'banner');
                      input.value = '';
                    }}
                    className="w-full text-xs text-slate-700 file:mr-2 file:rounded-full file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
                  />
                  <p className="text-[11px] text-slate-500">
                    {uploadingBanner ? '배너 업로드 중...' : '이미지 선택 시 Vercel Blob으로 업로드됩니다.'}
                  </p>
                </div>
              </div>

              {createModalError && (
                <p className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {createModalError}
                </p>
              )}

              <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={creatingStore}
                  className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creatingStore || uploadingLogo || uploadingBanner}
                  className="inline-flex h-11 items-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingStore ? '생성 중...' : uploadingLogo || uploadingBanner ? '업로드 중...' : '가맹점 생성'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <style jsx>{`
        .store-management-shell {
          background:
            radial-gradient(circle at 12% 18%, rgba(20, 184, 166, 0.2), transparent 42%),
            radial-gradient(circle at 88% 14%, rgba(251, 191, 36, 0.18), transparent 36%),
            linear-gradient(180deg, #f0fdfa 0%, #f8fafc 48%, #eef2ff 100%);
          font-family: "Space Grotesk", "IBM Plex Sans KR", "Noto Sans KR", sans-serif;
        }

        .decor-orb {
          pointer-events: none;
          position: absolute;
          border-radius: 9999px;
          filter: blur(40px);
          opacity: 0.45;
          animation: float-drift 8s ease-in-out infinite;
        }

        .decor-orb-a {
          left: -90px;
          top: 120px;
          height: 260px;
          width: 260px;
          background: linear-gradient(145deg, rgba(20, 184, 166, 0.5), rgba(16, 185, 129, 0.25));
        }

        .decor-orb-b {
          right: -110px;
          top: 300px;
          height: 300px;
          width: 300px;
          background: linear-gradient(145deg, rgba(251, 191, 36, 0.45), rgba(245, 158, 11, 0.2));
          animation-delay: 0.9s;
        }

        .frosted-mark {
          background: linear-gradient(160deg, rgba(204, 251, 241, 0.9), rgba(153, 246, 228, 0.72));
          border: 1px solid rgba(20, 184, 166, 0.25);
        }

        .reveal-up {
          opacity: 0;
          transform: translateY(14px);
          animation: reveal-up 560ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        }

        .modal-pop {
          animation: modal-pop 180ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        @keyframes reveal-up {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes modal-pop {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes float-drift {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(0, -14px, 0);
          }
        }
      `}</style>
    </main>
  );
}
