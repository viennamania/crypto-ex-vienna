'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

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

const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number(value) || 0)} USDT`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
  const params = useParams<{ lang: string; storecode: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const storecode = Array.isArray(params?.storecode) ? params.storecode[0] : params?.storecode || '';
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [selectedChain, setSelectedChain] = useState<CollectChain>('polygon');
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<CollectBalanceResult | null>(null);
  const [histories, setHistories] = useState<CollectHistoryItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [animatedBalance, setAnimatedBalance] = useState(0);
  const [lastBalanceUpdatedAt, setLastBalanceUpdatedAt] = useState('');
  const animationFrameRef = useRef<number | null>(null);
  const animatedBalanceRef = useRef(0);

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

  const fetchCollectBalance = useCallback(async (adminWalletAddress: string) => {
    const balancePayload = await postPaymentWalletApi({
      action: 'collect-balance',
      storecode,
      agentcode,
      adminWalletAddress,
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
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const agentSummary = await fetchAgentSummary(agentcode);
      if (!agentSummary?.adminWalletAddress) {
        throw new Error('에이전트 관리자 지갑 정보가 없어 조회할 수 없습니다.');
      }

      const [, historyPayload] = await Promise.all([
        fetchCollectBalance(agentSummary.adminWalletAddress),
        postPaymentWalletApi({
          action: 'collect-history',
          storecode,
          agentcode,
          adminWalletAddress: agentSummary.adminWalletAddress,
          limit: 50,
        }),
      ]);

      const historyResult = Array.isArray(historyPayload?.result) ? historyPayload.result : [];

      setAgent(agentSummary);
      setHistories(historyResult.map((item) => normalizeCollectHistoryItem(item)));
    } catch (loadError) {
      setAgent(null);
      setBalanceInfo(null);
      setHistories([]);
      setError(loadError instanceof Error ? loadError.message : '회수 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode, fetchCollectBalance, postPaymentWalletApi, storecode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshCollectStatus = useCallback(async (transactionId: string) => {
    if (!transactionId || !storecode || !agent?.adminWalletAddress) return;
    try {
      await postPaymentWalletApi({
        action: 'collect-status',
        storecode,
        agentcode,
        adminWalletAddress: agent.adminWalletAddress,
        transactionId,
      });
      await loadData();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '회수 상태를 갱신하지 못했습니다.');
    }
  }, [agent?.adminWalletAddress, agentcode, loadData, postPaymentWalletApi, storecode]);

  const onCollectAll = useCallback(async () => {
    if (!storecode || !agentcode || !agent?.adminWalletAddress || !balanceInfo) return;

    setCollecting(true);
    setError(null);
    try {
      const payload = await postPaymentWalletApi({
        action: 'collect',
        storecode,
        agentcode,
        chain: selectedChain,
        adminWalletAddress: agent.adminWalletAddress,
        toWalletAddress: agent.adminWalletAddress,
      });

      const result = isRecord(payload?.result) ? payload.result : {};
      const amount = Number(result.transferredAmount || 0);
      const transactionId = String(result.transactionId || '').trim();
      let latestStatus = String(result.status || '').toUpperCase();

      setConfirmOpen(false);
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
            adminWalletAddress: agent.adminWalletAddress,
            transactionId,
          });
          const statusResult = isRecord(statusPayload?.result) ? statusPayload.result : {};
          latestStatus = String(statusResult.status || latestStatus || 'QUEUED').toUpperCase();
        }
      }

      await loadData();

      if (latestStatus === 'CONFIRMED') {
        setNotice(`전체 회수가 완료되어 회수 가능 잔고를 갱신했습니다. (${formatUsdt(amount)})`);
      } else if (latestStatus === 'FAILED') {
        setError('전체 회수 처리에 실패했습니다. 회수 이력의 오류 내용을 확인해 주세요.');
      } else if (transactionId) {
        setNotice(`회수 요청이 처리 중입니다. 완료되면 회수 가능 잔고가 갱신됩니다. (transactionId: ${transactionId})`);
      }
    } catch (collectError) {
      setError(collectError instanceof Error ? collectError.message : '전체 회수 처리에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  }, [agent?.adminWalletAddress, agentcode, balanceInfo, loadData, postPaymentWalletApi, selectedChain, storecode]);

  const canCollectAll = Boolean(balanceInfo && balanceInfo.balance > 0 && agent?.adminWalletAddress);

  useEffect(() => {
    animateBalanceTo(Number(balanceInfo?.balance || 0));
  }, [animateBalanceTo, balanceInfo?.balance]);

  useEffect(() => {
    if (!storecode || !agentcode || !agent?.adminWalletAddress) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (collecting) return;
      fetchCollectBalance(agent.adminWalletAddress).catch((pollError) => {
        console.warn('collect balance polling failed', pollError);
      });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [agent?.adminWalletAddress, agentcode, collecting, fetchCollectBalance, storecode]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
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

      {agentcode && <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />}

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

      {balanceInfo && (
        <>
          <section className="rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-4">
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

            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-2">
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

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
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

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">회수 이력</h2>
          <span className="text-xs text-slate-500">최신 50건</span>
        </div>

        {histories.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">회수 이력이 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {histories.map((item) => {
              const canRefreshStatus = item.transactionId && item.status !== 'CONFIRMED' && item.status !== 'FAILED';
              return (
                <div key={item.id || item.transactionId} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{formatUsdt(item.requestedAmount)}</p>
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
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-600 md:grid-cols-2">
                    <p>요청 지갑: {shortAddress(item.requestedByWalletAddress)}</p>
                    <p>회수 지갑: {shortAddress(item.toWalletAddress)}</p>
                    <p>지급 지갑: {shortAddress(item.fromWalletAddress)}</p>
                    <p>요청 시각: {toDateTime(item.createdAt)}</p>
                    <p>갱신 시각: {toDateTime(item.updatedAt)}</p>
                    <p>확정 시각: {toDateTime(item.confirmedAt)}</p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="truncate text-[11px] text-slate-500">transactionId: {item.transactionId || '-'}</p>
                    {canRefreshStatus && (
                      <button
                        type="button"
                        onClick={() => refreshCollectStatus(item.transactionId)}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                      >
                        상태 갱신
                      </button>
                    )}
                  </div>

                  {item.error && <p className="mt-1 text-[11px] font-semibold text-rose-600">오류: {item.error}</p>}
                </div>
              );
            })}
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
