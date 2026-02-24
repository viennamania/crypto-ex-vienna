'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

type RelatedTradeOrderPreview = {
  orderId: string;
  tradeId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  paymentMethod: string;
  usdtAmount: string;
  krwAmount: string;
  rate: string;
  buyerWalletAddress: string;
  buyerEscrowWalletAddress: string;
  buyerDepositName: string;
  sellerWalletAddress: string;
  sellerEscrowWalletAddress: string;
  sellerBankName: string;
  sellerAccountNumber: string;
  sellerAccountHolder: string;
  transactionHash: string;
  escrowTransactionHash: string;
  buyerLockTransactionHash: string;
  sellerLockTransactionHash: string;
};

type RelatedTrade = {
  tradeId: string;
  status: string;
  reason: string;
  orderId?: string;
  order?: RelatedTradeOrderPreview | null;
};

type WalletBalanceState = {
  loading: boolean;
  displayValue: string;
  error: string;
  lastCheckedAt: string;
  cooldownUntilMs: number;
};

type SelectedTradeModalState = {
  transfer: TransferItem;
  trade: RelatedTrade;
};

type TransferItem = {
  transactionHash: string;
  blockNumber: string;
  blockTimestamp: string;
  direction: 'IN' | 'OUT';
  fromAddress: string;
  toAddress: string;
  counterpartyAddress: string;
  amountRaw: string;
  amountFormatted: string;
  signedAmountRaw: string;
  signedAmountFormatted: string;
  runningBalanceRaw: string;
  runningBalanceFormatted: string;
  transferType: string;
  tokenType: string;
  caseType: string;
  caseLabel: string;
  isExpectedFlow: boolean;
  relatedTrades: RelatedTrade[];
};

type CaseSummaryItem = {
  caseType: string;
  caseLabel: string;
  count: number;
};

type SellerEscrowTransferHistoryResult = {
  seller: {
    id: number;
    nickname: string;
    storecode: string;
    walletAddress: string;
    escrowWalletAddress: string;
    matchMode: string;
  };
  chain: 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
  token: {
    symbol: string;
    contractAddress: string;
    decimals: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
  orderContext: {
    orderCount: number;
    expectedCounterpartyCount: number;
  };
  overall: {
    totalInRaw: string;
    totalInFormatted: string;
    totalOutRaw: string;
    totalOutFormatted: string;
    netChangeRaw: string;
    netChangeFormatted: string;
    runningBalanceRaw: string;
    runningBalanceFormatted: string;
  };
  caseSummary: CaseSummaryItem[];
  transfers: TransferItem[];
};

const PAGE_SIZE = 20;
const BALANCE_CHECK_COOLDOWN_MS = 10_000;

const chainExplorerTxBase: Record<string, string> = {
  polygon: 'https://polygonscan.com/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  ethereum: 'https://etherscan.io/tx/',
  bsc: 'https://bscscan.com/tx/',
};

const shortenAddress = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
};

const shortenHash = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 10)}...${normalized.slice(-8)}`;
};

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatAmountDisplay = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '0';
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return normalized;
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(numeric);
};

const formatKrwDisplay = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return normalized;
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numeric);
};

const formatSignedUsdtDisplay = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '0';
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) {
    return `+${formatAmountDisplay(normalized)}`;
  }
  return formatAmountDisplay(normalized);
};

const getOrderStatusLabel = (status: string) => {
  const normalized = String(status || '').trim();
  if (normalized === 'ordered') return '주문생성';
  if (normalized === 'accepted') return '주문접수';
  if (normalized === 'paymentRequested') return '입금요청';
  if (normalized === 'paymentConfirmed') return '입금확인';
  if (normalized === 'completed') return '거래완료';
  if (normalized === 'cancelled') return '주문취소';
  return normalized || '-';
};

const normalizeWalletKey = (walletAddress: string) => String(walletAddress || '').trim().toLowerCase();

const getDirectionBadgeClassName = (direction: 'IN' | 'OUT') =>
  direction === 'IN'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-blue-200 bg-blue-50 text-blue-700';

const getCaseBadgeClassName = (transfer: TransferItem) => {
  if (transfer.isExpectedFlow) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (transfer.caseType === 'ORDER_HASH_MATCHED') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-rose-200 bg-rose-50 text-rose-700';
};

export default function SellerEscrowTransferHistoryPage() {
  const [sellerId, setSellerId] = useState('');
  const [submittedSellerId, setSubmittedSellerId] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<Array<{ nickname: string; walletAddress: string }>>([]);
  const [result, setResult] = useState<SellerEscrowTransferHistoryResult | null>(null);
  const [walletCopyFeedback, setWalletCopyFeedback] = useState('');
  const [walletBalanceByAddress, setWalletBalanceByAddress] = useState<Record<string, WalletBalanceState>>({});
  const [walletBalanceTickMs, setWalletBalanceTickMs] = useState(() => Date.now());
  const [selectedTradeModal, setSelectedTradeModal] = useState<SelectedTradeModalState | null>(null);

  const currentPage = result?.pagination?.page || page;
  const totalPages = result?.pagination?.totalPages || 1;
  const totalItems = result?.pagination?.totalItems || 0;
  const txExplorerBase = result ? chainExplorerTxBase[result.chain] || '' : '';

  const hasResult = Boolean(result && result.transfers);
  const hasTransfers = Boolean(result && result.transfers.length > 0);
  const caseSummary = result?.caseSummary || [];
  const transfers = result?.transfers || [];
  const selectedOrder = selectedTradeModal?.trade?.order || null;
  const overall = result?.overall;
  const sellerEscrowWalletAddress = String(result?.seller?.escrowWalletAddress || '').trim();
  const sellerEscrowWalletKey = normalizeWalletKey(sellerEscrowWalletAddress);
  const sellerEscrowWalletBalanceState = sellerEscrowWalletAddress
    ? walletBalanceByAddress[sellerEscrowWalletKey]
    : undefined;
  const sellerEscrowWalletRemainingCooldownMs = Math.max(
    0,
    Number(sellerEscrowWalletBalanceState?.cooldownUntilMs || 0) - walletBalanceTickMs,
  );
  const sellerEscrowWalletIsCooldown = sellerEscrowWalletRemainingCooldownMs > 0;

  const hasActiveWalletBalanceCooldown = useMemo(
    () =>
      Object.values(walletBalanceByAddress).some(
        (item) => Number(item?.cooldownUntilMs || 0) > walletBalanceTickMs,
      ),
    [walletBalanceByAddress, walletBalanceTickMs],
  );

  useEffect(() => {
    if (!hasActiveWalletBalanceCooldown) return;
    const interval = window.setInterval(() => {
      setWalletBalanceTickMs(Date.now());
    }, 200);
    return () => window.clearInterval(interval);
  }, [hasActiveWalletBalanceCooldown]);

  const handleCopyWalletAddress = async (walletAddress: string) => {
    const normalizedWallet = String(walletAddress || '').trim();
    if (!normalizedWallet) return;
    const walletKey = normalizeWalletKey(normalizedWallet);
    try {
      await navigator.clipboard.writeText(normalizedWallet);
      setWalletCopyFeedback(walletKey);
      window.setTimeout(() => {
        setWalletCopyFeedback((prev) => (prev === walletKey ? '' : prev));
      }, 1500);
    } catch (copyError) {
      console.error('failed to copy wallet address', copyError);
    }
  };

  const handleCheckWalletUsdtBalance = async (walletAddress: string) => {
    const normalizedWallet = String(walletAddress || '').trim();
    if (!normalizedWallet) return;

    const walletKey = normalizeWalletKey(normalizedWallet);
    const nowMs = Date.now();
    const currentState = walletBalanceByAddress[walletKey];
    if (currentState?.loading) return;
    if (Number(currentState?.cooldownUntilMs || 0) > nowMs) return;

    const nextCooldownUntil = nowMs + BALANCE_CHECK_COOLDOWN_MS;
    setWalletBalanceByAddress((prev) => {
      const existing = prev[walletKey];
      return {
        ...prev,
        [walletKey]: {
          loading: true,
          displayValue: existing?.displayValue || '',
          error: '',
          lastCheckedAt: existing?.lastCheckedAt || '',
          cooldownUntilMs: nextCooldownUntil,
        },
      };
    });

    try {
      const response = await fetch('/api/user/getUSDTBalanceByWalletAddress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: normalizedWallet,
          chain: result?.chain || 'polygon',
        }),
      });
      const data = await response.json().catch(() => ({}));
      const rawDisplayValue = String(data?.result?.displayValue || data?.result?.balance || '0');
      const displayValue = formatAmountDisplay(rawDisplayValue);
      const errorMessage = !response.ok
        ? String(data?.error || '잔고 조회에 실패했습니다.')
        : String(data?.error || '');

      setWalletBalanceByAddress((prev) => {
        const existing = prev[walletKey];
        return {
          ...prev,
          [walletKey]: {
            loading: false,
            displayValue,
            error: errorMessage,
            lastCheckedAt: new Date().toISOString(),
            cooldownUntilMs: existing?.cooldownUntilMs || nextCooldownUntil,
          },
        };
      });
    } catch (balanceError) {
      console.error('failed to check wallet balance', balanceError);
      setWalletBalanceByAddress((prev) => {
        const existing = prev[walletKey];
        return {
          ...prev,
          [walletKey]: {
            loading: false,
            displayValue: existing?.displayValue || '',
            error: '잔고 조회 중 오류가 발생했습니다.',
            lastCheckedAt: existing?.lastCheckedAt || '',
            cooldownUntilMs: existing?.cooldownUntilMs || nextCooldownUntil,
          },
        };
      });
    }
  };

  const renderWalletCell = (walletAddress: string) => {
    const normalizedWallet = String(walletAddress || '').trim();
    if (!normalizedWallet) {
      return <span className="font-mono text-[11px] text-slate-500">-</span>;
    }

    const walletKey = normalizeWalletKey(normalizedWallet);
    const walletBalanceState = walletBalanceByAddress[walletKey];
    const remainingCooldownMs = Number(walletBalanceState?.cooldownUntilMs || 0) - walletBalanceTickMs;
    const isCooldown = remainingCooldownMs > 0;

    return (
      <div className="max-w-[170px] space-y-1.5">
        <p className="break-all font-mono text-[11px] text-slate-600" title={normalizedWallet}>
          {shortenAddress(normalizedWallet)}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void handleCopyWalletAddress(normalizedWallet);
            }}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            {walletCopyFeedback === walletKey ? '복사됨' : '복사'}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCheckWalletUsdtBalance(normalizedWallet);
            }}
            disabled={walletBalanceState?.loading || isCooldown}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              walletBalanceState?.loading || isCooldown
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            {walletBalanceState?.loading
              ? '조회중...'
              : isCooldown
              ? `${Math.ceil(remainingCooldownMs / 1000)}초`
              : '잔고확인'}
          </button>
        </div>
        <p className={`text-[10px] ${walletBalanceState?.error ? 'text-rose-600' : 'text-slate-500'}`}>
          {walletBalanceState?.error
            ? walletBalanceState.error
            : walletBalanceState?.displayValue
            ? `${walletBalanceState.displayValue} USDT`
            : '잔고 미조회'}
        </p>
      </div>
    );
  };

  const fetchHistory = async ({
    nextSellerId,
    nextPage,
  }: {
    nextSellerId: string;
    nextPage: number;
  }) => {
    const normalizedSellerId = String(nextSellerId || '').trim();
    if (!normalizedSellerId) {
      setError('판매자 아이디를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    setCandidates([]);
    setSelectedTradeModal(null);

    try {
      const response = await fetch('/api/user/getSellerEscrowTransferHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: normalizedSellerId,
          page: nextPage,
          limit: PAGE_SIZE,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = String(payload?.error || '에스크로 입출금 이력을 조회하지 못했습니다.');
        const nextCandidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
        setCandidates(nextCandidates);
        throw new Error(errorMessage);
      }

      const nextResult = payload?.result as SellerEscrowTransferHistoryResult;
      setResult(nextResult);
      setWalletCopyFeedback('');
      setWalletBalanceByAddress({});
      setSubmittedSellerId(normalizedSellerId);
      setPage(nextPage);
    } catch (fetchError) {
      console.error('failed to fetch seller escrow transfer history', fetchError);
      setResult(null);
      setError(fetchError instanceof Error ? fetchError.message : '조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const unexpectedTransferCount = useMemo(() => {
    if (!result?.transfers?.length) return 0;
    return result.transfers.filter((item) => !item.isExpectedFlow).length;
  }, [result]);

  return (
    <main className="min-h-[100vh] bg-gradient-to-br from-slate-50 via-white to-slate-100 p-3 sm:p-4 lg:p-6">
      <div className="mx-auto w-full max-w-screen-2xl space-y-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.55)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Seller Escrow Flow</p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                판매자 에스크로 입출금 케이스 분석
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                판매자 아이디(닉네임/숫자 ID/지갑주소) 기준으로 에스크로 지갑 USDT 전체 입출금과 케이스를 확인합니다.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold text-slate-600">
              <p>페이지 크기</p>
              <p className="text-sm font-bold text-slate-900">{PAGE_SIZE}건</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
              <input
                type="text"
                value={sellerId}
                onChange={(event) => setSellerId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void fetchHistory({ nextSellerId: sellerId, nextPage: 1 });
                  }
                }}
                placeholder="예: orange0004"
                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                void fetchHistory({ nextSellerId: sellerId, nextPage: 1 });
              }}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                loading ? 'cursor-not-allowed bg-slate-400' : 'bg-slate-900 hover:-translate-y-0.5 hover:bg-slate-800'
              }`}
            >
              {loading ? '조회중...' : '검색'}
            </button>
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          {candidates.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-800">검색 후보</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {candidates.map((candidate) => (
                  <button
                    key={`${candidate.nickname}-${candidate.walletAddress}`}
                    type="button"
                    onClick={() => {
                      setSellerId(candidate.nickname);
                      void fetchHistory({ nextSellerId: candidate.nickname, nextPage: 1 });
                    }}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    {candidate.nickname} ({shortenAddress(candidate.walletAddress)})
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {hasResult ? (
          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">판매자</p>
                <p className="text-sm font-bold text-slate-900">{result?.seller?.nickname || '-'}</p>
                <p className="text-[11px] text-slate-500">ID {result?.seller?.id || '-'}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">판매자 지갑</p>
                <p className="font-mono text-xs text-slate-700">{shortenAddress(result?.seller?.walletAddress || '')}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">에스크로 지갑</p>
                <p className="font-mono text-xs text-slate-700" title={sellerEscrowWalletAddress}>
                  {shortenAddress(sellerEscrowWalletAddress)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyWalletAddress(sellerEscrowWalletAddress);
                    }}
                    disabled={!sellerEscrowWalletAddress}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      sellerEscrowWalletAddress
                        ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    }`}
                  >
                    {walletCopyFeedback === sellerEscrowWalletKey ? '복사됨' : '복사'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCheckWalletUsdtBalance(sellerEscrowWalletAddress);
                    }}
                    disabled={!sellerEscrowWalletAddress || sellerEscrowWalletBalanceState?.loading || sellerEscrowWalletIsCooldown}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      !sellerEscrowWalletAddress || sellerEscrowWalletBalanceState?.loading || sellerEscrowWalletIsCooldown
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    {sellerEscrowWalletBalanceState?.loading
                      ? '조회중...'
                      : sellerEscrowWalletIsCooldown
                      ? `${Math.ceil(sellerEscrowWalletRemainingCooldownMs / 1000)}초`
                      : '잔고확인'}
                  </button>
                </div>
                <p className={`mt-1 text-[10px] ${sellerEscrowWalletBalanceState?.error ? 'text-rose-600' : 'text-slate-500'}`}>
                  {sellerEscrowWalletBalanceState?.error
                    ? sellerEscrowWalletBalanceState.error
                    : sellerEscrowWalletBalanceState?.displayValue
                    ? `${sellerEscrowWalletBalanceState.displayValue} USDT`
                    : '잔고 미조회'}
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">조회 건수</p>
                <p className="text-xl font-black text-slate-900">{new Intl.NumberFormat('ko-KR').format(totalItems)}</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">미분류/주의</p>
                <p className={`text-xl font-black ${unexpectedTransferCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {new Intl.NumberFormat('ko-KR').format(unexpectedTransferCount)}
                </p>
              </article>
            </div>

            {caseSummary.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {caseSummary.map((item) => (
                  <span
                    key={item.caseType}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    <span>{item.caseLabel}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-900">
                      {item.count}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">에스크로 입출금 이력</h2>
            <span className="text-xs font-semibold text-slate-500">
              {submittedSellerId ? `검색어: ${submittedSellerId}` : '검색 후 표시'}
            </span>
          </div>

          {hasResult ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">전체 입금</p>
                <p className="text-sm font-bold text-emerald-800">
                  +{formatAmountDisplay(overall?.totalInFormatted || '0')} USDT
                </p>
              </article>
              <article className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700">전체 출금</p>
                <p className="text-sm font-bold text-blue-800">
                  -{formatAmountDisplay(overall?.totalOutFormatted || '0')} USDT
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">순변동</p>
                <p
                  className={`text-sm font-bold ${
                    String(overall?.netChangeRaw || '').startsWith('-') ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {formatSignedUsdtDisplay(overall?.netChangeFormatted || '0')} USDT
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                  누적 잔고(초기 0)
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {formatSignedUsdtDisplay(overall?.runningBalanceFormatted || '0')} USDT
                </p>
              </article>
            </div>
          ) : null}

          {!hasResult ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
              판매자 아이디를 입력하고 검색하면 입출금 이력이 표시됩니다.
            </div>
          ) : !hasTransfers ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
              조회된 입출금 이력이 없습니다.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full table-fixed border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="w-[13%] px-2 py-2 text-left">시간</th>
                    <th className="w-[7%] px-2 py-2 text-left">방향</th>
                    <th className="w-[10%] px-2 py-2 text-left">케이스</th>
                    <th className="w-[9%] px-2 py-2 text-left">금액(USDT)</th>
                    <th className="w-[11%] px-2 py-2 text-left">누적 잔고(USDT)</th>
                    <th className="w-[14%] px-2 py-2 text-left">From</th>
                    <th className="w-[14%] px-2 py-2 text-left">To</th>
                    <th className="w-[12%] px-2 py-2 text-left">연관 주문</th>
                    <th className="w-[10%] px-2 py-2 text-left">Tx Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((transfer) => (
                    <tr
                      key={`${transfer.transactionHash}-${transfer.blockNumber}-${transfer.fromAddress}-${transfer.toAddress}`}
                      className={`border-t ${
                        transfer.isExpectedFlow ? 'bg-white' : 'bg-rose-50/40'
                      }`}
                    >
                      <td className="px-2 py-2 align-top text-slate-600">
                        <div className="flex flex-col">
                          <span>{formatDateTime(transfer.blockTimestamp)}</span>
                          <span className="font-mono text-[11px] text-slate-400">#{transfer.blockNumber || '-'}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span
                          className={`inline-flex min-w-[52px] items-center justify-center rounded-full border px-2 py-1 text-[11px] font-semibold ${getDirectionBadgeClassName(
                            transfer.direction,
                          )}`}
                        >
                          {transfer.direction === 'IN' ? '입금' : '출금'}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span
                          className={`inline-flex break-words rounded-full border px-2 py-1 text-[11px] font-semibold ${getCaseBadgeClassName(
                            transfer,
                          )}`}
                        >
                          {transfer.caseLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top font-semibold text-slate-800">
                        <span className={transfer.direction === 'IN' ? 'text-emerald-700' : 'text-blue-700'}>
                          {formatSignedUsdtDisplay(transfer.signedAmountFormatted)}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top font-semibold text-slate-700">
                        {formatSignedUsdtDisplay(transfer.runningBalanceFormatted)}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {renderWalletCell(transfer.fromAddress)}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {renderWalletCell(transfer.toAddress)}
                      </td>
                      <td className="px-2 py-2 align-top text-slate-600">
                        {transfer.relatedTrades.length === 0 ? (
                          <span>-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {transfer.relatedTrades.map((trade) => (
                              <button
                                key={`${transfer.transactionHash}-${trade.tradeId}-${trade.reason}`}
                                type="button"
                                onClick={() => {
                                  setSelectedTradeModal({ transfer, trade });
                                }}
                                className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                title={`${trade.reason}${trade.status ? ` / ${trade.status}` : ''}`}
                              >
                                {trade.tradeId || '-'}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {txExplorerBase && transfer.transactionHash ? (
                          <button
                            type="button"
                            onClick={() => {
                              window.open(`${txExplorerBase}${transfer.transactionHash}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="block w-full truncate text-left font-mono text-[11px] font-semibold text-indigo-600 hover:underline"
                            title={transfer.transactionHash}
                          >
                            {shortenHash(transfer.transactionHash)}
                          </button>
                        ) : (
                          <span className="block w-full truncate font-mono text-[11px] text-slate-600">{shortenHash(transfer.transactionHash)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasResult ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-600">
                {totalItems === 0
                  ? '0건'
                  : `${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, totalItems)} / ${new Intl.NumberFormat(
                      'ko-KR',
                    ).format(totalItems)}건`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextPage = Math.max(1, currentPage - 1);
                    void fetchHistory({ nextSellerId: submittedSellerId, nextPage });
                  }}
                  disabled={loading || currentPage <= 1}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    loading || currentPage <= 1
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                  }`}
                >
                  ← 이전
                </button>
                <span className="text-xs font-semibold text-slate-500">
                  페이지 {currentPage} / {Math.max(1, totalPages)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextPage = Math.min(Math.max(1, totalPages), currentPage + 1);
                    void fetchHistory({ nextSellerId: submittedSellerId, nextPage });
                  }}
                  disabled={loading || currentPage >= totalPages}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    loading || currentPage >= totalPages
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                  }`}
                >
                  다음 →
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {selectedTradeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-2 py-4 md:py-3"
          onClick={() => setSelectedTradeModal(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_32px_100px_-56px_rgba(15,23,42,0.75)] md:max-h-[68vh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-3 py-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Related Order</p>
                <h3 className="text-sm font-bold text-slate-900">
                  연관 주문 정보: {selectedTradeModal.trade.tradeId || '-'}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-600">{selectedTradeModal.trade.reason || '-'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTradeModal(null)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto px-3 py-2 text-xs leading-tight">
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <p className="text-[10px] font-semibold text-slate-500">주문 상태</p>
                  <p className="font-semibold text-slate-800">
                    {getOrderStatusLabel(selectedTradeModal.trade.status)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <p className="text-[10px] font-semibold text-slate-500">연결 전송 케이스</p>
                  <p className="font-semibold text-slate-800">{selectedTradeModal.transfer.caseLabel}</p>
                </div>
              </div>

              {!selectedOrder ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
                  해당 TradeId의 주문 상세를 찾지 못했습니다. (해시 매칭 정보만 존재)
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">Order ID</p>
                      <p className="break-all font-mono text-[11px] text-slate-700">{selectedOrder.orderId || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">Trade ID</p>
                      <p className="break-all font-mono text-[11px] text-slate-700">{selectedOrder.tradeId || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">생성 시각</p>
                      <p className="text-slate-700">{formatDateTime(selectedOrder.createdAt)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">수정 시각</p>
                      <p className="text-slate-700">{formatDateTime(selectedOrder.updatedAt)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">USDT</p>
                      <p className="font-semibold text-slate-800">{formatAmountDisplay(selectedOrder.usdtAmount)} USDT</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">KRW / 환율</p>
                      <p className="font-semibold text-slate-800">
                        {formatKrwDisplay(selectedOrder.krwAmount)} KRW / {formatAmountDisplay(selectedOrder.rate)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 sm:col-span-2 lg:col-span-3">
                      <p className="text-[10px] font-semibold text-slate-500">판매자 정산 계좌</p>
                      <p className="text-slate-700">
                        {[selectedOrder.sellerBankName, selectedOrder.sellerAccountNumber, selectedOrder.sellerAccountHolder]
                          .filter(Boolean)
                          .join(' / ') || '-'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">구매자 지갑</p>
                      <p className="break-all font-mono text-[11px] text-slate-700">{selectedOrder.buyerWalletAddress || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">구매 에스크로 지갑</p>
                      <p className="break-all font-mono text-[11px] text-slate-700">{selectedOrder.buyerEscrowWalletAddress || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">판매자 지갑</p>
                      <p className="break-all font-mono text-[11px] text-slate-700">{selectedOrder.sellerWalletAddress || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500">판매자 에스크로 지갑</p>
                      <p className="break-all font-mono text-[11px] text-slate-700">{selectedOrder.sellerEscrowWalletAddress || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 sm:col-span-2 lg:col-span-3">
                      <p className="text-[10px] font-semibold text-slate-500">입금자명</p>
                      <p className="text-slate-700">{selectedOrder.buyerDepositName || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 sm:col-span-2 lg:col-span-3">
                      <p className="text-[10px] font-semibold text-slate-500">Tx Hash</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedOrder.transactionHash ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!txExplorerBase) return;
                              window.open(`${txExplorerBase}${selectedOrder.transactionHash}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            주문 Tx {shortenHash(selectedOrder.transactionHash)}
                          </button>
                        ) : null}
                        {selectedOrder.escrowTransactionHash ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!txExplorerBase) return;
                              window.open(`${txExplorerBase}${selectedOrder.escrowTransactionHash}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            에스크로 Tx {shortenHash(selectedOrder.escrowTransactionHash)}
                          </button>
                        ) : null}
                        {selectedOrder.buyerLockTransactionHash ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!txExplorerBase) return;
                              window.open(`${txExplorerBase}${selectedOrder.buyerLockTransactionHash}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            Buyer Lock {shortenHash(selectedOrder.buyerLockTransactionHash)}
                          </button>
                        ) : null}
                        {selectedOrder.sellerLockTransactionHash ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!txExplorerBase) return;
                              window.open(`${txExplorerBase}${selectedOrder.sellerLockTransactionHash}`, '_blank', 'noopener,noreferrer');
                            }}
                            className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            Seller Lock {shortenHash(selectedOrder.sellerLockTransactionHash)}
                          </button>
                        ) : null}
                        {!selectedOrder.transactionHash
                          && !selectedOrder.escrowTransactionHash
                          && !selectedOrder.buyerLockTransactionHash
                          && !selectedOrder.sellerLockTransactionHash ? (
                            <span className="text-[11px] text-slate-500">-</span>
                          ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
