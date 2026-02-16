'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Manrope, Playfair_Display } from 'next/font/google';
import { toast } from 'react-hot-toast';
import {
  getContract,
  sendAndConfirmTransaction,
} from 'thirdweb';
import {
  balanceOf,
  transfer,
} from 'thirdweb/extensions/erc20';
import {
  ethereum,
  polygon,
  arbitrum,
  bsc,
  type Chain,
} from 'thirdweb/chains';
import {
  AutoConnect,
  useActiveAccount,
} from 'thirdweb/react';

import { client } from '@/app/client';
import { ConnectButton } from '@/components/OrangeXConnectButton';
import { useClientWallets } from '@/lib/useClientWallets';
import { useClientSettings } from '@/components/ClientSettingsProvider';
import {
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from '@/app/config/contractAddresses';

type NetworkKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';

type NetworkOption = {
  id: NetworkKey;
  label: string;
  chain: Chain;
  contractAddress: string;
  tokenDecimals: number;
  explorerBaseUrl: string;
};

type Merchant = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  paymentWalletAddress: string;
};

type PaymentRecord = {
  id: string;
  storecode: string;
  storeName: string;
  chain: NetworkKey;
  fromWalletAddress: string;
  toWalletAddress: string;
  usdtAmount: number;
  krwAmount: number;
  exchangeRate: number;
  transactionHash: string;
  createdAt: string;
  confirmedAt: string;
};

const displayFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const WALLET_AUTH_OPTIONS = ['phone', 'email', 'google', 'apple', 'line', 'telegram'];
const QUICK_KRW_AMOUNTS = [10000, 30000, 50000, 100000, 300000, 500000];

const NETWORK_BY_KEY: Record<NetworkKey, NetworkOption> = {
  ethereum: {
    id: 'ethereum',
    label: 'Ethereum',
    chain: ethereum,
    contractAddress: ethereumContractAddressUSDT,
    tokenDecimals: 6,
    explorerBaseUrl: 'https://etherscan.io/tx/',
  },
  polygon: {
    id: 'polygon',
    label: 'Polygon',
    chain: polygon,
    contractAddress: polygonContractAddressUSDT,
    tokenDecimals: 6,
    explorerBaseUrl: 'https://polygonscan.com/tx/',
  },
  arbitrum: {
    id: 'arbitrum',
    label: 'Arbitrum',
    chain: arbitrum,
    contractAddress: arbitrumContractAddressUSDT,
    tokenDecimals: 6,
    explorerBaseUrl: 'https://arbiscan.io/tx/',
  },
  bsc: {
    id: 'bsc',
    label: 'BSC',
    chain: bsc,
    contractAddress: bscContractAddressUSDT,
    tokenDecimals: 18,
    explorerBaseUrl: 'https://bscscan.com/tx/',
  },
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

const shortAddress = (value: string) => {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const toSafeKrwAmount = (value: string) => {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!digits) return 0;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const formatKrw = (value: number) => `${value.toLocaleString()}원`;
const formatUsdt = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`;
const formatRate = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW`;

type ExchangeRateItem = {
  id: string;
  name: string;
  price: number;
};

const resolveExchangeRate = (payload: any) => {
  const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
  const numericItems: ExchangeRateItem[] = items
    .filter((item: any) => Number.isFinite(item?.price) && Number(item?.price) > 0)
    .map((item: any): ExchangeRateItem => ({
      id: String(item.id || ''),
      name: String(item.name || item.id || ''),
      price: Number(item.price),
    }));

  if (numericItems.length === 0) {
    return null;
  }

  const preferredOrder = ['upbit', 'bithumb', 'korbit'];
  const preferred = preferredOrder
    .map((id) => numericItems.find((item) => item.id === id))
    .find((item): item is ExchangeRateItem => Boolean(item));

  if (preferred) {
    return {
      source: preferred.name,
      price: Number(preferred.price.toFixed(2)),
    };
  }

  const avgPrice =
    numericItems.reduce((sum, item) => sum + item.price, 0) / numericItems.length;

  return {
    source: 'Average',
    price: Number(avgPrice.toFixed(2)),
  };
};

export default function PaymentUsdtPage({
  params,
}: {
  params: { lang: string };
}) {
  const lang = params?.lang || 'ko';
  const { chain } = useClientSettings();
  const activeAccount = useActiveAccount();
  const { wallet, wallets } = useClientWallets({
    authOptions: WALLET_AUTH_OPTIONS,
    sponsorGas: true,
    defaultSmsCountryCode: 'KR',
  });

  const activeNetwork = useMemo(
    () => NETWORK_BY_KEY[chain] ?? NETWORK_BY_KEY.polygon,
    [chain]
  );

  const contract = useMemo(
    () =>
      getContract({
        client,
        chain: activeNetwork.chain,
        address: activeNetwork.contractAddress,
      }),
    [activeNetwork]
  );

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedStorecode, setSelectedStorecode] = useState('');

  const [balance, setBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [exchangeRate, setExchangeRate] = useState(0);
  const [exchangeRateSource, setExchangeRateSource] = useState('');
  const [loadingRate, setLoadingRate] = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selectedMerchant = useMemo(
    () => merchants.find((item) => item.storecode === selectedStorecode) || null,
    [merchants, selectedStorecode]
  );

  const filteredMerchants = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return merchants;
    return merchants.filter((item) => {
      return (
        item.storeName.toLowerCase().includes(keyword) ||
        item.storecode.toLowerCase().includes(keyword)
      );
    });
  }, [merchants, searchKeyword]);

  const krwAmount = useMemo(() => toSafeKrwAmount(amountInput), [amountInput]);
  const usdtAmount = useMemo(() => {
    if (exchangeRate <= 0 || krwAmount <= 0) {
      return 0;
    }
    return Number((krwAmount / exchangeRate).toFixed(6));
  }, [exchangeRate, krwAmount]);
  const hasEnoughBalance = usdtAmount > 0 && usdtAmount <= balance;

  const loadMerchants = useCallback(async () => {
    setLoadingMerchants(true);
    try {
      const response = await fetch('/api/store/getAllStores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 200,
          page: 1,
          searchStore: '',
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error('상점 목록을 불러오지 못했습니다.');
      }

      const source = Array.isArray(data?.result?.stores) ? data.result.stores : [];
      const nextMerchants: Merchant[] = source
        .map((store: any) => {
          const settlement = String(store?.settlementWalletAddress || '').trim();
          const seller = String(store?.sellerWalletAddress || '').trim();
          const admin = String(store?.adminWalletAddress || '').trim();
          const paymentWalletAddress = [settlement, seller, admin].find((item) =>
            isWalletAddress(item)
          ) || '';

          return {
            storecode: String(store?.storecode || '').trim(),
            storeName: String(store?.storeName || store?.storecode || '상점'),
            storeLogo: String(store?.storeLogo || ''),
            paymentWalletAddress,
          };
        })
        .filter((item: Merchant) => Boolean(item.storecode && item.paymentWalletAddress));

      setMerchants(nextMerchants);
      setSelectedStorecode((prev) => {
        if (prev && nextMerchants.some((item) => item.storecode === prev)) {
          return prev;
        }
        return nextMerchants[0]?.storecode || '';
      });
    } catch (error) {
      console.error('Failed to load merchants', error);
      toast.error('상점 목록 조회에 실패했습니다.');
    } finally {
      setLoadingMerchants(false);
    }
  }, []);

  const loadExchangeRate = useCallback(async () => {
    setLoadingRate(true);
    try {
      const response = await fetch('/api/markets/usdt-krw', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error('환율 조회 실패');
      }

      const resolved = resolveExchangeRate(data);
      if (!resolved) {
        throw new Error('유효한 환율 데이터가 없습니다.');
      }

      setExchangeRate(resolved.price);
      setExchangeRateSource(resolved.source);
      setRateUpdatedAt(String(data?.updatedAt || new Date().toISOString()));
    } catch (error) {
      console.error('Failed to load exchange rate', error);
    } finally {
      setLoadingRate(false);
    }
  }, []);

  const loadBalance = useCallback(async () => {
    if (!activeAccount?.address) {
      setBalance(0);
      return;
    }

    setLoadingBalance(true);
    try {
      const result = await balanceOf({
        contract,
        address: activeAccount.address,
      });
      setBalance(Number(result) / 10 ** activeNetwork.tokenDecimals);
    } catch (error) {
      console.error('Failed to load balance', error);
      toast.error('USDT 잔액 조회에 실패했습니다.');
    } finally {
      setLoadingBalance(false);
    }
  }, [activeAccount?.address, contract, activeNetwork.tokenDecimals]);

  const loadHistory = useCallback(async () => {
    if (!activeAccount?.address) {
      setHistory([]);
      return;
    }

    setLoadingHistory(true);
    try {
      const response = await fetch('/api/wallet/payment-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list',
          fromWalletAddress: activeAccount.address,
          limit: 8,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || '결제 내역 조회 실패');
      }

      setHistory(Array.isArray(data?.result) ? data.result : []);
    } catch (error) {
      console.error('Failed to load payment history', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [activeAccount?.address]);

  useEffect(() => {
    loadMerchants();
  }, [loadMerchants]);

  useEffect(() => {
    loadExchangeRate();

    const interval = setInterval(() => {
      loadExchangeRate();
    }, 45000);

    return () => clearInterval(interval);
  }, [loadExchangeRate]);

  useEffect(() => {
    loadBalance();

    if (!activeAccount?.address) {
      return;
    }

    const interval = setInterval(() => {
      loadBalance();
    }, 12000);

    return () => clearInterval(interval);
  }, [activeAccount?.address, loadBalance]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const openConfirmModal = () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!selectedMerchant) {
      toast.error('결제할 상점을 선택해 주세요.');
      return;
    }
    if (krwAmount <= 0) {
      toast.error('결제 금액(원)을 입력해 주세요.');
      return;
    }
    if (exchangeRate <= 0) {
      toast.error('환율 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!hasEnoughBalance) {
      toast.error('USDT 잔액이 부족합니다.');
      return;
    }

    setIsConfirmOpen(true);
  };

  const submitPayment = async () => {
    if (
      !activeAccount?.address ||
      !selectedMerchant ||
      krwAmount <= 0 ||
      usdtAmount <= 0 ||
      exchangeRate <= 0 ||
      paying
    ) {
      return;
    }

    setPaying(true);
    try {
      const prepareResponse = await fetch('/api/wallet/payment-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare',
          chain: activeNetwork.id,
          storecode: selectedMerchant.storecode,
          fromWalletAddress: activeAccount.address,
          krwAmount,
          exchangeRate,
          usdtAmount,
        }),
      });
      const prepareData = await prepareResponse.json();

      if (!prepareResponse.ok) {
        throw new Error(prepareData?.error || '결제 요청 생성에 실패했습니다.');
      }

      const paymentRequestId = String(prepareData?.result?.paymentRequestId || '');
      const toWalletAddress = String(prepareData?.result?.toWalletAddress || '').trim();

      if (!paymentRequestId || !isWalletAddress(toWalletAddress)) {
        throw new Error('결제 요청 정보가 올바르지 않습니다.');
      }

      const transaction = transfer({
        contract,
        to: toWalletAddress,
        amount: usdtAmount.toString(),
      });

      const txResult = await sendAndConfirmTransaction({
        transaction,
        account: activeAccount as any,
      });

      const transactionHash = String((txResult as any)?.transactionHash || '');
      if (!transactionHash) {
        throw new Error('트랜잭션 해시를 확인할 수 없습니다.');
      }

      const confirmResponse = await fetch('/api/wallet/payment-usdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          paymentRequestId,
          fromWalletAddress: activeAccount.address,
          transactionHash,
        }),
      });

      const confirmData = await confirmResponse.json();
      if (!confirmResponse.ok) {
        throw new Error(confirmData?.error || '결제 기록 저장에 실패했습니다.');
      }

      toast.success('USDT 결제가 완료되었습니다.');
      setIsConfirmOpen(false);
      setAmountInput('');
      setSelectedPreset(null);
      await Promise.all([loadBalance(), loadHistory()]);
    } catch (error) {
      console.error('Failed to submit payment', error);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('결제 처리 중 오류가 발생했습니다.');
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <main
      className={`${displayFont.variable} ${bodyFont.variable} relative min-h-screen overflow-hidden bg-[radial-gradient(130%_130%_at_100%_0%,#cffafe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-900`}
      style={{ fontFamily: 'var(--font-body), "Avenir Next", "Segoe UI", sans-serif' }}
    >
      <AutoConnect client={client} wallets={[wallet]} />

      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-300/40 blur-3xl" />
      <div className="pointer-events-none absolute top-24 right-0 h-80 w-80 rounded-full bg-blue-300/30 blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
              Wallet Management
            </p>
            <h1
              className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl"
              style={{ fontFamily: 'var(--font-display), "Times New Roman", serif' }}
            >
              USDT 결제하기
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              상점을 선택하고 금액을 입력한 뒤 확인 모달에서 결제를 완료하세요.
            </p>
          </div>

          <Link
            href={`/${lang}/wallet-management/wallet-usdt`}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-900"
          >
            내 지갑으로 돌아가기
          </Link>
        </div>

        <div className="mb-6 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)] backdrop-blur">
          {activeAccount?.address ? (
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">내 지갑</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{shortAddress(activeAccount.address)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">네트워크</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{activeNetwork.label}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">USDT 잔액</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  {loadingBalance ? '조회 중...' : `${balance.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">환율</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  {loadingRate ? '조회 중...' : exchangeRate > 0 ? `1 USDT = ${formatRate(exchangeRate)}` : '환율 조회 실패'}
                </p>
                {exchangeRateSource && (
                  <p className="mt-1 text-xs text-slate-500">
                    {exchangeRateSource}
                    {rateUpdatedAt ? ` · ${new Date(rateUpdatedAt).toLocaleTimeString()}` : ''}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">결제를 시작하려면 지갑을 연결하세요.</p>
                <p className="mt-1 text-xs text-slate-600">연결 후 상점 선택, 원화 금액 입력, 환율 적용 USDT 전송이 활성화됩니다.</p>
              </div>
              <ConnectButton
                client={client}
                wallets={wallets}
                chain={activeNetwork.chain}
                locale={lang === 'en' ? 'en_US' : 'ko_KR'}
                theme="light"
                connectButton={{
                  label: '지갑 연결',
                  className:
                    'inline-flex h-10 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800',
                }}
              />
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr,1fr]">
          <section className="rounded-3xl border border-white/70 bg-white/70 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">결제할 상점 선택</h2>
              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="상점명 또는 코드 검색"
                className="h-10 w-full rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-500 md:w-64"
              />
            </div>

            <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
              {loadingMerchants && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  상점 목록을 불러오는 중입니다...
                </div>
              )}

              {!loadingMerchants && filteredMerchants.length === 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  결제 가능한 상점이 없습니다.
                </div>
              )}

              {filteredMerchants.map((merchant) => {
                const selected = merchant.storecode === selectedStorecode;
                return (
                  <button
                    key={merchant.storecode}
                    type="button"
                    onClick={() => setSelectedStorecode(merchant.storecode)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      selected
                        ? 'border-cyan-400 bg-cyan-50/80 shadow-[0_18px_30px_-22px_rgba(6,182,212,0.8)]'
                        : 'border-slate-200 bg-white/90 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                          {merchant.storeLogo ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(merchant.storeLogo)})` }}
                              aria-label={merchant.storeName}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">
                              SHOP
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{merchant.storeName}</p>
                          <p className="text-xs text-slate-500">{merchant.storecode}</p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold ${
                          selected ? 'bg-cyan-500 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {selected ? '선택됨' : '선택'}
                      </span>
                    </div>

                    <p className="mt-3 text-xs text-slate-600">
                      결제지갑: {shortAddress(merchant.paymentWalletAddress)}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
            <h2 className="text-lg font-semibold text-slate-900">결제 금액 입력 (KRW)</h2>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {QUICK_KRW_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(value);
                    setAmountInput(String(value));
                  }}
                  className={`h-10 rounded-xl border text-sm font-semibold transition ${
                    selectedPreset === value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {formatKrw(value)}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-300 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">직접 입력 (원)</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <input
                  value={amountInput ? Number(amountInput).toLocaleString() : ''}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/[^0-9]/g, '');
                    setAmountInput(raw);
                    setSelectedPreset(null);
                  }}
                  placeholder="0"
                  className="w-full bg-transparent text-2xl font-semibold text-slate-900 outline-none"
                  inputMode="numeric"
                />
                <span className="pb-1 text-sm font-semibold text-slate-500">KRW</span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">선택 상점</span>
                <span className="font-semibold text-slate-800">
                  {selectedMerchant ? selectedMerchant.storeName : '미선택'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">결제 네트워크</span>
                <span className="font-semibold text-slate-800">{activeNetwork.label}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">적용 환율</span>
                <span className="font-semibold text-slate-800">
                  {exchangeRate > 0 ? `1 USDT = ${formatRate(exchangeRate)}` : '조회 중'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">결제 금액 (KRW)</span>
                <span className="font-semibold text-slate-800">
                  {krwAmount > 0 ? formatKrw(krwAmount) : '0원'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">전송 예정 (USDT)</span>
                <span className="font-semibold text-slate-800">
                  {usdtAmount > 0 ? formatUsdt(usdtAmount) : '0 USDT'}
                </span>
              </div>
            </div>

            {!hasEnoughBalance && usdtAmount > 0 && (
              <p className="mt-3 text-sm font-medium text-rose-600">
                잔액이 부족합니다. 현재 환율 기준 전송량은 {formatUsdt(usdtAmount)} 입니다.
              </p>
            )}

            <button
              type="button"
              onClick={openConfirmModal}
              disabled={!activeAccount?.address || !selectedMerchant || krwAmount <= 0 || exchangeRate <= 0 || usdtAmount <= 0 || !hasEnoughBalance || paying}
              className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white transition enabled:hover:-translate-y-0.5 enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {paying ? '결제 처리 중...' : '결제하기'}
            </button>

            <p className="mt-3 text-xs text-slate-500">
              원화 금액 입력 후 환율을 적용한 USDT 수량이 계산되며, 확인 시 해당 USDT가 상점 결제지갑으로 전송됩니다.
            </p>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">내 최근 결제 내역</h2>
            <button
              type="button"
              onClick={loadHistory}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
            >
              새로고침
            </button>
          </div>

          {loadingHistory && <p className="text-sm text-slate-500">결제 내역을 불러오는 중입니다...</p>}
          {!loadingHistory && history.length === 0 && (
            <p className="text-sm text-slate-500">아직 완료된 결제 내역이 없습니다.</p>
          )}

          {!loadingHistory && history.length > 0 && (
            <div className="space-y-3">
              {history.map((item) => {
                const txUrl = `${NETWORK_BY_KEY[item.chain]?.explorerBaseUrl || ''}${item.transactionHash}`;
                return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.storeName}</p>
                        <p className="text-xs text-slate-500">{item.storecode}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">
                          {Number(item.usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.krwAmount > 0 ? `${Number(item.krwAmount).toLocaleString()}원 · ` : ''}
                          {new Date(item.confirmedAt || item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500">수신지갑: {shortAddress(item.toWalletAddress)}</span>
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2"
                      >
                        TX 확인
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {isConfirmOpen && selectedMerchant && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_40px_100px_-45px_rgba(2,132,199,0.9)]">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
              결제 확인
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">KRW 결제 요청을 진행할까요?</h3>

            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">상점</span>
                <span className="font-semibold text-slate-800">{selectedMerchant.storeName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">결제 금액 (KRW)</span>
                <span className="font-semibold text-slate-800">
                  {formatKrw(krwAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">네트워크</span>
                <span className="font-semibold text-slate-800">{activeNetwork.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">적용 환율</span>
                <span className="font-semibold text-slate-800">1 USDT = {formatRate(exchangeRate)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">실제 전송 (USDT)</span>
                <span className="font-semibold text-slate-800">{formatUsdt(usdtAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">수신지갑</span>
                <span className="font-semibold text-slate-800">{shortAddress(selectedMerchant.paymentWalletAddress)}</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={paying}
                className="h-11 rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitPayment}
                disabled={paying}
                className="h-11 rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {paying ? '결제 중...' : '확인하고 결제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
