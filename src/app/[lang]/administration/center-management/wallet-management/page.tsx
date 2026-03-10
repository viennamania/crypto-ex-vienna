'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useQRCode } from 'next-qrcode';
import { getContract, sendAndConfirmTransaction } from 'thirdweb';
import { arbitrum, bsc, ethereum, polygon, type Chain } from 'thirdweb/chains';
import { balanceOf, transfer } from 'thirdweb/extensions/erc20';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { shortenAddress } from 'thirdweb/utils';

import { client, clientId } from '@/app/client';
import {
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
} from '@/app/config/contractAddresses';
import { useClientWallets } from '@/lib/useClientWallets';

type NetworkKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
type WalletTab = 'receive' | 'send' | 'history';
type TransferModalPhase = 'confirm' | 'processing' | 'result';

type NetworkConfig = {
  label: string;
  chain: Chain;
  contractAddress: string;
  decimals: number;
  explorerBaseUrl: string;
};

type UsdtTransfer = {
  transaction_hash?: string;
  block_timestamp?: number | string;
  from_address?: string;
  to_address?: string;
  amount?: string | number;
  value?: string | number;
  token_decimals?: number;
  decimals?: number;
  token_symbol?: string;
  symbol?: string;
  token_metadata?: {
    symbol?: string;
    decimals?: number;
  };
};

const NETWORK_CONFIGS: Record<NetworkKey, NetworkConfig> = {
  ethereum: {
    label: 'Ethereum',
    chain: ethereum,
    contractAddress: ethereumContractAddressUSDT,
    decimals: 6,
    explorerBaseUrl: 'https://etherscan.io/tx/',
  },
  polygon: {
    label: 'Polygon',
    chain: polygon,
    contractAddress: polygonContractAddressUSDT,
    decimals: 6,
    explorerBaseUrl: 'https://polygonscan.com/tx/',
  },
  arbitrum: {
    label: 'Arbitrum',
    chain: arbitrum,
    contractAddress: arbitrumContractAddressUSDT,
    decimals: 6,
    explorerBaseUrl: 'https://arbiscan.io/tx/',
  },
  bsc: {
    label: 'BSC',
    chain: bsc,
    contractAddress: bscContractAddressUSDT,
    decimals: 18,
    explorerBaseUrl: 'https://bscscan.com/tx/',
  },
};

const TRANSFER_HISTORY_LIMIT = 20;

const isNetworkKey = (value: string): value is NetworkKey =>
  value === 'ethereum' || value === 'polygon' || value === 'arbitrum' || value === 'bsc';

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);

const normalizeAmountInput = (value: string, decimals: number) => {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleaned) {
    return '';
  }

  const parts = cleaned.split('.');
  const whole = (parts[0] || '').replace(/^0+(?=\d)/, '') || '0';
  const fraction = parts.slice(1).join('').slice(0, decimals);

  if (cleaned.endsWith('.') && parts.length === 2) {
    return `${whole}.`;
  }

  return fraction ? `${whole}.${fraction}` : whole;
};

const formatDisplayAmount = (value: number, maximumFractionDigits: number) =>
  new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);

const formatTokenAmount = (rawValue: string | number | undefined, decimals: number) => {
  if (rawValue === undefined || rawValue === null) {
    return '0';
  }

  const rawString = String(rawValue);
  if (rawString.includes('.')) {
    const numericValue = Number(rawString);
    if (!Number.isFinite(numericValue)) {
      return rawString;
    }
    return numericValue.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, '');
  }

  try {
    const raw = BigInt(rawString);
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const fraction = raw % base;
    if (fraction === 0n) {
      return whole.toString();
    }
    const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${whole.toString()}.${fractionText}`;
  } catch (error) {
    const numericValue = Number(rawString);
    if (!Number.isFinite(numericValue)) {
      return rawString;
    }
    return numericValue.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, '');
  }
};

const formatTimestamp = (value?: string | number) => {
  if (!value) {
    return '-';
  }

  const numericValue = typeof value === 'string' ? Number(value) : value;
  let timestampMs: number | null = null;

  if (Number.isFinite(numericValue)) {
    timestampMs = numericValue > 1e12 ? numericValue : numericValue * 1000;
  } else if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      timestampMs = parsed;
    }
  }

  if (timestampMs === null) {
    return '-';
  }

  return new Date(timestampMs).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const resolveTimestampValue = (value?: string | number) => {
  if (!value) {
    return 0;
  }

  const numericValue = typeof value === 'string' ? Number(value) : value;
  if (Number.isFinite(numericValue)) {
    return numericValue > 1e12 ? numericValue : numericValue * 1000;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
};

const shortenValue = (value?: string, leading = 6, trailing = 4) => {
  if (!value) {
    return '-';
  }
  if (value.length <= leading + trailing) {
    return value;
  }
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
};

export default function CenterManagementWalletManagementPage() {
  const params = useParams<{ lang?: string }>();
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const { chain } = useClientWallets({ authOptions: ['google', 'email'] });
  const { Canvas } = useQRCode();

  const account = activeWallet?.getAccount?.() ?? activeAccount;
  const walletAddress = String(account?.address || '').trim();
  const shortWalletAddress = walletAddress ? shortenAddress(walletAddress) : '연결 대기중';

  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';
  const networkKey: NetworkKey = isNetworkKey(String(chain || '')) ? String(chain) as NetworkKey : 'polygon';
  const networkConfig = NETWORK_CONFIGS[networkKey];

  const contract = useMemo(() => (
    getContract({
      client,
      chain: networkConfig.chain,
      address: networkConfig.contractAddress,
    })
  ), [networkConfig]);

  const [activeTab, setActiveTab] = useState<WalletTab>('receive');
  const [usdtBalance, setUsdtBalance] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState('');
  const [balanceRefreshToken, setBalanceRefreshToken] = useState(0);

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferModalPhase, setTransferModalPhase] = useState<TransferModalPhase>('confirm');
  const [transferStatusText, setTransferStatusText] = useState('');
  const [transferResult, setTransferResult] = useState<{
    ok: boolean;
    message: string;
    txHash?: string;
  }>({ ok: false, message: '' });

  const [transfers, setTransfers] = useState<UsdtTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transfersError, setTransfersError] = useState('');
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  const parsedAmount = amountInput && amountInput !== '.' ? Number(amountInput) : 0;
  const sendAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  const hasValidRecipient = isWalletAddress(recipientAddress);
  const exceedsBalance = sendAmount > usdtBalance;
  const canSubmitTransfer =
    Boolean(walletAddress) &&
    Boolean(account) &&
    hasValidRecipient &&
    recipientAddress.toLowerCase() !== walletAddress.toLowerCase() &&
    sendAmount > 0 &&
    !exceedsBalance &&
    !sending;

  useEffect(() => {
    if (!walletAddress) {
      setUsdtBalance(0);
      setBalanceUpdatedAt('');
      setBalanceLoading(false);
      return;
    }

    let cancelled = false;

    const loadBalance = async () => {
      try {
        if (!cancelled) {
          setBalanceLoading(true);
        }

        const result = await balanceOf({
          contract,
          address: walletAddress,
        });

        if (!cancelled) {
          setUsdtBalance(Number(result) / 10 ** networkConfig.decimals);
          setBalanceUpdatedAt(new Date().toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }));
        }
      } catch (error) {
        console.error('failed to load center management usdt balance', error);
      } finally {
        if (!cancelled) {
          setBalanceLoading(false);
        }
      }
    };

    void loadBalance();
    const intervalId = window.setInterval(loadBalance, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [walletAddress, contract, networkConfig.decimals, balanceRefreshToken]);

  useEffect(() => {
    if (!walletAddress || !clientId) {
      setTransfers([]);
      setTransfersError('');
      setTransfersLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadTransfers = async () => {
      try {
        if (!cancelled) {
          setTransfersLoading(true);
          setTransfersError('');
        }

        const url = new URL('https://insight.thirdweb.com/v1/tokens/transfers');
        url.searchParams.set('chain_id', String(networkConfig.chain.id));
        url.searchParams.set('owner_address', walletAddress);
        url.searchParams.set('contract_address', networkConfig.contractAddress);
        url.searchParams.set('token_types', 'erc20');
        url.searchParams.set('metadata', 'true');
        url.searchParams.set('sort_order', 'desc');
        url.searchParams.set('limit', String(TRANSFER_HISTORY_LIMIT));
        url.searchParams.set('page', '0');

        const response = await fetch(url.toString(), {
          headers: {
            'x-client-id': String(clientId),
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch transfers');
        }

        const payload: any = await response.json();
        const items =
          (Array.isArray(payload?.data) && payload.data) ||
          (Array.isArray(payload?.data?.transfers) && payload.data.transfers) ||
          (Array.isArray(payload?.result) && payload.result) ||
          [];

        const sortedItems = [...items].sort(
          (a, b) => resolveTimestampValue(b?.block_timestamp) - resolveTimestampValue(a?.block_timestamp),
        );

        if (!cancelled) {
          setTransfers(sortedItems as UsdtTransfer[]);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        console.error('failed to load center wallet transfer history', error);
        if (!cancelled) {
          setTransfers([]);
          setTransfersError('전송내역을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) {
          setTransfersLoading(false);
        }
      }
    };

    void loadTransfers();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [walletAddress, networkConfig.chain.id, networkConfig.contractAddress, historyRefreshToken]);

  const handleCopyWallet = async (value: string, successMessage: string) => {
    if (!value || !navigator.clipboard?.writeText) {
      toast.error('복사할 값이 없습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch (error) {
      console.error('failed to copy wallet value', error);
      toast.error('복사에 실패했습니다.');
    }
  };

  const handleAmountChange = (value: string) => {
    const normalized = normalizeAmountInput(value, networkConfig.decimals);
    const numericValue = normalized && normalized !== '.' ? Number(normalized) : 0;

    if (numericValue > usdtBalance) {
      setAmountInput(String(usdtBalance > 0 ? usdtBalance : ''));
      return;
    }

    setAmountInput(normalized);
  };

  const openTransferConfirm = () => {
    if (!account || !walletAddress) {
      toast.error('지갑 연결 상태를 확인해주세요.');
      return;
    }
    if (!hasValidRecipient) {
      toast.error('보낼 지갑주소 형식이 올바르지 않습니다.');
      return;
    }
    if (recipientAddress.toLowerCase() === walletAddress.toLowerCase()) {
      toast.error('자기 자신의 지갑으로는 보낼 수 없습니다.');
      return;
    }
    if (!sendAmount || sendAmount <= 0) {
      toast.error('보낼 USDT 수량을 입력해주세요.');
      return;
    }
    if (exceedsBalance) {
      toast.error('USDT 잔고가 부족합니다.');
      return;
    }

    setTransferModalPhase('confirm');
    setTransferStatusText('전송 전 최종 확인 단계입니다.');
    setTransferResult({ ok: false, message: '' });
    setShowTransferConfirm(true);
  };

  const closeTransferModal = () => {
    if (transferModalPhase === 'processing') {
      return;
    }

    setShowTransferConfirm(false);
    setTransferModalPhase('confirm');
    setTransferStatusText('');
    setTransferResult({ ok: false, message: '' });
  };

  const handleSendTransfer = async () => {
    if (!canSubmitTransfer || !account) {
      return;
    }

    setSending(true);
    setTransferModalPhase('processing');
    setTransferStatusText('지갑 승인과 블록체인 확인이 진행 중입니다. 완료될 때까지 잠시 기다려주세요.');

    try {
      const transaction = transfer({
        contract,
        to: recipientAddress,
        amount: sendAmount,
      });

      const { transactionHash } = await sendAndConfirmTransaction({
        transaction,
        account: account as any,
      });

      setTransferModalPhase('result');
      setTransferStatusText('전송이 완료되었습니다.');
      setTransferResult({
        ok: true,
        message: 'USDT 전송이 정상적으로 완료되었습니다.',
        txHash: transactionHash,
      });

      setRecipientAddress('');
      setAmountInput('');
      setActiveTab('history');
      setBalanceRefreshToken((prev) => prev + 1);
      setHistoryRefreshToken((prev) => prev + 1);
      toast.success('USDT 전송이 완료되었습니다.');
    } catch (error) {
      console.error('failed to send center management usdt', error);
      const message = error instanceof Error ? error.message : String(error);
      const friendlyMessage = message.toLowerCase().includes('gas')
        ? '가스비용이 부족합니다. 네이티브 토큰 잔고를 확인해주세요.'
        : 'USDT 전송에 실패했습니다. 다시 시도해주세요.';

      setTransferModalPhase('result');
      setTransferStatusText('전송 처리 중 오류가 발생했습니다.');
      setTransferResult({
        ok: false,
        message: friendlyMessage,
      });
      toast.error(friendlyMessage);
    } finally {
      setSending(false);
    }
  };

  const balanceLabel = balanceLoading
    ? '불러오는 중...'
    : `${formatDisplayAmount(usdtBalance, 6)} USDT`;

  const tabs: Array<{ key: WalletTab; label: string; hint: string }> = [
    { key: 'receive', label: '받기', hint: '지갑주소와 QR코드' },
    { key: 'send', label: '보내기', hint: 'USDT 전송' },
    { key: 'history', label: '내역', hint: '최신순 전송내역' },
  ];

  const progressSteps = [
    {
      label: '전송 확인',
      state:
        transferModalPhase === 'confirm'
          ? 'active'
          : transferModalPhase === 'processing' || transferModalPhase === 'result'
          ? 'done'
          : 'idle',
    },
    {
      label: '네트워크 처리',
      state:
        transferModalPhase === 'processing'
          ? 'active'
          : transferModalPhase === 'result'
          ? transferResult.ok
            ? 'done'
            : 'error'
          : 'idle',
    },
    {
      label: '결과 확인',
      state: transferModalPhase === 'result' ? (transferResult.ok ? 'done' : 'error') : 'idle',
    },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fafc_40%,#ffffff_68%,#e2e8f0_100%)] shadow-[0_30px_90px_-60px_rgba(15,23,42,0.55)]">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.95fr] lg:px-8 lg:py-8">
          <div className="relative">
            <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-sky-300/30 blur-3xl" />
            <div className="relative">
              <p className="inline-flex items-center rounded-full border border-slate-300/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700">
                Center Wallet Management
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                센터 관리자 지갑 관리
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                연결된 관리자 지갑의 USDT 잔고를 공통으로 확인하고, 받기·보내기·내역 탭에서 바로 작업할 수 있습니다.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleCopyWallet(walletAddress, '지갑 주소를 복사했습니다.')}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  지갑주소 복사
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceRefreshToken((prev) => prev + 1)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white/90 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white"
                >
                  잔고 새로고침
                </button>
                <Link
                  href={`/${lang}/administration/center-management`}
                  className="inline-flex h-11 items-center rounded-2xl border border-slate-300 bg-white/90 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white"
                >
                  센터 관리 홈으로
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(160deg,#020617_0%,#0f172a_52%,#1e293b_100%)] p-5 text-white shadow-[0_24px_70px_-45px_rgba(2,6,23,0.85)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">Common USDT Balance</p>
            <p className="mt-4 text-2xl font-black tracking-tight">현재 운영 지갑 요약</p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">USDT Balance</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-white">{balanceLabel}</p>
              <p className="mt-2 text-xs text-slate-400">
                {balanceUpdatedAt ? `최근 갱신 ${balanceUpdatedAt}` : '잔고를 확인하는 중입니다.'}
              </p>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Wallet Address</p>
                <p className="mt-2 break-all font-mono text-sm leading-6 text-slate-100">
                  {walletAddress || '연결 대기중'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Short</p>
                  <p className="mt-2 text-sm font-semibold text-white">{shortWalletAddress}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Chain</p>
                  <p className="mt-2 text-sm font-semibold text-white">{networkConfig.label}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-[26px] border px-5 py-5 text-left shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)] transition ${
              activeTab === tab.key
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200/80 bg-white text-slate-900 hover:border-slate-300'
            }`}
          >
            <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${activeTab === tab.key ? 'text-slate-300' : 'text-slate-400'}`}>
              Tab
            </p>
            <p className="mt-3 text-2xl font-black tracking-tight">{tab.label}</p>
            <p className={`mt-2 text-sm leading-6 ${activeTab === tab.key ? 'text-slate-300' : 'text-slate-500'}`}>
              {tab.hint}
            </p>
          </button>
        ))}
      </section>

      {activeTab === 'receive' && (
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_70px_-52px_rgba(15,23,42,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Receive</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">받기</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              아래 지갑주소 또는 QR코드를 사용해 현재 운영 지갑으로 USDT를 받을 수 있습니다.
            </p>
            <div className="mt-6 flex justify-center">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.3)]">
                <Canvas
                  text={walletAddress || ''}
                  options={{
                    margin: 2,
                    scale: 5,
                    width: 220,
                    color: {
                      dark: '#020617',
                      light: '#ffffff',
                    },
                  }}
                />
              </div>
            </div>
          </article>

          <article className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_70px_-52px_rgba(15,23,42,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Wallet Address</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">입금용 주소</h2>
            <div className="mt-5 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Full Address</p>
              <p className="mt-3 break-all font-mono text-sm leading-7 text-slate-800">
                {walletAddress || '연결 대기중'}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleCopyWallet(walletAddress, '입금용 지갑 주소를 복사했습니다.')}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                주소 복사
              </button>
              <div className="inline-flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
                {networkConfig.label} USDT
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tip 1</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  동일 체인({networkConfig.label})의 USDT만 보내세요.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tip 2</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  주소를 붙여넣기 전후로 앞 6자리와 뒤 4자리를 다시 확인하세요.
                </p>
              </div>
            </div>
          </article>
        </section>
      )}

      {activeTab === 'send' && (
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_70px_-52px_rgba(15,23,42,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Send</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">보내기</h2>
            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="recipient-wallet-address" className="text-sm font-semibold text-slate-800">
                  보낼 지갑주소
                </label>
                <input
                  id="recipient-wallet-address"
                  type="text"
                  value={recipientAddress}
                  onChange={(event) => setRecipientAddress(event.target.value.trim())}
                  placeholder="0x..."
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
                <p className="mt-2 text-xs text-slate-500">이더리움 형식의 지갑주소만 입력할 수 있습니다.</p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="send-usdt-amount" className="text-sm font-semibold text-slate-800">
                    보낼 USDT 수량
                  </label>
                  <button
                    type="button"
                    onClick={() => setAmountInput(usdtBalance > 0 ? String(usdtBalance) : '')}
                    className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                  >
                    MAX
                  </button>
                </div>
                <input
                  id="send-usdt-amount"
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) => handleAmountChange(event.target.value)}
                  placeholder="0.0"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">사용 가능 잔고 {formatDisplayAmount(usdtBalance, 6)} USDT</span>
                  {exceedsBalance && <span className="font-semibold text-rose-600">잔고 부족</span>}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Transfer Summary</p>
                <div className="mt-3 grid gap-2 text-sm text-slate-700">
                  <p>
                    받는 주소: <span className="font-semibold text-slate-950">{recipientAddress || '-'}</span>
                  </p>
                  <p>
                    전송 수량: <span className="font-semibold text-slate-950">{sendAmount > 0 ? `${formatDisplayAmount(sendAmount, 6)} USDT` : '-'}</span>
                  </p>
                  <p>
                    네트워크: <span className="font-semibold text-slate-950">{networkConfig.label}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={!canSubmitTransfer}
                onClick={openTransferConfirm}
                className={`inline-flex h-12 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${
                  canSubmitTransfer
                    ? 'bg-slate-950 text-white hover:bg-slate-800'
                    : 'cursor-not-allowed bg-slate-200 text-slate-400'
                }`}
              >
                보내기
              </button>
            </div>
          </article>

          <article className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_70px_-52px_rgba(15,23,42,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Transfer Guide</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">전송 전 확인사항</h2>
            <div className="mt-5 space-y-3">
              {[
                '받는 지갑주소가 정확한지 전체 주소 기준으로 다시 확인합니다.',
                '보낼 수량은 현재 표시된 공통 USDT 잔고를 초과할 수 없습니다.',
                '전송 버튼을 누르면 모달에서 최종 확인 후 블록체인 전송이 진행됩니다.',
              ].map((item, index) => (
                <div
                  key={item}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_18px_40px_-38px_rgba(15,23,42,0.45)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_70px_-52px_rgba(15,23,42,0.45)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">History</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">전송내역 최신순</h2>
              <p className="mt-2 text-sm text-slate-500">현재 운영 지갑 기준 최근 {TRANSFER_HISTORY_LIMIT}건을 보여줍니다.</p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryRefreshToken((prev) => prev + 1)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              내역 새로고침
            </button>
          </div>

          {transfersLoading && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">
              전송내역을 불러오는 중입니다...
            </div>
          )}

          {!transfersLoading && Boolean(transfersError) && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-700">
              {transfersError}
            </div>
          )}

          {!transfersLoading && !transfersError && transfers.length === 0 && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">
              아직 확인된 전송내역이 없습니다.
            </div>
          )}

          {!transfersLoading && !transfersError && transfers.length > 0 && (
            <div className="mt-6 space-y-3">
              {transfers.map((item, index) => {
                const from = String(item.from_address || '').toLowerCase();
                const to = String(item.to_address || '').toLowerCase();
                const direction = to === walletAddress.toLowerCase() ? 'in' : from === walletAddress.toLowerCase() ? 'out' : 'unknown';
                const amount = formatTokenAmount(
                  item.amount ?? item.value ?? '0',
                  item.token_metadata?.decimals ?? item.token_decimals ?? item.decimals ?? networkConfig.decimals,
                );
                const symbol = item.token_metadata?.symbol ?? item.token_symbol ?? item.symbol ?? 'USDT';
                const txUrl = item.transaction_hash ? `${networkConfig.explorerBaseUrl}${item.transaction_hash}` : '';

                return (
                  <article
                    key={item.transaction_hash || `${index}-${item.block_timestamp}`}
                    className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] px-5 py-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-start gap-3">
                        <span
                          className={`inline-flex min-w-[64px] items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold ${
                            direction === 'in'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : direction === 'out'
                              ? 'border-rose-200 bg-rose-50 text-rose-600'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {direction === 'in' ? '받기' : direction === 'out' ? '보내기' : '이동'}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {direction === 'in' ? '+' : direction === 'out' ? '-' : ''}
                            {amount} {symbol}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{formatTimestamp(item.block_timestamp)}</p>
                        </div>
                      </div>

                      <div className="space-y-1 text-sm text-slate-600 lg:text-right">
                        <p>From: {shortenValue(item.from_address)}</p>
                        <p>To: {shortenValue(item.to_address)}</p>
                        {txUrl ? (
                          <a
                            href={txUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900"
                          >
                            Tx {shortenValue(item.transaction_hash, 10, 8)}
                          </a>
                        ) : (
                          <p className="text-xs text-slate-400">Tx {shortenValue(item.transaction_hash, 10, 8)}</p>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {showTransferConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeTransferModal();
            }
          }}
        >
          <div className="relative w-full max-w-xl overflow-hidden rounded-[32px] border border-slate-200/90 bg-white p-6 shadow-[0_34px_90px_-46px_rgba(15,23,42,0.75)]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden">
              <div className="absolute -left-10 -top-12 h-24 w-24 rounded-full bg-emerald-200/50 blur-2xl" />
              <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-sky-200/50 blur-2xl" />
            </div>

            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Transfer Confirm</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-slate-950">USDT 보내기</h3>
              <p className="mt-2 text-sm text-slate-500">모달에서 최종 확인 후 전송을 진행합니다.</p>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {progressSteps.map((step) => (
                  <div
                    key={step.label}
                    className={`rounded-2xl border px-3 py-3 text-sm font-semibold ${
                      step.state === 'done'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : step.state === 'active'
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : step.state === 'error'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {step.label}
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Network</span>
                  <span className="font-bold text-slate-900">{networkConfig.label}</span>
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-slate-200 pt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">To</span>
                  <span className="max-w-[72%] break-all text-right font-medium text-slate-900">{recipientAddress}</span>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/85 px-3 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">Amount</span>
                  <div className="mt-1 flex items-end justify-end gap-1">
                    <span className="text-4xl font-black tracking-tight text-emerald-700">
                      {formatDisplayAmount(sendAmount, 6)}
                    </span>
                    <span className="mb-1 text-lg font-extrabold text-emerald-700">USDT</span>
                  </div>
                </div>
              </div>

              <div
                className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  transferModalPhase === 'result'
                    ? transferResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-sky-200 bg-sky-50 text-sky-800'
                }`}
              >
                {transferStatusText || '전송 전 확인 단계입니다.'}
              </div>

              {transferResult.txHash && (
                <a
                  href={`${networkConfig.explorerBaseUrl}${transferResult.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900"
                >
                  Tx {shortenValue(transferResult.txHash, 12, 10)}
                </a>
              )}

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  disabled={transferModalPhase === 'processing'}
                  onClick={closeTransferModal}
                  className={`flex-1 rounded-2xl border px-4 py-3 text-[16px] font-bold transition ${
                    transferModalPhase === 'processing'
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  {transferModalPhase === 'result' ? '닫기' : '취소'}
                </button>

                {transferModalPhase === 'confirm' && (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      void handleSendTransfer();
                    }}
                    className="flex-1 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-[16px] font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    확인 후 전송
                  </button>
                )}

                {transferModalPhase === 'processing' && (
                  <button
                    type="button"
                    disabled
                    className="flex-1 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-[16px] font-bold text-slate-400"
                  >
                    진행 중...
                  </button>
                )}

                {transferModalPhase === 'result' && (
                  <button
                    type="button"
                    onClick={closeTransferModal}
                    className="flex-1 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-[16px] font-extrabold text-white transition hover:bg-slate-800"
                  >
                    확인
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
