'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';

import { client } from '@/app/client';
import { ConnectButton } from '@/components/WalletConnectButton';
import { useClientWallets } from '@/lib/useClientWallets';

type CandidateItem = {
  candidateId: string;
  transactionId: string;
  batchIndex: number;
  transactionHash: string;
  createdAt: string;
  confirmedAt: string;
  fromAddress: string;
  sellerWalletAddress: string;
  sellerNickname: string;
  sellerEscrowWalletAddress: string;
  sellerEscrowSignerAddress: string;
  buyerEscrowWalletAddress: string;
  usdtAmount: number;
  rawAmount: string;
  privateBuyWalletLabel: string;
  privateBuyWalletCreatedAt: string;
  buyerWalletHintPrefix: string;
  suggestedBuyerWalletAddress: string;
  suggestedBuyerNickname: string;
  suggestedBuyerMatchCount: number;
  existingOrderId?: string;
  existingTradeId?: string;
};

type ExcludedCandidateItem = CandidateItem & {
  excludedByExistingTxHash?: boolean;
  excludedByExistingEscrowWallet?: boolean;
  excludedReasonCodes?: string[];
  existingByTxOrderId?: string;
  existingByTxTradeId?: string;
  existingByTxOrderStatus?: string;
  existingByEscrowOrderId?: string;
  existingByEscrowTradeId?: string;
  existingByEscrowOrderStatus?: string;
  existingOrderStatus?: string;
  existingOrderCancelled?: boolean;
};

type CandidateResponse = {
  result?: {
    candidates?: CandidateItem[];
    excludedCandidates?: ExcludedCandidateItem[];
    meta?: {
      lookbackDays?: number;
      scannedTransactions?: number;
      matchedTransfers?: number;
      missingCount?: number;
      excludedCount?: number;
      excludedByExistingTxHashCount?: number;
      excludedByExistingEscrowWalletCount?: number;
      excludedByBothCount?: number;
      excludedCancelledOrderCount?: number;
      sellerCount?: number;
      privateBuyWalletCount?: number;
      privateBuyWalletDetectionMode?: string;
      privateBuyWalletWarning?: string;
      engineServerWalletLookupFailed?: boolean;
      txSearchCacheEnabled?: boolean;
      txSearchCacheHits?: number;
      txSearchCacheMisses?: number;
      txSearchCacheBypasses?: number;
      chain?: string;
      usdtContractAddress?: string;
    };
  };
  error?: string;
  message?: string;
};

type CandidateStreamEvent =
  | {
      type: 'progress';
      step?: string;
      message?: string;
      percent?: number;
      elapsedMs?: number;
      meta?: Record<string, unknown>;
    }
  | {
      type: 'result';
      result?: CandidateResponse['result'];
    }
  | {
      type: 'error';
      status?: number;
      error?: string;
      message?: string;
      detail?: string;
    };

type RecoverResponse = {
  result?: {
    success?: boolean;
    existed?: boolean;
    orderId?: string;
    tradeId?: string;
  };
  error?: string;
  reason?: string;
  detail?: string;
  message?: string;
};

type UnrecoveredCancelledOrderItem = {
  candidateId: string;
  orderId: string;
  tradeId: string;
  createdAt: string;
  acceptedAt: string;
  paymentRequestedAt: string;
  cancelledAt: string;
  cancelTradeReason: string;
  cancelledByRole: string;
  sellerWalletAddress: string;
  sellerNickname: string;
  sellerEscrowWalletAddress: string;
  buyerWalletAddress: string;
  buyerEscrowWalletAddress: string;
  usdtAmount: number;
  expectedRollbackUsdtAmount: number;
  rollbackUsdtAmount: number;
  rollbackRawAmount: string;
  rollbackTxHash: string;
  issueCodes?: string[];
};

type UnrecoveredCancelledResponse = {
  result?: {
    candidates?: UnrecoveredCancelledOrderItem[];
    meta?: {
      lookbackDays?: number;
      scannedCancelledOrders?: number;
      missingRollbackTransferCount?: number;
      excludedWithRollbackTxHashCount?: number;
      excludedAlreadyRecoveredCount?: number;
      missingEscrowAddressCount?: number;
      missingExpectedRollbackAmountCount?: number;
      inspectedAt?: string;
    };
  };
  error?: string;
  message?: string;
};

type RecoverCancelledRollbackResponse = {
  result?: {
    success?: boolean;
    alreadyRecovered?: boolean;
    transactionHash?: string;
    recoveredAt?: string;
    recoveredUsdtAmount?: number;
    recoveredRawAmount?: string;
  };
  error?: string;
  reason?: string;
  detail?: string;
  message?: string;
};

const walletAuthOptions = ['google', 'email', 'phone'];
const LOOKBACK_OPTIONS = [7, 30, 90, 180];
const EXCLUDED_CANDIDATES_PAGE_SIZE = 20;
const UNRECOVERED_CANCELLED_PAGE_SIZE = 20;
const SHOW_RECOVERY_ACTION_COLUMNS = false;
const PROGRESS_STEPS = [
  { key: 'validate', label: '요청 검증' },
  { key: 'load-sellers', label: '판매자 조회' },
  { key: 'load-private-buy-wallets', label: 'private-buy 지갑 매핑' },
  { key: 'prepare-transaction-cache', label: '트랜잭션 캐시 준비' },
  { key: 'scan-transactions', label: 'Engine 트랜잭션 스캔' },
  { key: 'dedupe-matches', label: '중복 정리' },
  { key: 'load-existing-orders', label: '기존 주문 대조' },
  { key: 'suggest-buyers', label: '구매자 추천 매칭' },
  { key: 'finalize', label: '최종 후보 생성' },
] as const;
const PROGRESS_STEP_KEY_SET = new Set<string>(PROGRESS_STEPS.map((item) => item.key));

const isWalletAddress = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const normalizeOrderStatus = (value: unknown) => String(value || '').trim().toLowerCase();
const isCancelledOrderStatus = (value: unknown) => normalizeOrderStatus(value) === 'cancelled';

const isCancelledMatchedExcludedCandidate = (item: ExcludedCandidateItem) => (
  Boolean(item?.existingOrderCancelled)
  || isCancelledOrderStatus(item?.existingOrderStatus)
  || isCancelledOrderStatus(item?.existingByTxOrderStatus)
  || isCancelledOrderStatus(item?.existingByEscrowOrderStatus)
);

const shortText = (value: string, head = 6, tail = 4) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= head + tail + 3) return normalized;
  return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`;
};

const formatDateTime = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatUsdt = (value: number) =>
  new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number(value || 0));

export default function MissingOrderRecoveryPage() {
  const pathname = usePathname();
  const isAgentManagementContext = pathname.includes('/p2p/agent-management/');
  const activeAccount = useActiveAccount();
  const adminWalletAddress = String(activeAccount?.address || '').trim();
  const isWalletConnected = Boolean(adminWalletAddress);
  const { wallet, wallets } = useClientWallets({ authOptions: walletAuthOptions });

  const [lookbackDays, setLookbackDays] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [excludedCandidates, setExcludedCandidates] = useState<ExcludedCandidateItem[]>([]);
  const [meta, setMeta] = useState<{
    scannedTransactions: number;
    matchedTransfers: number;
    missingCount: number;
    excludedCount: number;
    excludedByExistingTxHashCount: number;
    excludedByExistingEscrowWalletCount: number;
    excludedByBothCount: number;
    excludedCancelledOrderCount: number;
    sellerCount: number;
    privateBuyWalletCount: number;
    privateBuyWalletDetectionMode: string;
    privateBuyWalletWarning: string;
    engineServerWalletLookupFailed: boolean;
    chain: string;
  }>({
    scannedTransactions: 0,
    matchedTransfers: 0,
    missingCount: 0,
    excludedCount: 0,
    excludedByExistingTxHashCount: 0,
    excludedByExistingEscrowWalletCount: 0,
    excludedByBothCount: 0,
    excludedCancelledOrderCount: 0,
    sellerCount: 0,
    privateBuyWalletCount: 0,
    privateBuyWalletDetectionMode: '',
    privateBuyWalletWarning: '',
    engineServerWalletLookupFailed: false,
    chain: '',
  });
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [buyerWalletDraftByCandidateId, setBuyerWalletDraftByCandidateId] = useState<Record<string, string>>({});
  const [processingCandidateId, setProcessingCandidateId] = useState('');
  const [excludedCandidatesPage, setExcludedCandidatesPage] = useState(1);
  const [cancelledExcludedCandidatesPage, setCancelledExcludedCandidatesPage] = useState(1);
  const [showCancelledExcludedSeparately, setShowCancelledExcludedSeparately] = useState(false);
  const [excludedSellerSearchText, setExcludedSellerSearchText] = useState('');
  const [unrecoveredCancelledCandidates, setUnrecoveredCancelledCandidates] = useState<UnrecoveredCancelledOrderItem[]>([]);
  const [unrecoveredCancelledMeta, setUnrecoveredCancelledMeta] = useState<{
    scannedCancelledOrders: number;
    missingRollbackTransferCount: number;
    excludedWithRollbackTxHashCount: number;
    excludedAlreadyRecoveredCount: number;
    missingEscrowAddressCount: number;
    missingExpectedRollbackAmountCount: number;
    inspectedAt: string;
  }>({
    scannedCancelledOrders: 0,
    missingRollbackTransferCount: 0,
    excludedWithRollbackTxHashCount: 0,
    excludedAlreadyRecoveredCount: 0,
    missingEscrowAddressCount: 0,
    missingExpectedRollbackAmountCount: 0,
    inspectedAt: '',
  });
  const [unrecoveredCancelledLoading, setUnrecoveredCancelledLoading] = useState(false);
  const [unrecoveredCancelledError, setUnrecoveredCancelledError] = useState('');
  const [unrecoveredCancelledPage, setUnrecoveredCancelledPage] = useState(1);
  const [processingUnrecoveredCandidateId, setProcessingUnrecoveredCandidateId] = useState('');
  const [recoveryActorInfo, setRecoveryActorInfo] = useState<{ role: string; nickname: string }>({
    role: isAgentManagementContext ? 'agent' : 'admin',
    nickname: isAgentManagementContext ? '에이전트' : '관리자',
  });
  const loadingRef = useRef(false);
  const [loadingProgress, setLoadingProgress] = useState<{
    percent: number;
    elapsedSeconds: number;
    phaseLabel: string;
    currentStep: string;
    stepMessageByKey: Record<string, string>;
    liveScannedTransactions: number;
    liveMatchedTransfers: number;
    liveTxCacheHits: number;
    liveTxCacheMisses: number;
    liveTxCacheBypasses: number;
  }>({
    percent: 0,
    elapsedSeconds: 0,
    phaseLabel: '',
    currentStep: '',
    stepMessageByKey: {},
    liveScannedTransactions: 0,
    liveMatchedTransfers: 0,
    liveTxCacheHits: 0,
    liveTxCacheMisses: 0,
    liveTxCacheBypasses: 0,
  });

  const recoveryActorRole = String(recoveryActorInfo.role || '').trim().toLowerCase()
    || (isAgentManagementContext ? 'agent' : 'admin');
  const recoveryActorNickname = String(recoveryActorInfo.nickname || '').trim()
    || (recoveryActorRole === 'agent' ? '에이전트' : '관리자');
  const recoveryActorRoleLabel = recoveryActorRole === 'agent' ? '에이전트' : '관리자';

  const loadUnrecoveredCancelledCandidates = useCallback(async () => {
    setUnrecoveredCancelledLoading(true);
    setUnrecoveredCancelledError('');
    try {
      const response = await fetch('/api/order/getUnrecoveredCancelledPrivateBuyOrders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lookbackDays,
          limit: 1000,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as UnrecoveredCancelledResponse;
      if (!response.ok) {
        throw new Error(
          String(payload?.message || payload?.error || '취소 주문 회수 누락 후보 조회에 실패했습니다.'),
        );
      }

      const nextCandidates = Array.isArray(payload?.result?.candidates) ? payload.result.candidates : [];
      const nextMeta = payload?.result?.meta || {};
      setUnrecoveredCancelledCandidates(nextCandidates);
      setUnrecoveredCancelledPage(1);
      setUnrecoveredCancelledMeta({
        scannedCancelledOrders: Number(nextMeta?.scannedCancelledOrders || 0) || 0,
        missingRollbackTransferCount: Number(nextMeta?.missingRollbackTransferCount || 0) || 0,
        excludedWithRollbackTxHashCount: Number(nextMeta?.excludedWithRollbackTxHashCount || 0) || 0,
        excludedAlreadyRecoveredCount: Number(nextMeta?.excludedAlreadyRecoveredCount || 0) || 0,
        missingEscrowAddressCount: Number(nextMeta?.missingEscrowAddressCount || 0) || 0,
        missingExpectedRollbackAmountCount: Number(nextMeta?.missingExpectedRollbackAmountCount || 0) || 0,
        inspectedAt: String(nextMeta?.inspectedAt || ''),
      });
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : '취소 주문 회수 누락 후보 조회 중 오류가 발생했습니다.';
      setUnrecoveredCancelledError(message);
    } finally {
      setUnrecoveredCancelledLoading(false);
    }
  }, [lookbackDays]);

  const loadCandidates = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    setError('');
    setLoadingProgress({
      percent: 2,
      elapsedSeconds: 0,
      phaseLabel: '조회 요청을 시작합니다.',
      currentStep: 'start',
      stepMessageByKey: {},
      liveScannedTransactions: 0,
      liveMatchedTransfers: 0,
      liveTxCacheHits: 0,
      liveTxCacheMisses: 0,
      liveTxCacheBypasses: 0,
    });

    const applyResult = (result?: CandidateResponse['result']) => {
      const nextCandidates = Array.isArray(result?.candidates) ? result.candidates : [];
      const nextExcludedCandidates = Array.isArray(result?.excludedCandidates) ? result.excludedCandidates : [];
      const nextMeta = result?.meta || {};

      setCandidates(nextCandidates);
      setExcludedCandidates(nextExcludedCandidates);
      setExcludedCandidatesPage(1);
      setCancelledExcludedCandidatesPage(1);
      setMeta({
        scannedTransactions: Number(nextMeta?.scannedTransactions || 0) || 0,
        matchedTransfers: Number(nextMeta?.matchedTransfers || 0) || 0,
        missingCount: Number(nextMeta?.missingCount || 0) || 0,
        excludedCount: Number(nextMeta?.excludedCount || 0) || 0,
        excludedByExistingTxHashCount: Number(nextMeta?.excludedByExistingTxHashCount || 0) || 0,
        excludedByExistingEscrowWalletCount: Number(nextMeta?.excludedByExistingEscrowWalletCount || 0) || 0,
        excludedByBothCount: Number(nextMeta?.excludedByBothCount || 0) || 0,
        excludedCancelledOrderCount: Number(nextMeta?.excludedCancelledOrderCount || 0) || 0,
        sellerCount: Number(nextMeta?.sellerCount || 0) || 0,
        privateBuyWalletCount: Number(nextMeta?.privateBuyWalletCount || 0) || 0,
        privateBuyWalletDetectionMode: String(nextMeta?.privateBuyWalletDetectionMode || ''),
        privateBuyWalletWarning: String(nextMeta?.privateBuyWalletWarning || ''),
        engineServerWalletLookupFailed: Boolean(nextMeta?.engineServerWalletLookupFailed),
        chain: String(nextMeta?.chain || ''),
      });
      setLastUpdatedAt(new Date().toISOString());

      setBuyerWalletDraftByCandidateId((previous) => {
        const next = { ...previous };
        for (const candidate of nextCandidates) {
          const candidateId = String(candidate?.candidateId || '').trim();
          if (!candidateId) continue;
          if (next[candidateId]) continue;
          const suggestedWalletAddress = String(candidate?.suggestedBuyerWalletAddress || '').trim();
          if (isWalletAddress(suggestedWalletAddress)) {
            next[candidateId] = suggestedWalletAddress;
          }
        }
        return next;
      });
    };

    try {
      const response = await fetch('/api/order/getMissingPrivateBuyOrderCandidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lookbackDays,
          maxCandidates: 300,
          stream: true,
        }),
      });

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const isNdjson = contentType.includes('application/x-ndjson');

      if (!response.body || !isNdjson) {
        const payload = (await response.json().catch(() => ({}))) as CandidateResponse;
        if (!response.ok) {
          throw new Error(String(payload?.message || payload?.error || '누락 후보 조회에 실패했습니다.'));
        }
        applyResult(payload?.result);
        await loadUnrecoveredCancelledCandidates();
        setLoadingProgress((previous) => ({
          ...previous,
          percent: 100,
          phaseLabel: '조회가 완료되었습니다.',
          currentStep: 'complete',
          liveScannedTransactions: Number(payload?.result?.meta?.scannedTransactions || previous.liveScannedTransactions) || 0,
          liveMatchedTransfers: Number(payload?.result?.meta?.matchedTransfers || previous.liveMatchedTransfers) || 0,
          liveTxCacheHits: Number(payload?.result?.meta?.txSearchCacheHits || previous.liveTxCacheHits) || 0,
          liveTxCacheMisses: Number(payload?.result?.meta?.txSearchCacheMisses || previous.liveTxCacheMisses) || 0,
          liveTxCacheBypasses: Number(payload?.result?.meta?.txSearchCacheBypasses || previous.liveTxCacheBypasses) || 0,
        }));
        return;
      }

      if (!response.ok) {
        let errorMessage = '누락 후보 조회에 실패했습니다.';
        try {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const { value } = await reader.read();
          const firstChunk = value ? decoder.decode(value) : '';
          const firstLine = firstChunk.split('\n').find((line) => line.trim()) || '';
          if (firstLine) {
            const firstEvent = JSON.parse(firstLine) as CandidateStreamEvent;
            if (firstEvent?.type === 'error') {
              errorMessage = String(firstEvent.message || firstEvent.detail || firstEvent.error || errorMessage);
            }
          }
        } catch {
          // ignore parser errors and keep generic message
        }
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: CandidateResponse['result'] | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');
          if (!line) continue;

          let streamEvent: CandidateStreamEvent | null = null;
          try {
            streamEvent = JSON.parse(line) as CandidateStreamEvent;
          } catch {
            streamEvent = null;
          }
          if (!streamEvent) continue;

          if (streamEvent.type === 'progress') {
            const stepKey = String(streamEvent.step || '').trim();
            const percent = Math.max(0, Math.min(100, Math.floor(Number(streamEvent.percent || 0))));
            const elapsedSeconds = Math.max(0, Math.floor(Number(streamEvent.elapsedMs || 0) / 1000));
            const progressMeta =
              streamEvent.meta && typeof streamEvent.meta === 'object' && !Array.isArray(streamEvent.meta)
                ? streamEvent.meta
                : {};
            const scannedTransactions = Number((progressMeta as Record<string, unknown>)?.scannedTransactions);
            const matchedTransfers = Number((progressMeta as Record<string, unknown>)?.matchedTransfers);
            const txCacheHits = Number((progressMeta as Record<string, unknown>)?.txCacheHits);
            const txCacheMisses = Number((progressMeta as Record<string, unknown>)?.txCacheMisses);
            const txCacheBypasses = Number((progressMeta as Record<string, unknown>)?.txCacheBypasses);

            setLoadingProgress((previous) => ({
              stepMessageByKey:
                stepKey && PROGRESS_STEP_KEY_SET.has(stepKey)
                  ? {
                      ...previous.stepMessageByKey,
                      [stepKey]: String(streamEvent.message || streamEvent.step || ''),
                    }
                  : previous.stepMessageByKey,
              percent,
              elapsedSeconds,
              phaseLabel: String(streamEvent.message || streamEvent.step || '조회 진행 중입니다.'),
              currentStep:
                stepKey === 'complete'
                  ? 'complete'
                  : stepKey && PROGRESS_STEP_KEY_SET.has(stepKey)
                    ? stepKey
                    : previous.currentStep,
              liveScannedTransactions:
                Number.isFinite(scannedTransactions) && scannedTransactions >= 0
                  ? Math.floor(scannedTransactions)
                  : previous.liveScannedTransactions,
              liveMatchedTransfers:
                Number.isFinite(matchedTransfers) && matchedTransfers >= 0
                  ? Math.floor(matchedTransfers)
                  : previous.liveMatchedTransfers,
              liveTxCacheHits:
                Number.isFinite(txCacheHits) && txCacheHits >= 0
                  ? Math.floor(txCacheHits)
                  : previous.liveTxCacheHits,
              liveTxCacheMisses:
                Number.isFinite(txCacheMisses) && txCacheMisses >= 0
                  ? Math.floor(txCacheMisses)
                  : previous.liveTxCacheMisses,
              liveTxCacheBypasses:
                Number.isFinite(txCacheBypasses) && txCacheBypasses >= 0
                  ? Math.floor(txCacheBypasses)
                  : previous.liveTxCacheBypasses,
            }));
            continue;
          }

          if (streamEvent.type === 'result') {
            finalResult = streamEvent.result;
            continue;
          }

          if (streamEvent.type === 'error') {
            throw new Error(
              String(streamEvent.message || streamEvent.detail || streamEvent.error || '누락 후보 조회에 실패했습니다.'),
            );
          }
        }
      }

      if (!finalResult) {
        throw new Error('조회 결과를 수신하지 못했습니다.');
      }

      applyResult(finalResult);
      await loadUnrecoveredCancelledCandidates();
      setLoadingProgress((previous) => ({
        ...previous,
        percent: 100,
        phaseLabel: '조회가 완료되었습니다.',
        currentStep: 'complete',
        liveScannedTransactions: Number(finalResult?.meta?.scannedTransactions || previous.liveScannedTransactions) || 0,
        liveMatchedTransfers: Number(finalResult?.meta?.matchedTransfers || previous.liveMatchedTransfers) || 0,
        liveTxCacheHits: Number(finalResult?.meta?.txSearchCacheHits || previous.liveTxCacheHits) || 0,
        liveTxCacheMisses: Number(finalResult?.meta?.txSearchCacheMisses || previous.liveTxCacheMisses) || 0,
        liveTxCacheBypasses: Number(finalResult?.meta?.txSearchCacheBypasses || previous.liveTxCacheBypasses) || 0,
      }));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '누락 후보 조회 중 오류가 발생했습니다.';
      setError(message);
      toast.error(message);
      setLoadingProgress((previous) => ({
        ...previous,
        currentStep: 'error',
        phaseLabel: '조회 중 오류가 발생했습니다.',
      }));
    } finally {
      loadingRef.current = false;
      setLoading(false);
      window.setTimeout(() => {
        if (loadingRef.current) return;
        setLoadingProgress({
          percent: 0,
          elapsedSeconds: 0,
          phaseLabel: '',
          currentStep: '',
          stepMessageByKey: {},
          liveScannedTransactions: 0,
          liveMatchedTransfers: 0,
          liveTxCacheHits: 0,
          liveTxCacheMisses: 0,
          liveTxCacheBypasses: 0,
        });
      }, 900);
    }
  }, [lookbackDays, loadUnrecoveredCancelledCandidates]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    let isMounted = true;
    const defaultRole = isAgentManagementContext ? 'agent' : 'admin';
    const defaultNickname = isAgentManagementContext ? '에이전트' : '관리자';

    const applyFallback = () => {
      if (!isMounted) return;
      setRecoveryActorInfo({
        role: defaultRole,
        nickname: defaultNickname,
      });
    };

    if (!adminWalletAddress) {
      applyFallback();
      return () => {
        isMounted = false;
      };
    }

    const fetchRecoveryActorInfo = async () => {
      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: 'admin',
            walletAddress: adminWalletAddress,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(payload?.error || 'FAILED_TO_FETCH_RECOVERY_ACTOR'));
        }

        const resolvedRole =
          String(payload?.result?.role || defaultRole).trim().toLowerCase() || defaultRole;
        const resolvedNickname =
          String(payload?.result?.nickname || '').trim()
          || (resolvedRole === 'agent' ? '에이전트' : '관리자');

        if (!isMounted) return;
        setRecoveryActorInfo({
          role: resolvedRole,
          nickname: resolvedNickname,
        });
      } catch (error) {
        console.error('Failed to fetch recovery actor info', error);
        applyFallback();
      }
    };

    void fetchRecoveryActorInfo();
    return () => {
      isMounted = false;
    };
  }, [adminWalletAddress, isAgentManagementContext]);

  const handleRecoverCandidate = useCallback(async (candidate: CandidateItem) => {
    if (!isWalletConnected) {
      toast.error('지갑을 연결해주세요.');
      return;
    }

    const candidateId = String(candidate?.candidateId || '').trim();
    if (!candidateId) {
      toast.error('후보 식별자가 비어 있습니다.');
      return;
    }

    const buyerWalletAddress = String(
      buyerWalletDraftByCandidateId[candidateId]
      || candidate?.suggestedBuyerWalletAddress
      || '',
    ).trim();
    if (!isWalletAddress(buyerWalletAddress)) {
      toast.error('구매자 지갑주소를 정확히 입력해주세요.');
      return;
    }

    if (processingCandidateId === candidateId) {
      return;
    }

    setProcessingCandidateId(candidateId);

    try {
      const response = await fetch('/api/order/recoverMissingPrivateBuyOrder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buyerWalletAddress,
          sellerEscrowWalletAddress: candidate.sellerEscrowWalletAddress,
          buyerEscrowWalletAddress: candidate.buyerEscrowWalletAddress,
          transactionHash: candidate.transactionHash,
          transactionId: candidate.transactionId,
          usdtAmount: candidate.usdtAmount,
          confirmedAt: candidate.confirmedAt || candidate.createdAt,
          requesterWalletAddress: adminWalletAddress,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as RecoverResponse;
      if (!response.ok || !payload?.result?.success) {
        throw new Error(
          String(payload?.message || payload?.detail || payload?.reason || payload?.error || '보정 주문 생성에 실패했습니다.'),
        );
      }

      const tradeId = String(payload?.result?.tradeId || '').trim();
      const existed = Boolean(payload?.result?.existed);
      if (existed) {
        toast.success(tradeId ? `이미 주문이 존재합니다. (TID: ${tradeId})` : '이미 주문이 존재합니다.');
      } else {
        toast.success(tradeId ? `보정 주문 생성 완료 (TID: ${tradeId})` : '보정 주문 생성 완료');
      }

      setCandidates((previous) => previous.filter((item) => item.candidateId !== candidateId));
      setMeta((previous) => ({
        ...previous,
        missingCount: Math.max(0, previous.missingCount - 1),
      }));
    } catch (recoverError) {
      const message = recoverError instanceof Error ? recoverError.message : '보정 주문 생성 중 오류가 발생했습니다.';
      toast.error(message);
    } finally {
      setProcessingCandidateId('');
    }
  }, [
    adminWalletAddress,
    buyerWalletDraftByCandidateId,
    isWalletConnected,
    processingCandidateId,
  ]);

  const handleRecoverUnrecoveredCancelledCandidate = useCallback(async (candidate: UnrecoveredCancelledOrderItem) => {
    if (!isWalletConnected) {
      toast.error('지갑을 연결해주세요.');
      return;
    }

    const candidateId = String(candidate?.candidateId || '').trim();
    const orderId = String(candidate?.orderId || '').trim();
    if (!candidateId || !orderId) {
      toast.error('회수 대상 주문 식별자가 비어 있습니다.');
      return;
    }

    if (processingUnrecoveredCandidateId === candidateId) {
      return;
    }

    setProcessingUnrecoveredCandidateId(candidateId);
    try {
      const response = await fetch('/api/order/recoverCancelledPrivateBuyOrderRollback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          requesterWalletAddress: adminWalletAddress,
          recoveredByRole: recoveryActorRole,
          recoveredByNickname: recoveryActorNickname,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as RecoverCancelledRollbackResponse;
      if (!response.ok || !payload?.result?.success) {
        throw new Error(
          String(
            payload?.message
            || payload?.detail
            || payload?.reason
            || payload?.error
            || '회수 처리에 실패했습니다.',
          ),
        );
      }

      const txHash = String(payload?.result?.transactionHash || '').trim();
      const alreadyRecovered = payload?.result?.alreadyRecovered === true;

      if (alreadyRecovered) {
        toast.success(txHash ? `이미 회수 처리됨 (TX: ${shortText(txHash, 10, 8)})` : '이미 회수 처리된 주문입니다.');
      } else {
        toast.success(txHash ? `회수 처리 완료 (TX: ${shortText(txHash, 10, 8)})` : '회수 처리 완료');
      }

      await loadUnrecoveredCancelledCandidates();
    } catch (recoverError) {
      const message = recoverError instanceof Error ? recoverError.message : '회수 처리 중 오류가 발생했습니다.';
      toast.error(message);
    } finally {
      setProcessingUnrecoveredCandidateId('');
    }
  }, [
    adminWalletAddress,
    isWalletConnected,
    loadUnrecoveredCancelledCandidates,
    processingUnrecoveredCandidateId,
    recoveryActorNickname,
    recoveryActorRole,
  ]);

  const availableCandidates = useMemo(
    () => candidates.filter((item) => item && item.candidateId),
    [candidates],
  );
  const availableExcludedCandidates = useMemo(
    () => excludedCandidates.filter((item) => item && item.candidateId),
    [excludedCandidates],
  );
  const normalizedExcludedSellerSearchText = excludedSellerSearchText.trim().toLowerCase();
  const filteredExcludedCandidates = useMemo(() => {
    if (!normalizedExcludedSellerSearchText) return availableExcludedCandidates;
    return availableExcludedCandidates.filter((item) => {
      const sellerNickname = String(item?.sellerNickname || '').trim().toLowerCase();
      const sellerWalletAddress = String(item?.sellerWalletAddress || '').trim().toLowerCase();
      return (
        sellerNickname.includes(normalizedExcludedSellerSearchText)
        || sellerWalletAddress.includes(normalizedExcludedSellerSearchText)
      );
    });
  }, [availableExcludedCandidates, normalizedExcludedSellerSearchText]);
  const cancelledMatchedExcludedCandidates = useMemo(
    () => filteredExcludedCandidates.filter((item) => isCancelledMatchedExcludedCandidate(item)),
    [filteredExcludedCandidates],
  );
  const nonCancelledExcludedCandidates = useMemo(
    () => filteredExcludedCandidates.filter((item) => !isCancelledMatchedExcludedCandidate(item)),
    [filteredExcludedCandidates],
  );
  const mainExcludedCandidates = useMemo(
    () => (showCancelledExcludedSeparately ? nonCancelledExcludedCandidates : filteredExcludedCandidates),
    [showCancelledExcludedSeparately, nonCancelledExcludedCandidates, filteredExcludedCandidates],
  );
  const excludedCandidatesTotalCount = mainExcludedCandidates.length;
  const excludedCandidatesTotalPages = Math.max(
    1,
    Math.ceil(excludedCandidatesTotalCount / EXCLUDED_CANDIDATES_PAGE_SIZE),
  );
  const currentExcludedCandidatesPage = Math.min(
    Math.max(excludedCandidatesPage, 1),
    excludedCandidatesTotalPages,
  );
  const pagedExcludedCandidates = useMemo(() => {
    const startIndex = (currentExcludedCandidatesPage - 1) * EXCLUDED_CANDIDATES_PAGE_SIZE;
    return mainExcludedCandidates.slice(startIndex, startIndex + EXCLUDED_CANDIDATES_PAGE_SIZE);
  }, [mainExcludedCandidates, currentExcludedCandidatesPage]);
  const excludedPageStart = excludedCandidatesTotalCount
    ? (currentExcludedCandidatesPage - 1)
      * EXCLUDED_CANDIDATES_PAGE_SIZE
      + 1
    : 0;
  const excludedPageEnd = excludedCandidatesTotalCount
    ? Math.min(excludedPageStart + pagedExcludedCandidates.length - 1, excludedCandidatesTotalCount)
    : 0;

  const cancelledExcludedCandidatesTotalCount = cancelledMatchedExcludedCandidates.length;
  const cancelledExcludedCandidatesTotalPages = Math.max(
    1,
    Math.ceil(cancelledExcludedCandidatesTotalCount / EXCLUDED_CANDIDATES_PAGE_SIZE),
  );
  const currentCancelledExcludedCandidatesPage = Math.min(
    Math.max(cancelledExcludedCandidatesPage, 1),
    cancelledExcludedCandidatesTotalPages,
  );
  const pagedCancelledExcludedCandidates = useMemo(() => {
    const startIndex = (currentCancelledExcludedCandidatesPage - 1) * EXCLUDED_CANDIDATES_PAGE_SIZE;
    return cancelledMatchedExcludedCandidates.slice(startIndex, startIndex + EXCLUDED_CANDIDATES_PAGE_SIZE);
  }, [cancelledMatchedExcludedCandidates, currentCancelledExcludedCandidatesPage]);
  const cancelledExcludedPageStart = cancelledExcludedCandidatesTotalCount
    ? (currentCancelledExcludedCandidatesPage - 1)
      * EXCLUDED_CANDIDATES_PAGE_SIZE
      + 1
    : 0;
  const cancelledExcludedPageEnd = cancelledExcludedCandidatesTotalCount
    ? Math.min(
      cancelledExcludedPageStart + pagedCancelledExcludedCandidates.length - 1,
      cancelledExcludedCandidatesTotalCount,
    )
    : 0;

  useEffect(() => {
    setExcludedCandidatesPage((previous) => {
      if (previous < 1) return 1;
      if (previous > excludedCandidatesTotalPages) return excludedCandidatesTotalPages;
      return previous;
    });
  }, [excludedCandidatesTotalPages]);

  useEffect(() => {
    setExcludedCandidatesPage(1);
    setCancelledExcludedCandidatesPage(1);
  }, [normalizedExcludedSellerSearchText, showCancelledExcludedSeparately]);

  useEffect(() => {
    setCancelledExcludedCandidatesPage((previous) => {
      if (previous < 1) return 1;
      if (previous > cancelledExcludedCandidatesTotalPages) return cancelledExcludedCandidatesTotalPages;
      return previous;
    });
  }, [cancelledExcludedCandidatesTotalPages]);

  const availableUnrecoveredCancelledCandidates = useMemo(
    () => unrecoveredCancelledCandidates.filter((item) => item && item.candidateId),
    [unrecoveredCancelledCandidates],
  );
  const unrecoveredCancelledTotalCount = availableUnrecoveredCancelledCandidates.length;
  const unrecoveredCancelledTotalPages = Math.max(
    1,
    Math.ceil(unrecoveredCancelledTotalCount / UNRECOVERED_CANCELLED_PAGE_SIZE),
  );
  const currentUnrecoveredCancelledPage = Math.min(
    Math.max(unrecoveredCancelledPage, 1),
    unrecoveredCancelledTotalPages,
  );
  const pagedUnrecoveredCancelledCandidates = useMemo(() => {
    const startIndex = (currentUnrecoveredCancelledPage - 1) * UNRECOVERED_CANCELLED_PAGE_SIZE;
    return availableUnrecoveredCancelledCandidates.slice(
      startIndex,
      startIndex + UNRECOVERED_CANCELLED_PAGE_SIZE,
    );
  }, [availableUnrecoveredCancelledCandidates, currentUnrecoveredCancelledPage]);
  const unrecoveredPageStart = unrecoveredCancelledTotalCount
    ? (currentUnrecoveredCancelledPage - 1) * UNRECOVERED_CANCELLED_PAGE_SIZE + 1
    : 0;
  const unrecoveredPageEnd = unrecoveredCancelledTotalCount
    ? Math.min(unrecoveredPageStart + pagedUnrecoveredCancelledCandidates.length - 1, unrecoveredCancelledTotalCount)
    : 0;

  useEffect(() => {
    setUnrecoveredCancelledPage((previous) => {
      if (previous < 1) return 1;
      if (previous > unrecoveredCancelledTotalPages) return unrecoveredCancelledTotalPages;
      return previous;
    });
  }, [unrecoveredCancelledTotalPages]);

  const progressSteps = useMemo(() => {
    const currentIndex = PROGRESS_STEPS.findIndex((item) => item.key === loadingProgress.currentStep);
    const isComplete = loadingProgress.currentStep === 'complete' || loadingProgress.percent >= 100;
    const isErrored = loadingProgress.currentStep === 'error';

    return PROGRESS_STEPS.map((step, index) => {
      let status: 'pending' | 'active' | 'done' = 'pending';
      if (isComplete) {
        status = 'done';
      } else if (currentIndex >= 0) {
        if (index < currentIndex) status = 'done';
        else if (index === currentIndex) status = 'active';
      } else if (!isErrored && loadingProgress.percent > 0 && index === 0) {
        status = 'active';
      }

      return {
        ...step,
        status,
        message: String(loadingProgress.stepMessageByKey[step.key] || '').trim(),
      };
    });
  }, [loadingProgress.currentStep, loadingProgress.percent, loadingProgress.stepMessageByKey]);

  const completedProgressStepCount = useMemo(
    () => progressSteps.filter((step) => step.status === 'done').length,
    [progressSteps],
  );
  const handleCopyWalletAddress = useCallback(async (value: string, label = '지갑주소') => {
    const normalized = String(value || '').trim();
    if (!isWalletAddress(normalized)) {
      toast.error('복사할 지갑주소가 없습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(normalized);
      toast.success(`${label} 복사 완료`);
    } catch {
      toast.error('지갑주소 복사에 실패했습니다.');
    }
  }, []);

  const renderExcludedCandidateRow = useCallback((candidate: ExcludedCandidateItem, rowKeyPrefix: string) => {
    const txMatched = Boolean(candidate.excludedByExistingTxHash);
    const escrowMatched = Boolean(candidate.excludedByExistingEscrowWallet);
    const reasonText = txMatched && escrowMatched
      ? '기존 tx hash + escrow'
      : txMatched
        ? '기존 tx hash'
        : escrowMatched
          ? '기존 escrow'
          : '-';

    const existingByTxTradeId = String(candidate.existingByTxTradeId || '').trim();
    const existingByEscrowTradeId = String(candidate.existingByEscrowTradeId || '').trim();
    const existingByTxOrderId = String(candidate.existingByTxOrderId || '').trim();
    const existingByEscrowOrderId = String(candidate.existingByEscrowOrderId || '').trim();
    const existingByTxStatusRaw = String(candidate.existingByTxOrderStatus || '').trim();
    const existingByEscrowStatusRaw = String(candidate.existingByEscrowOrderStatus || '').trim();
    const existingOrderStatusRaw = String(candidate.existingOrderStatus || '').trim();
    const existingByTxStatus = normalizeOrderStatus(existingByTxStatusRaw);
    const existingByEscrowStatus = normalizeOrderStatus(existingByEscrowStatusRaw);
    const existingOrderStatus = normalizeOrderStatus(existingOrderStatusRaw)
      || existingByTxStatus
      || existingByEscrowStatus;
    const existingOrderStatusDisplay = existingOrderStatusRaw
      || existingByTxStatusRaw
      || existingByEscrowStatusRaw;
    const cancelledMatched = isCancelledMatchedExcludedCandidate(candidate);

    return (
      <tr key={`${rowKeyPrefix}-${candidate.candidateId}`} className="align-top text-slate-700">
        <td className="border border-slate-200 px-2 py-2 leading-5 break-words">
          <div>{formatDateTime(candidate.confirmedAt || candidate.createdAt)}</div>
          <div className="text-[11px] text-slate-500">created: {formatDateTime(candidate.createdAt)}</div>
        </td>
        <td className="border border-slate-200 px-2 py-2 leading-5 break-all">
          <div className="font-semibold text-slate-900">{shortText(candidate.transactionHash, 10, 8)}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">id: {shortText(candidate.transactionId, 8, 6)}</div>
        </td>
        <td className="border border-slate-200 px-2 py-2 leading-5 break-all">
          <div className="font-semibold text-slate-900">
            {candidate.sellerNickname || shortText(candidate.sellerWalletAddress)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{shortText(candidate.sellerWalletAddress)}</div>
        </td>
        <td className="border border-slate-200 px-2 py-2 leading-5 break-all">
          <div className="flex flex-wrap items-center gap-1 font-semibold text-slate-900">
            <span>{shortText(candidate.buyerEscrowWalletAddress)}</span>
            <button
              type="button"
              onClick={() => void handleCopyWalletAddress(candidate.buyerEscrowWalletAddress, '구매자 에스크로 지갑')}
              className="inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              복사
            </button>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{formatUsdt(candidate.usdtAmount)} USDT</div>
        </td>
        <td className="border border-slate-200 px-2 py-2 leading-5 break-words">
          <div className="font-semibold text-amber-700">{reasonText}</div>
        </td>
        <td className="border border-slate-200 px-2 py-2 leading-5 break-all text-[11px] text-slate-600">
          {existingByTxTradeId && (
            <div>
              tx: {existingByTxTradeId} ({shortText(existingByTxOrderId, 8, 6)})
              {existingByTxStatusRaw ? ` [${existingByTxStatusRaw}]` : ''}
            </div>
          )}
          {existingByEscrowTradeId && (
            <div>
              escrow: {existingByEscrowTradeId} ({shortText(existingByEscrowOrderId, 8, 6)})
              {existingByEscrowStatusRaw ? ` [${existingByEscrowStatusRaw}]` : ''}
            </div>
          )}
          {!existingByTxTradeId && !existingByEscrowTradeId && (
            <div>-</div>
          )}
          {existingOrderStatus && (
            <div
              className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                cancelledMatched
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-300 bg-slate-100 text-slate-700'
              }`}
            >
              상태: {existingOrderStatusDisplay || existingOrderStatus}
            </div>
          )}
        </td>
      </tr>
    );
  }, [handleCopyWalletAddress]);

  return (
    <main className="min-h-screen bg-transparent">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-20 pt-6 lg:px-6 lg:pt-8">
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/95 shadow-sm">
                <Image src="/icon-buyorder.png" alt="Recovery" width={22} height={22} className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                  Missing Buyorder Recovery
                </p>
                <h1 className="text-xl font-bold text-slate-900">누락 구매주문 보정</h1>
                <p className="text-sm text-slate-500">
                  전송은 완료됐지만 주문이 생성되지 않은 private-buy 후보를 조회하고 수동 보정 주문을 생성합니다.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={lookbackDays}
                onChange={(event) => setLookbackDays(Number(event.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-slate-500 focus:outline-none"
              >
                {LOOKBACK_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    최근 {days}일
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadCandidates()}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? '조회중...' : '새로고침'}
              </button>
            </div>
          </div>
        </section>

        {!isWalletConnected && (
          <section className="rounded-2xl border border-cyan-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.98)_100%)] p-4 shadow-[0_20px_48px_-36px_rgba(14,116,144,0.65)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-slate-900">지갑 연결이 필요합니다</p>
                <p className="mt-1 text-xs text-slate-600">
                  보정 주문 생성은 관리자 지갑 연결 후 진행할 수 있습니다.
                </p>
              </div>
              <div className="w-full sm:w-auto">
                <ConnectButton
                  client={client}
                  wallets={wallets.length ? wallets : wallet ? [wallet] : []}
                  locale="ko_KR"
                  theme="light"
                  connectButton={{
                    label: '지갑 연결',
                    style: {
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      borderRadius: '9999px',
                      border: '1px solid rgba(15,23,42,0.3)',
                      height: '42px',
                      minWidth: '148px',
                      fontWeight: 700,
                      fontSize: '14px',
                      width: '100%',
                    },
                  }}
                  connectModal={{
                    size: 'wide',
                    showThirdwebBranding: false,
                  }}
                />
              </div>
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">누락 후보</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{meta.missingCount.toLocaleString('ko-KR')}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">제외 후보</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{meta.excludedCount.toLocaleString('ko-KR')}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">매칭 전송</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{meta.matchedTransfers.toLocaleString('ko-KR')}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">스캔 트랜잭션</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{meta.scannedTransactions.toLocaleString('ko-KR')}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">판매자</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{meta.sellerCount.toLocaleString('ko-KR')}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Private-Buy 지갑</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{meta.privateBuyWalletCount.toLocaleString('ko-KR')}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">체인</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{meta.chain || '-'}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.42)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">누락 후보 목록</p>
            <p className="text-xs text-slate-500">
              마지막 갱신: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'}
            </p>
          </div>

          {error && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {meta.privateBuyWalletWarning && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {meta.engineServerWalletLookupFailed
                ? 'Engine 서버지갑 조회가 일부 실패하여 fallback 모드(수신자 기반)로 후보를 표시합니다. '
                : ''}
              {meta.privateBuyWalletWarning}
            </div>
          )}

          {(loading || loadingProgress.phaseLabel) && (
            <section className="rounded-2xl border border-cyan-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(236,253,245,0.9)_100%)] p-4 shadow-[0_18px_38px_-34px_rgba(6,95,70,0.45)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">조회 진행 상황</p>
                <p className="text-xs font-semibold text-slate-600">
                  {Math.max(0, Math.min(100, Math.floor(loadingProgress.percent || 0)))}%
                  {loadingProgress.elapsedSeconds > 0 ? ` · ${loadingProgress.elapsedSeconds}초` : ''}
                </p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, loadingProgress.percent || 0))}%` }}
                />
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-md border border-cyan-200/80 bg-white/80 px-2 py-1.5">
                  실시간 스캔 tx: <span className="font-semibold">{loadingProgress.liveScannedTransactions.toLocaleString('ko-KR')}</span>
                </div>
                <div className="rounded-md border border-cyan-200/80 bg-white/80 px-2 py-1.5">
                  실시간 매칭: <span className="font-semibold">{loadingProgress.liveMatchedTransfers.toLocaleString('ko-KR')}</span>
                </div>
                <div className="rounded-md border border-cyan-200/80 bg-white/80 px-2 py-1.5">
                  캐시 hit: <span className="font-semibold">{loadingProgress.liveTxCacheHits.toLocaleString('ko-KR')}</span>
                </div>
                <div className="rounded-md border border-cyan-200/80 bg-white/80 px-2 py-1.5">
                  캐시 miss: <span className="font-semibold">{loadingProgress.liveTxCacheMisses.toLocaleString('ko-KR')}</span>
                </div>
                <div className="rounded-md border border-cyan-200/80 bg-white/80 px-2 py-1.5">
                  캐시 bypass: <span className="font-semibold">{loadingProgress.liveTxCacheBypasses.toLocaleString('ko-KR')}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                단계 진행: {completedProgressStepCount.toLocaleString('ko-KR')} / {PROGRESS_STEPS.length.toLocaleString('ko-KR')}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {loadingProgress.phaseLabel || '조회 진행 중입니다.'}
              </p>
              <div className="mt-2 space-y-1 rounded-lg border border-cyan-100 bg-white/70 p-2">
                {progressSteps.map((step) => (
                  <div key={step.key} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${
                        step.status === 'done'
                          ? 'bg-emerald-500'
                          : step.status === 'active'
                            ? 'bg-cyan-500'
                            : 'bg-slate-300'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-semibold ${
                          step.status === 'active'
                            ? 'text-cyan-700'
                            : step.status === 'done'
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                        }`}
                      >
                        {step.label}
                      </p>
                      {step.message && step.status !== 'pending' && (
                        <p className="truncate text-[11px] text-slate-500">{step.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="w-full overflow-hidden">
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              {SHOW_RECOVERY_ACTION_COLUMNS ? (
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[20%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[24%]" />
                  <col className="w-[7%]" />
                </colgroup>
              ) : (
                <colgroup>
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[28%]" />
                  <col className="w-[24%]" />
                  <col className="w-[20%]" />
                </colgroup>
              )}
              <thead>
                <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                  <th className="rounded-tl-xl border border-slate-200 px-3 py-2">시간</th>
                  <th className="border border-slate-200 px-3 py-2">트랜잭션</th>
                  <th className="border border-slate-200 px-3 py-2">판매자 / 에스크로</th>
                  <th className="border border-slate-200 px-3 py-2">구매자 에스크로</th>
                  <th className="border border-slate-200 px-3 py-2">USDT</th>
                  {SHOW_RECOVERY_ACTION_COLUMNS && (
                    <>
                      <th className="border border-slate-200 px-3 py-2">구매자 지갑 입력</th>
                      <th className="rounded-tr-xl border border-slate-200 px-3 py-2">보정</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {availableCandidates.length === 0 && (
                  <tr>
                    <td
                      colSpan={SHOW_RECOVERY_ACTION_COLUMNS ? 7 : 5}
                      className="border border-slate-200 px-4 py-8 text-center text-sm text-slate-500"
                    >
                      표시할 누락 후보가 없습니다.
                    </td>
                  </tr>
                )}

                {availableCandidates.map((candidate) => {
                  const candidateId = String(candidate.candidateId || '').trim();
                  const suggestedBuyer = String(candidate.suggestedBuyerWalletAddress || '').trim();
                  const draftBuyerWalletAddress = String(
                    buyerWalletDraftByCandidateId[candidateId]
                    || suggestedBuyer
                    || '',
                  ).trim();
                  const isProcessing = processingCandidateId === candidateId;

                  return (
                    <tr key={candidateId} className="align-top text-slate-700">
                      <td className="border border-slate-200 px-2 py-3 text-xs leading-5 break-words">
                        <div>{formatDateTime(candidate.confirmedAt || candidate.createdAt)}</div>
                        <div className="text-[11px] text-slate-500">created: {formatDateTime(candidate.createdAt)}</div>
                      </td>
                      <td className="border border-slate-200 px-2 py-3 text-xs leading-5 break-all">
                        <div className="font-semibold text-slate-900">{shortText(candidate.transactionHash, 10, 8)}</div>
                        <div className="mt-1 text-[11px] text-slate-500">id: {shortText(candidate.transactionId, 8, 6)}</div>
                      </td>
                      <td className="border border-slate-200 px-2 py-3 text-xs leading-5 break-all">
                        <div className="font-semibold text-slate-900">
                          {candidate.sellerNickname || shortText(candidate.sellerWalletAddress)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                          <span>{shortText(candidate.sellerWalletAddress)}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopyWalletAddress(candidate.sellerWalletAddress, '판매자 지갑')}
                            className="inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            복사
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                          <span>escrow: {shortText(candidate.sellerEscrowWalletAddress)}</span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyWalletAddress(candidate.sellerEscrowWalletAddress, '판매자 에스크로 지갑')
                            }
                            className="inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            복사
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                          <span>from: {shortText(candidate.fromAddress)}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopyWalletAddress(candidate.fromAddress, '전송자 지갑')}
                            className="inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            복사
                          </button>
                        </div>
                      </td>
                      <td className="border border-slate-200 px-2 py-3 text-xs leading-5 break-all">
                        <div className="flex flex-wrap items-center gap-1 font-semibold text-slate-900">
                          <span>{shortText(candidate.buyerEscrowWalletAddress)}</span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyWalletAddress(candidate.buyerEscrowWalletAddress, '구매자 에스크로 지갑')
                            }
                            className="inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            복사
                          </button>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {candidate.privateBuyWalletLabel || '-'}
                        </div>
                      </td>
                      <td className="border border-slate-200 px-2 py-3 text-xs leading-5 break-words">
                        <div className="font-semibold text-slate-900">{formatUsdt(candidate.usdtAmount)} USDT</div>
                        <div className="mt-1 text-[11px] text-slate-500">raw: {candidate.rawAmount || '-'}</div>
                      </td>
                      {SHOW_RECOVERY_ACTION_COLUMNS && (
                        <td className="border border-slate-200 px-2 py-3 text-xs leading-5">
                          <input
                            type="text"
                            value={draftBuyerWalletAddress}
                            onChange={(event) => {
                              const nextValue = String(event.target.value || '').trim();
                              setBuyerWalletDraftByCandidateId((previous) => ({
                                ...previous,
                                [candidateId]: nextValue,
                              }));
                            }}
                            placeholder="0x..."
                            className="min-w-0 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 focus:border-slate-500 focus:outline-none"
                          />
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => void handleCopyWalletAddress(draftBuyerWalletAddress, '구매자 지갑')}
                              className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              입력 지갑 복사
                            </button>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {candidate.suggestedBuyerMatchCount > 1
                              ? `힌트 prefix(${candidate.buyerWalletHintPrefix}) 일치 계정 ${candidate.suggestedBuyerMatchCount}개`
                              : candidate.suggestedBuyerMatchCount === 1
                                ? `추천: ${candidate.suggestedBuyerNickname || shortText(candidate.suggestedBuyerWalletAddress)}`
                                : candidate.buyerWalletHintPrefix
                                  ? `힌트 prefix: ${candidate.buyerWalletHintPrefix}`
                                  : '자동 추천 없음'}
                          </div>
                        </td>
                      )}
                      {SHOW_RECOVERY_ACTION_COLUMNS && (
                        <td className="border border-slate-200 px-2 py-3">
                          <button
                            type="button"
                            onClick={() => void handleRecoverCandidate(candidate)}
                            disabled={!isWalletConnected || isProcessing}
                            className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-slate-900 px-2 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isProcessing ? '처리중...' : '보정 주문 생성'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">제외된 후보 목록 (기존 주문 매칭)</p>
              <p className="text-xs text-slate-600">
                tx hash 매칭: {meta.excludedByExistingTxHashCount.toLocaleString('ko-KR')}
                {' · '}
                escrow 매칭: {meta.excludedByExistingEscrowWalletCount.toLocaleString('ko-KR')}
                {' · '}
                동시 매칭: {meta.excludedByBothCount.toLocaleString('ko-KR')}
                {' · '}
                cancelled 매칭: {meta.excludedCancelledOrderCount.toLocaleString('ko-KR')}
              </p>
            </div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={showCancelledExcludedSeparately}
                  onChange={(event) => setShowCancelledExcludedSeparately(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                />
                cancelled 주문 별도 표시
              </label>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                  type="text"
                  value={excludedSellerSearchText}
                  onChange={(event) => setExcludedSellerSearchText(String(event.target.value || ''))}
                  placeholder="판매자 아이디 검색"
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-slate-500 focus:outline-none sm:w-64"
                />
                <button
                  type="button"
                  onClick={() => setExcludedSellerSearchText('')}
                  disabled={!excludedSellerSearchText.trim()}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  초기화
                </button>
              </div>
            </div>

            {showCancelledExcludedSeparately && (
              <div className="mb-2 rounded-lg border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-xs text-cyan-800">
                일반 제외(취소 아님): {nonCancelledExcludedCandidates.length.toLocaleString('ko-KR')}건
                {' · '}
                cancelled 매칭 제외: {cancelledMatchedExcludedCandidates.length.toLocaleString('ko-KR')}건
              </div>
            )}

            <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[18%]" />
                  <col className="w-[16%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 text-left font-semibold uppercase tracking-[0.12em] text-slate-600">
                    <th className="border border-slate-200 px-2 py-2">시간</th>
                    <th className="border border-slate-200 px-2 py-2">트랜잭션</th>
                    <th className="border border-slate-200 px-2 py-2">판매자</th>
                    <th className="border border-slate-200 px-2 py-2">구매자 에스크로</th>
                    <th className="border border-slate-200 px-2 py-2">제외 사유</th>
                    <th className="border border-slate-200 px-2 py-2">기존 주문</th>
                  </tr>
                </thead>
                <tbody>
                  {excludedCandidatesTotalCount === 0 && (
                    <tr>
                      <td colSpan={6} className="border border-slate-200 px-3 py-6 text-center text-slate-500">
                        {showCancelledExcludedSeparately
                          ? '표시할 일반 제외 후보가 없습니다.'
                          : '제외된 후보가 없습니다.'}
                      </td>
                    </tr>
                  )}
                  {pagedExcludedCandidates.map((candidate) => renderExcludedCandidateRow(candidate, 'excluded-main'))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-xs text-slate-600">
                {excludedCandidatesTotalCount > 0
                  ? `${showCancelledExcludedSeparately ? '일반 제외' : '검색 결과'} ${excludedCandidatesTotalCount.toLocaleString('ko-KR')}건 중 ${excludedPageStart.toLocaleString('ko-KR')}-${excludedPageEnd.toLocaleString('ko-KR')}건 표시`
                  : '총 0건'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExcludedCandidatesPage((previous) => Math.max(1, previous - 1))}
                  disabled={excludedCandidatesTotalCount === 0 || currentExcludedCandidatesPage <= 1}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이전
                </button>
                <span className="text-xs font-medium text-slate-600">
                  {excludedCandidatesTotalCount === 0
                    ? '0 / 0'
                    : `${currentExcludedCandidatesPage} / ${excludedCandidatesTotalPages}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setExcludedCandidatesPage((previous) => Math.min(excludedCandidatesTotalPages, previous + 1))
                  }
                  disabled={
                    excludedCandidatesTotalCount === 0
                    || currentExcludedCandidatesPage >= excludedCandidatesTotalPages
                  }
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            </div>

            {showCancelledExcludedSeparately && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/60 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-rose-900">
                    cancelled 주문 매칭 제외 목록 (기존 주문 존재)
                  </p>
                  <p className="text-[11px] text-rose-700">
                    총 {cancelledExcludedCandidatesTotalCount.toLocaleString('ko-KR')}건
                  </p>
                </div>
                <div className="w-full overflow-hidden rounded-lg border border-rose-200 bg-white">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
                    <colgroup>
                      <col className="w-[16%]" />
                      <col className="w-[18%]" />
                      <col className="w-[16%]" />
                      <col className="w-[18%]" />
                      <col className="w-[14%]" />
                      <col className="w-[18%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-rose-100 text-left font-semibold uppercase tracking-[0.12em] text-rose-700">
                        <th className="border border-rose-200 px-2 py-2">시간</th>
                        <th className="border border-rose-200 px-2 py-2">트랜잭션</th>
                        <th className="border border-rose-200 px-2 py-2">판매자</th>
                        <th className="border border-rose-200 px-2 py-2">구매자 에스크로</th>
                        <th className="border border-rose-200 px-2 py-2">제외 사유</th>
                        <th className="border border-rose-200 px-2 py-2">기존 주문</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cancelledExcludedCandidatesTotalCount === 0 && (
                        <tr>
                          <td colSpan={6} className="border border-rose-200 px-3 py-6 text-center text-rose-700/80">
                            표시할 cancelled 매칭 제외 후보가 없습니다.
                          </td>
                        </tr>
                      )}
                      {pagedCancelledExcludedCandidates.map((candidate) =>
                        renderExcludedCandidateRow(candidate, 'excluded-cancelled'))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="text-xs text-rose-700">
                    {cancelledExcludedCandidatesTotalCount > 0
                      ? `${cancelledExcludedCandidatesTotalCount.toLocaleString('ko-KR')}건 중 ${cancelledExcludedPageStart.toLocaleString('ko-KR')}-${cancelledExcludedPageEnd.toLocaleString('ko-KR')}건 표시`
                      : '총 0건'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCancelledExcludedCandidatesPage((previous) => Math.max(1, previous - 1))}
                      disabled={cancelledExcludedCandidatesTotalCount === 0 || currentCancelledExcludedCandidatesPage <= 1}
                      className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      이전
                    </button>
                    <span className="text-xs font-medium text-rose-700">
                      {cancelledExcludedCandidatesTotalCount === 0
                        ? '0 / 0'
                        : `${currentCancelledExcludedCandidatesPage} / ${cancelledExcludedCandidatesTotalPages}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCancelledExcludedCandidatesPage((previous) =>
                          Math.min(cancelledExcludedCandidatesTotalPages, previous + 1))
                      }
                      disabled={
                        cancelledExcludedCandidatesTotalCount === 0
                        || currentCancelledExcludedCandidatesPage >= cancelledExcludedCandidatesTotalPages
                      }
                      className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      다음
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-rose-200/80 bg-rose-50/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">취소 주문 회수 누락 후보 (USDT 미회수 추정)</p>
              <p className="text-xs text-slate-600">
                점검: {unrecoveredCancelledMeta.inspectedAt ? formatDateTime(unrecoveredCancelledMeta.inspectedAt) : '-'}
              </p>
            </div>

            <div className="mb-2 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-md border border-rose-200/80 bg-white/80 px-2 py-1.5">
                취소 주문 스캔: <span className="font-semibold">{unrecoveredCancelledMeta.scannedCancelledOrders.toLocaleString('ko-KR')}</span>
              </div>
              <div className="rounded-md border border-rose-200/80 bg-white/80 px-2 py-1.5">
                회수 누락 후보: <span className="font-semibold">{unrecoveredCancelledMeta.missingRollbackTransferCount.toLocaleString('ko-KR')}</span>
              </div>
              <div className="rounded-md border border-rose-200/80 bg-white/80 px-2 py-1.5">
                회수 tx 존재(제외): <span className="font-semibold">{unrecoveredCancelledMeta.excludedWithRollbackTxHashCount.toLocaleString('ko-KR')}</span>
              </div>
              <div className="rounded-md border border-rose-200/80 bg-white/80 px-2 py-1.5">
                이미 회수처리(제외): <span className="font-semibold">{unrecoveredCancelledMeta.excludedAlreadyRecoveredCount.toLocaleString('ko-KR')}</span>
              </div>
              <div className="rounded-md border border-rose-200/80 bg-white/80 px-2 py-1.5">
                에스크로 주소 누락: <span className="font-semibold">{unrecoveredCancelledMeta.missingEscrowAddressCount.toLocaleString('ko-KR')}</span>
              </div>
              <div className="rounded-md border border-rose-200/80 bg-white/80 px-2 py-1.5">
                회수예상금액 누락: <span className="font-semibold">{unrecoveredCancelledMeta.missingExpectedRollbackAmountCount.toLocaleString('ko-KR')}</span>
              </div>
            </div>

            <div className="mb-2 rounded-md border border-rose-200/80 bg-white/80 px-2 py-1.5 text-xs text-slate-700">
              회수 처리자: <span className="font-semibold">{recoveryActorNickname}</span>
              {' '}({recoveryActorRoleLabel})
              {adminWalletAddress ? ` · ${shortText(adminWalletAddress, 8, 6)}` : ''}
            </div>

            {unrecoveredCancelledLoading && (
              <div className="mb-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs text-slate-600">
                취소 주문 회수 누락 후보를 조회하고 있습니다...
              </div>
            )}

            {unrecoveredCancelledError && (
              <div className="mb-2 rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-xs text-rose-800">
                {unrecoveredCancelledError}
              </div>
            )}

            <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                  <col className="w-[10%]" />
                  <col className="w-[7%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 text-left font-semibold uppercase tracking-[0.12em] text-slate-600">
                    <th className="border border-slate-200 px-2 py-2">취소 시간</th>
                    <th className="border border-slate-200 px-2 py-2">주문</th>
                    <th className="border border-slate-200 px-2 py-2">판매자</th>
                    <th className="border border-slate-200 px-2 py-2">구매자 에스크로</th>
                    <th className="border border-slate-200 px-2 py-2">판매자 에스크로</th>
                    <th className="border border-slate-200 px-2 py-2">예상 회수</th>
                    <th className="border border-slate-200 px-2 py-2">취소 사유</th>
                    <th className="border border-slate-200 px-2 py-2">이슈</th>
                    <th className="border border-slate-200 px-2 py-2">회수</th>
                  </tr>
                </thead>
                <tbody>
                  {unrecoveredCancelledTotalCount === 0 && (
                    <tr>
                      <td colSpan={9} className="border border-slate-200 px-3 py-6 text-center text-slate-500">
                        표시할 회수 누락 후보가 없습니다.
                      </td>
                    </tr>
                  )}
                  {pagedUnrecoveredCancelledCandidates.map((candidate) => {
                    const issueCodes = Array.isArray(candidate.issueCodes) ? candidate.issueCodes : [];
                    const issueText = issueCodes.length
                      ? issueCodes
                        .map((code) => (
                          code === 'missing-rollback-tx-hash'
                            ? '회수 tx hash 없음'
                            : code === 'missing-escrow-wallet-address'
                              ? '에스크로 주소 누락'
                              : code === 'missing-expected-rollback-amount'
                                ? '회수예상금액 누락'
                                : code
                        ))
                        .join(', ')
                      : '-';

                    return (
                      <tr key={`unrecovered-${candidate.candidateId}`} className="align-top text-slate-700">
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-words">
                          <div>{formatDateTime(candidate.cancelledAt)}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">req: {formatDateTime(candidate.paymentRequestedAt)}</div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-all">
                          <div className="font-semibold text-slate-900">{candidate.tradeId || '-'}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{shortText(candidate.orderId, 8, 6)}</div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-all">
                          <div className="font-semibold text-slate-900">
                            {candidate.sellerNickname || shortText(candidate.sellerWalletAddress)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{shortText(candidate.sellerWalletAddress)}</div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-all">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="font-semibold text-slate-900">{shortText(candidate.buyerEscrowWalletAddress)}</span>
                            <button
                              type="button"
                              onClick={() => void handleCopyWalletAddress(candidate.buyerEscrowWalletAddress, '구매자 에스크로 지갑')}
                              className="inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              복사
                            </button>
                          </div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-all">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="font-semibold text-slate-900">{shortText(candidate.sellerEscrowWalletAddress)}</span>
                            <button
                              type="button"
                              onClick={() => void handleCopyWalletAddress(candidate.sellerEscrowWalletAddress, '판매자 에스크로 지갑')}
                              className="inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              복사
                            </button>
                          </div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-words">
                          <div className="font-semibold text-slate-900">{formatUsdt(candidate.expectedRollbackUsdtAmount)} USDT</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">주문: {formatUsdt(candidate.usdtAmount)}</div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-words text-[11px] text-slate-600">
                          <div>{candidate.cancelTradeReason || '-'}</div>
                          <div className="mt-0.5 text-slate-500">{candidate.cancelledByRole || '-'}</div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-words">
                          <div className="font-semibold text-rose-700">{issueText}</div>
                        </td>
                        <td className="border border-slate-200 px-2 py-2 leading-5 break-words">
                          {issueCodes.includes('missing-escrow-wallet-address') ? (
                            <span className="text-[11px] font-semibold text-slate-400">주소누락</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleRecoverUnrecoveredCancelledCandidate(candidate)}
                              disabled={!isWalletConnected || processingUnrecoveredCandidateId === candidate.candidateId}
                              className="inline-flex w-full items-center justify-center rounded border border-cyan-300 bg-cyan-50 px-1.5 py-1 text-[11px] font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              {processingUnrecoveredCandidateId === candidate.candidateId ? '회수중...' : '회수'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-xs text-slate-600">
                {unrecoveredCancelledTotalCount > 0
                  ? `총 ${unrecoveredCancelledTotalCount.toLocaleString('ko-KR')}건 중 ${unrecoveredPageStart.toLocaleString('ko-KR')}-${unrecoveredPageEnd.toLocaleString('ko-KR')}건 표시`
                  : '총 0건'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUnrecoveredCancelledPage((previous) => Math.max(1, previous - 1))}
                  disabled={unrecoveredCancelledTotalCount === 0 || currentUnrecoveredCancelledPage <= 1}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이전
                </button>
                <span className="text-xs font-medium text-slate-600">
                  {unrecoveredCancelledTotalCount === 0
                    ? '0 / 0'
                    : `${currentUnrecoveredCancelledPage} / ${unrecoveredCancelledTotalPages}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setUnrecoveredCancelledPage((previous) => Math.min(unrecoveredCancelledTotalPages, previous + 1))
                  }
                  disabled={
                    unrecoveredCancelledTotalCount === 0
                    || currentUnrecoveredCancelledPage >= unrecoveredCancelledTotalPages
                  }
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
