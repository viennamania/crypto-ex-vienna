'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Manrope, Playfair_Display } from 'next/font/google';
import { toast } from 'react-hot-toast';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';
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
import { useClientWallets } from '@/lib/useClientWallets';
import { useClientSettings } from '@/components/ClientSettingsProvider';
import WalletManagementBottomNav from '@/components/wallet-management/WalletManagementBottomNav';
import WalletConnectPrompt from '@/components/wallet-management/WalletConnectPrompt';
import WalletSummaryCard from '@/components/wallet-management/WalletSummaryCard';
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
  adminWalletAddress: string;
  usdtToKrwRate: number;
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
  member?: {
    nickname?: string;
    storecode?: string;
    buyer?: {
      bankInfo?: BuyerBankInfoSnapshot | null;
    } | null;
  } | null;
};

type BuyerBankInfoSnapshot = {
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  depositBankName?: string;
  depositBankAccountNumber?: string;
  depositName?: string;
  [key: string]: unknown;
};

type MemberProfile = {
  nickname: string;
  storecode: string;
  buyer: {
    bankInfo?: BuyerBankInfoSnapshot;
    depositBankName?: string;
    depositBankAccountNumber?: string;
    depositName?: string;
    [key: string]: unknown;
  } | null;
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

const WALLET_AUTH_OPTIONS = ['phone'];
const QUICK_USDT_AMOUNTS = [10, 30, 50, 100, 300, 500];
const SENDBIRD_APP_ID =
  process.env.NEXT_PUBLIC_SENDBIRD_APP_ID ||
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SENDBIRD_APP_ID ||
  '';

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

const normalizeUsdtInput = (value: string) => {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const hasTrailingDot = cleaned.endsWith('.');
  const [wholeRaw, decimalRaw = ''] = cleaned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '');
  const decimal = decimalRaw.slice(0, 6);
  if (hasTrailingDot) {
    return `${whole || '0'}.`;
  }
  if (decimal.length > 0) {
    return `${whole || '0'}.${decimal}`;
  }
  return whole;
};

const toSafeUsdtAmount = (value: string) => {
  const parsed = Number(String(value || '').replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Number(parsed.toFixed(6));
  return normalized > 0 ? normalized : 0;
};

const formatUsdtInputFromBalance = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const floored = Math.floor(value * 1_000_000) / 1_000_000;
  if (floored <= 0) return '';
  return floored.toFixed(6).replace(/\.?0+$/, '');
};

const formatKrw = (value: number) => `${value.toLocaleString()}원`;
const formatUsdt = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`;
const formatRate = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveBuyerBankInfo = (buyer: unknown): BuyerBankInfoSnapshot | null => {
  if (!isRecord(buyer)) return null;

  const bankInfoFromBuyer = buyer.bankInfo;
  if (isRecord(bankInfoFromBuyer)) {
    return bankInfoFromBuyer as BuyerBankInfoSnapshot;
  }

  const depositBankName = String(buyer.depositBankName || '').trim();
  const depositBankAccountNumber = String(buyer.depositBankAccountNumber || '').trim();
  const depositName = String(buyer.depositName || '').trim();

  if (!depositBankName && !depositBankAccountNumber && !depositName) {
    return null;
  }

  return {
    bankName: depositBankName,
    accountNumber: depositBankAccountNumber,
    accountHolder: depositName,
    depositBankName,
    depositBankAccountNumber,
    depositName,
  };
};

const formatPaymentMemberName = (member: PaymentRecord['member']) => {
  const nickname = String(member?.nickname || '').trim();
  const memberStorecode = String(member?.storecode || '').trim();
  if (nickname && memberStorecode) {
    return `${nickname} (${memberStorecode})`;
  }
  return nickname || memberStorecode || '-';
};

const isNetworkKey = (value: string): value is NetworkKey =>
  value === 'ethereum' || value === 'polygon' || value === 'arbitrum' || value === 'bsc';

const toSafeNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizePaymentRecord = (value: unknown): PaymentRecord | null => {
  if (!isRecord(value)) return null;

  const chainCandidate = String(value.chain || '').trim().toLowerCase();
  const chain = isNetworkKey(chainCandidate) ? chainCandidate : 'polygon';

  return {
    id: String(value.id || value._id || '').trim(),
    storecode: String(value.storecode || '').trim(),
    storeName: String(value.storeName || value.storecode || '').trim(),
    chain,
    fromWalletAddress: String(value.fromWalletAddress || '').trim(),
    toWalletAddress: String(value.toWalletAddress || '').trim(),
    usdtAmount: toSafeNumber(value.usdtAmount),
    krwAmount: toSafeNumber(value.krwAmount),
    exchangeRate: toSafeNumber(value.exchangeRate),
    transactionHash: String(value.transactionHash || '').trim(),
    createdAt: String(value.createdAt || '').trim(),
    confirmedAt: String(value.confirmedAt || '').trim(),
    member: isRecord(value.member) ? (value.member as PaymentRecord['member']) : null,
  };
};

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};

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
  const searchParams = useSearchParams();
  const storecodeFromQuery = String(searchParams?.get('storecode') || '').trim();
  const hasStorecodeParam = Boolean(storecodeFromQuery);
  const disconnectRedirectPath = useMemo(() => {
    const query = new URLSearchParams();
    if (storecodeFromQuery) {
      query.set('storecode', storecodeFromQuery);
    }
    const queryString = query.toString();
    return `/${lang}/wallet-management${queryString ? `?${queryString}` : ''}`;
  }, [lang, storecodeFromQuery]);
  const { chain } = useClientSettings();
  const activeAccount = useActiveAccount();
  const { wallet, wallets, smartAccountEnabled } = useClientWallets({
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

  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [exchangeRate, setExchangeRate] = useState(0);
  const [exchangeRateSource, setExchangeRateSource] = useState('');
  const [loadingRate, setLoadingRate] = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState('');
  const [isStorePickerOpen, setIsStorePickerOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentTab, setPaymentTab] = useState<'pay' | 'history'>('pay');

  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [latestPaymentRecord, setLatestPaymentRecord] = useState<PaymentRecord | null>(null);
  const [justPaidRecordId, setJustPaidRecordId] = useState('');
  const [myMemberProfile, setMyMemberProfile] = useState<MemberProfile | null>(null);
  const [loadingMemberProfile, setLoadingMemberProfile] = useState(false);
  const [memberProfileError, setMemberProfileError] = useState<string | null>(null);
  const [signupNickname, setSignupNickname] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signingUpMember, setSigningUpMember] = useState(false);
  const [chatSessionToken, setChatSessionToken] = useState<string | null>(null);
  const [chatChannelUrl, setChatChannelUrl] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatRefreshToken, setChatRefreshToken] = useState(0);
  const memberProfileRequestIdRef = useRef(0);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const memberStatusCardRef = useRef<HTMLDivElement | null>(null);

  const clampUsdtInputToBalance = useCallback((rawValue: string) => {
    const normalized = normalizeUsdtInput(rawValue);
    if (!normalized) return '';

    // Keep intermediate decimal input states (e.g. "0", "0.", "0.0") so users can continue typing.
    if (/^0(?:\.0*)?$/.test(normalized)) {
      return normalized;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return '';
    if (balance > 0 && parsed > balance) {
      return formatUsdtInputFromBalance(balance);
    }

    return normalized;
  }, [balance]);

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

  const usdtAmount = useMemo(() => toSafeUsdtAmount(amountInput), [amountInput]);
  const krwAmount = useMemo(() => {
    if (exchangeRate <= 0 || usdtAmount <= 0) {
      return 0;
    }
    return Math.round(usdtAmount * exchangeRate);
  }, [exchangeRate, usdtAmount]);
  const hasEnoughBalance = usdtAmount > 0 && usdtAmount <= balance;
  const paymentTabLabel = useMemo(
    () => (paymentTab === 'pay' ? '결제하기' : '결제내역'),
    [paymentTab],
  );
  const memberBankInfoSnapshot = useMemo(
    () => resolveBuyerBankInfo(myMemberProfile?.buyer),
    [myMemberProfile?.buyer]
  );
  const fallbackMemberDisplayName = useMemo(() => {
    if (!activeAccount?.address) return '';
    return `user_${activeAccount.address.replace(/^0x/i, '').slice(0, 6)}`;
  }, [activeAccount?.address]);
  const memberDisplayName = useMemo(() => {
    const nickname = String(myMemberProfile?.nickname || '').trim();
    return nickname || fallbackMemberDisplayName;
  }, [myMemberProfile?.nickname, fallbackMemberDisplayName]);
  const selectedMerchantAdminWalletAddress = String(selectedMerchant?.adminWalletAddress || '').trim();
  const hasValidStoreAdminWallet = isWalletAddress(selectedMerchantAdminWalletAddress);
  const isStoreAdminSameAsMember = Boolean(
    activeAccount?.address &&
      hasValidStoreAdminWallet &&
      activeAccount.address.toLowerCase() === selectedMerchantAdminWalletAddress.toLowerCase(),
  );
  const shouldShowSelfMerchantChatAlert = Boolean(
    activeAccount?.address && selectedMerchant && isStoreAdminSameAsMember,
  );
  const hasMemberProfile = Boolean(myMemberProfile);
  const needsMerchantSelectionFirst = !hasStorecodeParam && !selectedMerchant;
  const needsMemberSignupFirst = Boolean(
    activeAccount?.address &&
      selectedMerchant &&
      !loadingMemberProfile &&
      !hasMemberProfile
  );
  const shouldLockAmountInputs =
    !selectedMerchant || loadingMemberProfile || needsMemberSignupFirst;
  const isPaymentReady = Boolean(
    activeAccount?.address &&
      selectedMerchant &&
      !loadingMemberProfile &&
      hasMemberProfile &&
      usdtAmount > 0 &&
      exchangeRate > 0 &&
      krwAmount > 0 &&
      hasEnoughBalance
  );
  const latestPaymentTxUrl = useMemo(() => {
    if (!latestPaymentRecord?.transactionHash) return '';
    return `${NETWORK_BY_KEY[latestPaymentRecord.chain]?.explorerBaseUrl || ''}${latestPaymentRecord.transactionHash}`;
  }, [latestPaymentRecord]);
  const primaryActionLabel = useMemo(() => {
    if (paying) {
      return '결제 처리 중...';
    }
    if (!activeAccount?.address) {
      return '지갑 연결 후 진행';
    }
    if (!selectedMerchant) {
      return hasStorecodeParam ? '상점 정보 확인 필요' : '가맹점 선택하고 계속';
    }
    if (loadingMemberProfile) {
      return '회원 정보 확인 중...';
    }
    if (!hasMemberProfile) {
      return '회원정보 연동하기';
    }
    if (usdtAmount <= 0) {
      return 'USDT 수량 입력하기';
    }
    if (exchangeRate <= 0) {
      return '환율 로딩 중...';
    }
    if (krwAmount <= 0) {
      return '수량 조정 필요';
    }
    if (!hasEnoughBalance) {
      return 'USDT 충전 후 결제';
    }
    return `${formatUsdt(usdtAmount)} 결제하기`;
  }, [
    paying,
    activeAccount?.address,
    selectedMerchant,
    hasStorecodeParam,
    loadingMemberProfile,
    hasMemberProfile,
    usdtAmount,
    exchangeRate,
    krwAmount,
    hasEnoughBalance,
  ]);
  const primaryActionGuide = useMemo(() => {
    if (!activeAccount?.address) {
      return '지갑을 연결하면 상점 선택과 결제 진행이 가능합니다.';
    }
    if (!selectedMerchant) {
      return hasStorecodeParam
        ? '요청한 상점을 확인한 뒤 결제를 진행해 주세요.'
        : '먼저 결제할 가맹점을 선택해 주세요.';
    }
    if (loadingMemberProfile) {
      return '선택한 가맹점 회원 여부를 확인하고 있습니다.';
    }
    if (!hasMemberProfile) {
      return '가맹점 회원 아이디와 비밀번호를 입력해 회원정보 연동을 완료해야 결제를 진행할 수 있습니다.';
    }
    if (usdtAmount <= 0) {
      return '결제할 USDT 수량을 입력해 주세요.';
    }
    if (exchangeRate <= 0) {
      return '실시간 환율을 불러오는 중입니다. 잠시만 기다려 주세요.';
    }
    if (krwAmount <= 0) {
      return '환산 금액이 0원이 되지 않도록 USDT 수량을 조정해 주세요.';
    }
    if (!hasEnoughBalance) {
      return `잔액이 부족합니다. 현재 필요 수량은 ${formatUsdt(usdtAmount)} 입니다.`;
    }
    return '확인 모달에서 최종 금액을 확인한 뒤 결제를 완료할 수 있습니다.';
  }, [
    activeAccount?.address,
    selectedMerchant,
    hasStorecodeParam,
    loadingMemberProfile,
    hasMemberProfile,
    usdtAmount,
    exchangeRate,
    krwAmount,
    hasEnoughBalance,
  ]);

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
          const paymentWalletAddress = String(store?.paymentWalletAddress || '').trim();

          return {
            storecode: String(store?.storecode || '').trim(),
            storeName: String(store?.storeName || store?.storecode || '상점'),
            storeLogo: String(store?.storeLogo || ''),
            paymentWalletAddress,
            adminWalletAddress: String(store?.adminWalletAddress || '').trim(),
            usdtToKrwRate: toSafeNumber(store?.usdtToKrwRate),
          };
        })
        .filter((item: Merchant) => Boolean(item.storecode && item.paymentWalletAddress));

      setMerchants(nextMerchants);
      setSelectedStorecode((prev) => {
        if (storecodeFromQuery) {
          const matchedStore = nextMerchants.find(
            (item) => item.storecode.toLowerCase() === storecodeFromQuery.toLowerCase(),
          );
          return matchedStore?.storecode || storecodeFromQuery;
        }
        if (prev && nextMerchants.some((item) => item.storecode === prev)) {
          return prev;
        }
        return '';
      });
    } catch (error) {
      console.error('Failed to load merchants', error);
      toast.error('상점 목록 조회에 실패했습니다.');
    } finally {
      setLoadingMerchants(false);
    }
  }, [storecodeFromQuery]);

  const loadExchangeRate = useCallback(async () => {
    const storeConfiguredRate = toSafeNumber(selectedMerchant?.usdtToKrwRate);
    if (storeConfiguredRate > 0) {
      setExchangeRate(storeConfiguredRate);
      setExchangeRateSource('Store');
      setRateUpdatedAt(new Date().toISOString());
      setLoadingRate(false);
      return;
    }

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
  }, [selectedMerchant?.usdtToKrwRate]);

  const loadBalance = useCallback(async () => {
    if (!activeAccount?.address) {
      setBalance(0);
      return;
    }

    try {
      const result = await balanceOf({
        contract,
        address: activeAccount.address,
      });
      setBalance(Number(result) / 10 ** activeNetwork.tokenDecimals);
    } catch (error) {
      console.error('Failed to load balance', error);
      toast.error('USDT 잔액 조회에 실패했습니다.');
    }
  }, [activeAccount?.address, contract, activeNetwork.tokenDecimals]);

  const loadHistory = useCallback(async () => {
    if (!activeAccount?.address) {
      setHistory([]);
      setLatestPaymentRecord(null);
      setJustPaidRecordId('');
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
          ...(selectedStorecode ? { storecode: selectedStorecode } : {}),
          limit: 8,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || '결제 내역 조회 실패');
      }

      const nextHistory = (Array.isArray(data?.result) ? data.result : [])
        .map((item: unknown) => normalizePaymentRecord(item))
        .filter((item: PaymentRecord | null): item is PaymentRecord => Boolean(item));

      setHistory(nextHistory);
      setLatestPaymentRecord(nextHistory[0] || null);
    } catch (error) {
      console.error('Failed to load payment history', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [activeAccount?.address, selectedStorecode]);

  const loadMemberProfile = useCallback(async () => {
    const requestId = memberProfileRequestIdRef.current + 1;
    memberProfileRequestIdRef.current = requestId;

    if (!activeAccount?.address || !selectedStorecode) {
      setMyMemberProfile(null);
      setMemberProfileError(null);
      setLoadingMemberProfile(false);
      return;
    }

    setLoadingMemberProfile(true);
    try {
      const response = await fetch('/api/user/getUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: selectedStorecode,
          walletAddress: activeAccount.address,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '회원 정보 조회 실패');
      }
      const user = data?.result;

      if (requestId !== memberProfileRequestIdRef.current) {
        return;
      }

      if (user && typeof user === 'object') {
        setMyMemberProfile({
          nickname: String(user?.nickname || '').trim(),
          storecode: String(user?.storecode || '').trim(),
          buyer: isRecord(user?.buyer) ? (user.buyer as MemberProfile['buyer']) : null,
        });
        setMemberProfileError(null);
        setSignupNickname('');
        setSignupPassword('');
      } else {
        setMyMemberProfile(null);
        setMemberProfileError(null);
      }
    } catch (error) {
      console.error('Failed to load member profile', error);
      if (requestId !== memberProfileRequestIdRef.current) {
        return;
      }
      setMyMemberProfile(null);
      setMemberProfileError(error instanceof Error ? error.message : '회원 정보를 불러오지 못했습니다.');
    } finally {
      if (requestId === memberProfileRequestIdRef.current) {
        setLoadingMemberProfile(false);
      }
    }
  }, [activeAccount?.address, selectedStorecode]);

  const connectStoreChat = useCallback(async () => {
    if (
      paymentTab !== 'pay' ||
      !activeAccount?.address ||
      !selectedMerchant ||
      !SENDBIRD_APP_ID ||
      !hasValidStoreAdminWallet ||
      isStoreAdminSameAsMember
    ) {
      setChatSessionToken(null);
      setChatChannelUrl(null);
      setChatError(null);
      return;
    }

    if (!memberDisplayName) {
      return;
    }

    setChatLoading(true);
    setChatError(null);
    try {
      await fetch('/api/sendbird/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeAccount.address,
          nickname: memberDisplayName,
        }),
      }).catch(() => null);

      const sessionResponse = await fetch('/api/sendbird/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeAccount.address,
          nickname: memberDisplayName,
        }),
      });
      const sessionData = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || !sessionData?.sessionToken) {
        throw new Error(sessionData?.error || '채팅 세션 토큰 발급에 실패했습니다.');
      }

      const channelResponse = await fetch('/api/sendbird/group-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerId: activeAccount.address,
          sellerId: selectedMerchantAdminWalletAddress,
        }),
      });
      const channelData = await channelResponse.json().catch(() => ({}));
      if (!channelResponse.ok || !channelData?.channelUrl) {
        throw new Error(channelData?.error || '상점 채팅 채널 생성에 실패했습니다.');
      }

      setChatSessionToken(String(sessionData.sessionToken));
      setChatChannelUrl(String(channelData.channelUrl));
    } catch (error) {
      console.error('Failed to connect store chat', error);
      setChatSessionToken(null);
      setChatChannelUrl(null);
      setChatError(error instanceof Error ? error.message : '채팅을 연결하지 못했습니다.');
    } finally {
      setChatLoading(false);
    }
  }, [
    paymentTab,
    activeAccount?.address,
    selectedMerchant,
    selectedMerchantAdminWalletAddress,
    hasValidStoreAdminWallet,
    isStoreAdminSameAsMember,
    memberDisplayName,
  ]);

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

  useEffect(() => {
    loadMemberProfile();
  }, [loadMemberProfile]);

  useEffect(() => {
    connectStoreChat();
  }, [connectStoreChat, chatRefreshToken]);

  useEffect(() => {
    setSignupNickname('');
    setSignupPassword('');
    setJustPaidRecordId('');
  }, [selectedStorecode]);

  const registerMemberForSelectedStore = async () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!selectedStorecode) {
      toast.error('상점을 먼저 선택해 주세요.');
      return;
    }

    const nickname = signupNickname.trim();
    if (nickname.length < 2) {
      toast.error('회원 아이디를 2자 이상 입력해 주세요.');
      return;
    }

    const password = signupPassword.trim();
    if (!password) {
      toast.error('비밀번호를 입력해 주세요.');
      return;
    }

    setSigningUpMember(true);
    setMemberProfileError(null);
    try {
      const response = await fetch('/api/user/linkWalletByStorecodeNicknamePassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: selectedStorecode,
          walletAddress: activeAccount.address,
          nickname,
          password,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.error || '회원 인증에 실패했습니다.');
      }

      toast.success('회원 인증이 완료되어 내 지갑으로 연결되었습니다.');
      await loadMemberProfile();
    } catch (error) {
      console.error('Failed to verify and link member', error);
      const message = error instanceof Error ? error.message : '회원 인증 중 오류가 발생했습니다.';
      setMemberProfileError(message);
      toast.error(message);
    } finally {
      setSigningUpMember(false);
    }
  };

  const openConfirmModal = () => {
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!selectedMerchant) {
      toast.error(hasStorecodeParam ? '요청한 상점 정보를 찾을 수 없습니다.' : '결제할 상점을 선택해 주세요.');
      return;
    }
    if (loadingMemberProfile) {
      toast.error('회원 정보를 확인 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!hasMemberProfile) {
      toast.error('선택한 상점의 회원정보 연동을 완료해야 결제할 수 있습니다.');
      return;
    }
    if (usdtAmount <= 0) {
      toast.error('결제 수량(USDT)을 입력해 주세요.');
      return;
    }
    if (exchangeRate <= 0) {
      toast.error('환율 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (krwAmount <= 0) {
      toast.error('환산 금액이 너무 작습니다. USDT 수량을 늘려 주세요.');
      return;
    }
    if (!hasEnoughBalance) {
      toast.error('USDT 잔액이 부족합니다.');
      return;
    }

    setIsConfirmOpen(true);
  };

  const handlePrimaryAction = () => {
    if (paying) {
      return;
    }
    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!selectedMerchant) {
      if (!hasStorecodeParam) {
        setSearchKeyword('');
        setIsStorePickerOpen(true);
        return;
      }
      toast.error('요청한 상점 정보를 찾을 수 없습니다.');
      return;
    }
    if (loadingMemberProfile) {
      toast.error('회원 정보를 확인 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!hasMemberProfile) {
      memberStatusCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error('회원정보 연동을 먼저 완료해 주세요.');
      return;
    }
    if (usdtAmount <= 0) {
      amountInputRef.current?.focus();
      toast.error('결제 수량(USDT)을 입력해 주세요.');
      return;
    }
    if (exchangeRate <= 0) {
      toast.error('환율 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (krwAmount <= 0) {
      amountInputRef.current?.focus();
      toast.error('환산 금액이 너무 작습니다. USDT 수량을 늘려 주세요.');
      return;
    }
    if (!hasEnoughBalance) {
      toast.error('USDT 잔액이 부족합니다.');
      return;
    }

    openConfirmModal();
  };

  const submitPayment = async () => {
    if (
      !activeAccount?.address ||
      !selectedMerchant ||
      !hasMemberProfile ||
      usdtAmount <= 0 ||
      exchangeRate <= 0 ||
      krwAmount <= 0 ||
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
          memberNickname: myMemberProfile?.nickname || '',
          memberStorecode: myMemberProfile?.storecode || '',
          memberBuyerBankInfo: memberBankInfoSnapshot,
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

      const confirmedPayment = normalizePaymentRecord(confirmData?.result);
      if (confirmedPayment) {
        setLatestPaymentRecord(confirmedPayment);
        setJustPaidRecordId(confirmedPayment.id || confirmedPayment.transactionHash);
        setHistory((previous) => {
          const deduped = previous.filter(
            (item) =>
              item.id !== confirmedPayment.id &&
              item.transactionHash !== confirmedPayment.transactionHash,
          );
          return [confirmedPayment, ...deduped].slice(0, 8);
        });
      }

      toast.success('USDT 결제가 완료되었습니다.');
      setIsConfirmOpen(false);
      setAmountInput('');
      setSelectedPreset(null);
      setPaymentTab('history');
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

      <div className="relative mx-auto w-full max-w-[430px] px-4 pb-28 pt-8">
        <div className="mb-8">
          <p className="mb-2 inline-flex rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
            Wallet Management
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: '"SUIT Variable", "Pretendard", "Noto Sans KR", sans-serif' }}
          >
            {hasStorecodeParam && selectedMerchant ? (
              <span className="inline-flex max-w-full items-center gap-2.5">
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-cyan-200">
                  {selectedMerchant.storeLogo ? (
                    <span
                      className="block h-full w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${encodeURI(selectedMerchant.storeLogo)})` }}
                      aria-label={selectedMerchant.storeName}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-cyan-700">
                      SHOP
                    </span>
                  )}
                </span>
                <span className="min-w-0 truncate">{selectedMerchant.storeName}</span>
                <span className="shrink-0 text-slate-700">USDT 결제</span>
              </span>
            ) : (
              'USDT 결제'
            )}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {hasStorecodeParam
              ? '지정된 가맹점에 USDT 결제 수량을 입력하면, 실시간 환율 기준 KRW 환산 금액을 확인하며 안전하게 결제할 수 있습니다.'
              : '가맹점을 선택하고 USDT 결제 수량을 입력하면, 실시간 환율 기준 KRW 환산 금액을 확인하며 안전하게 결제할 수 있습니다.'}
          </p>
        </div>

        {activeAccount?.address ? (
          <WalletSummaryCard
            walletAddress={activeAccount.address}
            walletAddressDisplay={shortAddress(activeAccount.address)}
            networkLabel={activeNetwork.label}
            usdtBalanceDisplay={`${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
            modeLabel={paymentTabLabel}
            smartAccountEnabled={smartAccountEnabled}
            disconnectRedirectPath={disconnectRedirectPath}
            onCopyAddress={(walletAddress) => {
              navigator.clipboard.writeText(walletAddress);
              toast.success('지갑 주소를 복사했습니다.');
            }}
          />
        ) : (
          <div className="mb-6 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)] backdrop-blur">
            <WalletConnectPrompt
              wallets={wallets}
              chain={activeNetwork.chain}
              lang={lang}
              title="결제를 시작하려면 지갑을 연결하세요."
              description="연결 후 상점 선택, USDT 수량 입력, 환율 기반 결제가 활성화됩니다."
            />
          </div>
        )}

        <div className="grid gap-5">
          <section className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="mb-5 grid grid-cols-2 gap-2">
              {[
                { key: 'pay', label: '결제하기' },
                { key: 'history', label: '결제내역' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPaymentTab(tab.key as 'pay' | 'history')}
                  className={`inline-flex h-10 items-center justify-center rounded-xl border text-xs font-semibold transition ${
                    paymentTab === tab.key
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {paymentTab === 'pay' ? (
              <>
                {latestPaymentRecord && (
                  <div
                    className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
                      justPaidRecordId &&
                      (justPaidRecordId === latestPaymentRecord.id ||
                        justPaidRecordId === latestPaymentRecord.transactionHash)
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-cyan-200 bg-cyan-50/70'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                        최근 결제 완료 정보
                      </p>
                      {justPaidRecordId &&
                        (justPaidRecordId === latestPaymentRecord.id ||
                          justPaidRecordId === latestPaymentRecord.transactionHash) && (
                          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            방금 결제됨
                          </span>
                        )}
                    </div>

                    <p className="mt-1 text-base font-semibold text-slate-900">
                      {latestPaymentRecord.storeName || '-'} ({latestPaymentRecord.storecode || '-'})
                    </p>
                    <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-1">
                      <p className="text-2xl font-extrabold leading-none tabular-nums text-slate-900">
                        {formatUsdt(latestPaymentRecord.usdtAmount)}
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-slate-600">
                        {formatKrw(latestPaymentRecord.krwAmount)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      결제완료 {formatDateTime(latestPaymentRecord.confirmedAt || latestPaymentRecord.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      TX {shortAddress(latestPaymentRecord.transactionHash || '-')}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentTab('history')}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                      >
                        결제내역 상세 보기
                      </button>
                      {latestPaymentTxUrl && (
                        <a
                          href={latestPaymentTxUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 text-xs font-semibold text-cyan-800 transition hover:border-cyan-400 hover:text-cyan-900"
                        >
                          TX 확인
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {!hasStorecodeParam && (
                  <div
                    className={`mb-4 rounded-2xl border p-4 ${
                      needsMerchantSelectionFirst
                        ? 'border-cyan-300 bg-gradient-to-br from-cyan-50 via-white to-sky-50 shadow-[0_18px_45px_-25px_rgba(6,182,212,0.55)]'
                        : 'border-cyan-200 bg-cyan-50/70'
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">STEP 1 · 결제 가맹점 선택</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-900">
                      {selectedMerchant ? '결제할 가맹점이 선택되었습니다.' : '먼저 결제할 가맹점을 선택해 주세요.'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      {selectedMerchant
                        ? '상점 선택이 완료되었습니다. 이제 USDT 결제 수량을 입력해 진행할 수 있습니다.'
                        : '가맹점을 먼저 선택해야 회원 확인과 USDT 수량 입력이 활성화됩니다.'}
                    </p>

                    {selectedMerchant && (
                      <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-200 bg-white px-2.5 py-1.5">
                        <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-cyan-200">
                          {selectedMerchant.storeLogo ? (
                            <div
                              className="h-full w-full bg-cover bg-center"
                              style={{ backgroundImage: `url(${encodeURI(selectedMerchant.storeLogo)})` }}
                              aria-label={selectedMerchant.storeName}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-cyan-700">
                              SHOP
                            </div>
                          )}
                        </div>
                        <span className="truncate text-xs font-semibold text-cyan-900">
                          {selectedMerchant.storeName}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setSearchKeyword('');
                        setIsStorePickerOpen(true);
                      }}
                      disabled={loadingMerchants || merchants.length === 0}
                      className={`mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition ${
                        needsMerchantSelectionFirst
                          ? 'bg-cyan-700 text-white shadow-[0_14px_34px_-16px_rgba(14,116,144,0.8)] hover:bg-cyan-600'
                          : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {selectedMerchant ? '결제 가맹점 다시 선택' : '결제할 가맹점 선택하기'}
                    </button>
                  </div>
                )}

                {!hasStorecodeParam && selectedMerchant && (
                  <div className="mb-4 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">지정 가맹점</p>
                    <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-200 bg-white px-2.5 py-1.5">
                      <div className="h-5 w-5 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-cyan-200">
                        {selectedMerchant.storeLogo ? (
                          <div
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${encodeURI(selectedMerchant.storeLogo)})` }}
                            aria-label={selectedMerchant.storeName}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[8px] font-bold text-cyan-700">
                            SHOP
                          </div>
                        )}
                      </div>
                      <span className="truncate text-xs font-semibold text-cyan-900">
                        {selectedMerchant.storeName}
                      </span>
                    </div>
                  </div>
                )}

                {hasStorecodeParam && !loadingMerchants && !selectedMerchant && (
                  <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                    <p className="font-semibold text-rose-700">요청한 가맹점 정보를 찾지 못했습니다.</p>
                    <p className="mt-1 text-xs text-rose-600">
                      잘못된 `storecode`이거나 결제지갑이 설정되지 않은 가맹점일 수 있습니다.
                    </p>
                  </div>
                )}

                {activeAccount?.address && selectedMerchant && (
                  <div
                    ref={memberStatusCardRef}
                    className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
                      hasMemberProfile
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-amber-200 bg-amber-50'
                    } ${
                      hasMemberProfile
                        ? 'min-h-[130px]'
                        : loadingMemberProfile
                          ? 'min-h-[160px]'
                          : 'min-h-[220px]'
                    }`}
                  >
                    {loadingMemberProfile ? (
                      <>
                        <p className="font-semibold text-slate-700">
                          {`${selectedMerchant.storeName || '선택 상점'} 회원 정보를 확인 중입니다...`}
                        </p>
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">회원 아이디</p>
                        <div className="mt-1 h-10 w-40 animate-pulse rounded-lg bg-slate-200/80" />
                      </>
                    ) : hasMemberProfile ? (
                      <>
                        <p className="font-semibold text-emerald-800">결제 가능한 회원입니다.</p>
                        <p className="mt-2 text-[11px] font-semibold text-emerald-700">회원 아이디</p>
                        <p className="mt-1 break-all text-2xl font-extrabold leading-tight text-emerald-900">
                          {myMemberProfile?.nickname || '-'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-amber-800">
                          {`${selectedMerchant.storeName || '이 상점'} 가맹점 회원정보를 먼저 연동해야 결제할 수 있습니다.`}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-amber-800">
                          회원 아이디와 비밀번호를 모를경우 가맹점에 문의하세요.
                        </p>
                        {memberProfileError && (
                          <p className="mt-1 text-xs text-rose-600">{memberProfileError}</p>
                        )}
                        <div className="mt-3 space-y-2.5">
                          <div className="grid grid-cols-2 gap-2.5">
                            <input
                              value={signupNickname}
                              onChange={(event) => setSignupNickname(event.target.value)}
                              placeholder="회원 아이디"
                              className="h-12 w-full rounded-2xl border-2 border-amber-300 bg-white px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-amber-500 placeholder:text-slate-400"
                              maxLength={24}
                            />
                            <input
                              type="password"
                              value={signupPassword}
                              onChange={(event) => setSignupPassword(event.target.value)}
                              placeholder="비밀번호"
                              autoComplete="current-password"
                              className="h-12 w-full rounded-2xl border-2 border-amber-300 bg-white px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-amber-500 placeholder:text-slate-400"
                              maxLength={64}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={registerMemberForSelectedStore}
                            disabled={signingUpMember}
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {signingUpMember ? '인증 처리 중...' : '회원정보 연동 후 결제하기'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {!hasStorecodeParam && (
                  <div
                    className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
                      isPaymentReady
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">결제 준비 상태</p>
                    <p className={`mt-1 font-semibold ${isPaymentReady ? 'text-emerald-800' : 'text-slate-800'}`}>
                      {primaryActionLabel}
                    </p>
                    <p className={`mt-1 text-xs ${isPaymentReady ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {primaryActionGuide}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">USDT 결제 수량 입력</h2>
                </div>

                {needsMerchantSelectionFirst && (
                  <p className="mt-2 text-xs font-semibold text-cyan-700">
                    결제할 가맹점을 먼저 선택하면 아래 USDT 입력이 활성화됩니다.
                  </p>
                )}
                {needsMemberSignupFirst && (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    회원정보 연동 완료 후 USDT 수량을 입력할 수 있습니다.
                  </p>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {QUICK_USDT_AMOUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={shouldLockAmountInputs}
                      onClick={() => {
                        const nextAmount = clampUsdtInputToBalance(String(value));
                        setAmountInput(nextAmount);
                        setSelectedPreset(nextAmount === String(value) ? value : null);
                      }}
                      className={`h-10 rounded-xl border text-sm font-semibold transition ${
                        selectedPreset === value
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                      } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                    >
                      {value.toLocaleString()} USDT
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-300 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">직접 입력 (USDT)</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setAmountInput('');
                          setSelectedPreset(null);
                        }}
                        disabled={shouldLockAmountInputs || !amountInput}
                        className="text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                      >
                        초기화
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAmountInput(formatUsdtInputFromBalance(balance));
                          setSelectedPreset(null);
                        }}
                        disabled={shouldLockAmountInputs || balance <= 0}
                        className="text-xs font-semibold text-emerald-600 underline decoration-emerald-200 underline-offset-2 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                      >
                        최대
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <input
                      ref={amountInputRef}
                      disabled={shouldLockAmountInputs}
                      value={amountInput}
                      onChange={(event) => {
                        setAmountInput(clampUsdtInputToBalance(event.target.value));
                        setSelectedPreset(null);
                      }}
                      placeholder="0.00"
                      className="w-full bg-transparent text-right text-5xl font-bold text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                      inputMode="decimal"
                    />
                    <span className="pb-1 text-sm font-semibold text-slate-500">USDT</span>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">선택 상점</span>
                    <span className="font-semibold text-slate-800">
                      {selectedMerchant ? selectedMerchant.storeName : '미선택 (가맹점 먼저 선택)'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-slate-500">결제 네트워크</span>
                    <span className="font-semibold text-slate-800">{activeNetwork.label}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-slate-500">입력 수량 (USDT)</span>
                    <span className="font-semibold text-slate-800">
                      {usdtAmount > 0 ? formatUsdt(usdtAmount) : '0 USDT'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-slate-500">적용 환율</span>
                    <span className="font-semibold text-slate-800">
                      {exchangeRate > 0 ? `1 USDT = ${formatRate(exchangeRate)}` : '조회 중'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-slate-500">환산 금액 (KRW)</span>
                    <span className="font-semibold text-slate-800">
                      {krwAmount > 0 ? formatKrw(krwAmount) : '0원'}
                    </span>
                  </div>
                </div>

                {!hasEnoughBalance && usdtAmount > 0 && (
                  <p className="mt-3 text-sm font-medium text-rose-600">
                    잔액이 부족합니다. 입력한 전송 수량은 {formatUsdt(usdtAmount)} 입니다.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={paying || loadingMemberProfile}
                  className={`mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-white transition ${
                    isPaymentReady
                      ? 'bg-cyan-700 shadow-[0_16px_34px_-20px_rgba(14,116,144,0.85)] hover:-translate-y-0.5 hover:bg-cyan-600'
                      : 'bg-slate-900 hover:bg-slate-800'
                  } disabled:cursor-not-allowed disabled:bg-slate-300`}
                >
                  {primaryActionLabel}
                </button>

                <p className="mt-3 text-xs text-slate-500">
                  {isPaymentReady
                    ? '확인 모달에서 결제 세부정보를 확인한 후 최종 전송을 진행합니다.'
                    : '버튼을 누르면 현재 단계에서 필요한 다음 행동으로 바로 안내됩니다.'}
                </p>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">내 최근 결제 내역</h2>
                  <button
                    type="button"
                    onClick={loadHistory}
                    disabled={loadingHistory}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingHistory ? '조회 중...' : '새로고침'}
                  </button>
                </div>

                {loadingHistory && <p className="text-sm text-slate-500">결제 내역을 불러오는 중입니다...</p>}
                {!loadingHistory && history.length === 0 && (
                  <p className="text-sm text-slate-500">아직 완료된 결제 내역이 없습니다.</p>
                )}

                {!loadingHistory && history.length > 0 && (
                  <div className="space-y-3">
                    {history.map((item) => {
                      const isJustPaid =
                        Boolean(justPaidRecordId) &&
                        (justPaidRecordId === item.id || justPaidRecordId === item.transactionHash);
                      const txUrl = `${NETWORK_BY_KEY[item.chain]?.explorerBaseUrl || ''}${item.transactionHash}`;
                      return (
                        <div
                          key={item.id || item.transactionHash}
                          className={`rounded-2xl border px-4 py-3 ${
                            isJustPaid ? 'border-emerald-300 bg-emerald-50/80' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">가맹점 정보</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {item.storeName || '-'} ({item.storecode || '-'})
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-extrabold leading-none tabular-nums text-slate-900">
                                {Number(item.usdtAmount).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT
                              </p>
                              <p className="text-sm font-semibold tabular-nums text-slate-600">
                                {item.krwAmount > 0 ? `${Number(item.krwAmount).toLocaleString()}원 · ` : ''}
                                {formatDateTime(item.confirmedAt || item.createdAt)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2 grid gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs">
                            <div>
                              <p className="font-semibold text-slate-500">가맹점 결제지갑</p>
                              <p className="mt-0.5 font-mono text-slate-700">{shortAddress(item.toWalletAddress)}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-500">결제 회원</p>
                              <p className="mt-0.5 text-slate-800">{formatPaymentMemberName(item.member)}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-500">회원 지갑</p>
                              <p className="mt-0.5 font-mono text-slate-700">{shortAddress(item.fromWalletAddress)}</p>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-slate-500">네트워크: {NETWORK_BY_KEY[item.chain]?.label || item.chain}</span>
                            <div className="flex items-center gap-2">
                              {isJustPaid && (
                                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                                  방금 결제됨
                                </span>
                              )}
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {paymentTab === 'pay' && (
          <section className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">STEP 2</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">상점 채팅</h2>
                <p className="mt-1 text-xs text-slate-500">
                  회원 지갑과 상점 관리자 간 채팅으로 결제 확인을 빠르게 진행하세요.
                </p>
              </div>
              {!shouldShowSelfMerchantChatAlert && (
                <button
                  type="button"
                  onClick={() => setChatRefreshToken((prev) => prev + 1)}
                  disabled={chatLoading}
                  className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chatLoading ? '연결 중...' : '재연결'}
                </button>
              )}
            </div>

            {!activeAccount?.address && (
              <p className="mt-3 text-sm text-slate-500">지갑 연결 후 상점 채팅을 사용할 수 있습니다.</p>
            )}
            {activeAccount?.address && !selectedMerchant && (
              <p className="mt-3 text-sm text-slate-500">결제 상점을 선택하면 채팅이 자동으로 연결됩니다.</p>
            )}
            {shouldShowSelfMerchantChatAlert && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm">
                <p className="font-semibold text-rose-700">현재 상점 관리자가 회원 지갑과 동일한 계정입니다.</p>
                <p className="mt-1 text-xs text-rose-600">채팅 연결 대상이 없어 상점을 다시 선택해 주세요.</p>
              </div>
            )}
            {activeAccount?.address && selectedMerchant && !isStoreAdminSameAsMember && !SENDBIRD_APP_ID && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                채팅 설정이 비어 있어 연결할 수 없습니다. NEXT_PUBLIC_SENDBIRD_APP_ID 설정을 확인해 주세요.
              </p>
            )}
            {activeAccount?.address && selectedMerchant && !isStoreAdminSameAsMember && SENDBIRD_APP_ID && !hasValidStoreAdminWallet && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                상점 관리자 지갑이 설정되지 않아 채팅을 연결할 수 없습니다.
              </p>
            )}
            {activeAccount?.address && selectedMerchant && !isStoreAdminSameAsMember && SENDBIRD_APP_ID && hasValidStoreAdminWallet && (
              <>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  관리자 지갑: {shortAddress(selectedMerchantAdminWalletAddress)}
                </p>
                <div className="mt-2 h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {chatError ? (
                  <div className="px-4 py-4 text-xs font-semibold text-rose-600">{chatError}</div>
                ) : !memberDisplayName || loadingMemberProfile ? (
                  <div className="px-4 py-4 text-xs text-slate-500">내 회원 정보를 불러오는 중입니다...</div>
                ) : !chatSessionToken || !chatChannelUrl ? (
                  <div className="px-4 py-4 text-xs text-slate-500">
                    {chatLoading ? '채팅을 준비 중입니다...' : '채팅 채널을 연결하는 중입니다...'}
                  </div>
                ) : (
                  <SendbirdProvider
                    appId={SENDBIRD_APP_ID}
                    userId={activeAccount.address}
                    accessToken={chatSessionToken}
                    theme="light"
                  >
                    <GroupChannel channelUrl={chatChannelUrl} />
                  </SendbirdProvider>
                )}
                </div>
              </>
            )}
          </section>
          )}
        </div>
      </div>

      <WalletManagementBottomNav lang={lang} active="payment" />

      {isStorePickerOpen && !hasStorecodeParam && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_40px_100px_-45px_rgba(2,132,199,0.8)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                  결제 상점 선택
                </p>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">
                  결제할 상점을 선택해 주세요
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStorePickerOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                닫기
              </button>
            </div>

            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="상점명 또는 코드 검색"
              className="mt-4 h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-cyan-500"
            />

            <div className="mt-3 max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/85">
              {loadingMerchants && (
                <div className="px-4 py-5 text-sm text-slate-500">
                  상점 목록을 불러오는 중입니다...
                </div>
              )}

              {!loadingMerchants && filteredMerchants.length === 0 && (
                <div className="px-4 py-5 text-sm text-slate-500">
                  결제 가능한 상점이 없습니다.
                </div>
              )}

              {!loadingMerchants && filteredMerchants.map((merchant) => {
                const selected = merchant.storecode === selectedStorecode;
                return (
                  <button
                    key={merchant.storecode}
                    type="button"
                    onClick={() => {
                      setSelectedStorecode(merchant.storecode);
                      setIsStorePickerOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 ${
                      selected ? 'bg-cyan-50/80' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                        {merchant.storeLogo ? (
                          <div
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${encodeURI(merchant.storeLogo)})` }}
                            aria-label={merchant.storeName}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-500">
                            SHOP
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{merchant.storeName}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {merchant.storecode} · {shortAddress(merchant.paymentWalletAddress)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ${
                        selected
                          ? 'bg-cyan-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {selected ? '선택됨' : '선택'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isConfirmOpen && selectedMerchant && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_40px_100px_-45px_rgba(2,132,199,0.9)]">
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
              결제 확인
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">USDT 결제를 진행할까요?</h3>

            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">상점</span>
                <span className="font-semibold text-slate-800">{selectedMerchant.storeName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">입력 수량 (USDT)</span>
                <span className="font-semibold text-slate-800">{formatUsdt(usdtAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">환산 금액 (KRW)</span>
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

            {paying && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                결제 진행 중입니다. 완료될 때까지 이 창을 닫지 마세요.
              </p>
            )}

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
                disabled={paying || !hasMemberProfile}
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
