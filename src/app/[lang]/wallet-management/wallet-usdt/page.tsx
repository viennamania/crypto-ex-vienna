// send USDT
'use client';


import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { toast } from 'react-hot-toast';
import { client, clientId } from '../../../client';


import {
    //ThirdwebProvider,
    useReadContract,
  
    useActiveWallet,

    useActiveAccount,
    useSendBatchTransaction,

    useConnectedWallets,

    useSetActiveWallet,

    AutoConnect,
    
} from "thirdweb/react";



import {
  getContract,
  //readContract,
  sendTransaction,
  sendAndConfirmTransaction,
} from "thirdweb";

import {
  balanceOf,
  transfer,
} from "thirdweb/extensions/erc20";
 


import {
  createWallet,
  inAppWallet,
} from "thirdweb/wallets";

import Image from 'next/image';

import AppBarComponent from "@/components/Appbar/AppBar";
import { getDictionary } from "../../../dictionaries";
import { useClientWallets } from "@/lib/useClientWallets";
import { useClientSettings } from "@/components/ClientSettingsProvider";
import WalletManagementBottomNav from "@/components/wallet-management/WalletManagementBottomNav";
import WalletConnectPrompt from "@/components/wallet-management/WalletConnectPrompt";
import WalletSummaryCard from "@/components/wallet-management/WalletSummaryCard";



import {
  ethereum,
  polygon,
  arbitrum,
  bsc,
  type Chain,
} from "thirdweb/chains";

import {
  chain,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,
} from "@/app/config/contractAddresses";




const walletAuthOptions = ['phone'];


const contractAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // USDT on Polygon


const contractAddressArbitrum = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // USDT on Arbitrum

type NetworkKey = 'ethereum' | 'polygon' | 'arbitrum' | 'bsc';
const NETWORK_OPTIONS: Array<{
  id: NetworkKey;
  label: string;
  chain: Chain;
  contractAddress: string;
  logo: string;
  nativeSymbol: string;
  decimals: number;
}> = [
  {
    id: 'ethereum',
    label: 'Ethereum',
    chain: ethereum,
    contractAddress: ethereumContractAddressUSDT,
    logo: '/logo-chain-ethereum.png',
    nativeSymbol: 'ETH',
    decimals: 6,
  },
  {
    id: 'polygon',
    label: 'Polygon',
    chain: polygon,
    contractAddress: polygonContractAddressUSDT,
    logo: '/logo-chain-polygon.png',
    nativeSymbol: 'POL',
    decimals: 6,
  },
  {
    id: 'arbitrum',
    label: 'Arbitrum',
    chain: arbitrum,
    contractAddress: arbitrumContractAddressUSDT,
    logo: '/logo-chain-arbitrum.png',
    nativeSymbol: 'ETH',
    decimals: 6,
  },
  {
    id: 'bsc',
    label: 'BSC',
    chain: bsc,
    contractAddress: bscContractAddressUSDT,
    logo: '/logo-chain-bsc.png',
    nativeSymbol: 'BNB',
    decimals: 18,
  },
];

const TRANSFERS_PAGE_SIZE = 10;

type UsdtTransfer = {
  transaction_hash?: string;
  block_timestamp?: number | string;
  from_address?: string;
  to_address?: string;
  amount?: string | number;
  value?: string | number;
  token_address?: string;
  contract_address?: string;
  token_decimals?: number;
  decimals?: number;
  token_symbol?: string;
  symbol?: string;
  token_metadata?: {
    symbol?: string;
    decimals?: number;
  };
};

type FavoriteWallet = {
  _id?: string;
  ownerWalletAddress?: string;
  walletAddress: string;
  label?: string | null;
  chainId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type MemberSearchResult = {
  id?: number | string;
  email?: string;
  nickname?: string;
  avatar?: string;
  walletAddress?: string;
  storecode?: string;
};






/*
const smartWallet = new smartWallet(config);
const smartAccount = await smartWallet.connect({
  client,
  personalAccount,
});
*/

import {
  useRouter,
  useSearchParams
} from "next//navigation";

import { Select } from '@mui/material';
import { Manrope, Playfair_Display } from 'next/font/google';
import { Router } from 'next/router';
import path from 'path';










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

export default function SendUsdt({ params }: any) {

  const lang = params?.lang ?? 'ko';
  const { loading: clientSettingsLoading } = useClientSettings();
  const { wallet, wallets, smartAccountEnabled } = useClientWallets({
    authOptions: walletAuthOptions,
    sponsorGas: true,
    defaultSmsCountryCode: 'KR',
  });

  //console.log("wallet", wallet);
  //console.log("wallets", wallets);
  //console.log("smartAccountEnabled", smartAccountEnabled);





  //console.log("params", params);

  const searchParams = useSearchParams();
  const storecodeFromQuery = String(searchParams?.get('storecode') || '').trim();
  const disconnectRedirectPath = useMemo(() => {
    const query = new URLSearchParams();
    if (storecodeFromQuery) {
      query.set('storecode', storecodeFromQuery);
    }
    const queryString = query.toString();
    return `/${lang}/wallet-management${queryString ? `?${queryString}` : ''}`;
  }, [lang, storecodeFromQuery]);
 
  ///const wallet = searchParams.get('wallet');
  
  const defaultNetwork: NetworkKey = (chain === 'ethereum'
    || chain === 'polygon'
    || chain === 'arbitrum'
    || chain === 'bsc')
    ? (chain as NetworkKey)
    : 'polygon';
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkKey>(defaultNetwork);
  const selectedNetworkConfig = useMemo(() => (
    NETWORK_OPTIONS.find((option) => option.id === selectedNetwork) ?? NETWORK_OPTIONS[1]
  ), [selectedNetwork]);
  const contract = useMemo(() => (
    getContract({
      // the client you have created via `createThirdwebClient()`
      client,
      // the chain the contract is deployed on
      chain: selectedNetworkConfig.chain,
      address: selectedNetworkConfig.contractAddress,
      // OPTIONAL: the contract's abi
      //abi: [...],
    })
  ), [selectedNetworkConfig]);




  const [data, setData] = useState({
    title: "",
    description: "",

    menu : {
      buy: "",
      sell: "",
      trade: "",
      chat: "",
      history: "",
      settings: "",
    },

    Go_Home: "",
    My_Balance: "",
    My_Nickname: "",
    My_Buy_Trades: "",
    My_Sell_Trades: "",
    Buy: "",
    Sell: "",
    Buy_USDT: "",
    Sell_USDT: "",
    Contact_Us: "",
    Buy_Description: "",
    Sell_Description: "",
    Send_USDT: "",
    Pay_USDT: "",
    Coming_Soon: "",
    Please_connect_your_wallet_first: "",

    USDT_sent_successfully: "",
    Failed_to_send_USDT: "",

    Go_Buy_USDT: "",
    Enter_Wallet_Address: "",
    Enter_the_amount_and_recipient_address: "",
    Select_a_user: "",
    User_wallet_address: "",
    This_address_is_not_white_listed: "",
    If_you_are_sure_please_click_the_send_button: "",

    Sending: "",

    Anonymous: "",

    Copied_Wallet_Address: "",
    Withdraw_USDT: "",

  } );

  useEffect(() => {
      async function fetchData() {
          const dictionary = await getDictionary(params.lang);
          setData(dictionary);
      }
      fetchData();
  }, [params.lang]);

  const {
    title,
    description,
    menu,
    Go_Home,
    My_Balance,
    My_Nickname,
    My_Buy_Trades,
    My_Sell_Trades,
    Buy,
    Sell,
    Buy_USDT,
    Sell_USDT,
    Contact_Us,
    Buy_Description,
    Sell_Description,
    Pay_USDT,
    Coming_Soon,
    Please_connect_your_wallet_first,

    USDT_sent_successfully,
    Failed_to_send_USDT,

    Go_Buy_USDT,
    Enter_Wallet_Address,
    Enter_the_amount_and_recipient_address,
    Select_a_user,
    User_wallet_address,
    This_address_is_not_white_listed,
    If_you_are_sure_please_click_the_send_button,

    Sending,

    Anonymous,

    Copied_Wallet_Address,
    Withdraw_USDT,

  } = data;



  const router = useRouter();

  const walletPageClassName = `${displayFont.variable} ${bodyFont.variable} relative min-h-[100vh] overflow-hidden bg-[radial-gradient(130%_130%_at_100%_0%,#cffafe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-900`;
  const walletPageStyle = {
    fontFamily: 'var(--font-body), "Avenir Next", "Segoe UI", sans-serif',
  } as const;



  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const account = activeWallet?.getAccount?.() ?? activeAccount;
  const address = account?.address;


  const [balance, setBalance] = useState(0);
  const [animatedBalance, setAnimatedBalance] = useState(0);
  const balanceRef = useRef(0);
  const transfersScopeRef = useRef<string | null>(null);
  const [transfers, setTransfers] = useState<UsdtTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transfersError, setTransfersError] = useState<string | null>(null);
  const [transfersPage, setTransfersPage] = useState(0);
  const [transfersHasMore, setTransfersHasMore] = useState(false);
  const [transfersRefreshToken, setTransfersRefreshToken] = useState(0);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferModalPhase, setTransferModalPhase] = useState<'confirm' | 'processing' | 'result'>('confirm');
  const [transferResult, setTransferResult] = useState<{ ok: boolean; message: string }>({ ok: false, message: '' });
  const [showJackpot, setShowJackpot] = useState(false);
  const [lastSentAmount, setLastSentAmount] = useState<number | null>(null);
  const [favoriteWallets, setFavoriteWallets] = useState<FavoriteWallet[]>([]);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [favoriteLabel, setFavoriteLabel] = useState('');
  const [favoriteHit, setFavoriteHit] = useState<FavoriteWallet | null>(null);
  const [memberKeyword, setMemberKeyword] = useState('');
  const [memberResults, setMemberResults] = useState<MemberSearchResult[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [footerTab, setFooterTab] = useState<'withdraw' | 'deposit' | 'history'>('withdraw');
  const footerTabLabel = useMemo(() => {
    if (footerTab === 'withdraw') return '출금하기';
    if (footerTab === 'deposit') return '입금하기';
    return '전송내역';
  }, [footerTab]);
  const [recipient, setRecipient] = useState({
    _id: '',
    id: 0,
    email: '',
    nickname: '',
    avatar: '',
    mobile: '',
    walletAddress: '',
    createdAt: '',
    settlementAmountOfFee: '',
  });
  const userLookupNonce = useRef(0);

  const [amount, setAmount] = useState(0);
  const [amountInput, setAmountInput] = useState('');
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const recipientInputRef = useRef<HTMLInputElement | null>(null);
  const riskConsentRef = useRef<HTMLDivElement | null>(null);
  const maxAmount = useMemo(() => (
    Number.isFinite(balance) ? Math.max(0, balance) : 0
  ), [balance]);

  const normalizeAmountInput = (value: string, decimals: number) => {
    const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '');
    if (cleaned === '') {
      return '';
    }
    const hasTrailingDot = cleaned.endsWith('.');
    const [wholeRaw, fractionRaw = ''] = cleaned.split('.');
    const whole = wholeRaw.replace(/^0+(?=\d)/, '');
    const limitedFraction = fractionRaw.slice(0, decimals);
    if (hasTrailingDot) {
      return `${whole || '0'}.`;
    }
    if (limitedFraction.length > 0) {
      return `${whole || '0'}.${limitedFraction}`;
    }
    return whole;
  };

  const formatAmountInput = (value: number, decimals: number) => {
    if (!Number.isFinite(value)) {
      return '';
    }
    const fixed = value.toFixed(decimals);
    return fixed.replace(/\.?0+$/, '');
  };

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
      return numericValue.toFixed(decimals).replace(/\.?0+$/, '');
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
      return numericValue.toFixed(decimals).replace(/\.?0+$/, '');
    }
  };

  const formatTimestamp = (value?: string | number) => {
    if (!value) {
      return '-';
    }
    const numericValue = typeof value === 'string' ? Number(value) : value;
    let msValue: number | null = null;
    if (Number.isFinite(numericValue)) {
      msValue = numericValue > 1e12 ? numericValue : numericValue * 1000;
    } else if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        msValue = parsed;
      }
    }
    if (msValue === null) {
      return '-';
    }
    return new Date(msValue).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  const resolveTransferAmount = (transfer: UsdtTransfer) =>
    transfer.amount ?? transfer.value ?? '0';

  const resolveTransferDecimals = (transfer: UsdtTransfer) =>
    transfer.token_metadata?.decimals ??
    transfer.token_decimals ??
    transfer.decimals ??
    selectedNetworkConfig.decimals;

  const resolveTransferSymbol = (transfer: UsdtTransfer) =>
    transfer.token_metadata?.symbol ??
    transfer.token_symbol ??
    transfer.symbol ??
    'USDT';

  const resolveTransferDirection = (transfer: UsdtTransfer) => {
    if (!address) {
      return 'unknown';
    }
    const from = transfer.from_address?.toLowerCase();
    const to = transfer.to_address?.toLowerCase();
    const walletLower = address.toLowerCase();
    if (to && to === walletLower) {
      return 'in';
    }
    if (from && from === walletLower) {
      return 'out';
    }
    return 'unknown';
  };

  const getExplorerTxUrl = (hash?: string) => {
    if (!hash) {
      return null;
    }
    switch (selectedNetwork) {
      case 'ethereum':
        return `https://etherscan.io/tx/${hash}`;
      case 'polygon':
        return `https://polygonscan.com/tx/${hash}`;
      case 'arbitrum':
        return `https://arbiscan.io/tx/${hash}`;
      case 'bsc':
        return `https://bscscan.com/tx/${hash}`;
      default:
        return `https://polygonscan.com/tx/${hash}`;
    }
  };

  const handleAmountChange = (value: string) => {
    const normalized = normalizeAmountInput(value, selectedNetworkConfig.decimals);
    const numericValue = normalized && normalized !== '.' ? Number(normalized) : 0;
    if (numericValue > maxAmount) {
      const cappedValue = maxAmount;
      setAmount(cappedValue);
      setAmountInput(formatAmountInput(cappedValue, selectedNetworkConfig.decimals));
      return;
    }
    setAmount(numericValue);
    setAmountInput(normalized);
  };

  const handleMaxAmount = () => {
    const formatted = formatAmountInput(maxAmount, selectedNetworkConfig.decimals);
    setAmount(maxAmount);
    setAmountInput(formatted);
  };

  useEffect(() => {
    if (!amountInput) {
      if (amount !== 0) {
        setAmount(0);
      }
      return;
    }
    const normalized = normalizeAmountInput(amountInput, selectedNetworkConfig.decimals);
    const numericValue = normalized && normalized !== '.' ? Number(normalized) : 0;
    if (numericValue > maxAmount) {
      const cappedValue = maxAmount;
      setAmount(cappedValue);
      setAmountInput(formatAmountInput(cappedValue, selectedNetworkConfig.decimals));
      return;
    }
    if (normalized !== amountInput) {
      setAmountInput(normalized);
    }
    if (numericValue !== amount) {
      setAmount(numericValue);
    }
  }, [maxAmount, selectedNetworkConfig.decimals]);

  useEffect(() => {
    const getBalance = async () => {
      const result = await balanceOf({
        contract,
        address: address || '',
      });
      setBalance(Number(result) / 10 ** selectedNetworkConfig.decimals);
    };

    if (address) {
      balanceRef.current = 0;
      setAnimatedBalance(0);
      setBalance(0);
      getBalance();
    }

    const interval = setInterval(() => {
      if (address) getBalance();
    }, 5000);

    return () => clearInterval(interval);
  }, [address, contract, selectedNetworkConfig.decimals]);

  useEffect(() => {
    const from = balanceRef.current;
    const to = balance;
    if (from === to) {
      return;
    }

    const durationMs = 650;
    const startTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = from + (to - from) * eased;
      setAnimatedBalance(nextValue);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        balanceRef.current = to;
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [balance]);

  useEffect(() => {
    if (!address || !clientId) {
      setTransfers([]);
      setTransfersPage(0);
      setTransfersHasMore(false);
      setTransfersError(null);
      transfersScopeRef.current = null;
      return;
    }

    const scopeKey = `${address}-${selectedNetworkConfig.chain.id}-${selectedNetworkConfig.contractAddress}`;
    let shouldFetch = true;
    if (transfersScopeRef.current !== scopeKey) {
      transfersScopeRef.current = scopeKey;
      setTransfers([]);
      setTransfersHasMore(false);
      setTransfersError(null);
      if (transfersPage !== 0) {
        setTransfersPage(0);
        shouldFetch = false;
      }
    }

    if (!shouldFetch) {
      return;
    }

    const controller = new AbortController();
    const clientIdValue = clientId;

    const fetchTransfers = async () => {
      setTransfersLoading(true);
      setTransfersError(null);
      try {
        const url = new URL('https://insight.thirdweb.com/v1/tokens/transfers');
        url.searchParams.append('chain_id', String(selectedNetworkConfig.chain.id));
        url.searchParams.set('owner_address', address);
        url.searchParams.append('contract_address', selectedNetworkConfig.contractAddress);
        url.searchParams.append('token_types', 'erc20');
        url.searchParams.set('metadata', 'true');
        url.searchParams.set('sort_order', 'desc');
        url.searchParams.set('limit', String(TRANSFERS_PAGE_SIZE));
        url.searchParams.set('page', String(transfersPage));

        const response = await fetch(url.toString(), {
          headers: clientIdValue ? { 'x-client-id': clientIdValue } : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to fetch transfers');
        }

        const payload = await response.json();
        const items =
          (Array.isArray(payload?.data) && payload.data) ||
          (Array.isArray(payload?.data?.transfers) && payload.data.transfers) ||
          (Array.isArray(payload?.result) && payload.result) ||
          [];
        const meta = payload?.meta ?? payload?.data?.meta ?? null;
        const currentPage = typeof meta?.page === 'number' ? meta.page : transfersPage;
        setTransfers(items as UsdtTransfer[]);
        const totalPages =
          typeof meta?.total_pages === 'number' ? meta.total_pages : null;
        if (totalPages !== null) {
          const nextPageIndex = typeof currentPage === 'number' ? currentPage + 1 : transfersPage + 1;
          setTransfersHasMore(nextPageIndex < totalPages);
        } else {
          setTransfersHasMore(items.length >= TRANSFERS_PAGE_SIZE);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch transfers', error);
        setTransfersError('USDT 입출금 내역을 불러오지 못했습니다.');
      } finally {
        setTransfersLoading(false);
      }
    };

    fetchTransfers();

    return () => {
      controller.abort();
    };
  }, [
    address,
    clientId,
    selectedNetworkConfig.chain.id,
    selectedNetworkConfig.contractAddress,
    transfersPage,
    transfersRefreshToken,
  ]);

  useEffect(() => {
    if (!address) {
      setFavoriteWallets([]);
      return;
    }
    fetchFavoriteWallets();
  }, [address]);

  useEffect(() => {
    if (!recipient.walletAddress) {
      setFavoriteHit(null);
      return;
    }
    const normalized = recipient.walletAddress.toLowerCase();
    const cached = favoriteWallets.find(
      (fav) => fav.walletAddress?.toLowerCase() === normalized,
    );
    setFavoriteHit(cached ?? null);
  }, [recipient.walletAddress, favoriteWallets]);


  const [user, setUser] = useState(
    {
      _id: '',
      id: 0,
      email: '',
      nickname: '',
      avatar: '',
      mobile: '',
      walletAddress: '',
      createdAt: '',
      settlementAmountOfFee: '',
      storecode: '',
    }
  );

  useEffect(() => {

    if (!address) return;

    const getUser = async () => {

      const response = await fetch('/api/user/getUserByWalletAddress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
        }),
      });

      if (!response.ok) {
        console.error('getUser failed', response.status, response.statusText);
        return;
      }

      const raw = await response.text();
      if (!raw) {
        console.error('getUser returned empty body');
        return;
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        console.error('getUser invalid JSON', err);
        return;
      }


      setUser(data.result);

    };

    getUser();

  }, [address]);



  ///console.log("recipient", recipient);

  //console.log("recipient.walletAddress", recipient.walletAddress);
  //console.log("amount", amount);



  const [otp, setOtp] = useState('');

  //////const [verifiedOtp, setVerifiedOtp] = useState(false);

  const [verifiedOtp, setVerifiedOtp] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);


  const [isSendedOtp, setIsSendedOtp] = useState(false);



  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const [isVerifingOtp, setIsVerifingOtp] = useState(false);

  


  const [sending, setSending] = useState(false);
  const sendUsdt = async (): Promise<boolean> => {
    if (sending) {
      return false;
    }


    if (!recipient.walletAddress) {
      toast.error('Please enter a valid address');
      return false;
    }

    const isEthAddress = /^0x[a-fA-F0-9]{40}$/.test(recipient.walletAddress);
    if (!isEthAddress) {
      toast.error('받는사람 지갑주소가 올바른 이더리움 형식이 아닙니다.');
      return false;
    }

    if (!amount) {
      toast.error('Please enter a valid amount');
      return false;
    }

    //console.log('amount', amount, "balance", balance);

    if (Number(amount) > balance) {
      toast.error('Insufficient balance');
      return false;
    }

    setSending(true);
    let ok = false;

    try {



        // send USDT
        // Call the extension function to prepare the transaction
        const transaction = transfer({
            //contract,

            contract: contract,

            to: recipient.walletAddress,
            amount: amount,
        });

        console.log("contract", contract);
        console.log("recipient.walletAddress", recipient.walletAddress);
        console.log("amount", amount);
        

        /*
        const transactionResult = await sendAndConfirmTransaction({

            transaction: transaction,
            
            account: smartAccount as any,
        });

        console.log("transactionResult", transactionResult);
        
        if (transactionResult.status !== "success") {
          toast.error(Failed_to_send_USDT);
          return;
        }
        */

        /*
        const { transactionHash } = await sendTransaction({
          
          account: account as any,

          transaction,
        });
        */
        // sendAndConfirmTransaction
        const { transactionHash } = await sendAndConfirmTransaction({
          transaction: transaction,
          account: account as any,
        });

        
        if (transactionHash) {


          await fetch('/api/transaction/setTransfer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              lang: params.lang,
              chain: selectedNetwork,
              walletAddress: address,
              amount: amount,
              toWalletAddress: recipient.walletAddress,
            }),
          });



          toast.success(USDT_sent_successfully);

          setLastSentAmount(amount);
          setAmount(0); // reset amount
          setAmountInput('');
          setRecipient((prev) => ({
            ...prev,
            walletAddress: '',
            nickname: '',
            email: '',
            avatar: '',
            mobile: '',
          }));
          setFavoriteHit(null);
          setConsentChecked(false);

          // refresh balance

          // get the balance

          const result = await balanceOf({
            contract,
            address: address || "",
          });

          setBalance(Number(result) / 10 ** selectedNetworkConfig.decimals);


          ok = true;
        } else {

          toast.error(Failed_to_send_USDT);

        }
      

    } catch (error) {
      console.error('Failed to send USDT', error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('insufficient funds') || message.toLowerCase().includes('gas')) {
        toast.error('가스비용이 부족합니다. 네트워크 잔고를 확인해주세요.');
      } else {
        toast.error(Failed_to_send_USDT);
      }
    }

    setSending(false);
    return ok;
  };



  // get user by wallet address
  const getUserByWalletAddress = async (walletAddress: string) => {

    const response = await fetch('/api/user/getUserByWalletAddress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress: walletAddress,
      }),
    });

    if (!response.ok) {
      console.error('getUserByWalletAddress failed', response.status, response.statusText);
      return null;
    }

    const raw = await response.text();
    if (!raw) {
      console.error('getUserByWalletAddress returned empty body');
      return null;
    }

    try {
      const data = JSON.parse(raw);
      return data?.result ?? null;
    } catch (err) {
      console.error('getUserByWalletAddress invalid JSON', err);
      return null;
    }

  };

  const fetchFavoriteWallets = async () => {
    if (!address) {
      setFavoriteWallets([]);
      setFavoriteHit(null);
      return;
    }

    setFavoriteLoading(true);
    setFavoriteError(null);
    try {
      const response = await fetch('/api/favorite-wallets/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerWalletAddress: address,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      const list = Array.isArray(data?.result) ? data.result : [];
      setFavoriteWallets(list);
      if (recipient.walletAddress) {
        const found = list.find(
          (fav: FavoriteWallet) =>
            fav.walletAddress?.toLowerCase() === recipient.walletAddress.toLowerCase(),
        );
        setFavoriteHit(found ?? null);
      }
    } catch (error) {
      console.error('Failed to load favorite wallets', error);
      setFavoriteError('자주 쓰는 지갑을 불러오지 못했습니다.');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const addFavoriteWallet = async () => {
    if (!address || !recipient.walletAddress) {
      toast.error('지갑 주소를 입력해 주세요.');
      return;
    }

    const isEthAddress = /^0x[a-fA-F0-9]{40}$/.test(recipient.walletAddress);
    if (!isEthAddress) {
      toast.error('이더리움 지갑주소 형식이 아닙니다.');
      return;
    }

    setFavoriteSaving(true);
    try {
      const response = await fetch('/api/favorite-wallets/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerWalletAddress: address,
          walletAddress: recipient.walletAddress,
          label: favoriteLabel.trim() || recipient.nickname || '즐겨찾기 지갑',
          chainId: selectedNetworkConfig.chain.id,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      toast.success('자주 쓰는 지갑에 추가했습니다.');
      setFavoriteLabel('');
      await fetchFavoriteWallets();
      setFavoriteHit({
        walletAddress: recipient.walletAddress,
        label: favoriteLabel.trim() || recipient.nickname || '즐겨찾기 지갑',
        chainId: selectedNetworkConfig.chain.id,
      });
    } catch (error) {
      console.error('Failed to save favorite wallet', error);
      toast.error('즐겨찾기 저장에 실패했습니다.');
    } finally {
      setFavoriteSaving(false);
    }
  };

  const removeFavoriteWallet = async (walletAddress: string) => {
    if (!address) return;
    setFavoriteSaving(true);
    try {
      const response = await fetch('/api/favorite-wallets/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ownerWalletAddress: address,
          walletAddress,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setFavoriteWallets((prev) => prev.filter((item) => item.walletAddress !== walletAddress));
    } catch (error) {
      console.error('Failed to remove favorite wallet', error);
      toast.error('즐겨찾기 삭제에 실패했습니다.');
    } finally {
      setFavoriteSaving(false);
    }
  };

  const searchMembers = async () => {
    const keyword = memberKeyword.trim();
    if (!keyword) {
      setMemberResults([]);
      setMemberError('검색어를 입력하세요.');
      return;
    }
    setMemberLoading(true);
    setMemberError(null);
    try {
      const response = await fetch('/api/user/searchByNickname', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storecode: user?.storecode,
          nickname: keyword,
          limit: 20,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      setMemberResults(Array.isArray(data?.result) ? data.result : []);
    } catch (error) {
      console.error('Failed to search members', error);
      setMemberError('회원 검색에 실패했습니다.');
    } finally {
      setMemberLoading(false);
    }
  };
  
  const [recipientMode, setRecipientMode] = useState<'manual' | 'favorites' | 'member'>('manual');



  const [isWhateListedUser, setIsWhateListedUser] = useState(false);
  const isTrustedRecipient = useMemo(
    () => Boolean(favoriteHit) || isWhateListedUser,
    [favoriteHit, isWhateListedUser],
  );
  const transferRecipientNickname = recipient?.nickname?.trim() || '';
  const transferRecipientAvatar = recipient?.avatar || '/profile-default.png';
  const transferRecipientDetails = useMemo(() => {
    const details: Array<{ label: string; value: string }> = [];
    const nickname = transferRecipientNickname;
    const favoriteLabelValue = favoriteHit?.label?.trim();
    const email = recipient?.email?.trim();

    if (favoriteLabelValue && favoriteLabelValue !== nickname) {
      details.push({ label: '즐겨찾기', value: favoriteLabelValue });
    }
    if (email) {
      details.push({ label: '이메일', value: email });
    }

    return details;
  }, [favoriteHit?.label, recipient?.email, transferRecipientNickname]);

  const recipientWalletAddress = recipient?.walletAddress?.trim() || '';
  const hasAmountToSend = amount > 0;
  const hasRecipientWallet = Boolean(recipientWalletAddress);
  const hasValidRecipientWallet = /^0x[a-fA-F0-9]{40}$/.test(recipientWalletAddress);
  const needsRiskConsent = Boolean(hasRecipientWallet && !isTrustedRecipient && !consentChecked);
  const canOpenTransferConfirm = Boolean(
    address &&
      hasAmountToSend &&
      hasValidRecipientWallet &&
      !addressError &&
      verifiedOtp &&
      !needsRiskConsent &&
      !sending
  );
  const withdrawPrimaryLabel = useMemo(() => {
    if (sending) {
      return '전송 처리 중...';
    }
    if (!hasAmountToSend) {
      return '출금 금액 입력하기';
    }
    if (!hasRecipientWallet) {
      return recipientMode === 'manual' ? '받는 지갑주소 입력하기' : '받는 지갑 선택하기';
    }
    if (!hasValidRecipientWallet || addressError) {
      return '지갑주소 형식 확인 필요';
    }
    if (!verifiedOtp) {
      return '본인 인증 필요';
    }
    if (needsRiskConsent) {
      return '위험 고지 동의 필요';
    }
    return `${formatAmountInput(amount, selectedNetworkConfig.decimals)} USDT 확인 후 전송`;
  }, [
    sending,
    hasAmountToSend,
    hasRecipientWallet,
    recipientMode,
    hasValidRecipientWallet,
    addressError,
    verifiedOtp,
    needsRiskConsent,
    amount,
    selectedNetworkConfig.decimals,
  ]);
  const withdrawPrimaryGuide = useMemo(() => {
    if (!hasAmountToSend) {
      return '먼저 출금할 USDT 금액을 입력해 주세요.';
    }
    if (!hasRecipientWallet) {
      return '받는 지갑주소를 입력하거나 즐겨찾기/회원 검색에서 선택해 주세요.';
    }
    if (!hasValidRecipientWallet || addressError) {
      return '이더리움 지갑주소 형식을 다시 확인해 주세요.';
    }
    if (!verifiedOtp) {
      return '보안을 위해 본인 인증이 완료되어야 전송할 수 있습니다.';
    }
    if (needsRiskConsent) {
      return '신규 주소 전송은 위험 고지 동의가 필요합니다.';
    }
    return '확인 모달에서 수신 주소와 전송 금액을 최종 확인한 뒤 진행할 수 있습니다.';
  }, [
    hasAmountToSend,
    hasRecipientWallet,
    hasValidRecipientWallet,
    addressError,
    verifiedOtp,
    needsRiskConsent,
  ]);

  const openTransferConfirmWithCta = () => {
    if (sending) {
      return;
    }
    if (!address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }
    if (!hasAmountToSend) {
      amountInputRef.current?.focus();
      toast.error('출금 금액을 입력해 주세요.');
      return;
    }
    if (!hasRecipientWallet) {
      if (recipientMode !== 'manual') {
        setRecipientMode('manual');
      }
      setTimeout(() => recipientInputRef.current?.focus(), 0);
      toast.error('받는 지갑주소를 입력해 주세요.');
      return;
    }
    if (!hasValidRecipientWallet || addressError) {
      if (recipientMode !== 'manual') {
        setRecipientMode('manual');
      }
      setTimeout(() => recipientInputRef.current?.focus(), 0);
      toast.error('받는사람 지갑주소 형식을 확인해 주세요.');
      return;
    }
    if (!verifiedOtp) {
      toast.error('본인 인증이 필요합니다.');
      return;
    }
    if (needsRiskConsent) {
      riskConsentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast.error('위험 고지 동의 후 전송해 주세요.');
      return;
    }

    setTransferModalPhase('confirm');
    setTransferResult({ ok: false, message: '' });
    setShowTransferConfirm(true);
  };

  
  useEffect(() => {
    const wallet = recipient?.walletAddress?.trim();

    if (!wallet) {
      setIsWhateListedUser(false);
      setConsentChecked(false);
      return;
    }

    const nonce = ++userLookupNonce.current;

    getUserByWalletAddress(wallet).then((data) => {
      // ignore stale responses if user changed wallet while request was pending
      if (nonce !== userLookupNonce.current) return;

      const checkUser = data;

      if (checkUser) {
        setIsWhateListedUser(true);
        setConsentChecked(true);
        setRecipient((prev) => ({
          ...prev,
          ...checkUser,
          walletAddress: wallet,
        }));
      } else {
        setIsWhateListedUser(false);
        setConsentChecked(false);
        setRecipient((prev) => ({
          ...prev,
          walletAddress: wallet,
          nickname: '',
          email: '',
          avatar: '',
          mobile: '',
        }));
      }
    });
  }, [recipient?.walletAddress]);
  




  if (clientSettingsLoading) {
    return (
      <main className={`${walletPageClassName} px-4 py-8 pb-28`} style={walletPageStyle}>
        <div className="mx-auto flex min-h-[70vh] max-w-screen-sm items-center justify-center text-center">
          <p className="text-lg font-semibold text-slate-600 sm:text-2xl">
            클라이언트 설정을 확인 중입니다...
          </p>
        </div>
        <WalletManagementBottomNav lang={lang} active="wallet" />
      </main>
    );
  }

  if (!smartAccountEnabled) {
    return (
      <main className={`${walletPageClassName} px-4 py-8 pb-28`} style={walletPageStyle}>
        <div className="mx-auto flex min-h-[70vh] max-w-screen-sm items-center justify-center text-center">
          <p className="text-lg font-semibold text-rose-600 sm:text-2xl">
            스마트 어카운트가 비활성화되어 있습니다. 관리자에게 문의해주세요.
          </p>
        </div>
        <WalletManagementBottomNav lang={lang} active="wallet" />
      </main>
    );
  }

  if (!address) {
    return (
      <main className={`${walletPageClassName} px-4 py-8 pb-28`} style={walletPageStyle}>
        <AutoConnect client={client} wallets={wallets.length ? wallets : [wallet]} />
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-300/40 blur-3xl" />
        <div className="pointer-events-none absolute top-24 right-0 h-80 w-80 rounded-full bg-blue-300/30 blur-3xl" />
        <div className="relative mx-auto flex min-h-[70vh] w-full max-w-[430px] items-center px-4">
          <WalletConnectPrompt
            wallets={wallets}
            chain={selectedNetworkConfig.chain}
            lang={lang}
            title="지갑 연결이 필요합니다."
            description="USDT 지갑 서비스를 사용하려면 먼저 지갑을 연결해 주세요."
            centered
          />
        </div>
        <footer className="relative mt-10 border-t border-slate-200 bg-white/50 px-6 py-12 text-center text-slate-600 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
            <Image
              src="/logo-orangex.png"
              alt="OrangeX"
              width={180}
              height={56}
              className="h-10 w-auto"
            />
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500">
              <Link href={`/${lang}/terms-of-service`} className="hover:text-slate-900">
                이용약관
              </Link>
              <span className="text-slate-300">|</span>
              <Link href={`/${lang}/privacy-policy`} className="hover:text-slate-900">
                개인정보처리방침
              </Link>
              <span className="text-slate-300">|</span>
              <Link href={`/${lang}/refund-policy`} className="hover:text-slate-900">
                환불·분쟁 정책
              </Link>
            </div>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
              리스크 고지: 가상자산 결제에는 가격 변동 및 네트워크 지연 등 위험이 수반될 수 있습니다.
              결제 전에 수수료·환율·정산 조건을 확인해 주세요.
            </p>
            <div className="text-sm text-slate-500">
              <p>이메일 : help@orangex.center</p>
              <p>주소 : 14F, Corner St. Paul &amp; Tombs of the Kings, 8046 Pafos, Cyprus</p>
            </div>
            <p className="text-xs text-slate-400">Copyright © OrangeX All Rights Reserved</p>
          </div>
        </footer>
        <WalletManagementBottomNav lang={lang} active="wallet" />
      </main>
    );
  }

  return (

    <main className={walletPageClassName} style={walletPageStyle}>


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
              USDT 지갑
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              내 지갑의 USDT를 관리하고 출금, 입금, 전송내역을 한 화면에서 확인할 수 있습니다.
            </p>
          </div>

          <WalletSummaryCard
            walletAddress={address}
            walletAddressDisplay={`${address.substring(0, 6)}...${address.substring(address.length - 4)}`}
            networkLabel={selectedNetworkConfig.label}
            usdtBalanceDisplay={`${Number(animatedBalance).toFixed(3)} USDT`}
            modeLabel={footerTabLabel}
            smartAccountEnabled={smartAccountEnabled}
            disconnectRedirectPath={disconnectRedirectPath}
            onCopyAddress={(walletAddress) => {
              navigator.clipboard.writeText(walletAddress);
              toast.success(Copied_Wallet_Address);
            }}
          />

          <div className="grid gap-5">
            <section className="rounded-3xl border border-white/70 bg-white/75 p-5 shadow-[0_26px_60px_-35px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="mb-5 grid grid-cols-3 gap-2">
                {[
                  {
                    key: 'withdraw',
                    label: '출금하기',
                    icon: (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 5v14m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="4" y="3" width="16" height="6" rx="2" />
                      </svg>
                    ),
                  },
                  {
                    key: 'deposit',
                    label: '입금하기',
                    icon: (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 19V5m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="4" y="15" width="16" height="4" rx="1.5" />
                      </svg>
                    ),
                  },
                  {
                    key: 'history',
                    label: '전송내역',
                    icon: (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="8" />
                        <path d="M12 8v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ),
                  },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFooterTab(tab.key as any)}
                    className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition ${
                      footerTab === tab.key
                        ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
              네트워크 선택
            </span>
            <div
              role="radiogroup"
              aria-label="네트워크 선택"
              className="grid grid-cols-2 gap-2"
            >
              {NETWORK_OPTIONS.map((option) => {
                const isSelected = option.id === selectedNetwork;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={sending}
                    onClick={() => setSelectedNetwork(option.id)}
                    className={`relative flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10 ${
                      sending
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'bg-transparent text-slate-800 hover:border-slate-400'
                    } ${isSelected ? 'border-slate-900 bg-slate-50 text-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]' : 'border-slate-200'}`}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white">
                      <Image
                        src={option.logo}
                        alt={`${option.label} logo`}
                        width={20}
                        height={20}
                        className="h-5 w-5 object-contain"
                      />
                    </span>
                    <span className="text-[13px] font-semibold text-slate-900">{option.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              선택한 네트워크 기준으로 잔고와 출금이 처리됩니다.
            </p>
          </div>

              

          {footerTab === 'withdraw' && (
          <div className="mt-4 flex flex-col gap-5 border-t border-slate-200 pt-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-900">출금 요청</span>
              <p className="text-sm text-slate-500">{Enter_the_amount_and_recipient_address}</p>
            </div>

            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                canOpenTransferConfirm
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">출금 준비 상태</p>
              <div className="mt-2 grid gap-1 text-xs">
                <div className={`font-semibold ${hasAmountToSend ? 'text-emerald-700' : 'text-slate-500'}`}>
                  1. 금액 입력 {hasAmountToSend ? '완료' : '필요'}
                </div>
                <div className={`font-semibold ${hasValidRecipientWallet ? 'text-emerald-700' : 'text-slate-500'}`}>
                  2. 수신 지갑 확인 {hasValidRecipientWallet ? '완료' : '필요'}
                </div>
                <div
                  className={`font-semibold ${
                    !hasRecipientWallet
                      ? 'text-slate-500'
                      : !needsRiskConsent
                      ? 'text-emerald-700'
                      : 'text-rose-600'
                  }`}
                >
                  3. 위험 고지 동의 {hasRecipientWallet ? (!needsRiskConsent ? '완료' : '필요') : '대기'}
                </div>
              </div>
              <p className={`mt-2 font-semibold ${canOpenTransferConfirm ? 'text-emerald-800' : 'text-slate-800'}`}>
                {withdrawPrimaryLabel}
              </p>
              <p className={`mt-1 text-xs ${canOpenTransferConfirm ? 'text-emerald-700' : 'text-slate-600'}`}>
                {withdrawPrimaryGuide}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                    Amount
                  </label>
                  <button
                    type="button"
                    onClick={handleMaxAmount}
                    className="text-xs font-medium text-emerald-600 underline decoration-emerald-200 underline-offset-2 transition hover:text-emerald-700"
                  >
                    잔고 전체 선택
                  </button>
                </div>
                <div className="relative">
                  <input
                    ref={amountInputRef}
                    disabled={sending}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    className={`
                      w-full rounded-md border px-4 py-4 pr-20 text-right text-5xl font-semibold leading-none tracking-tight tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400
                      ${sending ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-white'}
                    `}
                    value={amountInput}
                    onChange={(e) => handleAmountChange(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    USDT
                  </span>
                </div>
                <div className="text-xs font-medium text-slate-400">
                  사용 가능: {formatAmountInput(maxAmount, selectedNetworkConfig.decimals)} USDT
                </div>
              </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-full bg-slate-100 p-1">
                        {[
                          { key: 'manual', label: '직접 입력' },
                          { key: 'favorites', label: '자주 쓰는 지갑' },
                          { key: 'member', label: '회원 검색' },
                        ].map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setRecipientMode(tab.key as any)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${
                              recipientMode === tab.key
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs text-slate-500">
                        주소를 직접 입력하거나 즐겨찾기/회원 검색에서 선택하세요.
                      </span>
                    </div>

                    {recipientMode === 'manual' ? (
                      <div className="flex flex-col gap-4 items-center justify-between">
                        <input
                        ref={recipientInputRef}
                        disabled={sending}
                        type="text"
                        placeholder={User_wallet_address}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                        value={recipient.walletAddress}
                          onChange={(e) => {
                            const next = e.target.value.trim();
                            const isEth = /^0x[a-fA-F0-9]{40}$/.test(next);
                            setAddressError(next ? (isEth ? null : '이더리움 지갑주소 형식이 아닙니다.') : null);
                            setRecipient({
                              ...recipient,
                              walletAddress: next,
                            });
                            if (!isEth) {
                              setFavoriteHit(null);
                            }
                          }}
                        />
                      {addressError && (
                        <p className="text-xs font-semibold text-rose-500">{addressError}</p>
                      )}
                      {favoriteHit && (
                        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-[11px]">
                            ★
                          </span>
                          <div className="flex flex-col">
                            <span>자주 쓰는 지갑으로 등록됨</span>
                            <span className="text-[11px] font-normal text-emerald-700/80">
                              {favoriteHit.label || favoriteHit.walletAddress.substring(0, 10) + '...'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="w-full flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                        <input
                          disabled={
                            favoriteSaving ||
                            sending ||
                            !recipient.walletAddress ||
                            Boolean(addressError)
                          }
                          type="text"
                          placeholder="별칭 (선택)"
                          className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                          value={favoriteLabel}
                          onChange={(e) => setFavoriteLabel(e.target.value)}
                        />
                          <button
                            type="button"
                            disabled={
                              favoriteSaving ||
                              sending ||
                              !recipient.walletAddress ||
                              Boolean(addressError)
                            }
                            onClick={addFavoriteWallet}
                            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                              favoriteSaving || sending || !recipient.walletAddress || addressError
                                ? 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                            }`}
                          >
                            {favoriteSaving ? '저장 중...' : '즐겨찾기 추가'}
                          </button>
                        </div>

                        {isWhateListedUser ? (
                          <div className="w-full rounded-xl border border-emerald-200/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 shadow-[0_6px_14px_rgba(16,185,129,0.12)]">
                            <div className="flex items-center gap-2">
                              <Image
                                src={recipient.avatar || '/profile-default.png'}
                                alt="profile"
                                width={36}
                                height={36}
                                className="rounded-full border border-emerald-200 bg-white"
                                style={{ objectFit: 'cover' }}
                              />
                              <div className="flex flex-col leading-tight">
                                <span className="text-sm font-bold">{recipient?.nickname || '등록 회원'}</span>
                                <span className="text-[11px] text-emerald-700/80">
                                  {recipient.walletAddress
                                    ? `${recipient.walletAddress.substring(0, 6)}...${recipient.walletAddress.substring(recipient.walletAddress.length - 4)}`
                                    : ''}
                                </span>
                              </div>
                              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">
                                <Image src="/verified.png" alt="verified" width={14} height={14} />
                                등록 회원
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-emerald-700/90 sm:grid-cols-2">
                              {recipient.email && (
                                <span>이메일: {recipient.email.replace(/(.{2}).*(@.*)/, '$1***$2')}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            {recipient?.walletAddress && (
                              <div className='flex flex-col gap-1 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700'>
                                <div className="flex items-center gap-2">
                                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500"></div>
                                  <span>등록된 회원 지갑주소가 아닙니다.</span>
                                </div>
                                <span className="text-[11px] font-medium text-amber-700/90">
                                  주소가 정확한지 다시 확인하거나, 신규 주소라면 위험을 확인한 뒤 전송하세요.
                                </span>
                              </div>
                            )}
                          </>
                        )}

                        {!isTrustedRecipient && recipient.walletAddress && !addressError && (
                          <div
                            ref={riskConsentRef}
                            className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700"
                          >
                            <div className="flex items-center gap-2 font-semibold">
                              <div className="h-2.5 w-2.5 rounded-full bg-rose-500"></div>
                              <span>주의: 자주 쓰는 지갑/등록 회원이 아닌 주소입니다.</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                              오입금 시 복구가 불가능하며 모든 책임은 본인에게 있습니다. 주소를 다시 한 번 확인한 후 동의해주세요.
                            </p>
                            <label className="inline-flex items-center gap-2 text-[11px] font-semibold">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border border-rose-300 text-rose-600 focus:ring-rose-400"
                                checked={consentChecked}
                                onChange={(e) => setConsentChecked(e.target.checked)}
                              />
                              위험을 이해했고 본인 책임으로 전송함에 동의합니다.
                            </label>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {recipientMode === 'favorites' && (
                          <div className="flex flex-col gap-3">
                            {favoriteLoading && (
                              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                                {[1, 2, 3, 4].map((i) => (
                                  <div
                                    key={i}
                                    className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,0.05)]"
                                  >
                                    <div
                                      className="absolute inset-0 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 animate-[shimmer_1.4s_linear_infinite]"
                                      style={{ backgroundSize: '200% 100%' }}
                                    />
                                    <div className="relative flex flex-col gap-2">
                                      <div className="h-3 w-24 rounded-full bg-slate-200" />
                                      <div className="h-4 w-40 rounded-full bg-slate-200" />
                                      <div className="flex gap-2">
                                        <div className="h-8 w-14 rounded-md bg-slate-200" />
                                        <div className="h-8 w-14 rounded-md bg-slate-200" />
                                        <div className="h-8 w-14 rounded-md bg-slate-200" />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {favoriteError && (
                              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                                {favoriteError}
                              </div>
                            )}

                            {!favoriteLoading && !favoriteError && favoriteWallets.length === 0 && (
                              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                                <span className="text-sm font-semibold text-slate-700">등록된 즐겨찾기 지갑이 없습니다.</span>
                                <p className="text-xs text-slate-500">자주 사용하는 주소를 추가해 두면 빠르게 선택할 수 있습니다.</p>
                                <button
                                  type="button"
                                  onClick={() => setRecipientMode('manual')}
                                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400"
                                >
                                  주소 추가하러 가기
                                </button>
                              </div>
                            )}

                            {!favoriteLoading && favoriteWallets.length > 0 && (
                              <div className="overflow-hidden rounded-xl border border-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                                <div className="grid grid-cols-[1.5fr_1.6fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  <span>별칭</span>
                                  <span>지갑주소</span>
                                  <span className="text-right pr-1">동작</span>
                                </div>
                                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                                  {favoriteWallets.map((fav, idx) => {
                                    const masked = `${fav.walletAddress.substring(0, 6)}...${fav.walletAddress.substring(fav.walletAddress.length - 4)}`;
                                    return (
                                      <div
                                        key={`${fav.walletAddress}-${fav.label ?? ''}-${idx}`}
                                        className="grid grid-cols-[1.5fr_1.6fr_1fr] items-center gap-3 px-4 py-3 bg-white transition duration-500 ease-out hover:bg-slate-50 animate-[fadeInUp_0.4s_ease]"
                                        style={{ animationDelay: `${idx * 40}ms` }}
                                      >
                                        <div className="text-sm font-semibold text-slate-900 truncate">
                                          {fav.label || '즐겨찾기'}
                                        </div>
                                        <div className="text-xs font-medium text-slate-800">{masked}</div>
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setRecipient({
                                                ...recipient,
                                                walletAddress: fav.walletAddress,
                                                nickname: fav.label || recipient.nickname,
                                              });
                                              setRecipientMode('manual');
                                              setAddressError(null);
                                              setFavoriteHit(fav);
                                            }}
                                            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:border-emerald-400 whitespace-nowrap"
                                          >
                                            사용
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => navigator.clipboard.writeText(fav.walletAddress)}
                                            className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-400 whitespace-nowrap"
                                          >
                                            복사
                                          </button>
                                          <button
                                            type="button"
                                            disabled={favoriteSaving}
                                            onClick={() => removeFavoriteWallet(fav.walletAddress)}
                                            className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-rose-500 hover:border-rose-300 whitespace-nowrap"
                                          >
                                            삭제
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {recipientMode === 'member' && (
                          <div className="flex flex-col gap-3 w-full">
                            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                              <input
                                type="text"
                                placeholder="회원 닉네임(아이디)으로 검색"
                                className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                                value={memberKeyword}
                                onChange={(e) => setMemberKeyword(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    searchMembers();
                                  }
                                }}
                              />
                              <button
                                type="button"
                                disabled={memberLoading || !memberKeyword.trim()}
                                onClick={searchMembers}
                                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                                  memberLoading || !memberKeyword.trim()
                                    ? 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'border border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                                }`}
                              >
                                {memberLoading ? '검색 중...' : '검색'}
                              </button>
                            </div>

                            {memberError && (
                              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                                {memberError}
                              </div>
                            )}

                            {!memberLoading && memberResults.length === 0 && !memberError && (
                              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                검색 결과가 없습니다. 닉네임을 다시 확인해 주세요.
                              </div>
                            )}

                            {memberResults.length > 0 && (
                              <div className="overflow-hidden rounded-xl border border-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                                <div className="grid grid-cols-[1.6fr_1.5fr_0.8fr] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  <span>회원</span>
                                  <span>지갑주소</span>
                                  <span className="text-right pr-1">선택</span>
                                </div>
                                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                                  {memberResults.map((m, idx) => {
                                    const masked = m.walletAddress
                                      ? `${m.walletAddress.substring(0, 6)}...${m.walletAddress.substring(m.walletAddress.length - 4)}`
                                      : '지갑 미등록';
                                    const maskedEmail = m.email
                                      ? m.email.replace(/(.{2}).*(@.*)/, '$1***$2')
                                      : '-';
                                    return (
                                      <div
                                        key={`${m.walletAddress}-${m.nickname}-${m.id}-${idx}`}
                                        className="grid grid-cols-[1.6fr_1.5fr_0.8fr] items-center gap-3 px-4 py-3 bg-white transition duration-300 ease-out hover:bg-slate-50 animate-[fadeIn_0.35s_ease]"
                                        style={{ animationDelay: `${idx * 30}ms` }}
                                      >
                                        <div className="flex items-center gap-3 min-w-0">
                                          <Image
                                            src={m.avatar || '/profile-default.png'}
                                            alt="profile"
                                            width={36}
                                            height={36}
                                            className="rounded-full border border-slate-200 bg-white"
                                          />
                                          <div className="min-w-0 flex flex-col gap-0.5">
                                            <div className="text-[15px] leading-tight font-extrabold tracking-tight text-slate-900 truncate">
                                              {m.nickname || '회원'}
                                            </div>
                                            <div className="text-[10px] text-slate-500 truncate">
                                              {maskedEmail}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-xs font-medium text-slate-800">{masked}</div>
                                        <div className="flex items-center justify-end">
                                          <button
                                            type="button"
                                            disabled={!m.walletAddress}
                                            onClick={() => {
                                              if (!m.walletAddress) return;
                                              setRecipient((prev) => ({
                                                ...prev,
                                                walletAddress: m.walletAddress || '',
                                                nickname: m.nickname || '',
                                                email: m.email || '',
                                                avatar: m.avatar || '',
                                                mobile: '',
                                              }));
                                              setIsWhateListedUser(!!m.walletAddress);
                                              setRecipientMode('manual');
                                              setAddressError(null);
                                            }}
                                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                                              m.walletAddress
                                                ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400'
                                                : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                            }`}
                                          >
                                            선택
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                </div>

                {/* otp verification */}
                {/*
                {verifiedOtp ? (
                  <div className="w-full flex flex-row gap-2 items-center justify-center">
                    <Image
                      src="/verified.png"
                      alt="check"
                      width={30}
                      height={30}
                    />
                    <div className="text-white">OTP verified</div>
                  </div>
                ) : (
              
          
                  <div className="w-full flex flex-row gap-2 items-start">

                    <button
                      disabled={!address || !recipient?.walletAddress || !amount || isSendingOtp}
                      onClick={sendOtp}
                      className={`
                        
                        ${isSendedOtp && 'hidden'}

                        w-32 p-2 rounded-lg text-sm font-semibold

                          ${
                          !address || !recipient?.walletAddress || !amount || isSendingOtp
                          ?'bg-gray-300 text-gray-400'
                          : 'bg-green-500 text-white'
                          }
                        
                        `}
                    >
                        Send OTP
                    </button>

                    <div className={`flex flex-row gap-2 items-center justify-center ${!isSendedOtp && 'hidden'}`}>
                      <input
                        type="text"
                        placeholder="Enter OTP"
                        className=" w-40 p-2 border border-gray-300 rounded text-black text-sm font-semibold"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                      />

                      <button
                        disabled={!otp || isVerifingOtp}
                        onClick={verifyOtp}
                        className={`w-32 p-2 rounded-lg text-sm font-semibold

                            ${
                            !otp || isVerifingOtp
                            ?'bg-gray-300 text-gray-400'
                            : 'bg-green-500 text-white'
                            }
                          
                          `}
                      >
                          Verify OTP
                      </button>
                    </div>

                  </div>

                )}
                  */}

                



                <button
                  disabled={sending}
                  onClick={openTransferConfirmWithCta}
                  className={`mt-2 w-full rounded-xl border px-4 py-3 text-lg font-medium transition-all duration-200 ease-in-out
                      ${sending ? 'animate-pulse' : ''}
                      ${
                      canOpenTransferConfirm
                      ? 'border-cyan-700 bg-cyan-700 text-white shadow-[0_16px_34px_-20px_rgba(14,116,144,0.85)] hover:-translate-y-0.5 hover:bg-cyan-600'
                      : 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
                      }
                      disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed
                    `}
                >
                    {withdrawPrimaryLabel}
                </button>

                <p className="mt-2 text-xs text-slate-500">
                  {withdrawPrimaryGuide}
                </p>

          </div>
          )}

          {footerTab === 'history' && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-sm font-medium text-slate-900">USDT 입출금 내역</span>
                <p className="text-xs text-slate-500">선택한 네트워크 기준 최신순</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
                  {selectedNetworkConfig.label}
                </span>
                <button
                  type="button"
                  onClick={() => setTransfersRefreshToken((prev) => prev + 1)}
                  disabled={transfersLoading}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className={`h-3 w-3 ${transfersLoading ? 'animate-spin text-slate-500' : 'text-slate-400'}`}
                    fill="none"
                  >
                    <path
                      d="M20 12a8 8 0 1 1-2.343-5.657"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M20 4v6h-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  새로고침
                </button>
              </div>
            </div>

            {transfersLoading && (
              <div className="mt-4 text-xs font-semibold text-slate-500">
                내역을 불러오는 중입니다...
              </div>
            )}

            {!transfersLoading && transfersError && (
              <div className="mt-4 text-xs font-semibold text-rose-600">
                {transfersError}
              </div>
            )}

            {!transfersLoading && !transfersError && transfers.length === 0 && (
              <div className="mt-4 text-xs font-semibold text-slate-500">
                아직 USDT 입출금 내역이 없습니다.
              </div>
            )}

            {!transfersLoading && !transfersError && transfers.length > 0 && (
              <div className="mt-4 divide-y divide-slate-200">
                {transfers.map((transfer, index) => {
                  const direction = resolveTransferDirection(transfer);
                  const isIncoming = direction === 'in';
                  const label = isIncoming ? '입금' : direction === 'out' ? '출금' : '이동';
                  const amountText = formatTokenAmount(
                    resolveTransferAmount(transfer),
                    resolveTransferDecimals(transfer)
                  );
                  const symbol = resolveTransferSymbol(transfer);
                  const fromText = shortenValue(transfer.from_address);
                  const toText = shortenValue(transfer.to_address);
                  const timeText = formatTimestamp(transfer.block_timestamp);
                  const hashText = shortenValue(transfer.transaction_hash, 10, 8);
                  const txUrl = getExplorerTxUrl(transfer.transaction_hash);
                  const tone =
                    direction === 'in'
                      ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                      : direction === 'out'
                      ? 'border-rose-200/70 bg-rose-50 text-rose-600'
                      : 'border-slate-200/70 bg-slate-100 text-slate-600';
                  const amountTone =
                    direction === 'in'
                      ? 'text-emerald-700'
                      : direction === 'out'
                      ? 'text-rose-600'
                      : 'text-slate-700';

                  return (
                    <div
                      key={transfer.transaction_hash || `${index}-${transfer.block_timestamp}`}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                <span className={`inline-flex min-w-[56px] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                  {label}
                </span>
                        <div className="flex flex-col text-xs text-slate-500">
                          <span>{timeText}</span>
                          {txUrl && hashText !== '-' ? (
                            <a
                              href={txUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-slate-400 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-600"
                            >
                              Tx {hashText}
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400">Tx {hashText}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-1 text-left sm:items-end sm:text-right">
                        <span className={`text-base font-medium ${amountTone}`}>
                          {isIncoming ? '+' : direction === 'out' ? '-' : ''}
                          {amountText} {symbol}
                        </span>
                        {(fromText !== '-' || toText !== '-') && (
                          <span className="text-[11px] text-slate-400">
                            {fromText} → {toText}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!transfersLoading && !transfersError && transfers.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  페이지 {transfersPage + 1}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTransfersPage((prev) => Math.max(0, prev - 1))}
                    disabled={transfersLoading || transfersPage === 0}
                    className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    이전
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransfersPage((prev) => prev + 1)}
                    disabled={transfersLoading || !transfersHasMore}
                    className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

          {footerTab === 'deposit' && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="text-sm font-semibold text-slate-900">입금하기</span>
                <p className="text-xs text-slate-500">아래 QR을 스캔해 지갑 주소로 입금하세요.</p>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  {address ? (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(address)}`}
                      alt="Deposit QR"
                      width={220}
                      height={220}
                      className="rounded-lg"
                      style={{ width: 220, height: 220 }}
                    />
                  ) : (
                    <div className="h-[220px] w-[220px] rounded-lg bg-slate-100" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <span>{address ? `${address.substring(0, 10)}...${address.substring(address.length - 6)}` : '지갑 주소를 불러오는 중'}</span>
                  {address && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(address);
                        toast.success(Copied_Wallet_Address);
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-400"
                    >
                      복사
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          
            </section>
          </div>
      </div>

      {showTransferConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget && transferModalPhase !== 'processing') {
              setShowTransferConfirm(false);
              setTransferModalPhase('confirm');
              setTransferResult({ ok: false, message: '' });
            }
          }}
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_34px_90px_-46px_rgba(15,23,42,0.75)]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 overflow-hidden">
              <div className="absolute -left-10 -top-12 h-24 w-24 rounded-full bg-emerald-200/50 blur-2xl" />
              <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-sky-200/50 blur-2xl" />
            </div>

            <h3 className="relative text-[38px] leading-none font-black tracking-tight text-slate-900">USDT 전송</h3>
            <p className="relative mt-2 text-[15px] font-medium text-slate-500">
              아래 정보를 확인하고 전송을 진행하세요.
            </p>

            <div className="relative mt-5 space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/60 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">Network</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-900 shadow-sm">
                  <Image
                    src={selectedNetworkConfig.logo}
                    alt={`${selectedNetworkConfig.label} logo`}
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px] rounded-full object-cover"
                  />
                  {selectedNetworkConfig.label}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 border-t border-slate-200/80 pt-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">To</span>
                <div className="max-w-[72%] text-right flex flex-col items-end">
                  {transferRecipientNickname && (
                    <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-2.5 py-1.5 shadow-[0_10px_26px_-18px_rgba(16,185,129,0.7)]">
                      <Image
                        src={transferRecipientAvatar}
                        alt="recipient avatar"
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full border border-emerald-200 bg-white object-cover"
                      />
                      <div className="min-w-0 text-left">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                          Member
                        </div>
                        <div className="text-sm font-extrabold leading-tight tracking-tight text-emerald-800 truncate">
                          {transferRecipientNickname}
                        </div>
                      </div>
                    </div>
                  )}
                  <span className="block font-medium text-slate-900 break-all">
                    {recipient?.walletAddress || '-'}
                  </span>
                  {transferRecipientDetails.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {transferRecipientDetails.map((item) => (
                        <div key={`${item.label}-${item.value}`} className="text-[11px] text-slate-500 break-all">
                          <span className="text-slate-400">{item.label}:</span>{' '}
                          <span className="font-medium text-slate-600">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/85 px-3 py-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-600">Amount</span>
                <div className="mt-1 flex items-end justify-end gap-1">
                  <span className="text-4xl font-black tracking-tight text-emerald-700 tabular-nums">
                    {formatAmountInput(amount, selectedNetworkConfig.decimals)}
                  </span>
                  <span className="mb-1 text-lg font-extrabold text-emerald-700">USDT</span>
                </div>
              </div>
            </div>

            {transferModalPhase === 'processing' && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-900">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700" />
                전송 중입니다... 네트워크 확인이 끝날 때까지 창을 닫지 마세요.
              </div>
            )}

            {transferModalPhase === 'result' && (
              <div
                className={`mt-4 flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  transferResult.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                    transferResult.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                  }`}
                >
                  {transferResult.ok ? '✓' : '!'}
                </span>
                <span>{transferResult.message || (transferResult.ok ? '전송이 완료되었습니다.' : '전송에 실패했습니다.')}</span>
              </div>
            )}

            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                disabled={transferModalPhase === 'processing'}
                onClick={() => {
                  setShowTransferConfirm(false);
                  setTransferModalPhase('confirm');
                  setTransferResult({ ok: false, message: '' });
                }}
                className={`flex-1 rounded-2xl border px-4 py-3 text-[17px] font-bold transition ${
                  transferModalPhase === 'processing'
                    ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                }`}
              >
                {transferModalPhase === 'result' ? '닫기' : '취소'}
              </button>
              {transferModalPhase === 'confirm' && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={async () => {
                    setTransferModalPhase('processing');
                    const ok = await sendUsdt();
                    setTransferResult({
                      ok,
                      message: ok ? '전송이 완료되었습니다.' : '전송에 실패했습니다. 다시 시도해주세요.',
                    });
                    if (ok) {
                      setShowJackpot(true);
                      setTimeout(() => setShowJackpot(false), 2500);
                    }
                    setTransferModalPhase('result');
                  }}
                  className="flex-1 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-[17px] font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  확인 후 전송
                </button>
              )}
              {transferModalPhase === 'processing' && (
                <button
                  type="button"
                  disabled
                  className="flex-1 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-[17px] font-bold text-slate-400"
                >
                  전송 중...
                </button>
              )}
              {transferModalPhase === 'result' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowTransferConfirm(false);
                    setTransferModalPhase('confirm');
                    setTransferResult({ ok: false, message: '' });
                  }}
                  className="flex-1 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-[17px] font-extrabold text-white transition hover:bg-slate-800"
                >
                  확인
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showJackpot && (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div className="absolute inset-0 animate-[fadeIn_0.3s_ease] bg-transparent">
            {/* Confetti layers */}
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(60)].map((_, i) => (
                <span
                  key={i}
                  className="absolute h-1 w-3 rounded-[2px]"
                  style={{
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    backgroundColor: ['#10b981', '#06b6d4', '#f59e0b', '#ef4444'][i % 4],
                    opacity: 0.85,
                    transform: `rotate(${Math.random() * 360}deg)`,
                    animation: `confetti-fall ${1200 + Math.random() * 800}ms ease-out forwards`,
                    animationDelay: `${Math.random() * 200}ms`,
                  }}
                />
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-[scaleIn_0.4s_ease] rounded-2xl bg-white/80 px-6 py-3 text-xl font-black text-emerald-700 shadow-[0_15px_60px_rgba(16,185,129,0.35)] backdrop-blur">
                {Number((lastSentAmount ?? amount) || 0).toFixed(3)} USDT 전송 완료
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes confetti-fall {
          from {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          to {
            transform: translateY(90vh) rotate(360deg);
            opacity: 0;
          }
        }
        @keyframes scaleIn {
          from {
            transform: scale(0.85);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes spin_reverse {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(-360deg);
          }
        }
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>

      <WalletManagementBottomNav lang={lang} active="wallet" />

    </main>

  );

}
