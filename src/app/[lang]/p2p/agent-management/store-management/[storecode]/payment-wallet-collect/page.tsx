'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useActiveAccount } from 'thirdweb/react';

import AgentInfoCard from '../../../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  shortAddress,
  toDateTime,
  type AgentSummary,
} from '../../../_shared';

type CollectChain = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';

type CollectBalanceResult = {
  store: {
    storecode: string;
    storeName: string;
    storeLogo: string;
    agentcode: string;
    paymentWalletAddress: string;
    adminWalletAddress: string;
  };
  chain: CollectChain;
  balance: number;
  collectToWalletAddress: string;
  collectToWalletBalance: number;
  requestedByRole: string;
};

type CollectHistoryItem = {
  id: string;
  agentcode: string;
  storecode: string;
  storeName: string;
  chain: string;
  fromWalletAddress: string;
  toWalletAddress: string;
  requestedByWalletAddress: string;
  requestedByRole: string;
  requestedAmount: number;
  transactionId: string;
  status: string;
  onchainStatus: string;
  transactionHash: string;
  error: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
};

const wait = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

const CHAIN_OPTIONS: Array<{ id: CollectChain; label: string }> = [
  { id: 'polygon', label: 'Polygon' },
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'arbitrum', label: 'Arbitrum' },
  { id: 'bsc', label: 'BSC' },
];
const HISTORY_PAGE_SIZE = 10;
const HISTORY_PAGINATION_BUTTON_COUNT = 5;

const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number(value) || 0)} USDT`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isSameAddress = (a: string, b: string) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const normalizeCollectHistoryItem = (value: unknown): CollectHistoryItem => {
  const source = isRecord(value) ? value : {};

  return {
    id: String(source.id || source._id || ''),
    agentcode: String(source.agentcode || ''),
    storecode: String(source.storecode || ''),
    storeName: String(source.storeName || ''),
    chain: String(source.chain || ''),
    fromWalletAddress: String(source.fromWalletAddress || ''),
    toWalletAddress: String(source.toWalletAddress || ''),
    requestedByWalletAddress: String(source.requestedByWalletAddress || ''),
    requestedByRole: String(source.requestedByRole || ''),
    requestedAmount: Number(source.requestedAmount || 0),
    transactionId: String(source.transactionId || ''),
    status: String(source.status || ''),
    onchainStatus: String(source.onchainStatus || ''),
    transactionHash: String(source.transactionHash || ''),
    error: String(source.error || ''),
    createdAt: String(source.createdAt || ''),
    updatedAt: String(source.updatedAt || ''),
    confirmedAt: String(source.confirmedAt || ''),
  };
};

const isFinalCollectStatus = (status: string) => status === 'CONFIRMED' || status === 'FAILED';

export default function P2PAgentStorePaymentWalletCollectPage() {
  const activeAccount = useActiveAccount();
  const params = useParams<{ lang: string; storecode: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const storecode = Array.isArray(params?.storecode) ? params.storecode[0] : params?.storecode || '';
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();
  const connectedWalletAddress = String(activeAccount?.address || '').trim();

  const [selectedChain, setSelectedChain] = useState<CollectChain>('polygon');
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<CollectBalanceResult | null>(null);
  const [histories, setHistories] = useState<CollectHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [animatedBalance, setAnimatedBalance] = useState(0);
  const [animatedMyWalletBalance, setAnimatedMyWalletBalance] = useState(0);
  const [lastBalanceUpdatedAt, setLastBalanceUpdatedAt] = useState('');
  const animationFrameRef = useRef<number | null>(null);
  const myWalletAnimationFrameRef = useRef<number | null>(null);
  const animatedBalanceRef = useRef(0);
  const animatedMyWalletBalanceRef = useRef(0);

  const storeManagementHref = useMemo(() => {
    const query = new URLSearchParams();
    if (agentcode) {
      query.set('agentcode', agentcode);
    }
    const queryString = query.toString();
    return `/${lang}/p2p/agent-management/store-management${queryString ? `?${queryString}` : ''}`;
  }, [agentcode, lang]);

  const postPaymentWalletApi = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch('/api/wallet/payment-usdt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((payload as Record<string, unknown>)?.error || '요청에 실패했습니다.'));
    }
    return payload as Record<string, unknown>;
  }, []);

  const animateBalanceTo = useCallback((targetBalance: number) => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const startValue = animatedBalanceRef.current;
    const nextValue = Number.isFinite(targetBalance) ? Math.max(0, targetBalance) : 0;
    const delta = nextValue - startValue;

    if (Math.abs(delta) < 0.000001) {
      animatedBalanceRef.current = nextValue;
      setAnimatedBalance(nextValue);
      return;
    }

    const durationMs = 700;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - (1 - progress) ** 3;
      const current = startValue + delta * eased;
      animatedBalanceRef.current = current;
      setAnimatedBalance(current);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
        animatedBalanceRef.current = nextValue;
        setAnimatedBalance(nextValue);
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }, []);

  const animateMyWalletBalanceTo = useCallback((targetBalance: number) => {
    if (myWalletAnimationFrameRef.current !== null) {
      cancelAnimationFrame(myWalletAnimationFrameRef.current);
      myWalletAnimationFrameRef.current = null;
    }

    const startValue = animatedMyWalletBalanceRef.current;
    const nextValue = Number.isFinite(targetBalance) ? Math.max(0, targetBalance) : 0;
    const delta = nextValue - startValue;

    if (Math.abs(delta) < 0.000001) {
      animatedMyWalletBalanceRef.current = nextValue;
      setAnimatedMyWalletBalance(nextValue);
      return;
    }

    const durationMs = 700;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - (1 - progress) ** 3;
      const current = startValue + delta * eased;
      animatedMyWalletBalanceRef.current = current;
      setAnimatedMyWalletBalance(current);

      if (progress < 1) {
        myWalletAnimationFrameRef.current = requestAnimationFrame(step);
      } else {
        myWalletAnimationFrameRef.current = null;
        animatedMyWalletBalanceRef.current = nextValue;
        setAnimatedMyWalletBalance(nextValue);
      }
    };

    myWalletAnimationFrameRef.current = requestAnimationFrame(step);
  }, []);

  const fetchCollectBalance = useCallback(async (requesterWalletAddress: string) => {
    const balancePayload = await postPaymentWalletApi({
      action: 'collect-balance',
      storecode,
      agentcode,
      adminWalletAddress: requesterWalletAddress,
      chain: selectedChain,
    });
    const balanceResult = isRecord(balancePayload?.result)
      ? (balancePayload.result as CollectBalanceResult)
      : null;

    setBalanceInfo(balanceResult);
    setLastBalanceUpdatedAt(new Date().toISOString());

    return balanceResult;
  }, [agentcode, postPaymentWalletApi, selectedChain, storecode]);

  const loadData = useCallback(async () => {
    if (!storecode || !agentcode) {
      setAgent(null);
      setBalanceInfo(null);
      setHistories([]);
      setHistoryTotalCount(0);
      setHistoryTotalPages(1);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    let fetchedAgent: AgentSummary | null = null;
    try {
      const agentSummary = await fetchAgentSummary(agentcode);
      fetchedAgent = agentSummary;
      setAgent(agentSummary);

      if (!agentSummary?.adminWalletAddress) {
        throw new Error('에이전트 관리자 지갑 정보가 없어 조회할 수 없습니다.');
      }
      if (!connectedWalletAddress) {
        setBalanceInfo(null);
        setHistories([]);
        setHistoryTotalCount(0);
        setHistoryTotalPages(1);
        setError('지갑을 먼저 연결해 주세요. 현재 연결된 지갑으로 회수와 잔고 조회를 진행합니다.');
        return;
      }

      const [, historyPayload] = await Promise.all([
        fetchCollectBalance(connectedWalletAddress),
        postPaymentWalletApi({
          action: 'collect-history',
          storecode,
          agentcode,
          adminWalletAddress: connectedWalletAddress,
          limit: HISTORY_PAGE_SIZE,
          page: historyPage,
        }),
      ]);

      const historyResponseResult = historyPayload?.result;
      let historyItems: unknown[] = [];
      let totalCount = 0;
      let responsePage = historyPage;
      let responseLimit = HISTORY_PAGE_SIZE;

      if (Array.isArray(historyResponseResult)) {
        historyItems = historyResponseResult;
        totalCount = historyResponseResult.length;
        responsePage = 1;
        responseLimit = historyResponseResult.length || HISTORY_PAGE_SIZE;
      } else if (isRecord(historyResponseResult)) {
        const resultItems = Array.isArray(historyResponseResult.items) ? historyResponseResult.items : [];
        const resultTotalCount = Number(historyResponseResult.totalCount);
        const resultPage = Number(historyResponseResult.page);
        const resultLimit = Number(historyResponseResult.limit);

        historyItems = resultItems;
        totalCount = Number.isFinite(resultTotalCount) && resultTotalCount >= 0
          ? Math.floor(resultTotalCount)
          : resultItems.length;
        responsePage = Number.isFinite(resultPage) && resultPage > 0 ? Math.floor(resultPage) : historyPage;
        responseLimit = Number.isFinite(resultLimit) && resultLimit > 0 ? Math.floor(resultLimit) : HISTORY_PAGE_SIZE;
      }

      const normalizedLimit = Math.max(1, responseLimit);
      const totalPages = Math.max(1, Math.ceil(totalCount / normalizedLimit));
      const normalizedPage = Math.min(Math.max(1, responsePage), totalPages);

      setHistories(historyItems.map((item) => normalizeCollectHistoryItem(item)));
      setHistoryTotalCount(totalCount);
      setHistoryTotalPages(totalPages);

      if (normalizedPage !== historyPage) {
        setHistoryPage(normalizedPage);
      }
    } catch (loadError) {
      if (!fetchedAgent) {
        setAgent(null);
      }
      setBalanceInfo(null);
      setHistories([]);
      setHistoryTotalCount(0);
      setHistoryTotalPages(1);
      setError(loadError instanceof Error ? loadError.message : '회수 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode, connectedWalletAddress, fetchCollectBalance, historyPage, postPaymentWalletApi, storecode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setHistoryPage(1);
  }, [agentcode, storecode]);

  const refreshCollectStatus = useCallback(async (transactionId: string) => {
    if (!transactionId || !storecode || !connectedWalletAddress) return;
    try {
      await postPaymentWalletApi({
        action: 'collect-status',
        storecode,
        agentcode,
        adminWalletAddress: connectedWalletAddress,
        transactionId,
      });
      await loadData();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '회수 상태를 갱신하지 못했습니다.');
    }
  }, [agentcode, connectedWalletAddress, loadData, postPaymentWalletApi, storecode]);

  const onCollectAll = useCallback(async () => {
    if (!storecode || !agentcode || !connectedWalletAddress || !balanceInfo) return;

    setCollecting(true);
    setError(null);
    try {
      const payload = await postPaymentWalletApi({
        action: 'collect',
        storecode,
        agentcode,
        chain: selectedChain,
        adminWalletAddress: connectedWalletAddress,
        toWalletAddress: connectedWalletAddress,
      });

      const result = isRecord(payload?.result) ? payload.result : {};
      const amount = Number(result.transferredAmount || 0);
      const transactionId = String(result.transactionId || '').trim();
      let latestStatus = String(result.status || '').toUpperCase();
      setNotice(
        transactionId
          ? `전체 회수 요청이 접수되었습니다. (${formatUsdt(amount)} / transactionId: ${transactionId})`
          : `전체 회수 요청이 접수되었습니다. (${formatUsdt(amount)})`,
      );

      if (transactionId) {
        const maxPollCount = 20;
        for (let attempt = 0; attempt < maxPollCount; attempt += 1) {
          if (isFinalCollectStatus(latestStatus)) {
            break;
          }

          await wait(1500);
          const statusPayload = await postPaymentWalletApi({
            action: 'collect-status',
            storecode,
            agentcode,
            adminWalletAddress: connectedWalletAddress,
            transactionId,
          });
          const statusResult = isRecord(statusPayload?.result) ? statusPayload.result : {};
          latestStatus = String(statusResult.status || latestStatus || 'QUEUED').toUpperCase();
        }
      }

      await loadData();

      if (latestStatus === 'CONFIRMED') {
        setNotice(`전체 회수가 완료되어 회수 가능 잔고와 내 지갑 잔고를 갱신했습니다. (${formatUsdt(amount)})`);
      } else if (latestStatus === 'FAILED') {
        setError('전체 회수 처리에 실패했습니다. 회수 이력의 오류 내용을 확인해 주세요.');
      } else if (transactionId) {
        setNotice(`회수 요청이 처리 중입니다. 완료되면 회수 가능 잔고가 갱신됩니다. (transactionId: ${transactionId})`);
      }

      setConfirmOpen(false);
    } catch (collectError) {
      setError(collectError instanceof Error ? collectError.message : '전체 회수 처리에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  }, [agentcode, balanceInfo, connectedWalletAddress, loadData, postPaymentWalletApi, selectedChain, storecode]);

  const canCollectAll = Boolean(
    balanceInfo
      && balanceInfo.balance > 0
      && connectedWalletAddress
      && isSameAddress(balanceInfo.collectToWalletAddress, connectedWalletAddress),
  );

  const selectedChainLabel = useMemo(
    () => CHAIN_OPTIONS.find((item) => item.id === selectedChain)?.label || selectedChain,
    [selectedChain],
  );

  const expectedMyWalletBalanceAfterCollect = useMemo(() => {
    const currentBalance = Number(balanceInfo?.collectToWalletBalance || 0);
    const collectAmount = Number(balanceInfo?.balance || 0);
    return Math.max(0, currentBalance + collectAmount);
  }, [balanceInfo?.balance, balanceInfo?.collectToWalletBalance]);

  const visibleHistoryPageNumbers = useMemo(() => {
    const safeTotalPages = Math.max(1, historyTotalPages);
    let start = Math.max(1, historyPage - Math.floor(HISTORY_PAGINATION_BUTTON_COUNT / 2));
    let end = start + HISTORY_PAGINATION_BUTTON_COUNT - 1;

    if (end > safeTotalPages) {
      end = safeTotalPages;
      start = Math.max(1, end - HISTORY_PAGINATION_BUTTON_COUNT + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [historyPage, historyTotalPages]);
  const isHistoryPreviousDisabled = loading || historyPage <= 1;
  const isHistoryNextDisabled = loading || historyPage >= historyTotalPages;

  useEffect(() => {
    animateBalanceTo(Number(balanceInfo?.balance || 0));
  }, [animateBalanceTo, balanceInfo?.balance]);

  useEffect(() => {
    animateMyWalletBalanceTo(Number(balanceInfo?.collectToWalletBalance || 0));
  }, [animateMyWalletBalanceTo, balanceInfo?.collectToWalletBalance]);

  useEffect(() => {
    if (!storecode || !agentcode || !connectedWalletAddress) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (collecting) return;
      fetchCollectBalance(connectedWalletAddress).catch((pollError) => {
        console.warn('collect balance polling failed', pollError);
      });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [agentcode, collecting, connectedWalletAddress, fetchCollectBalance, storecode]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (myWalletAnimationFrameRef.current !== null) {
        cancelAnimationFrame(myWalletAnimationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Payment Wallet Collect</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">가맹점 결제 지갑 회수하기</h1>
        <p className="mt-1 text-sm text-slate-600">결제 지갑 USDT 잔고를 조회하고 내 지갑으로 전체 회수할 수 있습니다.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={storeManagementHref}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
        >
          가맹점 목록으로 돌아가기
        </Link>

        <button
          type="button"
          onClick={loadData}
          disabled={loading || collecting}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '조회 중...' : '새로고침'}
        </button>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 사용할 수 있습니다.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {agentcode && (
          <div className="h-full">
            <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />
          </div>
        )}

        <section className="h-full rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">내 지갑 정보</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">현재 연결된 지갑 주소</p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-800">{shortAddress(connectedWalletAddress)}</p>
          <p className="mt-3 text-xs font-semibold text-slate-500">USDT 잔고</p>
          <p className="mt-1 text-2xl font-extrabold text-cyan-800">
            {balanceInfo ? formatUsdt(animatedMyWalletBalance) : '-'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {lastBalanceUpdatedAt ? `최근 갱신 ${toDateTime(lastBalanceUpdatedAt)}` : '최근 갱신 -'}
          </p>
          {connectedWalletAddress && balanceInfo && !isSameAddress(balanceInfo.collectToWalletAddress, connectedWalletAddress) && (
            <p className="mt-2 text-[11px] font-semibold text-rose-600">
              현재 연결 지갑이 회수 권한 지갑과 다릅니다. 권한 지갑으로 다시 연결해 주세요.
            </p>
          )}
        </section>

        {balanceInfo && (
          <>
            <section className="h-full rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan-200 bg-white text-xs font-bold text-cyan-700">
                  {balanceInfo.store.storeLogo ? (
                    <div
                      className="h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${encodeURI(balanceInfo.store.storeLogo)})` }}
                      aria-label={balanceInfo.store.storeName || balanceInfo.store.storecode}
                    />
                  ) : (
                    'SHOP'
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900">
                    {balanceInfo.store.storeName || balanceInfo.store.storecode}
                  </p>
                  <p className="truncate text-xs text-slate-600">코드 {balanceInfo.store.storecode}</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600">
                <div>
                  <p className="font-semibold text-slate-500">결제 지갑</p>
                  <p className="mt-0.5 font-mono text-slate-700">{shortAddress(balanceInfo.store.paymentWalletAddress)}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500">회수 대상 (내 지갑)</p>
                  <p className="mt-0.5 font-mono text-slate-700">{shortAddress(balanceInfo.collectToWalletAddress)}</p>
                </div>
              </div>
            </section>

            <section className="h-full rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">회수 가능 잔고</p>
                  <p className="mt-1 text-3xl font-extrabold text-slate-900">{formatUsdt(animatedBalance)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {lastBalanceUpdatedAt ? `최근 갱신 ${toDateTime(lastBalanceUpdatedAt)}` : '최근 갱신 -'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="collect-chain" className="text-xs font-semibold text-slate-500">
                    네트워크
                  </label>
                  <select
                    id="collect-chain"
                    value={selectedChain}
                    onChange={(event) => setSelectedChain(event.target.value as CollectChain)}
                    className="h-9 rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-cyan-500"
                  >
                    {CHAIN_OPTIONS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>요청자 권한: {balanceInfo.requestedByRole || '-'}</span>
                <span>네트워크: {balanceInfo.chain}</span>
              </div>

              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!canCollectAll || collecting}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {collecting ? '회수 요청 중...' : '전체 회수하기'}
              </button>
            </section>
          </>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">회수 이력</h2>
          <span className="text-xs text-slate-500">총 {historyTotalCount.toLocaleString()}건</span>
        </div>

        {histories.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">회수 이력이 없습니다.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-center">No</th>
                  <th className="px-3 py-2">요청 시각</th>
                  <th className="px-3 py-2 text-right">요청 금액</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">요청 지갑</th>
                  <th className="px-3 py-2">출금 지갑</th>
                  <th className="px-3 py-2">수신 지갑</th>
                  <th className="px-3 py-2">transactionId</th>
                  <th className="px-3 py-2">확정 시각</th>
                  <th className="px-3 py-2 text-center">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {histories.map((item, index) => {
                  const canRefreshStatus = item.transactionId && item.status !== 'CONFIRMED' && item.status !== 'FAILED';
                  const rowNumber = Math.max(
                    historyTotalCount - ((historyPage - 1) * HISTORY_PAGE_SIZE + index),
                    1,
                  );
                  return (
                    <tr key={item.id || item.transactionId || `${item.createdAt}-${index}`} className="align-top">
                      <td className="px-3 py-3 text-center text-xs font-semibold text-slate-500">{rowNumber}</td>
                      <td className="px-3 py-3 text-[11px] text-slate-600">{toDateTime(item.createdAt)}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-slate-900">
                        {formatUsdt(item.requestedAmount)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.status === 'CONFIRMED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.status === 'FAILED'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.status || '-'}
                        </span>
                        <p className="mt-1 text-[11px] text-slate-500">onchain: {item.onchainStatus || '-'}</p>
                        {item.error && (
                          <p className="mt-1 max-w-[240px] truncate text-[11px] font-semibold text-rose-600" title={item.error}>
                            오류: {item.error}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600">
                        {shortAddress(item.requestedByWalletAddress)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600">
                        {shortAddress(item.fromWalletAddress)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600">
                        {shortAddress(item.toWalletAddress)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600">
                        <p className="max-w-[220px] truncate" title={item.transactionId || '-'}>
                          {item.transactionId || '-'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-slate-600">{toDateTime(item.confirmedAt)}</td>
                      <td className="px-3 py-3 text-center">
                        {canRefreshStatus ? (
                          <button
                            type="button"
                            onClick={() => refreshCollectStatus(item.transactionId)}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                          >
                            상태 갱신
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {historyTotalCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">
              페이지 {historyPage} / {historyTotalPages} · 총 {historyTotalCount.toLocaleString()}건
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                disabled={isHistoryPreviousDisabled}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
              >
                이전
              </button>

              {visibleHistoryPageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setHistoryPage(pageNumber)}
                  disabled={loading}
                  className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition ${
                    pageNumber === historyPage
                      ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
                disabled={isHistoryNextDisabled}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </section>

      {confirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => {
              if (!collecting) setConfirmOpen(false);
            }}
            aria-label="회수 확인 닫기"
          />
          <div className="relative z-[81] w-full max-w-md rounded-2xl border border-white/60 bg-white p-5 shadow-[0_34px_90px_-40px_rgba(15,23,42,0.8)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Collect Confirm</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">결제 지갑 잔고를 전체 회수할까요?</h3>
            <p className="mt-2 text-sm text-slate-600">
              {balanceInfo ? formatUsdt(balanceInfo.balance) : '-'} 를 내 지갑{' '}
              <span className="font-mono text-slate-700">{shortAddress(balanceInfo?.collectToWalletAddress || '')}</span> 로
              전송 요청합니다.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
              <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5 text-xs">
                <p className="font-semibold text-slate-500">가맹점</p>
                <p className="font-semibold text-slate-800">
                  {balanceInfo?.store?.storeName || '-'} ({balanceInfo?.store?.storecode || '-'})
                </p>
                <p className="font-semibold text-slate-500">네트워크</p>
                <p className="font-semibold text-slate-800">{selectedChainLabel}</p>
                <p className="font-semibold text-slate-500">요청자 권한</p>
                <p className="font-semibold text-slate-800">{balanceInfo?.requestedByRole || '-'}</p>
                <p className="font-semibold text-slate-500">요청 지갑</p>
                <p className="font-mono text-slate-700">{shortAddress(connectedWalletAddress)}</p>
                <p className="font-semibold text-slate-500">출금 지갑</p>
                <p className="font-mono text-slate-700">{shortAddress(balanceInfo?.store?.paymentWalletAddress || '')}</p>
                <p className="font-semibold text-slate-500">수신 지갑</p>
                <p className="font-mono text-slate-700">{shortAddress(balanceInfo?.collectToWalletAddress || '')}</p>
                <p className="font-semibold text-slate-500">회수 금액</p>
                <p className="font-extrabold text-cyan-800">{formatUsdt(Number(balanceInfo?.balance || 0))}</p>
                <p className="font-semibold text-slate-500">회수 후 예상</p>
                <p className="font-semibold text-slate-800">{formatUsdt(expectedMyWalletBalanceAfterCollect)}</p>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              실행 후 취소할 수 없습니다. 상세 정보를 확인한 뒤 회수를 진행해 주세요.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={collecting}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onCollectAll}
                disabled={collecting}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-cyan-700 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {collecting ? '요청 중...' : '전체 회수 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
