'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useActiveAccount } from 'thirdweb/react';
import { getContract, sendAndConfirmTransaction } from 'thirdweb';
import { balanceOf, transfer } from 'thirdweb/extensions/erc20';
import { ethereum, polygon, arbitrum, bsc } from 'thirdweb/chains';

import { client } from '@/app/client';
import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';
import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  shortAddress,
  toDateTime,
  type AgentSummary,
} from '../_shared';

type FeeWalletMeta = {
  signerAddress: string;
  smartAccountAddress: string;
  walletAddress: string;
};

type FeeWalletHistoryItem = {
  id: string;
  chain: string;
  actionType: 'CHARGE' | 'RECOVER';
  status: string;
  fromWalletAddress: string;
  toWalletAddress: string;
  requestedByWalletAddress: string;
  amount: number;
  transactionHash: string;
  transactionId: string;
  onchainStatus: string;
  error: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
};

type LoadHistoryOptions = {
  background?: boolean;
};

const BALANCE_POLLING_MS = 10000;
const HISTORY_PAGE_SIZE = 12;
const HISTORY_PAGINATION_BUTTON_COUNT = 5;
const HISTORY_PERIOD_OPTIONS: Array<{ days: 1 | 7 | 30; label: string }> = [
  { days: 1, label: '오늘' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const isFinalHistoryStatus = (status: string) => status === 'CONFIRMED' || status === 'FAILED';

const normalizeHistoryErrorText = (value: unknown): string => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      return '';
    }
    if (text === '[object Object]') {
      return '상세 오류 객체(서버 로그 확인)';
    }
    return text;
  }

  if (value instanceof Error) {
    return String(value.message || '').trim();
  }

  if (isRecord(value)) {
    const message = typeof value.message === 'string' ? value.message.trim() : '';
    if (message) {
      return message;
    }

    const error = typeof value.error === 'string' ? value.error.trim() : '';
    if (error) {
      return error;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '상세 오류 객체(서버 로그 확인)';
    }
  }

  return String(value).trim();
};

const toBigIntSafe = (value: unknown): bigint => {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'string' && value.trim()) return BigInt(value.trim());
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return BigInt(Math.floor(value));
  } catch (_error) {
    // ignore parse errors and return zero
  }
  return 0n;
};

const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number(value || 0))} USDT`;

const resolveChainConfig = () => {
  const chainName = String(process.env.NEXT_PUBLIC_CHAIN || 'polygon').trim().toLowerCase();

  if (chainName === 'ethereum' || chainName === 'eth') {
    return {
      chainKey: 'ethereum',
      chain: ethereum,
      usdtContractAddress: ethereumContractAddressUSDT,
      decimals: 6,
    };
  }

  if (chainName === 'arbitrum' || chainName === 'arb') {
    return {
      chainKey: 'arbitrum',
      chain: arbitrum,
      usdtContractAddress: arbitrumContractAddressUSDT,
      decimals: 6,
    };
  }

  if (chainName === 'bsc' || chainName === 'bnb') {
    return {
      chainKey: 'bsc',
      chain: bsc,
      usdtContractAddress: bscContractAddressUSDT,
      decimals: 18,
    };
  }

  return {
    chainKey: 'polygon',
    chain: polygon,
    usdtContractAddress: polygonContractAddressUSDT,
    decimals: 6,
  };
};

const parseFeeWalletMeta = (source: unknown): FeeWalletMeta => {
  const record = isRecord(source) ? source : {};
  const creditWallet = isRecord(record.creditWallet) ? record.creditWallet : {};

  const signerAddress = String(creditWallet.signerAddress || record.signerAddress || '').trim();
  const smartAccountAddress = String(creditWallet.smartAccountAddress || record.smartAccountAddress || '').trim();

  const normalizedSignerAddress = isWalletAddress(signerAddress) ? signerAddress : '';
  const normalizedSmartAccountAddress = isWalletAddress(smartAccountAddress) ? smartAccountAddress : '';
  const walletAddress = normalizedSmartAccountAddress || normalizedSignerAddress;

  return {
    signerAddress: normalizedSignerAddress,
    smartAccountAddress: normalizedSmartAccountAddress,
    walletAddress,
  };
};

const parseHistoryItem = (source: unknown): FeeWalletHistoryItem => {
  const record = isRecord(source) ? source : {};
  const actionTypeRaw = String(record.actionType || '').trim().toUpperCase();
  const actionType: 'CHARGE' | 'RECOVER' = actionTypeRaw === 'CHARGE' ? 'CHARGE' : 'RECOVER';

  return {
    id: String(record.id || record._id || ''),
    chain: String(record.chain || ''),
    actionType,
    status: String(record.status || ''),
    fromWalletAddress: String(record.fromWalletAddress || ''),
    toWalletAddress: String(record.toWalletAddress || ''),
    requestedByWalletAddress: String(record.requestedByWalletAddress || ''),
    amount: Number(record.amount || 0),
    transactionHash: String(record.transactionHash || ''),
    transactionId: String(record.transactionId || ''),
    onchainStatus: String(record.onchainStatus || ''),
    error: normalizeHistoryErrorText(record.error),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    confirmedAt: String(record.confirmedAt || ''),
  };
};

export default function P2PAgentFeeWalletManagementPage() {
  const searchParams = useSearchParams();
  const activeAccount = useActiveAccount();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();
  const connectedWalletAddress = String(activeAccount?.address || '').trim();

  const [loading, setLoading] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [charging, setCharging] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastBalanceUpdatedAt, setLastBalanceUpdatedAt] = useState('');
  const [copiedWalletAddress, setCopiedWalletAddress] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPeriodDays, setHistoryPeriodDays] = useState<1 | 7 | 30>(7);
  const [histories, setHistories] = useState<FeeWalletHistoryItem[]>([]);
  const [refreshingHistoryKey, setRefreshingHistoryKey] = useState('');

  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [feeWalletMeta, setFeeWalletMeta] = useState<FeeWalletMeta>({
    signerAddress: '',
    smartAccountAddress: '',
    walletAddress: '',
  });
  const [feeWalletBalance, setFeeWalletBalance] = useState(0);
  const [myWalletBalance, setMyWalletBalance] = useState(0);
  const [chargeAmount, setChargeAmount] = useState('');

  const chainConfig = useMemo(() => resolveChainConfig(), []);

  const contract = useMemo(
    () =>
      getContract({
        client,
        chain: chainConfig.chain,
        address: chainConfig.usdtContractAddress,
      }),
    [chainConfig.chain, chainConfig.usdtContractAddress],
  );

  const fetchWalletMeta = useCallback(async (): Promise<FeeWalletMeta> => {
    const response = await fetch('/api/agent/getOneAgent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentcode }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((payload as Record<string, unknown>)?.error || '에이전트 지갑 정보를 불러오지 못했습니다.'));
    }

    const result = isRecord((payload as Record<string, unknown>)?.result)
      ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
      : {};

    return parseFeeWalletMeta(result);
  }, [agentcode]);

  const loadHistory = useCallback(async (options: LoadHistoryOptions = {}) => {
    const background = options.background === true;

    if (!agentcode || !isWalletAddress(connectedWalletAddress)) {
      setHistories([]);
      setHistoryTotalCount(0);
      setHistoryTotalPages(1);
      setHistoryPage(1);
      setHistoryLoading(false);
      setHistoryRefreshing(false);
      return;
    }

    if (background) {
      setHistoryRefreshing(true);
    } else {
      setHistoryLoading(true);
    }

    try {
      const response = await fetch('/api/agent/fee-wallet-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list',
          agentcode,
          requesterWalletAddress: connectedWalletAddress,
          page: historyPage,
          limit: HISTORY_PAGE_SIZE,
          periodDays: historyPeriodDays,
          refreshPending: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '수수료 지급용 지갑 이력을 불러오지 못했습니다.'));
      }

      const result = isRecord((payload as Record<string, unknown>)?.result)
        ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
        : {};
      const items = Array.isArray(result.items) ? result.items : [];
      const totalCount = Math.max(0, Number(result.totalCount || items.length || 0));
      const totalPages = Math.max(1, Number(result.totalPages || Math.ceil(totalCount / HISTORY_PAGE_SIZE) || 1));
      const responsePage = Math.max(1, Number(result.page || historyPage));
      const normalizedPage = Math.min(responsePage, totalPages);

      setHistories(items.map((item) => parseHistoryItem(item)));
      setHistoryTotalCount(totalCount);
      setHistoryTotalPages(totalPages);
      if (normalizedPage !== historyPage) {
        setHistoryPage(normalizedPage);
      }
    } finally {
      if (background) {
        setHistoryRefreshing(false);
      } else {
        setHistoryLoading(false);
      }
    }
  }, [agentcode, connectedWalletAddress, historyPage, historyPeriodDays]);

  const refreshBalances = useCallback(
    async (walletAddressOverride?: string) => {
      const targetFeeWalletAddress = String(walletAddressOverride || feeWalletMeta.walletAddress || '').trim();
      const shouldLoadMyWalletBalance = isWalletAddress(connectedWalletAddress);

      const feeWalletBalancePromise = targetFeeWalletAddress
        ? fetch('/api/agent/getFeeWalletBalances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [
                {
                  agentcode: agentcode || 'agent',
                  walletAddress: targetFeeWalletAddress,
                },
              ],
            }),
          })
            .then(async (response) => {
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error(String((payload as Record<string, unknown>)?.error || '수수료 지급용 지갑 잔고를 불러오지 못했습니다.'));
              }
              const result = isRecord((payload as Record<string, unknown>)?.result)
                ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
                : {};
              const items = Array.isArray(result.items) ? result.items : [];
              const first = items[0];
              if (!isRecord(first)) return 0;
              const displayValue = Number(first.displayValue || 0);
              return Number.isFinite(displayValue) && displayValue >= 0 ? displayValue : 0;
            })
        : Promise.resolve(0);

      const myWalletBalancePromise = shouldLoadMyWalletBalance
        ? balanceOf({
            contract,
            address: connectedWalletAddress,
          }).then((rawBalance) => {
            const rawBigInt = toBigIntSafe(rawBalance);
            const divisor = 10 ** chainConfig.decimals;
            return Number(rawBigInt) / divisor;
          })
        : Promise.resolve(0);

      const [nextFeeWalletBalance, nextMyWalletBalance] = await Promise.all([
        feeWalletBalancePromise,
        myWalletBalancePromise,
      ]);

      setFeeWalletBalance(nextFeeWalletBalance);
      setMyWalletBalance(nextMyWalletBalance);
      setLastBalanceUpdatedAt(new Date().toISOString());
    },
    [
      agentcode,
      chainConfig.decimals,
      connectedWalletAddress,
      contract,
      feeWalletMeta.walletAddress,
    ],
  );

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setFeeWalletMeta({
        signerAddress: '',
        smartAccountAddress: '',
        walletAddress: '',
      });
      setFeeWalletBalance(0);
      setMyWalletBalance(0);
      setError(null);
      setNotice(null);
      setLastBalanceUpdatedAt('');
      setHistories([]);
      setHistoryTotalCount(0);
      setHistoryTotalPages(1);
      setHistoryPage(1);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const [agentSummary, walletMeta] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchWalletMeta(),
      ]);
      setAgent(agentSummary);
      setFeeWalletMeta(walletMeta);
      await refreshBalances(walletMeta.walletAddress);
    } catch (loadError) {
      setAgent(null);
      setFeeWalletMeta({
        signerAddress: '',
        smartAccountAddress: '',
        walletAddress: '',
      });
      setFeeWalletBalance(0);
      setMyWalletBalance(0);
      setHistories([]);
      setHistoryTotalCount(0);
      setHistoryTotalPages(1);
      setHistoryPage(1);
      setError(loadError instanceof Error ? loadError.message : '수수료 지급용 지갑 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode, fetchWalletMeta, refreshBalances]);

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

  const isHistoryPreviousDisabled = historyLoading || historyPage <= 1;
  const isHistoryNextDisabled = historyLoading || historyPage >= historyTotalPages;
  const isHistoryInitialLoading = historyLoading && histories.length === 0;

  const handleCreateWallet = useCallback(async () => {
    if (!agentcode || creatingWallet) return;

    setCreatingWallet(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/agent/createFeeWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentcode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '수수료 지급용 지갑 생성에 실패했습니다.'));
      }

      setNotice('수수료 지급용 지갑 생성이 완료되었습니다.');
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '수수료 지급용 지갑 생성에 실패했습니다.');
    } finally {
      setCreatingWallet(false);
    }
  }, [agentcode, creatingWallet, loadData]);

  const handleChargeWallet = useCallback(async () => {
    if (charging) return;
    if (!activeAccount) {
      setError('활성 지갑 계정을 확인해 주세요.');
      return;
    }
    if (!isWalletAddress(feeWalletMeta.walletAddress)) {
      setError('수수료 지급용 지갑 주소가 없습니다. 먼저 지갑을 생성해 주세요.');
      return;
    }

    const numericAmount = Number(chargeAmount);
    if (!chargeAmount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('충전할 USDT 수량을 입력해 주세요.');
      return;
    }
    if (myWalletBalance > 0 && numericAmount > myWalletBalance + 0.0000001) {
      setError('내 지갑 USDT 잔고가 부족합니다.');
      return;
    }

    setCharging(true);
    setError(null);
    setNotice(null);
    try {
      const transferTx = transfer({
        contract,
        to: feeWalletMeta.walletAddress,
        amount: chargeAmount.trim(),
      });

      const txResult = await sendAndConfirmTransaction({
        transaction: transferTx,
        account: activeAccount,
      });

      const transactionHash = String((txResult as { transactionHash?: string })?.transactionHash || '').trim();
      if (transactionHash && isWalletAddress(connectedWalletAddress)) {
        try {
          const historyResponse = await fetch('/api/agent/fee-wallet-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'record-charge',
              agentcode,
              requesterWalletAddress: connectedWalletAddress,
              fromWalletAddress: connectedWalletAddress,
              toWalletAddress: feeWalletMeta.walletAddress,
              amount: numericAmount,
              transactionHash,
              status: 'CONFIRMED',
              chain: chainConfig.chainKey,
            }),
          });
          if (!historyResponse.ok) {
            const historyPayload = await historyResponse.json().catch(() => ({}));
            throw new Error(String((historyPayload as Record<string, unknown>)?.error || '충전 이력 저장 실패'));
          }
        } catch (historyWriteError) {
          console.warn('failed to save fee wallet charge history', historyWriteError);
        }
      }

      setNotice(
        transactionHash
          ? `충전이 완료되었습니다. (${formatUsdt(numericAmount)} · ${shortAddress(transactionHash)})`
          : `충전이 완료되었습니다. (${formatUsdt(numericAmount)})`,
      );
      setChargeAmount('');
      await refreshBalances(feeWalletMeta.walletAddress);
      await loadHistory().catch((historyLoadError) => {
        console.warn('failed to refresh fee wallet history', historyLoadError);
      });
    } catch (chargeError) {
      setError(chargeError instanceof Error ? chargeError.message : '충전에 실패했습니다.');
    } finally {
      setCharging(false);
    }
  }, [
    activeAccount,
    chargeAmount,
    charging,
    contract,
    feeWalletMeta.walletAddress,
    agentcode,
    chainConfig.chainKey,
    connectedWalletAddress,
    loadHistory,
    myWalletBalance,
    refreshBalances,
  ]);

  const handleRecoverAll = useCallback(async () => {
    if (!agentcode || recovering) return;
    if (!isWalletAddress(connectedWalletAddress)) {
      setError('회수 받을 내 지갑 주소를 확인할 수 없습니다.');
      return;
    }
    if (!isWalletAddress(feeWalletMeta.walletAddress)) {
      setError('수수료 지급용 지갑 주소가 없습니다. 먼저 지갑을 생성해 주세요.');
      return;
    }
    if (feeWalletBalance <= 0) {
      setError('회수할 수수료 지급용 지갑 잔고가 없습니다.');
      return;
    }
    if (!window.confirm(`수수료 지급용 지갑 잔고 ${formatUsdt(feeWalletBalance)} 를 내 지갑으로 전량 회수할까요?`)) {
      return;
    }

    setRecovering(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/agent/clearFeeWalletBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentcode,
          requesterWalletAddress: connectedWalletAddress,
          toWalletAddress: connectedWalletAddress,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const payloadRecord =
          typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
        const message = String(payloadRecord.error || '전량 회수 요청에 실패했습니다.');
        const detail = normalizeHistoryErrorText(payloadRecord.detail);
        throw new Error(detail ? `${message} (${detail})` : message);
      }

      const result = isRecord((payload as Record<string, unknown>)?.result)
        ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
        : {};
      const transferredAmount = Number(result.transferredAmount || 0);
      const transactionId = String(result.transactionId || '').trim();
      const status = String(result.status || '').trim().toUpperCase();

      setNotice(
        transactionId
          ? `전량 회수 요청이 접수되었습니다. (${formatUsdt(transferredAmount)} · transactionId: ${transactionId}${status ? ` · ${status}` : ''})`
          : `전량 회수 요청이 접수되었습니다. (${formatUsdt(transferredAmount)})`,
      );
      await refreshBalances(feeWalletMeta.walletAddress);
      await loadHistory().catch((historyLoadError) => {
        console.warn('failed to refresh fee wallet history', historyLoadError);
      });
    } catch (recoverError) {
      setError(recoverError instanceof Error ? recoverError.message : '전량 회수 요청에 실패했습니다.');
    } finally {
      setRecovering(false);
    }
  }, [
    agentcode,
    connectedWalletAddress,
    feeWalletBalance,
    feeWalletMeta.walletAddress,
    loadHistory,
    recovering,
    refreshBalances,
  ]);

  const handleCopyWalletAddress = useCallback(async (walletAddress: string) => {
    const normalizedWalletAddress = String(walletAddress || '').trim();
    if (!normalizedWalletAddress) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizedWalletAddress);
      }
      setCopiedWalletAddress(normalizedWalletAddress);
      window.setTimeout(() => {
        setCopiedWalletAddress((current) => (current === normalizedWalletAddress ? '' : current));
      }, 1500);
    } catch {
      setError('지갑 주소 복사에 실패했습니다.');
    }
  }, []);

  const handleRefreshHistoryStatus = useCallback(async (historyId: string, transactionId: string) => {
    const normalizedHistoryId = String(historyId || '').trim();
    const normalizedTransactionId = String(transactionId || '').trim();
    if ((!normalizedHistoryId && !normalizedTransactionId) || !agentcode || !isWalletAddress(connectedWalletAddress)) {
      return;
    }

    const refreshKey = normalizedHistoryId || normalizedTransactionId;
    setRefreshingHistoryKey(refreshKey);
    setError(null);
    try {
      const response = await fetch('/api/agent/fee-wallet-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh-status',
          agentcode,
          requesterWalletAddress: connectedWalletAddress,
          historyId: normalizedHistoryId,
          transactionId: normalizedTransactionId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '이력 상태 갱신에 실패했습니다.'));
      }

      await loadHistory();
      await refreshBalances(feeWalletMeta.walletAddress);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '이력 상태 갱신에 실패했습니다.');
    } finally {
      setRefreshingHistoryKey('');
    }
  }, [agentcode, connectedWalletAddress, feeWalletMeta.walletAddress, loadHistory, refreshBalances]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setHistoryPage(1);
  }, [agentcode, historyPeriodDays]);

  useEffect(() => {
    if (!agentcode) return;

    void loadHistory().catch((historyLoadError) => {
      console.warn('failed to load fee wallet history', historyLoadError);
    });
  }, [agentcode, loadHistory]);

  useEffect(() => {
    if (!agentcode) return;

    const intervalId = window.setInterval(() => {
      if (loading || creatingWallet || charging || recovering) return;
      void Promise.all([
        refreshBalances(),
        loadHistory({ background: true }),
      ]).catch((pollError) => {
        console.warn('fee wallet polling failed', pollError);
      });
    }, BALANCE_POLLING_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [agentcode, charging, creatingWallet, loadHistory, loading, recovering, refreshBalances]);

  const hasFeeWalletAddress = isWalletAddress(feeWalletMeta.walletAddress);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Fee Credit Wallet</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">수수료 지급용 지갑 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          에이전트별로 플랫폼 수수료를 지급하기 위해 필요한 지갑입니다. 지갑 주소/잔고를 자동 갱신하고 충전 및 전량 회수를 실행할 수 있습니다.
        </p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 사용할 수 있습니다.
        </div>
      )}

      {agentcode && (
        <>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                void loadData();
              }}
              disabled={loading || creatingWallet || charging || recovering}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '조회 중...' : '새로고침'}
            </button>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}
          {notice && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>
          )}

          <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">수수료 지급용 지갑주소</p>
              <div className="mt-2 flex items-start justify-between gap-2">
                <p className="break-all font-mono text-sm font-semibold text-slate-800">
                  {hasFeeWalletAddress ? feeWalletMeta.walletAddress : '-'}
                </p>
                {hasFeeWalletAddress && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyWalletAddress(feeWalletMeta.walletAddress);
                    }}
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    {copiedWalletAddress === feeWalletMeta.walletAddress ? '복사됨' : '복사'}
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                <p>Signer: {feeWalletMeta.signerAddress ? shortAddress(feeWalletMeta.signerAddress) : '-'}</p>
                <p>Smart Account: {feeWalletMeta.smartAccountAddress ? shortAddress(feeWalletMeta.smartAccountAddress) : '-'}</p>
                <p>네트워크: {chainConfig.chainKey}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">수수료 지급용 지갑 잔고</p>
              <p className="mt-2 text-4xl font-extrabold leading-tight text-cyan-900">{formatUsdt(feeWalletBalance)}</p>
              <p className="mt-2 text-[11px] text-cyan-700">
                {lastBalanceUpdatedAt
                  ? `최근 갱신 ${toDateTime(lastBalanceUpdatedAt)} · ${Math.floor(BALANCE_POLLING_MS / 1000)}초마다 자동 갱신`
                  : `${Math.floor(BALANCE_POLLING_MS / 1000)}초마다 자동 갱신`}
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">내 지갑</p>
              <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-800">
                {connectedWalletAddress || '-'}
              </p>
              <p className="mt-3 text-xs font-semibold text-slate-500">USDT 잔고</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{formatUsdt(myWalletBalance)}</p>
            </section>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            {!hasFeeWalletAddress ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-700">
                  수수료 지급용 지갑이 아직 생성되지 않았습니다. 먼저 지갑을 생성한 후 충전/전량 회수를 실행할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void handleCreateWallet();
                  }}
                  disabled={creatingWallet}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {creatingWallet ? '지갑 생성 중...' : '지갑 생성하기'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">충전하기</p>
                  <p className="mt-1 text-xs text-slate-600">내 지갑에서 수량을 입력해 수수료 지급용 지갑으로 전송합니다.</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="number"
                      min="0"
                      step="0.000001"
                      inputMode="decimal"
                      value={chargeAmount}
                      onChange={(event) => setChargeAmount(event.target.value)}
                      placeholder="충전할 USDT 수량"
                      className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleChargeWallet();
                      }}
                      disabled={charging || recovering}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {charging ? '충전 중...' : '충전하기'}
                    </button>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      void handleRecoverAll();
                    }}
                    disabled={recovering || charging || feeWalletBalance <= 0}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-300 xl:w-[220px]"
                  >
                    {recovering ? '회수 요청 중...' : '전량 회수하기'}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">충전/회수 이력</h2>
              <span className="text-xs text-slate-500">총 {historyTotalCount.toLocaleString()}건</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                {HISTORY_PERIOD_OPTIONS.map((option) => {
                  const active = historyPeriodDays === option.days;
                  return (
                    <button
                      key={option.days}
                      type="button"
                      onClick={() => {
                        setHistoryPeriodDays(option.days);
                      }}
                      disabled={historyLoading}
                      className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-semibold transition ${
                        active
                          ? 'bg-cyan-600 text-white'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500">
                페이지 {historyPage} / {historyTotalPages}
                {historyRefreshing ? ' · 갱신 중...' : ''}
              </p>
            </div>

            {isHistoryInitialLoading ? (
              <p className="mt-3 text-sm text-slate-500">이력을 불러오는 중입니다...</p>
            ) : histories.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">표시할 이력이 없습니다.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[1080px] w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2">요청 시각</th>
                      <th className="px-3 py-2">구분</th>
                      <th className="px-3 py-2">전송 정보</th>
                      <th className="px-3 py-2 text-right">수량</th>
                      <th className="px-3 py-2">상태</th>
                      <th className="px-3 py-2">트랜잭션</th>
                      <th className="px-3 py-2 text-center">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {histories.map((historyItem) => {
                      const canRefreshStatus =
                        historyItem.actionType === 'RECOVER'
                        && Boolean(historyItem.transactionId)
                        && !isFinalHistoryStatus(historyItem.status);
                      const historyRefreshKey = historyItem.id || historyItem.transactionId;
                      const isRefreshing = refreshingHistoryKey === historyRefreshKey;
                      return (
                        <tr key={historyItem.id || `${historyItem.transactionId}-${historyItem.createdAt}`} className="align-top">
                          <td className="px-3 py-3 text-xs text-slate-600">{toDateTime(historyItem.createdAt)}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                historyItem.actionType === 'CHARGE'
                                  ? 'bg-cyan-100 text-cyan-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {historyItem.actionType === 'CHARGE' ? '충전' : '전량 회수'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600">
                            <p className="font-mono">From: {shortAddress(historyItem.fromWalletAddress)}</p>
                            <p className="mt-1 font-mono">To: {shortAddress(historyItem.toWalletAddress)}</p>
                          </td>
                          <td className="px-3 py-3 text-right text-sm font-semibold text-slate-900">
                            {formatUsdt(historyItem.amount)}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                historyItem.status === 'CONFIRMED'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : historyItem.status === 'FAILED'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {historyItem.status || '-'}
                            </span>
                            {historyItem.onchainStatus && (
                              <p className="mt-1 text-[11px] text-slate-500">onchain: {historyItem.onchainStatus}</p>
                            )}
                            {historyItem.error && (
                              <p className="mt-1 max-w-[220px] truncate text-[11px] font-semibold text-rose-600" title={historyItem.error}>
                                오류: {historyItem.error}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-600">
                            <p className="font-mono" title={historyItem.transactionHash || '-'}>
                              hash: {historyItem.transactionHash ? shortAddress(historyItem.transactionHash) : '-'}
                            </p>
                            <p className="mt-1 font-mono" title={historyItem.transactionId || '-'}>
                              id: {historyItem.transactionId ? shortAddress(historyItem.transactionId) : '-'}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {canRefreshStatus ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleRefreshHistoryStatus(historyItem.id, historyItem.transactionId);
                                }}
                                disabled={isRefreshing}
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                {isRefreshing ? '갱신 중...' : '상태 갱신'}
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
                      disabled={historyLoading}
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
        </>
      )}
    </div>
  );
}
