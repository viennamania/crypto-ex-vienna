'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const getSuggestedNickname = (walletAddress?: string) => {
  const seed = String(walletAddress || '').replace(/^0x/i, '').slice(0, 6);
  return seed ? `user_${seed}` : `user_${Math.random().toString(36).slice(2, 8)}`;
};

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
  const [loadingBalance, setLoadingBalance] = useState(false);

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
  const [myMemberProfile, setMyMemberProfile] = useState<MemberProfile | null>(null);
  const [loadingMemberProfile, setLoadingMemberProfile] = useState(false);
  const [memberProfileError, setMemberProfileError] = useState<string | null>(null);
  const [signupNickname, setSignupNickname] = useState('');
  const [signingUpMember, setSigningUpMember] = useState(false);
  const memberProfileRequestIdRef = useRef(0);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const memberStatusCardRef = useRef<HTMLDivElement | null>(null);

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
  const paymentTabLabel = useMemo(
    () => (paymentTab === 'pay' ? '결제하기' : '결제내역'),
    [paymentTab],
  );
  const memberBankInfoSnapshot = useMemo(
    () => resolveBuyerBankInfo(myMemberProfile?.buyer),
    [myMemberProfile?.buyer]
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
      krwAmount > 0 &&
      exchangeRate > 0 &&
      usdtAmount > 0 &&
      hasEnoughBalance
  );
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
      return '회원가입 완료하기';
    }
    if (krwAmount <= 0) {
      return '결제 금액 입력하기';
    }
    if (exchangeRate <= 0) {
      return '환율 로딩 중...';
    }
    if (usdtAmount <= 0) {
      return '결제 금액 입력하기';
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
    krwAmount,
    usdtAmount,
    exchangeRate,
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
      return '회원가입을 완료해야 결제 금액 입력과 결제가 활성화됩니다.';
    }
    if (krwAmount <= 0) {
      return '결제할 KRW 금액을 입력해 주세요.';
    }
    if (exchangeRate <= 0) {
      return '실시간 환율을 불러오는 중입니다. 잠시만 기다려 주세요.';
    }
    if (usdtAmount <= 0) {
      return '전송 가능한 USDT 수량이 계산되도록 결제 금액을 조정해 주세요.';
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
    krwAmount,
    usdtAmount,
    exchangeRate,
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
        setSignupNickname((prev) => prev || String(user?.nickname || '').trim());
      } else {
        setMyMemberProfile(null);
        setMemberProfileError(null);
        setSignupNickname((prev) => prev || getSuggestedNickname(activeAccount.address));
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
      toast.error('닉네임을 2자 이상 입력해 주세요.');
      return;
    }

    setSigningUpMember(true);
    try {
      const response = await fetch('/api/user/setUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: selectedStorecode,
          walletAddress: activeAccount.address,
          nickname,
          mobile: '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        throw new Error(data?.error || '회원가입에 실패했습니다.');
      }

      toast.success('회원가입이 완료되었습니다.');
      await loadMemberProfile();
    } catch (error) {
      console.error('Failed to register member', error);
      toast.error(error instanceof Error ? error.message : '회원가입 중 오류가 발생했습니다.');
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
      toast.error('선택한 상점의 회원가입 후 결제할 수 있습니다.');
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
    if (usdtAmount <= 0) {
      toast.error('전송 가능한 USDT 수량이 계산되도록 결제 금액을 조정해 주세요.');
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
      toast.error('회원가입을 먼저 완료해 주세요.');
      return;
    }
    if (krwAmount <= 0) {
      amountInputRef.current?.focus();
      toast.error('결제 금액(원)을 입력해 주세요.');
      return;
    }
    if (exchangeRate <= 0) {
      toast.error('환율 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (usdtAmount <= 0) {
      amountInputRef.current?.focus();
      toast.error('전송 가능한 USDT 수량이 계산되도록 결제 금액을 조정해 주세요.');
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

      <div className="relative mx-auto w-full max-w-[430px] px-4 pb-28 pt-8">
        <div className="mb-8">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
              Wallet Management
            </p>
            <h1
              className="text-3xl font-semibold tracking-tight text-slate-900"
              style={{ fontFamily: 'var(--font-display), "Times New Roman", serif' }}
            >
              USDT 결제
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {hasStorecodeParam
                ? '지정된 가맹점에 결제 금액(KRW)을 입력하면, 실시간 환율 기준 USDT로 안전하게 결제할 수 있습니다.'
                : '가맹점을 선택하고 결제 금액(KRW)을 입력하면, 실시간 환율 기준 USDT로 안전하게 결제할 수 있습니다.'}
            </p>
          </div>
        </div>

        {activeAccount?.address ? (
          <WalletSummaryCard
            walletAddress={activeAccount.address}
            walletAddressDisplay={shortAddress(activeAccount.address)}
            networkLabel={activeNetwork.label}
            usdtBalanceDisplay={
              loadingBalance
                ? '조회 중...'
                : `${balance.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`
            }
            modeLabel={paymentTabLabel}
            smartAccountEnabled={smartAccountEnabled}
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
              description="연결 후 상점 선택, 원화 금액 입력, 환율 적용 USDT 전송이 활성화됩니다."
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
                        ? '상점 선택이 완료되었습니다. 이제 결제 금액을 입력해 진행할 수 있습니다.'
                        : '가맹점을 먼저 선택해야 회원 확인과 결제 금액 입력이 활성화됩니다.'}
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

                {hasStorecodeParam && selectedMerchant && (
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
                    }`}
                  >
                    {loadingMemberProfile ? (
                      <p className="text-slate-600">선택 상점 회원 정보를 확인 중입니다...</p>
                    ) : hasMemberProfile ? (
                      <>
                        <p className="font-semibold text-emerald-800">결제 가능한 회원입니다.</p>
                        <p className="mt-1 text-xs text-emerald-700">
                          {myMemberProfile?.nickname || '-'} · {myMemberProfile?.storecode || selectedStorecode}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-amber-800">
                          이 상점에서 결제하려면 먼저 회원가입이 필요합니다.
                        </p>
                        {memberProfileError && (
                          <p className="mt-1 text-xs text-rose-600">{memberProfileError}</p>
                        )}
                        <div className="mt-3 flex flex-col gap-2">
                          <input
                            value={signupNickname}
                            onChange={(event) => setSignupNickname(event.target.value)}
                            placeholder="회원가입 닉네임 입력"
                            className="h-10 flex-1 rounded-xl border border-amber-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-amber-500"
                            maxLength={24}
                          />
                          <button
                            type="button"
                            onClick={registerMemberForSelectedStore}
                            disabled={signingUpMember}
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {signingUpMember ? '가입 처리 중...' : '회원가입 후 결제하기'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

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

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">결제 금액 입력 (KRW)</h2>
                  {selectedMerchant && (
                    <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
                      {selectedMerchant.storeName}
                    </span>
                  )}
                </div>

                {needsMerchantSelectionFirst && (
                  <p className="mt-2 text-xs font-semibold text-cyan-700">
                    결제할 가맹점을 먼저 선택하면 아래 금액 입력이 활성화됩니다.
                  </p>
                )}
                {needsMemberSignupFirst && (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    회원가입 완료 후 결제 금액을 입력할 수 있습니다.
                  </p>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {QUICK_KRW_AMOUNTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={shouldLockAmountInputs}
                      onClick={() => {
                        setSelectedPreset(value);
                        setAmountInput(String(value));
                      }}
                      className={`h-10 rounded-xl border text-sm font-semibold transition ${
                        selectedPreset === value
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                      } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}
                    >
                      {formatKrw(value)}
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-300 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">직접 입력 (원)</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <input
                      ref={amountInputRef}
                      disabled={shouldLockAmountInputs}
                      value={amountInput ? Number(amountInput).toLocaleString() : ''}
                      onChange={(event) => {
                        const raw = event.target.value.replace(/[^0-9]/g, '');
                        setAmountInput(raw);
                        setSelectedPreset(null);
                      }}
                      placeholder="0"
                      className="w-full bg-transparent text-2xl font-semibold text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                      inputMode="numeric"
                    />
                    <span className="pb-1 text-sm font-semibold text-slate-500">KRW</span>
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
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">가맹점 정보</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {item.storeName || '-'} ({item.storecode || '-'})
                              </p>
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
              </>
            )}
          </section>
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
