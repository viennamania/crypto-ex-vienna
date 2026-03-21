'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';

import AgentInfoCard from '../_components/AgentInfoCard';
import { useSmartAccountAuth } from '../_useSmartAccountAuth';
import {
  fetchAgentSummary,
  fetchStoresByAgent,
  formatKrw,
  formatUsdt,
  shortAddress,
  toDateTime,
  type AgentStoreItem,
  type AgentSummary,
} from '../_shared';

const formatAppliedRate = (value: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '-';
  }
  return `1 USDT = ${new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric)} KRW`;
};

type StoreUsdtToKrwRateHistoryItem = {
  id: string;
  prevUsdtToKrwRate: number;
  nextUsdtToKrwRate: number;
  changedByWalletAddress: string;
  changedByName: string;
  changedAt: string;
};

type StoreAdminWalletMemberItem = {
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

type StoreCreateForm = {
  storeName: string;
  storeDescription: string;
  storeLogo: string;
  storeBanner: string;
};

const createInitialStoreForm = (): StoreCreateForm => ({
  storeName: '',
  storeDescription: '',
  storeLogo: '',
  storeBanner: '',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const toText = (value: unknown) => (typeof value === 'string' ? value : '');
const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const toRoleLabel = (value: unknown) => {
  const normalizedRole = toText(value).trim().toLowerCase();
  if (!normalizedRole) return 'member';
  if (normalizedRole === 'admin') return 'admin';
  if (normalizedRole === 'seller') return 'seller';
  if (normalizedRole === 'buyer') return 'buyer';
  return normalizedRole;
};
const normalizeAdminWalletMember = (value: unknown): StoreAdminWalletMemberItem | null => {
  const source = isRecord(value) ? value : {};
  const walletAddress = toText(source.walletAddress).trim();
  if (!isWalletAddress(walletAddress)) {
    return null;
  }

  return {
    id: toText(source._id).trim() || toText(source.id).trim() || walletAddress,
    nickname: toText(source.nickname).trim() || '이름없음',
    role: toRoleLabel(
      source.role
      ?? (source.seller ? 'seller' : source.buyer ? 'buyer' : 'member'),
    ),
    walletAddress,
    createdAt: toText(source.createdAt).trim(),
  };
};
const STORE_WALLET_BALANCE_BATCH_SIZE = 500;
const STORE_WALLET_BALANCE_COOLDOWN_MS = 10_000;

export default function P2PAgentStoreManagementPage() {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();
  const { activeAccount, buildSignedRequestBody } = useSmartAccountAuth(agentcode || 'admin');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [stores, setStores] = useState<AgentStoreItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [storeNotice, setStoreNotice] = useState<string | null>(null);
  const [rateNotice, setRateNotice] = useState<string | null>(null);
  const [rateModalStore, setRateModalStore] = useState<AgentStoreItem | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateHistory, setRateHistory] = useState<StoreUsdtToKrwRateHistoryItem[]>([]);
  const [loadingRateHistory, setLoadingRateHistory] = useState(false);
  const [rateHistoryError, setRateHistoryError] = useState<string | null>(null);
  const [adminWalletModalStore, setAdminWalletModalStore] = useState<AgentStoreItem | null>(null);
  const [adminWalletMembers, setAdminWalletMembers] = useState<StoreAdminWalletMemberItem[]>([]);
  const [selectedAdminWalletAddress, setSelectedAdminWalletAddress] = useState('');
  const [adminWalletSearchTerm, setAdminWalletSearchTerm] = useState('');
  const [adminWalletHistory, setAdminWalletHistory] = useState<StoreAdminWalletRoleHistoryItem[]>([]);
  const [loadingAdminWalletMembers, setLoadingAdminWalletMembers] = useState(false);
  const [loadingAdminWalletHistory, setLoadingAdminWalletHistory] = useState(false);
  const [adminWalletError, setAdminWalletError] = useState<string | null>(null);
  const [updatingAdminWallet, setUpdatingAdminWallet] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<StoreCreateForm>(() => createInitialStoreForm());
  const [createModalError, setCreateModalError] = useState<string | null>(null);
  const [creatingStore, setCreatingStore] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [readingStoreWalletBalances, setReadingStoreWalletBalances] = useState(false);
  const [storeWalletBalanceError, setStoreWalletBalanceError] = useState<string | null>(null);
  const [storeWalletBalanceCooldownUntilMs, setStoreWalletBalanceCooldownUntilMs] = useState(0);
  const [storeWalletBalanceNowMs, setStoreWalletBalanceNowMs] = useState(Date.now());
  const [storeWalletBalanceSummary, setStoreWalletBalanceSummary] = useState<{
    totalStores: number;
    walletStores: number;
    uniqueWalletCount: number;
    totalUsdtAmount: number;
    checkedAt: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setStores([]);
      setTotalCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, storesResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchStoresByAgent(agentcode, 300, 1),
      ]);

      setAgent(agentData);
      setStores(storesResult.stores);
      setTotalCount(storesResult.totalCount);
    } catch (loadError) {
      setAgent(null);
      setStores([]);
      setTotalCount(0);
      setError(loadError instanceof Error ? loadError.message : '가맹점 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (storeWalletBalanceCooldownUntilMs <= Date.now()) {
      return;
    }

    const timerId = window.setInterval(() => {
      setStoreWalletBalanceNowMs(() => {
        const now = Date.now();
        if (now >= storeWalletBalanceCooldownUntilMs) {
          window.clearInterval(timerId);
        }
        return now;
      });
    }, 500);

    return () => {
      window.clearInterval(timerId);
    };
  }, [storeWalletBalanceCooldownUntilMs]);

  useEffect(() => {
    setStoreWalletBalanceSummary(null);
    setStoreWalletBalanceError(null);
    setStoreWalletBalanceCooldownUntilMs(0);
    setStoreWalletBalanceNowMs(Date.now());
  }, [agentcode]);

  const filteredStores = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return stores;
    }
    return stores.filter((store) => {
      return (
        store.storeName.toLowerCase().includes(normalizedKeyword)
        || store.storecode.toLowerCase().includes(normalizedKeyword)
        || store.adminWalletAddress.toLowerCase().includes(normalizedKeyword)
        || store.paymentWalletAddress.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [stores, keyword]);

  const filteredAdminWalletMembers = useMemo(() => {
    const normalizedKeyword = adminWalletSearchTerm.trim().toLowerCase();
    if (!normalizedKeyword) {
      return adminWalletMembers;
    }

    return adminWalletMembers.filter((member) => (
      member.nickname.toLowerCase().includes(normalizedKeyword)
      || member.walletAddress.toLowerCase().includes(normalizedKeyword)
      || member.role.toLowerCase().includes(normalizedKeyword)
    ));
  }, [adminWalletMembers, adminWalletSearchTerm]);

  const formatUsdtFixed6 = useCallback((value: number) => {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    }).format(Number.isFinite(numeric) ? numeric : 0);
  }, []);

  const readStorePaymentWalletBalanceSummary = useCallback(async () => {
    if (readingStoreWalletBalances) {
      return;
    }
    if (storeWalletBalanceCooldownUntilMs > Date.now()) {
      return;
    }

    setReadingStoreWalletBalances(true);
    setStoreWalletBalanceError(null);

    try {
      const walletAddressMap = new Map<string, string>();
      let walletStores = 0;

      stores.forEach((store) => {
        const paymentWalletAddress = String(store.paymentWalletAddress || '').trim();
        if (!paymentWalletAddress) return;
        walletStores += 1;
        const normalizedWalletAddress = paymentWalletAddress.toLowerCase();
        if (!walletAddressMap.has(normalizedWalletAddress)) {
          walletAddressMap.set(normalizedWalletAddress, paymentWalletAddress);
        }
      });

      const uniqueWalletAddresses = Array.from(walletAddressMap.values());
      let totalUsdtAmount = 0;

      for (let index = 0; index < uniqueWalletAddresses.length; index += STORE_WALLET_BALANCE_BATCH_SIZE) {
        const walletAddressBatch = uniqueWalletAddresses.slice(index, index + STORE_WALLET_BALANCE_BATCH_SIZE);

        const response = await fetch('/api/user/getUSDTBalancesByWalletAddresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddresses: walletAddressBatch,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || '가맹점 결제지갑 잔고를 읽어오지 못했습니다.'));
        }

        const balances = Array.isArray(payload?.result?.balances) ? payload.result.balances : [];
        balances.forEach((balanceItem: unknown) => {
          const source =
            typeof balanceItem === 'object' && balanceItem !== null
              ? (balanceItem as Record<string, unknown>)
              : {};
          const amount = Number(source.displayValue ?? source.balance ?? 0);
          if (Number.isFinite(amount)) {
            totalUsdtAmount += amount;
          }
        });
      }

      setStoreWalletBalanceSummary({
        totalStores: stores.length,
        walletStores,
        uniqueWalletCount: uniqueWalletAddresses.length,
        totalUsdtAmount,
        checkedAt: new Date().toISOString(),
      });
      setStoreWalletBalanceCooldownUntilMs(Date.now() + STORE_WALLET_BALANCE_COOLDOWN_MS);
      setStoreWalletBalanceNowMs(Date.now());
    } catch (error) {
      setStoreWalletBalanceError(
        error instanceof Error ? error.message : '가맹점 결제지갑 잔고 합산 중 오류가 발생했습니다.',
      );
    } finally {
      setReadingStoreWalletBalances(false);
    }
  }, [readingStoreWalletBalances, storeWalletBalanceCooldownUntilMs, stores]);

  const storeWalletBalanceCooldownSeconds = Math.max(
    0,
    Math.ceil((storeWalletBalanceCooldownUntilMs - storeWalletBalanceNowMs) / 1000),
  );
  const storeWalletBalanceReadBlocked = readingStoreWalletBalances || storeWalletBalanceCooldownSeconds > 0;

  const loadStoreRateHistory = useCallback(async (storecode: string) => {
    const normalizedStorecode = String(storecode || '').trim();
    if (!normalizedStorecode) {
      setRateHistory([]);
      return;
    }

    setLoadingRateHistory(true);
    setRateHistoryError(null);
    try {
      const response = await fetch('/api/store/getStoreUsdtToKrwRateHistory', {
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
        throw new Error(String(payload?.error || '환율 변경이력을 불러오지 못했습니다.'));
      }

      const items = Array.isArray(payload?.result?.items) ? payload.result.items : [];
      const nextHistory = items.map((item: any, index: number) => {
        const prevRate = Number(item?.prevUsdtToKrwRate);
        const nextRate = Number(item?.nextUsdtToKrwRate);
        const idRaw = item?._id;
        const id = typeof idRaw?.toString === 'function'
          ? String(idRaw.toString())
          : `${normalizedStorecode}-${index}-${String(item?.changedAt || '')}`;

        return {
          id,
          prevUsdtToKrwRate: Number.isFinite(prevRate) ? prevRate : 0,
          nextUsdtToKrwRate: Number.isFinite(nextRate) ? nextRate : 0,
          changedByWalletAddress: String(item?.changedByWalletAddress || ''),
          changedByName: String(item?.changedByName || ''),
          changedAt: String(item?.changedAt || ''),
        };
      });

      setRateHistory(nextHistory);
    } catch (historyError) {
      setRateHistory([]);
      setRateHistoryError(
        historyError instanceof Error
          ? historyError.message
          : '환율 변경이력을 불러오지 못했습니다.',
      );
    } finally {
      setLoadingRateHistory(false);
    }
  }, []);

  const loadAdminWalletMembers = useCallback(async (store: AgentStoreItem) => {
    const normalizedStorecode = String(store.storecode || '').trim();
    if (!normalizedStorecode) {
      setAdminWalletMembers([]);
      return;
    }

    setLoadingAdminWalletMembers(true);
    setAdminWalletError(null);
    try {
      const adminStorecode = 'admin';
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
        throw new Error(String(payload?.error || '회원 목록 조회에 실패했습니다.'));
      }

      const users = Array.isArray(payload?.result?.users) ? payload.result.users : [];
      const nextMembersMap = new Map<string, StoreAdminWalletMemberItem>();

      users
        .map((user: unknown) => normalizeAdminWalletMember(user))
        .filter((member: StoreAdminWalletMemberItem | null): member is StoreAdminWalletMemberItem => member !== null)
        .forEach((member: StoreAdminWalletMemberItem) => {
          const key = member.walletAddress.toLowerCase();
          if (!nextMembersMap.has(key)) {
            nextMembersMap.set(key, member);
          }
        });

      const currentAdminWalletAddress = String(store.adminWalletAddress || '').trim();
      if (isWalletAddress(currentAdminWalletAddress)) {
        const normalizedCurrentAdminWalletAddress = currentAdminWalletAddress.toLowerCase();
        if (!nextMembersMap.has(normalizedCurrentAdminWalletAddress)) {
          nextMembersMap.set(normalizedCurrentAdminWalletAddress, {
            id: `current-admin-${normalizedStorecode}`,
            nickname: '현재 관리자',
            role: 'admin',
            walletAddress: currentAdminWalletAddress,
            createdAt: '',
          });
        }
      }

      const nextMembers = Array.from(nextMembersMap.values()).sort((left, right) => {
        if (left.role === 'admin' && right.role !== 'admin') return -1;
        if (left.role !== 'admin' && right.role === 'admin') return 1;
        return left.nickname.localeCompare(right.nickname, 'ko');
      });

      setAdminWalletMembers(nextMembers);
    } catch (loadError) {
      setAdminWalletMembers([]);
      setAdminWalletError(
        loadError instanceof Error ? loadError.message : '회원 목록 조회 중 오류가 발생했습니다.',
      );
    } finally {
      setLoadingAdminWalletMembers(false);
    }
  }, []);

  const loadAdminWalletHistory = useCallback(async (storecode: string) => {
    const normalizedStorecode = String(storecode || '').trim();
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
        throw new Error(String(payload?.error || '관리자 변경이력을 불러오지 못했습니다.'));
      }

      const items = Array.isArray(payload?.result?.items) ? payload.result.items : [];
      const nextHistory = items.map((item: any, index: number) => {
        const idRaw = item?._id;
        const id = typeof idRaw?.toString === 'function'
          ? String(idRaw.toString())
          : `${normalizedStorecode}-admin-${index}-${String(item?.changedAt || '')}`;

        return {
          id,
          prevAdminWalletAddress: String(item?.prevAdminWalletAddress || ''),
          nextAdminWalletAddress: String(item?.nextAdminWalletAddress || ''),
          changedByWalletAddress: String(item?.changedByWalletAddress || ''),
          changedByName: String(item?.changedByName || ''),
          changedAt: String(item?.changedAt || ''),
        };
      });

      setAdminWalletHistory(nextHistory);
    } catch (loadError) {
      setAdminWalletHistory([]);
      setAdminWalletError((previous) => (
        previous || (loadError instanceof Error ? loadError.message : '관리자 변경이력을 불러오지 못했습니다.')
      ));
    } finally {
      setLoadingAdminWalletHistory(false);
    }
  }, []);

  const openAdminWalletModal = useCallback((store: AgentStoreItem) => {
    const normalizedStorecode = String(store.storecode || '').trim();
    if (!normalizedStorecode) {
      toast.error('가맹점 코드가 없습니다.');
      return;
    }

    setAdminWalletModalStore(store);
    setSelectedAdminWalletAddress(String(store.adminWalletAddress || '').trim());
    setAdminWalletSearchTerm('');
    setAdminWalletMembers([]);
    setAdminWalletHistory([]);
    setAdminWalletError(null);

    void Promise.all([
      loadAdminWalletMembers(store),
      loadAdminWalletHistory(normalizedStorecode),
    ]);
  }, [loadAdminWalletHistory, loadAdminWalletMembers]);

  const closeAdminWalletModal = useCallback(() => {
    if (updatingAdminWallet) {
      return;
    }

    setAdminWalletModalStore(null);
    setSelectedAdminWalletAddress('');
    setAdminWalletSearchTerm('');
    setAdminWalletMembers([]);
    setAdminWalletHistory([]);
    setAdminWalletError(null);
  }, [updatingAdminWallet]);

  const openRateModal = useCallback((store: AgentStoreItem) => {
    setRateModalStore(store);
    setRateInput(store.usdtToKrwRate > 0 ? String(store.usdtToKrwRate) : '');
    setRateError(null);
    setRateHistory([]);
    setRateHistoryError(null);

    void loadStoreRateHistory(store.storecode);
  }, [loadStoreRateHistory]);

  const closeRateModal = useCallback(() => {
    if (rateSubmitting) {
      return;
    }
    setRateModalStore(null);
    setRateInput('');
    setRateError(null);
    setRateHistory([]);
    setRateHistoryError(null);
  }, [rateSubmitting]);

  const openCreateModal = useCallback(() => {
    if (!agentcode) {
      return;
    }
    setCreateModalError(null);
    setCreateForm(createInitialStoreForm());
    setIsCreateModalOpen(true);
  }, [agentcode]);

  const closeCreateModal = useCallback(() => {
    if (creatingStore || uploadingLogo || uploadingBanner) {
      return;
    }
    setIsCreateModalOpen(false);
    setCreateModalError(null);
    setCreateForm(createInitialStoreForm());
  }, [creatingStore, uploadingBanner, uploadingLogo]);

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
      const uploadedUrl = toText(payload?.url).trim();
      if (!uploadedUrl) {
        throw new Error('업로드 URL을 받지 못했습니다.');
      }

      setCreateForm((prev) => (
        kind === 'logo'
          ? { ...prev, storeLogo: uploadedUrl }
          : { ...prev, storeBanner: uploadedUrl }
      ));
      toast.success(kind === 'logo' ? '로고 업로드 완료' : '배너 업로드 완료');
    } catch (uploadError) {
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

  const submitCreateStore = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingStore || uploadingLogo || uploadingBanner) {
      return;
    }

    const resolvedAgentcode = String(agent?.agentcode || agentcode || '').trim();
    if (!resolvedAgentcode) {
      setCreateModalError('에이전트 코드가 없어 가맹점을 생성할 수 없습니다.');
      return;
    }

    const storeName = createForm.storeName.trim();
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
    setStoreNotice(null);

    try {
      const createStoreRequestBody = await buildSignedRequestBody({
        path: '/api/store/setStore',
        storecode: resolvedAgentcode,
        payload: {
          requesterWalletAddress: String(activeAccount?.address || '').trim(),
          agentcode: resolvedAgentcode,
          storeName,
          storeType: 'store',
          storeUrl: '',
          storeDescription,
          storeLogo,
          storeBanner,
        },
      });
      const response = await fetch('/api/store/setStore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createStoreRequestBody),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || '가맹점 생성 요청에 실패했습니다.'));
      }
      if (!payload?.result) {
        throw new Error('동일한 가맹점 코드 또는 이름이 이미 존재합니다.');
      }

      const createdStoreCode = toText(payload?.result?.storecode).trim();
      const notice = createdStoreCode
        ? `가맹점이 생성되었습니다 (${createdStoreCode}).`
        : '가맹점이 생성되었습니다.';

      setStoreNotice(notice);
      toast.success(notice);
      setIsCreateModalOpen(false);
      setCreateForm(createInitialStoreForm());
      await loadData();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : '가맹점 생성 중 오류가 발생했습니다.';
      setCreateModalError(message);
      toast.error(message);
    } finally {
      setCreatingStore(false);
    }
  }, [
    activeAccount?.address,
    buildSignedRequestBody,
    agent?.agentcode,
    agentcode,
    createForm.storeBanner,
    createForm.storeDescription,
    createForm.storeLogo,
    createForm.storeName,
    creatingStore,
    loadData,
    uploadingBanner,
    uploadingLogo,
  ]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCreateModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeCreateModal, isCreateModalOpen]);

  useEffect(() => {
    if (!adminWalletModalStore) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAdminWalletModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [adminWalletModalStore, closeAdminWalletModal]);

  const submitStoreRate = useCallback(async () => {
    if (!rateModalStore || rateSubmitting) {
      return;
    }

    const nextRateRaw = Number(String(rateInput || '').replace(/,/g, '').trim());
    if (!Number.isFinite(nextRateRaw) || nextRateRaw <= 0) {
      setRateError('적용 환율은 0보다 큰 숫자로 입력해 주세요.');
      return;
    }
    const nextRate = Number(nextRateRaw.toFixed(2));

    setRateSubmitting(true);
    setRateError(null);
    setRateNotice(null);
    try {
      const updateRateRequestBody = await buildSignedRequestBody({
        path: '/api/store/updateStoreUsdtToKrwRate',
        storecode: rateModalStore.storecode,
        payload: {
          storecode: rateModalStore.storecode,
          usdtToKrwRate: nextRate,
          changedByWalletAddress: String(
            activeAccount?.address || agent?.adminWalletAddress || '',
          ).trim(),
          changedByName: String(agent?.agentName || agent?.agentcode || '').trim(),
          requesterWalletAddress: String(activeAccount?.address || '').trim(),
        },
      });
      const response = await fetch('/api/store/updateStoreUsdtToKrwRate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateRateRequestBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.result !== true) {
        throw new Error(String(payload?.error || '적용 환율을 업데이트하지 못했습니다.'));
      }

      const payloadRate = Number(payload?.nextUsdtToKrwRate);
      const resolvedRate = Number.isFinite(payloadRate) && payloadRate > 0
        ? payloadRate
        : nextRate;

      setStores((prev) =>
        prev.map((store) =>
          store.storecode === rateModalStore.storecode
            ? { ...store, usdtToKrwRate: resolvedRate }
            : store,
        ),
      );
      setRateNotice(
        `${rateModalStore.storeName || rateModalStore.storecode} 적용 환율을 ${formatAppliedRate(resolvedRate)}로 변경했습니다.`,
      );
      await loadStoreRateHistory(rateModalStore.storecode);
      setRateModalStore(null);
      setRateInput('');
    } catch (submitError) {
      setRateError(
        submitError instanceof Error
          ? submitError.message
          : '적용 환율을 업데이트하지 못했습니다.',
      );
    } finally {
      setRateSubmitting(false);
    }
  }, [
    activeAccount?.address,
    agent?.adminWalletAddress,
    agent?.agentName,
    agent?.agentcode,
    buildSignedRequestBody,
    rateInput,
    loadStoreRateHistory,
    rateModalStore,
    rateSubmitting,
  ]);

  const updateStoreAdminWallet = useCallback(async () => {
    if (!adminWalletModalStore || updatingAdminWallet) {
      return;
    }

    const nextAdminWalletAddress = String(selectedAdminWalletAddress || '').trim();
    if (!isWalletAddress(nextAdminWalletAddress)) {
      setAdminWalletError('유효한 지갑주소를 선택해 주세요.');
      return;
    }

    const currentAdminWalletAddress = String(adminWalletModalStore.adminWalletAddress || '').trim().toLowerCase();
    if (currentAdminWalletAddress === nextAdminWalletAddress.toLowerCase()) {
      setAdminWalletError('현재 관리자 지갑과 동일합니다.');
      return;
    }

    setUpdatingAdminWallet(true);
    setAdminWalletError(null);
    try {
      const response = await fetch('/api/store/updateStoreAdminWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: adminWalletModalStore.storecode,
          adminWalletAddress: nextAdminWalletAddress,
          changedByWalletAddress: String(activeAccount?.address || agent?.adminWalletAddress || '').trim(),
          changedByName: 'store-management-dashboard',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || '관리자 지갑 변경에 실패했습니다.'));
      }

      const isChanged = Boolean(payload?.changed);

      setStores((previous) => previous.map((store) => (
        store.storecode === adminWalletModalStore.storecode
          ? { ...store, adminWalletAddress: nextAdminWalletAddress }
          : store
      )));
      setAdminWalletModalStore((previous) => (
        previous
          ? { ...previous, adminWalletAddress: nextAdminWalletAddress }
          : previous
      ));

      await Promise.all([
        loadData(),
        loadAdminWalletHistory(adminWalletModalStore.storecode),
      ]);

      if (isChanged) {
        toast.success('가맹점 관리자 지갑이 변경되었습니다.');
      } else {
        toast.success('변경할 내용이 없어 기존 관리자 지갑을 유지했습니다.');
      }
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : '관리자 지갑 변경 중 오류가 발생했습니다.';
      setAdminWalletError(message);
      toast.error(message);
    } finally {
      setUpdatingAdminWallet(false);
    }
  }, [
    activeAccount?.address,
    adminWalletModalStore,
    agent?.adminWalletAddress,
    loadAdminWalletHistory,
    loadData,
    selectedAdminWalletAddress,
    updatingAdminWallet,
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Stores</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">가맹점 관리</h1>
        <p className="mt-1 text-sm text-slate-600">에이전트 소속 가맹점과 결제 지표를 조회합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 가맹점 관리 페이지를 사용할 수 있습니다.
        </div>
      )}

      {agentcode && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '조회 중...' : '새로고침'}
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-cyan-600 px-3 text-xs font-semibold text-white transition hover:bg-cyan-500"
            >
              가맹점 추가
            </button>
          </div>

          <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">가맹점 수</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalCount.toLocaleString()}개</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">표시 목록</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{filteredStores.length.toLocaleString()}개</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">결제지갑 USDT 합산</p>
                <p className="mt-1 text-xs text-slate-600">
                  가맹점 전체 결제지갑(지갑주소가 있는 항목)의 USDT 잔고를 합산합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void readStorePaymentWalletBalanceSummary();
                }}
                disabled={storeWalletBalanceReadBlocked}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-cyan-300 bg-cyan-50 px-3 text-xs font-semibold text-cyan-800 transition hover:border-cyan-400 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {readingStoreWalletBalances
                  ? '읽어오는 중...'
                  : storeWalletBalanceCooldownSeconds > 0
                    ? `${storeWalletBalanceCooldownSeconds}초 후 재조회`
                    : '결제지갑 잔고 읽어오기'}
              </button>
            </div>

            {storeWalletBalanceError && (
              <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                {storeWalletBalanceError}
              </p>
            )}

            {storeWalletBalanceSummary && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">전체 가맹점</p>
                  <p className="text-sm font-semibold text-slate-900">{storeWalletBalanceSummary.totalStores.toLocaleString()}개</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">결제지갑 보유 가맹점</p>
                  <p className="text-sm font-semibold text-slate-900">{storeWalletBalanceSummary.walletStores.toLocaleString()}개</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] text-slate-500">고유 결제지갑 수</p>
                  <p className="text-sm font-semibold text-slate-900">{storeWalletBalanceSummary.uniqueWalletCount.toLocaleString()}개</p>
                </div>
                <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                  <p className="text-[11px] text-cyan-700">USDT 합산</p>
                  <p className="text-sm font-extrabold text-cyan-900">{formatUsdtFixed6(storeWalletBalanceSummary.totalUsdtAmount)} USDT</p>
                  <p className="text-[10px] text-cyan-700">조회 {toDateTime(storeWalletBalanceSummary.checkedAt)}</p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">가맹점 목록</p>
              <div className="flex w-full max-w-md items-center gap-2">
                <input
                  type="text"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="가맹점명/코드/지갑 검색"
                  className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
                />
              </div>
            </div>
          </section>

          {storeNotice && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {storeNotice}
            </div>
          )}

          {rateNotice && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {rateNotice}
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              가맹점 목록을 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3">관리자 지갑</th>
                    <th className="px-4 py-3">결제 지갑</th>
                    <th className="px-4 py-3 text-right">결제확정</th>
                    <th className="px-4 py-3 text-right">거래금액</th>
                    <th className="px-4 py-3">적용 환율</th>
                    <th className="px-4 py-3">등록일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStores.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 가맹점이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredStores.map((store) => (
                      <tr key={store.id || store.storecode} className="text-slate-700">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
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
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{store.storeName || '-'}</p>
                              <p className="truncate text-xs text-slate-500">코드 {store.storecode || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>{shortAddress(store.adminWalletAddress)}</p>
                          <button
                            type="button"
                            onClick={() => openAdminWalletModal(store)}
                            className="mt-1 inline-flex h-7 items-center justify-center rounded-md border border-sky-300 bg-sky-50 px-2 text-[11px] font-semibold text-sky-800 transition hover:border-sky-400 hover:text-sky-900"
                          >
                            관리자 설정
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>{shortAddress(store.paymentWalletAddress)}</p>
                          {store.storecode && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <Link
                                href={`/${lang}/p2p/agent-management/store-management/${encodeURIComponent(
                                  store.storecode,
                                )}/payment-wallet-collect${agentcode ? `?agentcode=${encodeURIComponent(agentcode)}` : ''}`}
                                className="inline-flex h-7 items-center justify-center rounded-md border border-cyan-300 bg-cyan-50 px-2 text-[11px] font-semibold text-cyan-800 transition hover:border-cyan-400 hover:text-cyan-900"
                              >
                                회수하기
                              </Link>
                              <Link
                                href={`/${lang}/p2p/agent-management/store-management/${encodeURIComponent(
                                  store.storecode,
                                )}/store-seller-settings${agentcode ? `?agentcode=${encodeURIComponent(agentcode)}` : ''}`}
                                className="inline-flex h-7 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-400 hover:text-emerald-800"
                              >
                                판매자 설정
                              </Link>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">
                          {store.totalPaymentConfirmedCount.toLocaleString()}건
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <p className="font-semibold text-slate-700">{formatKrw(store.totalKrwAmount)}</p>
                          <p className="text-slate-500">{formatUsdt(store.totalUsdtAmount)}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p className="font-semibold text-slate-700">{formatAppliedRate(store.usdtToKrwRate)}</p>
                          <button
                            type="button"
                            onClick={() => openRateModal(store)}
                            className="mt-1 inline-flex h-7 items-center justify-center rounded-md border border-cyan-300 bg-cyan-50 px-2 text-[11px] font-semibold text-cyan-800 transition hover:border-cyan-400 hover:text-cyan-900"
                          >
                            수정
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{toDateTime(store.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {adminWalletModalStore && (
        <div
          className="fixed inset-0 z-[133] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={closeAdminWalletModal}
        >
          <div
            className="w-full max-w-5xl rounded-3xl border border-white/80 bg-white p-5 shadow-[0_34px_70px_-40px_rgba(15,23,42,0.8)]"
            role="dialog"
            aria-modal="true"
            aria-label="가맹점 관리자 설정"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Store Admin</p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">가맹점 관리자 설정</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {adminWalletModalStore.storeName || '-'} ({adminWalletModalStore.storecode || '-'})
                </p>
              </div>
              <button
                type="button"
                onClick={closeAdminWalletModal}
                disabled={updatingAdminWallet}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                닫기
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">회원 지갑 목록</p>
                    <p className="mt-1 text-xs text-slate-500">회원 중에서 관리자 지갑으로 사용할 주소를 선택하세요.</p>
                  </div>
                  <span className="inline-flex rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                    현재 {shortAddress(adminWalletModalStore.adminWalletAddress)}
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
                            onClick={() => {
                              setSelectedAdminWalletAddress(member.walletAddress);
                              if (adminWalletError) {
                                setAdminWalletError(null);
                              }
                            }}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                              isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{member.nickname}</p>
                              <p className="truncate text-xs text-slate-500">
                                {shortAddress(member.walletAddress)} · role {member.role}
                                {member.createdAt ? ` · ${toDateTime(member.createdAt)}` : ''}
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

              <section className="rounded-2xl border border-slate-200 bg-white px-3 py-3 lg:col-span-5">
                <p className="text-sm font-semibold text-slate-900">변경 요약</p>

                <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <span>현재 관리자</span>
                    <span className="font-semibold text-slate-800">{shortAddress(adminWalletModalStore.adminWalletAddress)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>선택 지갑</span>
                    <span className="font-semibold text-slate-800">
                      {selectedAdminWalletAddress ? shortAddress(selectedAdminWalletAddress) : '-'}
                    </span>
                  </div>
                </div>

                {adminWalletError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    {adminWalletError}
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
                    onClick={updateStoreAdminWallet}
                    disabled={
                      updatingAdminWallet
                      || !isWalletAddress(selectedAdminWalletAddress)
                      || selectedAdminWalletAddress.trim().toLowerCase() === adminWalletModalStore.adminWalletAddress.trim().toLowerCase()
                    }
                    className="inline-flex h-10 items-center rounded-full bg-sky-700 px-3.5 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingAdminWallet ? '변경 중...' : '관리자 저장'}
                  </button>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">관리자 변경이력</p>
                      <p className="mt-1 text-xs text-slate-500">최근 변경 순으로 표시됩니다.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void loadAdminWalletHistory(adminWalletModalStore.storecode);
                      }}
                      disabled={loadingAdminWalletHistory}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingAdminWalletHistory ? '조회 중...' : '새로고침'}
                    </button>
                  </div>

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
                              {shortAddress(item.prevAdminWalletAddress)} → {shortAddress(item.nextAdminWalletAddress)}
                            </p>
                            <p className="mt-0.5">
                              {item.changedByName || 'agent'}
                              {item.changedByWalletAddress ? ` (${shortAddress(item.changedByWalletAddress)})` : ''}
                            </p>
                            <p className="mt-0.5 text-slate-500">{toDateTime(item.changedAt)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[131] flex items-center justify-center px-4 py-6">
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
            className="relative z-[132] max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-cyan-100 bg-white shadow-[0_40px_90px_-42px_rgba(15,23,42,0.7)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-700">Merchant Onboarding</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">가맹점 추가</h2>
                <p className="mt-1 text-sm text-slate-500">
                  생성된 가맹점은 에이전트 코드 {agent?.agentcode || agentcode || '-'} 에 자동 연결됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creatingStore || uploadingLogo || uploadingBanner}
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
              <div className="sm:col-span-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-900">
                저장 Agent Code: {agent?.agentcode || agentcode || '-'}
              </div>

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
                  placeholder="예: 강남역점"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100"
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100"
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
                    {uploadingLogo ? '로고 업로드 중...' : '이미지 선택 시 즉시 업로드됩니다.'}
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
                    {uploadingBanner ? '배너 업로드 중...' : '이미지 선택 시 즉시 업로드됩니다.'}
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
                  disabled={creatingStore || uploadingLogo || uploadingBanner}
                  className="inline-flex h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creatingStore || uploadingLogo || uploadingBanner}
                  className="inline-flex h-11 items-center rounded-full bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingStore ? '생성 중...' : uploadingLogo || uploadingBanner ? '업로드 중...' : '가맹점 생성'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {rateModalStore && (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[1px] sm:items-center"
          role="presentation"
          onClick={closeRateModal}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-white/80 bg-white p-5 shadow-[0_34px_70px_-40px_rgba(15,23,42,0.8)]"
            role="dialog"
            aria-modal="true"
            aria-label="가맹점 적용 환율 변경"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">Store Rate</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">가맹점 적용 환율 변경</h3>
            <p className="mt-1 text-sm text-slate-600">{rateModalStore.storeName || '-'} ({rateModalStore.storecode || '-'})</p>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 lg:col-span-5">
                <p className="text-xs text-slate-600">
                  현재 환율: <span className="font-semibold text-slate-800">{formatAppliedRate(rateModalStore.usdtToKrwRate)}</span>
                </p>

                <label className="mt-4 block">
                  <span className="text-xs font-semibold text-slate-600">새 적용 환율 (KRW)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={rateInput}
                    onChange={(event) => {
                      setRateInput(event.target.value);
                      if (rateError) {
                        setRateError(null);
                      }
                    }}
                    placeholder="예: 1400"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
                  />
                </label>

                {rateError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    {rateError}
                  </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={closeRateModal}
                    disabled={rateSubmitting}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={submitStoreRate}
                    disabled={rateSubmitting}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-600 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {rateSubmitting ? '저장 중...' : '저장'}
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white px-3 py-3 lg:col-span-7">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">환율 변경이력</p>
                  <button
                    type="button"
                    onClick={() => loadStoreRateHistory(rateModalStore.storecode)}
                    disabled={loadingRateHistory}
                    className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingRateHistory ? '조회 중...' : '새로고침'}
                  </button>
                </div>

                <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                  {loadingRateHistory ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div key={`rate-history-loading-${index}`} className="h-10 animate-pulse rounded-lg bg-slate-200/80" />
                      ))}
                    </div>
                  ) : rateHistoryError ? (
                    <p className="px-3 py-6 text-center text-xs font-semibold text-rose-700">{rateHistoryError}</p>
                  ) : rateHistory.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-slate-500">변경이력이 없습니다.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {rateHistory.map((item) => (
                        <div key={item.id} className="px-3 py-2 text-xs text-slate-600">
                          <p className="font-semibold text-slate-800">
                            {formatAppliedRate(item.prevUsdtToKrwRate)} → {formatAppliedRate(item.nextUsdtToKrwRate)}
                          </p>
                          <p className="mt-0.5">
                            {item.changedByName || 'agent'}
                            {item.changedByWalletAddress ? ` (${shortAddress(item.changedByWalletAddress)})` : ''}
                          </p>
                          <p className="mt-0.5 text-slate-500">{toDateTime(item.changedAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
