// nickname settings
'use client';
import React, { use, useEffect, useState, useCallback, useMemo } from 'react';



import { toast } from 'react-hot-toast';

import { useClientWallets } from '@/lib/useClientWallets';
import { createWalletSignatureAuthPayload } from '@/lib/security/walletSignature';
import { client } from "@/app/client";


import {
    getContract,
    getContractEvents,
    sendAndConfirmTransaction,
} from "thirdweb";

import {
    AutoConnect,
    ConnectButton,
    useActiveAccount,
    useActiveWallet,

    useConnectedWallets,
    useSetActiveWallet,
    useConnectModal,
} from "thirdweb/react";


import {
  inAppWallet,
  createWallet,
} from "thirdweb/wallets";

import { getUserPhoneNumber } from "thirdweb/wallets/in-app";


import Image from 'next/image';

import GearSetupIcon from "@/components/gearSetupIcon";


import Uploader from '@/components/uploader';

import { balanceOf, transfer, transferEvent } from "thirdweb/extensions/erc20";
 

import AppBarComponent from "@/components/Appbar/AppBar";
import { getDictionary } from "../../../dictionaries";
import { WALLET_CONNECT_OPTIONS, WALLET_CONNECT_WELCOME_SCREEN } from "@/lib/walletConnectModal";


import { useQRCode } from 'next-qrcode';


import {
  ethereum,
  polygon,
  arbitrum,
  bsc,
} from "thirdweb/chains";

import {
  chain,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,

  bscContractAddressMKRW,
} from "@/app/config/contractAddresses";



const storecode = "admin";



const wallets = [
  inAppWallet({
    auth: {
      options: [
        "google",
        "email",
      ],
    },
  }),
];


const contractAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // USDT on Polygon

const contractAddressArbitrum = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // USDT on Arbitrum




import {
    useRouter,
    useSearchParams,
} from "next//navigation";


const walletAuthOptions = ['email', 'google', 'phone'];
const isWalletAddress = (value: unknown) =>
    /^0x[a-fA-F0-9]{40}$/.test(String(value ?? '').trim());


export default function SettingsPage({ params }: any) {


    //console.log("params", params);
    
    const searchParams = useSearchParams();
 
    ///const wallet = searchParams.get('wallet');

    const { Canvas } = useQRCode();

    
    
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

        Wallet_Settings: "",
        Profile_Settings: "",

        Profile: "",
        My_Profile_Picture: "",
  
        Edit: "",


        Cancel: "",
        Save: "",
        Enter_your_nickname: "",
        Nickname_should_be_5_10_characters: "",

        Seller: "",
        Not_a_seller: "",
        Apply: "",
        Applying: "",
        Enter_your_bank_name: "",
        Enter_your_account_number: "",
        Enter_your_account_holder: "",
        Send_OTP: "",
        Enter_OTP: "",
        Verify_OTP: "",
        OTP_verified: "",

        Nickname_should_be_alphanumeric_lowercase: "",
        Nickname_should_be_at_least_5_characters_and_at_most_10_characters: "",

        Copied_Wallet_Address: "",

        Escrow: "",

        Make_Escrow_Wallet: "",

        Escrow_Wallet_Address_has_been_created: "",
        Failed_to_create_Escrow_Wallet_Address: "",
  
    
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
        Send_USDT,
        Pay_USDT,
        Coming_Soon,
        Please_connect_your_wallet_first,

        Wallet_Settings,
        Profile_Settings,

        Profile,
        My_Profile_Picture,
  
        Edit,

        Cancel,
        Save,
        Enter_your_nickname,
        Nickname_should_be_5_10_characters,

        Seller,
        Not_a_seller,
        Apply,
        Applying,
        Enter_your_bank_name,
        Enter_your_account_number,
        Enter_your_account_holder,
        Send_OTP,
        Enter_OTP,
        Verify_OTP,
        OTP_verified,

        Nickname_should_be_alphanumeric_lowercase,
        Nickname_should_be_at_least_5_characters_and_at_most_10_characters,

        Copied_Wallet_Address,

        Escrow,

        Make_Escrow_Wallet,

        Escrow_Wallet_Address_has_been_created,
        Failed_to_create_Escrow_Wallet_Address,

    } = data;
    
    



    const router = useRouter();

    const { wallet, wallets, smartAccountEnabled, chain } = useClientWallets({
        authOptions: walletAuthOptions,
        defaultSmsCountryCode: 'KR',
        sponsorGas: true, // enable paymaster for smart accounts to cover gas
    });


    const activeAccount = useActiveAccount();
    const activeWallet = useActiveWallet();
    const connectedWallets = useConnectedWallets();
    const address = activeAccount?.address;
    const walletAddressCandidates = useMemo(() => {
        const byLowerAddress = new Map<string, string>();
        const appendCandidate = (value: unknown) => {
            const normalized = String(value || '').trim();
            if (!isWalletAddress(normalized)) {
                return;
            }
            const key = normalized.toLowerCase();
            if (!byLowerAddress.has(key)) {
                byLowerAddress.set(key, normalized);
            }
        };

        // Prefer currently active account (often smart account), then fallback to admin EOA.
        appendCandidate(address);
        appendCandidate(activeWallet?.getAccount?.()?.address);
        appendCandidate(activeWallet?.getAdminAccount?.()?.address);

        for (const walletItem of connectedWallets) {
            appendCandidate(walletItem?.getAccount?.()?.address);
            appendCandidate(walletItem?.getAdminAccount?.()?.address);
        }

        return Array.from(byLowerAddress.values());
    }, [activeWallet, address, connectedWallets]);
    const rawRequesterWalletAddress = walletAddressCandidates[0] || '';
    const [resolvedWalletAddress, setResolvedWalletAddress] = useState('');
    const requesterWalletAddress = resolvedWalletAddress || rawRequesterWalletAddress;

    useEffect(() => {
        if (!resolvedWalletAddress) {
            return;
        }
        const stillConnected = walletAddressCandidates.some(
            (candidate) => candidate.toLowerCase() === resolvedWalletAddress.toLowerCase(),
        );
        if (!stillConnected) {
            setResolvedWalletAddress('');
        }
    }, [walletAddressCandidates, resolvedWalletAddress]);

    const signatureAccount = useMemo(() => {
        const candidates: Array<unknown> = [
            activeAccount,
            activeWallet?.getAccount?.(),
            activeWallet?.getAdminAccount?.(),
        ];
        for (const walletItem of connectedWallets) {
            candidates.push(walletItem?.getAccount?.());
            candidates.push(walletItem?.getAdminAccount?.());
        }

        for (const candidate of candidates) {
            const account = candidate as {
                address?: string;
                signMessage?: (options: {
                    message: string;
                    originalMessage?: string;
                    chainId?: number;
                }) => Promise<string>;
            } | null | undefined;
            if (account?.address && typeof account.signMessage === 'function') {
                return account;
            }
        }

        return null;
    }, [activeAccount, activeWallet, connectedWallets]);
    const buildSignedRequestBody = useCallback(
        async ({
            path,
            payload,
        }: {
            path: string;
            payload: Record<string, unknown>;
        }) => {
            if (!signatureAccount?.address || typeof signatureAccount.signMessage !== 'function') {
                throw new Error('서명 가능한 지갑 계정을 찾을 수 없습니다.');
            }

            const auth = await createWalletSignatureAuthPayload({
                account: signatureAccount,
                storecode,
                path,
                method: 'POST',
            });

            return {
                ...payload,
                auth,
            };
        },
        [signatureAccount],
    );



    const [phoneNumber, setPhoneNumber] = useState("");

    /*
    useEffect(() => {
  
  
      if (smartAccount) {
  
        //const phoneNumber = await getUserPhoneNumber({ client });
        //setPhoneNumber(phoneNumber);
  
  
        getUserPhoneNumber({ client }).then((phoneNumber) => {
          setPhoneNumber(phoneNumber || "");
        });
  
  
  
      }
  
    } , [smartAccount]);
    */



    // selectedChain USDT balance
    const [selectedChain, setSelectedChain] = useState(chain);

    const connectChain =
        selectedChain === "ethereum"
            ? ethereum
            : selectedChain === "arbitrum"
            ? arbitrum
            : selectedChain === "bsc"
            ? bsc
            : polygon;

    const { connect: openConnectModal, isConnecting } = useConnectModal();
    const [connectError, setConnectError] = useState<string | null>(null);

    const contract = useMemo(
        () =>
            getContract({
                client,
                chain:
                    selectedChain === 'ethereum'
                        ? ethereum
                        : selectedChain === 'polygon'
                        ? polygon
                        : selectedChain === 'arbitrum'
                        ? arbitrum
                        : selectedChain === 'bsc'
                        ? bsc
                        : ethereum,
                address:
                    selectedChain === 'ethereum'
                        ? ethereumContractAddressUSDT
                        : selectedChain === 'polygon'
                        ? polygonContractAddressUSDT
                        : selectedChain === 'arbitrum'
                        ? arbitrumContractAddressUSDT
                        : selectedChain === 'bsc'
                        ? bscContractAddressUSDT
                        : ethereumContractAddressUSDT,
            }),
        [selectedChain]
    );

    const [escrowHistoryOpen, setEscrowHistoryOpen] = useState(false);
    const [escrowHistoryLoading, setEscrowHistoryLoading] = useState(false);
    const [escrowHistory, setEscrowHistory] = useState<Array<{
        direction: 'in' | 'out';
        amount: number;
        from?: string;
        to?: string;
        txHash?: string;
        blockNumber?: bigint;
        logIndex?: number;
    }>>([]);
    const [escrowHistoryError, setEscrowHistoryError] = useState<string | null>(null);
    const HISTORY_STEP_DAYS = 3;
    const MAX_HISTORY_DAYS = 90;
    const MAX_EVENT_BLOCK_RANGE = 900n; // stay below RPC log limits (e.g., 1000 blocks)
    const [historyDays, setHistoryDays] = useState<number>(HISTORY_STEP_DAYS);
    const [chargeModalOpen, setChargeModalOpen] = useState(false);
    const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
    const [chargeAmount, setChargeAmount] = useState('');
    const [charging, setCharging] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);
    const [userBalance, setUserBalance] = useState<number | null>(null);
    const [userBalanceLoading, setUserBalanceLoading] = useState(false);




    ///const [nativeBalance, setNativeBalance] = useState(0);


    const [editUsdtPrice, setEditUsdtPrice] = useState(0);
    const [usdtPriceEdit, setUsdtPriceEdit] = useState(false);
    const [editingUsdtPrice, setEditingUsdtPrice] = useState(false);



    // get usdt price
    // api /api/order/getPrice

    const [usdtPrice, setUsdtPrice] = useState(0);
    useEffect(() => {

        if (!requesterWalletAddress) {
            return;
        }

        const fetchData = async () => {

            setEditingUsdtPrice(true);

            const response = await fetch("/api/order/getPrice", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    walletAddress: requesterWalletAddress,
                }),
            });

            const data = await response.json();

            ///console.log("getPrice data", data);

            if (data.result) {
                setUsdtPrice(data.result.usdtPrice);
            }

            setEditingUsdtPrice(false);
        };

        fetchData();
    }

    , [requesterWalletAddress]);


    
    const [nickname, setNickname] = useState("");
    const [avatar, setAvatar] = useState("/profile-default.png");
    const [userCode, setUserCode] = useState("");


    const [nicknameEdit, setNicknameEdit] = useState(false);

    const [editedNickname, setEditedNickname] = useState("");


    const [avatarEdit, setAvatarEdit] = useState(false);



    const [seller, setSeller] = useState(null) as any;

    const fetchEscrowHistory = useCallback(async () => {
        if (!seller?.escrowWalletAddress) {
            setEscrowHistory([]);
            return;
        }

        setEscrowHistoryLoading(true);
        setEscrowHistoryError(null);

        try {
            const walletAddress = seller.escrowWalletAddress;
            const blocksPerDay =
                selectedChain === 'ethereum'
                    ? 7200 // ~12s
                    : selectedChain === 'bsc'
                    ? 28800 // ~3s
                    : selectedChain === 'arbitrum'
                    ? 34500 // ~2.5s
                    : 43000; // polygon ~2s

            const totalRange = BigInt(blocksPerDay * historyDays);
            const decimals = selectedChain === 'bsc' ? 18 : 6;

            let remaining = totalRange;
            let cursorTo: bigint | undefined;
            const allEvents: any[] = [];

            while (remaining > 0n) {
                const range = remaining > MAX_EVENT_BLOCK_RANGE ? MAX_EVENT_BLOCK_RANGE : remaining;
                const commonOptions: any = {
                    contract,
                    blockRange: range,
                    useIndexer: false, // fall back to RPC to avoid indexer gaps
                };
                if (cursorTo && cursorTo > 0n) {
                    commonOptions.toBlock = cursorTo;
                }

                const [incomingChunk, outgoingChunk] = await Promise.all([
                    getContractEvents({
                        ...commonOptions,
                        events: [transferEvent({ to: walletAddress })],
                    }),
                    getContractEvents({
                        ...commonOptions,
                        events: [transferEvent({ from: walletAddress })],
                    }),
                ]);

                const normalize = (items: any[], direction: 'in' | 'out') =>
                    items.map((evt) => ({
                        direction,
                        amount: Number(evt?.args?.value ?? 0n) / 10 ** decimals,
                        from: evt?.args?.from,
                        to: evt?.args?.to,
                        txHash: evt?.transactionHash,
                        blockNumber: evt?.blockNumber,
                        logIndex: evt?.logIndex,
                    }));

                allEvents.push(...normalize(incomingChunk, 'in'), ...normalize(outgoingChunk, 'out'));

                const minBlockInChunk = [...incomingChunk, ...outgoingChunk].reduce<bigint | null>(
                    (acc, evt) =>
                        evt?.blockNumber !== undefined && evt.blockNumber !== null
                            ? acc === null || evt.blockNumber < acc
                                ? evt.blockNumber
                                : acc
                            : acc,
                    null,
                );

                if (minBlockInChunk === null || minBlockInChunk === 0n) {
                    break;
                }

                cursorTo = minBlockInChunk - 1n;
                if (cursorTo <= 0n) break;
                remaining -= range;
            }

            const merged = allEvents.sort((a, b) => {
                const blockDiff = Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n));
                if (blockDiff !== 0) return blockDiff;
                return (b.logIndex ?? 0) - (a.logIndex ?? 0);
            });

            setEscrowHistory(merged);
        } catch (error: any) {
            console.error('Failed to fetch escrow history', error);
            setEscrowHistoryError(error?.message || '입출금 내역을 불러오지 못했습니다.');
        } finally {
            setEscrowHistoryLoading(false);
        }
    }, [contract, seller?.escrowWalletAddress, selectedChain, historyDays]);

    const [kycFile, setKycFile] = useState<File | null>(null);
    const [kycPreview, setKycPreview] = useState<string | null>(null);
    const [kycImageUrl, setKycImageUrl] = useState<string | null>(null);
    const [kycSubmitting, setKycSubmitting] = useState(false);

    //const [escrowWalletAddress, setEscrowWalletAddress] = useState('');




    const [loadingUserData, setLoadingUserData] = useState(false);
    useEffect(() => {
        const resetUserState = () => {
            setNickname('');
            setAvatar('/profile-default.png');
            setUserCode('');
            setSeller(null);
            setEditedNickname('');
            setAccountHolder('');
            setAccountNumber('');
            setContactMemo('');
            setKycImageUrl(null);
            setKycPreview(null);
            setKycFile(null);
        };

        const fetchData = async () => {
            if (walletAddressCandidates.length === 0) {
                setResolvedWalletAddress('');
                resetUserState();
                return;
            }

            setLoadingUserData(true);
            let matchedWalletAddress = '';
            let matchedResult: any = null;
            for (const candidateWalletAddress of walletAddressCandidates) {
                const response = await fetch('/api/user/getUser', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        storecode: storecode,
                        walletAddress: candidateWalletAddress,
                    }),
                });
                if (!response.ok) {
                    continue;
                }

                const data = await response.json().catch(() => ({}));
                if (data?.result) {
                    matchedWalletAddress = candidateWalletAddress;
                    matchedResult = data.result;
                    break;
                }
            }

            if (matchedResult) {
                setResolvedWalletAddress(matchedWalletAddress);
                setNickname(matchedResult.nickname || '');
                matchedResult.avatar && setAvatar(matchedResult.avatar);
                setUserCode(matchedResult.id || '');
                setSeller(matchedResult.seller);
                setKycImageUrl(matchedResult.seller?.kyc?.idImageUrl || null);
                setKycPreview(matchedResult.seller?.kyc?.idImageUrl || null);
            } else {
                setResolvedWalletAddress('');
                resetUserState();
            }
            setLoadingUserData(false);

        };

        fetchData();
    }, [walletAddressCandidates]);

    useEffect(() => {
        if (escrowHistoryOpen) {
            fetchEscrowHistory();
        }
    }, [escrowHistoryOpen, fetchEscrowHistory]);

    // Reset window to recent range when seller/chain change
    useEffect(() => {
        setHistoryDays(HISTORY_STEP_DAYS);
    }, [seller?.escrowWalletAddress, selectedChain]);






    const setUserData = async () => {

        if (!requesterWalletAddress) {
            toast.error('지갑 연결을 확인해주세요.');
            return;
        }

        // check nickname length and alphanumeric
        //if (nickname.length < 5 || nickname.length > 10) {

        if (editedNickname.length < 5 || editedNickname.length > 10) {

            toast.error(Nickname_should_be_5_10_characters);
            return;
        }
        
        ///if (!/^[a-z0-9]*$/.test(nickname)) {
        if (!/^[a-z0-9]*$/.test(editedNickname)) {
            alert(Nickname_should_be_alphanumeric_lowercase);
            return;
        }

        try {
            if (nicknameEdit) {

                const updateUserBody = await buildSignedRequestBody({
                    path: '/api/user/updateUser',
                    payload: {
                        storecode: storecode,
                        walletAddress: requesterWalletAddress,
                        nickname: editedNickname,
                    },
                });

                const response = await fetch("/api/user/updateUser", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(updateUserBody),
                });

                const data = await response.json();

                ///console.log("updateUser data", data);

                if (data.result) {

                    setUserCode(data.result.id);
                    setNickname(data.result.nickname);

                    setNicknameEdit(false);
                    setEditedNickname('');

                    toast.success('아이디이 저장되었습니다');

                } else {

                    toast.error('아이디 저장에 실패했습니다');
                }


            } else {
                const setUserVerifiedBody = await buildSignedRequestBody({
                    path: '/api/user/setUserVerified',
                    payload: {
                        lang: params.lang,
                        storecode: storecode,
                        walletAddress: requesterWalletAddress,
                        nickname: editedNickname,
                        mobile: phoneNumber,
                    },
                });

                const response = await fetch("/api/user/setUserVerified", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(setUserVerifiedBody),
                });

                const data = await response.json();

                console.log("data", data);

                if (data.result) {

                    setUserCode(data.result.id);
                    setNickname(data.result.nickname);

                    setNicknameEdit(false);
                    setEditedNickname('');

                    toast.success('아이디이 저장되었습니다');

                } else {
                    toast.error('아이디 저장에 실패했습니다');
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '아이디 저장에 실패했습니다.';
            toast.error(message);
        }


        

        
    }


    // 은행명, 계좌번호, 예금주
    const [bankName, setBankName] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [accountHolder, setAccountHolder] = useState("");
    const [contactMemo, setContactMemo] = useState("");
    const [useContactTransfer, setUseContactTransfer] = useState(false);

    const [applying, setApplying] = useState(false);

    // 기존 계좌 정보가 연락처송금으로 저장된 경우 UI 상태도 맞춰준다.
    useEffect(() => {
      if (seller?.bankInfo?.bankName === '연락처송금') {
        setUseContactTransfer(true);
        setBankName('');
        setAccountNumber('');
        setAccountHolder('');
        setContactMemo(seller?.bankInfo?.contactMemo || '');
      } else {
        setContactMemo(seller?.bankInfo?.contactMemo || '');
      }
    }, [seller?.bankInfo?.bankName]);


    const apply = async () => {
      if (applying) {
        return;
      }

      const selectedBankName = useContactTransfer ? '연락처송금' : bankName;
      const selectedAccountNumber = useContactTransfer ? '' : accountNumber;
      const selectedAccountHolder = useContactTransfer ? '' : accountHolder;
      const selectedContactMemo = useContactTransfer ? contactMemo : '';

      if (!selectedBankName || (!useContactTransfer && (!selectedAccountNumber || !selectedAccountHolder))) {
        toast.error('Please enter bank name, account number, and account holder');
        return;
      }
      if (!requesterWalletAddress) {
        toast.error('지갑 연결을 확인해주세요.');
        return;
      }

      setApplying(true);

      try {
        const nowIso = new Date().toISOString();
        const nextBankInfo = {
          ...(seller?.bankInfo || {}),
          bankName: selectedBankName,
          accountNumber: selectedAccountNumber,
          accountHolder: selectedAccountHolder,
          contactMemo: selectedContactMemo,
          status: 'approved',
          submittedAt: nowIso,
          reviewedAt: nowIso,
          approvedAt: nowIso,
          rejectionReason: '',
        };

        const nextSellerStatus = seller?.status === 'confirmed' ? 'confirmed' : 'pending';
        const updatedSeller = {
          ...(seller || {}),
          status: nextSellerStatus,
          bankInfo: nextBankInfo,
        };

        const updateSellerInfoBody = await buildSignedRequestBody({
          path: '/api/user/updateSellerInfo',
          payload: {
            storecode: storecode,
            walletAddress: requesterWalletAddress,
            sellerStatus: nextSellerStatus,
            bankName: selectedBankName,
            accountNumber: selectedAccountNumber,
            accountHolder: selectedAccountHolder,
            contactMemo: selectedContactMemo,
            seller: updatedSeller,
          },
        });
        const updateResponse = await fetch('/api/user/updateSellerInfo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateSellerInfoBody),
        });
        const updatePayload = await updateResponse.json().catch(() => ({}));
        const matchedCount = Number(updatePayload?.result?.matchedCount || 0);
        if (!updateResponse.ok || matchedCount <= 0) {
          throw new Error(updatePayload?.error || 'Failed to save bank info');
        }

        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storecode: storecode,
            walletAddress: requesterWalletAddress,
          }),
        });
        const data = await response.json();
        if (data.result) {
          setSeller(data.result.seller);
          setKycImageUrl(data.result.seller?.kyc?.idImageUrl || null);
          setKycPreview(data.result.seller?.kyc?.idImageUrl || null);
        }
      } catch (error) {
        toast.error('Failed to apply');
      }

      setApplying(false);
    };

    const handleKycFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      if (file.size / 1024 / 1024 > 10) {
        toast.error('파일 용량은 10MB 이하만 가능합니다.');
        return;
      }
      setKycFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setKycPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    };

    const submitKyc = async () => {
      if (!requesterWalletAddress || kycSubmitting) {
        return;
      }
      if (!kycFile && !kycImageUrl) {
        toast.error('신분증 사진을 업로드해 주세요.');
        return;
      }
      setKycSubmitting(true);
      try {
        let uploadedUrl = kycImageUrl;
        if (kycFile) {
          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'content-type': kycFile.type || 'application/octet-stream',
            },
            body: kycFile,
          });
          if (!uploadRes.ok) {
            throw new Error('Upload failed');
          }
          const uploadData = await uploadRes.json();
          uploadedUrl = uploadData?.url || uploadData?.pathname || '';
        }

        if (!uploadedUrl) {
          throw new Error('Upload failed');
        }

        const nextSellerStatus = seller?.status === 'confirmed' ? 'confirmed' : 'pending';
        const updatedSeller = {
          ...(seller || {}),
          status: nextSellerStatus,
          kyc: {
            ...(seller?.kyc || {}),
            status: 'pending',
            idImageUrl: uploadedUrl,
            submittedAt: new Date().toISOString(),
          },
        };

        const updateSellerInfoBody = await buildSignedRequestBody({
          path: '/api/user/updateSellerInfo',
          payload: {
            storecode: storecode,
            walletAddress: requesterWalletAddress,
            sellerStatus: nextSellerStatus,
            bankName: seller?.bankInfo?.bankName || (useContactTransfer ? '연락처송금' : bankName) || '',
            accountNumber: seller?.bankInfo?.accountNumber || (useContactTransfer ? '' : accountNumber) || '',
            accountHolder: seller?.bankInfo?.accountHolder || (useContactTransfer ? '' : accountHolder) || '',
            contactMemo: seller?.bankInfo?.contactMemo || (useContactTransfer ? contactMemo : '') || '',
            seller: updatedSeller,
          },
        });
        await fetch('/api/user/updateSellerInfo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateSellerInfoBody),
        });

        const response = await fetch("/api/user/getUser", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            storecode: storecode,
            walletAddress: requesterWalletAddress,
          }),
        });
        const data = await response.json();
        if (data.result) {
          setSeller(data.result.seller);
          setKycImageUrl(data.result.seller?.kyc?.idImageUrl || null);
          setKycPreview(data.result.seller?.kyc?.idImageUrl || null);
          setKycFile(null);
        }
      } catch (error) {
        console.error('KYC submit failed', error);
        toast.error('심사 신청에 실패했습니다.');
      }
      setKycSubmitting(false);
    };
  



    // sellerEnabled
    // functon to toggle seller enabled
    const toggleSellerEnabled = async () => {
        if (!seller || !requesterWalletAddress) return;
        const newEnabled = !seller.enabled;
        try {
            const updateSellerEnabledBody = await buildSignedRequestBody({
                path: '/api/user/updateSellerEnabled',
                payload: {
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                    sellerEnabled: newEnabled,
                },
            });
            await fetch('/api/user/updateSellerEnabled', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateSellerEnabledBody),
            });
            setSeller({
                ...seller,
                enabled: newEnabled,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : '판매 가능 상태 변경에 실패했습니다.';
            toast.error(message);
        }
    };


    // apply seller
    const [applyingSeller, setApplyingSeller] = useState(false);
    const applySeller = async () => {
        if (applyingSeller || !requesterWalletAddress) return;
        setApplyingSeller(true);
        try {
            const applySellerBody = await buildSignedRequestBody({
                path: '/api/user/applySeller',
                payload: {
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                },
            });
            await fetch('/api/user/applySeller', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(applySellerBody),
            });
            // reload seller data
            const response = await fetch("/api/user/getUser", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                }),
            });
            const data = await response.json();
            if (data.result) {
                setSeller(data.result.seller);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '판매자 신청에 실패했습니다.';
            toast.error(message);
        } finally {
            setApplyingSeller(false);
        }
    };



    // check box edit seller
    const [editSeller, setEditSeller] = useState(false);


    const [otp, setOtp] = useState('');

    ///const [verifiedOtp, setVerifiedOtp] = useState(false);
    const [verifiedOtp, setVerifiedOtp] = useState(true);
  
    const [isSendedOtp, setIsSendedOtp] = useState(false);
  
  
  
    const [isSendingOtp, setIsSendingOtp] = useState(false);
  
    const [isVerifingOtp, setIsVerifingOtp] = useState(false);
  
    
  
    const sendOtp = async () => {
  
      setIsSendingOtp(true);
        
      const response = await fetch('/api/transaction/setOtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lang: params.lang,
          chain: storecode,
          walletAddress: requesterWalletAddress || address,
          mobile: phoneNumber,
        }),
      });
  
      const data = await response.json();
  
      //console.log("data", data);
  
      if (data.result) {
        setIsSendedOtp(true);
        toast.success('OTP sent successfully');
      } else {
        toast.error('Failed to send OTP');
      }
  
      setIsSendingOtp(false);
  
    };
  
    const verifyOtp = async () => {
  
      setIsVerifingOtp(true);
        
      /*
      const response = await fetch('/api/transaction/verifyOtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lang: params.lang,
          chain: storecode,
          walletAddress: address,
          otp: otp,
        }),
      });
  
      const data = await response.json();
  
      //console.log("data", data);
  
      if (data.status === 'success') {
        setVerifiedOtp(true);
        toast.success('OTP verified successfully');
      } else {
        toast.error('Failed to verify OTP');
      }
        */
    
      setVerifiedOtp(true);
      toast.success('OTP verified successfully');
  
      setIsVerifingOtp(false);
    
    }

    const bankInfoStatus =
      seller?.bankInfo?.status ||
      (seller?.bankInfo?.accountNumber
        ? seller?.status === 'confirmed'
          ? 'approved'
          : 'pending'
        : 'none');
    const bankInfoStatusLabel =
      bankInfoStatus === 'approved'
        ? '승인완료'
        : bankInfoStatus === 'rejected'
        ? '거절'
        : bankInfoStatus === 'pending'
        ? '심사중'
        : '미제출';

    const kycStatus = seller?.kyc?.status || (kycImageUrl ? 'pending' : 'none');
    const kycStatusLabel =
      kycStatus === 'approved'
        ? '승인완료'
        : kycStatus === 'rejected'
        ? '거절'
        : kycStatus === 'pending'
        ? '심사중'
        : '미제출';
  







    // get escrow wallet address and balance
    
    const [escrowBalance, setEscrowBalance] = useState(0);
    const [inTradeAmount, setInTradeAmount] = useState<number | null>(null);
    const [inTradeLoading, setInTradeLoading] = useState(false);
    const [inTradeError, setInTradeError] = useState<string | null>(null);

    const tokenDecimals = selectedChain === 'bsc' ? 18 : 6;

    const fetchEscrowBalance = useCallback(async () => {
        if (!seller?.escrowWalletAddress || seller?.escrowWalletAddress === '') return;
        const result = await balanceOf({
            contract,
            address: seller?.escrowWalletAddress,
        });
        setEscrowBalance(Number(result) / 10 ** tokenDecimals);
    }, [contract, seller?.escrowWalletAddress, tokenDecimals]);

    const fetchInTradeAmount = useCallback(async () => {
        if (!seller?.escrowWalletAddress || !requesterWalletAddress) return;
        setInTradeLoading(true);
        setInTradeError(null);
        try {
            const requestBody = await buildSignedRequestBody({
                path: '/api/order/getEscrowInUseAmount',
                payload: {
                    walletAddress: requesterWalletAddress,
                    escrowWalletAddress: seller.escrowWalletAddress,
                    storecode,
                },
            });
            const res = await fetch('/api/order/getEscrowInUseAmount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            if (!res.ok) throw new Error(`status ${res.status}`);
            const data = await res.json();
            const value = data?.result?.inUseAmount ?? 0;
            setInTradeAmount(Number(value));
        } catch (err: any) {
            console.error('Failed to fetch in-trade amount', err);
            setInTradeAmount(null);
            setInTradeError('거래중인 수량이 없습니다.');
        } finally {
            setInTradeLoading(false);
        }
    }, [buildSignedRequestBody, requesterWalletAddress, seller?.escrowWalletAddress]);

    const fetchUserBalance = useCallback(async () => {
        if (!address) return;
        setUserBalanceLoading(true);
        try {
            const result = await balanceOf({
                contract,
                address,
            });
            setUserBalance(Number(result) / 10 ** tokenDecimals);
        } catch (err) {
            console.error('Failed to fetch user balance', err);
            setUserBalance(null);
        } finally {
            setUserBalanceLoading(false);
        }
    }, [address, contract, tokenDecimals]);

    useEffect(() => {
        fetchEscrowBalance();
        fetchInTradeAmount();
        const interval = setInterval(fetchEscrowBalance, 5000);
        return () => clearInterval(interval);
    }, [fetchEscrowBalance, fetchInTradeAmount]);

    useEffect(() => {
        if (chargeModalOpen) {
            fetchUserBalance();
        }
    }, [chargeModalOpen, fetchUserBalance]);
    useEffect(() => {
        if (withdrawModalOpen) {
            fetchEscrowBalance();
            fetchInTradeAmount();
        }
    }, [withdrawModalOpen, fetchEscrowBalance, fetchInTradeAmount]);




    // transfer escrow balance to seller wallet address

    const [amountOfEscrowBalance, setAmountOfEscrowBalance] = useState("");

    const [transferingEscrowBalance, setTransferingEscrowBalance] = useState(false);

    const openChargeModal = async () => {
        setChargeModalOpen(true);
        await fetchUserBalance();
    };

    const chargeEscrow = async () => {
        if (!seller?.escrowWalletAddress) {
            toast.error('에스크로 지갑이 없습니다.');
            return;
        }
        if (!address) {
            toast.error('지갑을 먼저 연결해주세요.');
            return;
        }
        if (!activeAccount) {
            toast.error('활성화된 지갑 계정을 확인하세요.');
            return;
        }
        const amt = Number(chargeAmount);
        if (!chargeAmount || isNaN(amt) || amt <= 0) {
            toast.error('충전할 USDT 수량을 입력하세요.');
            return;
        }
        if (userBalance !== null && amt > userBalance + 0.000001) {
            toast.error('잔액이 부족합니다.');
            return;
        }

        setCharging(true);
        try {
            const transferTx = transfer({
                contract,
                to: seller.escrowWalletAddress,
                amount: chargeAmount,
            });
            await sendAndConfirmTransaction({
                transaction: transferTx,
                account: activeAccount,
            });
            toast.success('에스크로 지갑으로 충전 완료');
            setChargeModalOpen(false);
            setChargeAmount('');
            await Promise.all([fetchEscrowBalance(), fetchUserBalance()]);
        } catch (error) {
            console.error('Charge escrow failed', error);
            toast.error('충전에 실패했습니다.');
        } finally {
            setCharging(false);
        }
    };


    const transferEscrowBalance = async () => {

        if (transferingEscrowBalance) {
        return;
        }
        if (!requesterWalletAddress) {
        toast.error('지갑 연결을 확인해주세요.');
        return;
        }

        setTransferingEscrowBalance(true);

        try {

        const response = await fetch('/api/order/transferEscrowBalanceToSeller', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({
            lang: params.lang,
            storecode: storecode,
            walletAddress: requesterWalletAddress,
            amount: amountOfEscrowBalance,
            ///escrowWalletAddress: escrowWalletAddress,
            //isSmartAccount: activeWallet === inAppConnectWallet ? false : true,
            isSmartAccount: false,
            })
        });

        const data = await response.json();

        //console.log('data', data);

        if (data.result) {

            setAmountOfEscrowBalance("");

            toast.success('Escrow balance has been transfered to seller wallet address');

        }

        } catch (error) {
        console.error('Error:', error);
        toast.error('Transfer escrow balance has been failed');
        }

        setTransferingEscrowBalance(false);

    }




    // user.seller usdtToKrwRate rate update
    const [usdtToKrwRate, setUsdtToKrwRate] = useState(0);
    const [updatingUsdtToKrw, setUpdatingUsdtToKrw] = useState(false);
    const updateUsdtToKrwRate = async () => {
        if (!seller || !requesterWalletAddress) return;
        setUpdatingUsdtToKrw(true);
        try {
            const updateRateBody = await buildSignedRequestBody({
                path: '/api/user/updateSellerUsdtToKrwRate',
                payload: {
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                    usdtToKrwRate: usdtToKrwRate,
                },
            });
            await fetch('/api/user/updateSellerUsdtToKrwRate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateRateBody),
            });
            setSeller({
                ...seller,
                usdtToKrwRate: usdtToKrwRate,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'USDT 환율 수정에 실패했습니다.';
            toast.error(message);
        } finally {
            setUpdatingUsdtToKrw(false);
        }
    };


    // toggleAutoProcessDeposit
    const [togglingAutoProcessDeposit, setTogglingAutoProcessDeposit] = useState(false);
    const toggleAutoProcessDeposit = async () => {
        if (!seller || !requesterWalletAddress) return;
        const newAutoProcessDeposit = !seller.autoProcessDeposit;
        setTogglingAutoProcessDeposit(true);
        try {
            const toggleAutoDepositBody = await buildSignedRequestBody({
                path: '/api/user/toggleAutoProcessDeposit',
                payload: {
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                    autoProcessDeposit: newAutoProcessDeposit,
                },
            });
            await fetch('/api/user/toggleAutoProcessDeposit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(toggleAutoDepositBody),
            });
            setSeller({
                ...seller,
                autoProcessDeposit: newAutoProcessDeposit,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : '자동 입금 설정 변경에 실패했습니다.';
            toast.error(message);
        } finally {
            setTogglingAutoProcessDeposit(false);
        }
    };

    // setPriceSettingMethod
    const [settingPriceSettingMethod, setSettingPriceSettingMethod] = useState(false);
    const [priceSettingMethod, setPriceSettingMethod] = useState('fixed');
    const setPriceSettingMethodFunc = async (method: string) => {
        if (!seller || !requesterWalletAddress) return;
        setSettingPriceSettingMethod(true);
        try {
            const setPriceSettingMethodBody = await buildSignedRequestBody({
                path: '/api/user/setPriceSettingMethod',
                payload: {
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                    priceSettingMethod: method,
                },
            });
            await fetch('/api/user/setPriceSettingMethod', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(setPriceSettingMethodBody),
            });
            setSeller({
                ...seller,
                priceSettingMethod: method,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : '가격 설정 방식 변경에 실패했습니다.';
            toast.error(message);
        } finally {
            setSettingPriceSettingMethod(false);
        }
    };

    // setMarket
    // upbit, bithumb, korbit
    const [settingMarket, setSettingMarket] = useState(false);
    const [market, setMarket] = useState('upbit');
    const setMarketFunc = async (market: string) => {
        if (!seller || !requesterWalletAddress) return;
        setSettingMarket(true);
        try {
            const setMarketBody = await buildSignedRequestBody({
                path: '/api/user/setMarket',
                payload: {
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                    market: market,
                },
            });
            await fetch('/api/user/setMarket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(setMarketBody),
            });
            setSeller({
                ...seller,
                market: market,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : '마켓 설정 변경에 실패했습니다.';
            toast.error(message);
        } finally {
            setSettingMarket(false);
        }
    };


    // updatingPromotionText
    const [promotionText, setPromotionText] = useState('');
    const [updatingPromotionText, setUpdatingPromotionText] = useState(false);
    const [generatingPromotionText, setGeneratingPromotionText] = useState(false);
    const [promotionGenerateError, setPromotionGenerateError] = useState('');
    const updatePromotionText = async () => {
        if (!seller || !requesterWalletAddress) return;
        setUpdatingPromotionText(true);
        try {
            const updatePromotionTextBody = await buildSignedRequestBody({
                path: '/api/user/updatePromotionText',
                payload: {
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                    promotionText: promotionText,
                },
            });
            await fetch('/api/user/updatePromotionText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatePromotionTextBody),
            });
            setSeller({
                ...seller,
                promotionText: promotionText,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : '홍보 문구 저장에 실패했습니다.';
            toast.error(message);
        } finally {
            setUpdatingPromotionText(false);
        }
    };

    const generatePromotionText = async () => {
        if (!seller || !requesterWalletAddress || generatingPromotionText) return;
        setPromotionGenerateError('');
        setGeneratingPromotionText(true);
        try {
            const requestBody = await buildSignedRequestBody({
                path: '/api/user/generatePromotionText',
                payload: {
                    storecode: storecode,
                    walletAddress: requesterWalletAddress,
                    market: seller?.market,
                    priceSettingMethod: seller?.priceSettingMethod,
                    price: seller?.price,
                },
            });
            const response = await fetch('/api/user/generatePromotionText', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.text) {
                throw new Error(data?.error || '자동 생성에 실패했습니다.');
            }
            setPromotionText(data.text);
            toast.success('판매 홍보 문구가 자동 생성되었습니다.');
        } catch (error) {
            const message = error instanceof Error ? error.message : '자동 생성에 실패했습니다.';
            setPromotionGenerateError(message);
            toast.error('자동 생성에 실패했습니다.');
        } finally {
            setGeneratingPromotionText(false);
        }
    };



    // call api /api/escrow/clearSellerEscrowWallet
    // 판매자 에스크로 지갑 잔고 회수하기
    const [clearingSellerEscrowWalletBalance, setClearingSellerEscrowWalletBalance] = useState(false);
    const clearSellerEscrowWalletBalance = async () => {
        if (clearingSellerEscrowWalletBalance) return;
        if (!requesterWalletAddress) {
            throw new Error('지갑 연결을 확인해주세요.');
        }
        setClearingSellerEscrowWalletBalance(true);
        try {
            const safeSelectedChain =
                selectedChain === 'ethereum'
                || selectedChain === 'polygon'
                || selectedChain === 'arbitrum'
                || selectedChain === 'bsc'
                    ? selectedChain
                    : 'polygon';
            const requestBody = await buildSignedRequestBody({
                path: '/api/escrow/clearSellerEscrowWallet',
                payload: {
                    selectedChain: safeSelectedChain,
                    walletAddress: requesterWalletAddress,
                    storecode,
                },
            });
            const response = await fetch('/api/escrow/clearSellerEscrowWallet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                const detail = String(payload?.detail || '').trim();
                const message = String(payload?.error || '에스크로 잔고 회수 요청에 실패했습니다.');
                throw new Error(detail ? `${message} (${detail})` : message);
            }
            toast.success('판매자 에스크로 지갑 잔고 회수 요청이 완료되었습니다.');
        } finally {
            setClearingSellerEscrowWalletBalance(false);
        }
    };




    return (

        <main className="w-full max-w-screen-sm lg:max-w-7xl px-4 lg:px-5 pb-28 pt-4 lg:pb-10 min-h-[100vh] flex items-start justify-center mx-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">

            <AutoConnect client={client} wallets={[wallet]} />

            <div className="py-0 w-full">
        

                {/*
                {storecode && (
                    <div className="w-full flex flex-row items-center justify-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur mb-4">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {storecode}
                        </span>
                    </div>
                )}
                */}
        
                <div className="w-full flex flex-row gap-2 items-center justify-start mb-2"
                >
                    {/* go back button */}
                    <div className="w-full flex justify-start items-center gap-2">
                        <button
                            onClick={() => window.history.back()}
                            className="flex items-center justify-center rounded-full border border-slate-200/70 bg-white/90 p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                            <Image
                                src="/icon-back.png"
                                alt="Back"
                                width={20}
                                height={20}
                                className="rounded-full"
                            />
                        </button>
                        {/* title */}
                        <span className="text-sm text-slate-600 font-semibold">
                            돌아가기
                        </span>
                    </div>

                </div>



                {/* select chain(ethereum, polygon, arbitrum, bsc) */}
                {/* radio buttons */}
                {/*
                {address && (

                    <div className='w-full flex flex-col items-center justify-center mb-4'>

                        <span className="text-sm text-slate-600 font-semibold mb-2">
                            조회할 USDT 체인을 선택하세요.
                        </span>

                        <div className="w-full flex flex-row items-center justify-center gap-4 mb-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="chain"
                                    value="ethereum"
                                    checked={selectedChain === 'ethereum'}
                                    onChange={() => setSelectedChain('ethereum')}
                                />
                                <span className="text-sm text-slate-700 font-semibold">Ethereum</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="chain"
                                    value="polygon"
                                    checked={selectedChain === 'polygon'}
                                    onChange={() => setSelectedChain('polygon')}
                                />
                                <span className="text-sm text-slate-700 font-semibold">Polygon</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="chain"
                                    value="arbitrum"
                                    checked={selectedChain === 'arbitrum'}
                                    onChange={() => setSelectedChain('arbitrum')}
                                />
                                <span className="text-sm text-slate-700 font-semibold">Arbitrum</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="chain"
                                    value="bsc"
                                    checked={selectedChain === 'bsc'}
                                    onChange={() => setSelectedChain('bsc')}
                                />
                                <span className="text-sm text-slate-700 font-semibold">BSC</span>
                            </label>
                        </div>
                    </div>

                )}
                */}



                {address && (
                    <div className="mb-2" />
                )}


                {!address ? (
                    <div className="w-full">
                        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 text-center shadow-sm">
                            <p className="text-base font-semibold text-slate-600">
                                로그인해서 지갑을 연결하세요.
                            </p>
                            {connectError && (
                                <p className="mt-2 text-xs font-semibold text-rose-600">
                                    {connectError}
                                </p>
                            )}
                            <button
                                type="button"
                                disabled={isConnecting}
                                onClick={async () => {
                                    try {
                                        setConnectError(null);
                                        await openConnectModal({
                                            client,
                                            wallets: [wallet],
                                            chain: connectChain,
                                            ...WALLET_CONNECT_OPTIONS,
                                            welcomeScreen: {
                                                ...WALLET_CONNECT_WELCOME_SCREEN,
                                                subtitle: "판매자 설정을 위해 지갑을 연결하세요.",
                                            },
                                        });
                                    } catch (error) {
                                        const message =
                                            error instanceof Error ? error.message : '지갑 연결에 실패했습니다.';
                                        setConnectError(message);
                                    }
                                }}
                                className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-700"
                            >
                                {isConnecting ? '연결 중...' : '웹3 로그인'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full flex flex-col gap-4 lg:gap-4">

                        {loadingUserData && (
                            <div className="text-sm text-slate-500">Loading user data...</div>
                        )}

                        {!loadingUserData && !nickname && (
                            <div className='w-full flex flex-col gap-2 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-6 lg:p-5 shadow-sm'>

                                <span className="text-base font-semibold text-slate-800">
                                    회원이 아닙니다.
                                </span>

                                <button
                                    onClick={() => {
                                        router.push('/' + params.lang + '/p2p/profile-settings');
                                    }}
                                    className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                                >
                                    회원가입하기
                                </button>

                            </div>
                        )}

                        {!loadingUserData && nickname && !seller && (
                            <div className='w-full flex flex-col gap-3 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-6 lg:p-5 shadow-sm'>

                                {/* nickname */}
                                <div className='w-full flex flex-row gap-2 items-center justify-between'>
                                    <div className="flex flex-row items-center gap-2">
                                        {/* dot */}
                                        <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                        <span className="text-sm font-semibold text-slate-600">
                                            회원아이디
                                        </span>
                                    </div>
                                    <span className="text-2xl font-semibold text-emerald-700">
                                        {nickname}
                                    </span>
                                </div>

                                <span className="inline-flex items-center justify-center rounded-full border border-amber-200/80 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700 shadow-sm">
                                    판매불가능상태
                                </span>

                                <button
                                    onClick={() => {
                                        applySeller();
                                    }}
                                    className={`
                                        ${applyingSeller ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-500'}
                                        px-5 py-2 rounded-full text-sm font-semibold shadow-sm transition
                                    `}
                                    disabled={applyingSeller}
                                >
                                    {applyingSeller ? Applying + '...' : Apply}
                                </button>

                            </div>
                        )}


                        {!loadingUserData && seller && (
                            <div className="w-full grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-3">
                            <div className='w-full flex flex-col gap-4 lg:gap-2 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/95 p-5 lg:p-3 shadow-sm lg:col-span-12'>

                                {/* image and title */}
                                <div className='w-full flex flex-row gap-2 items-center justify-start'>
                                    <Image
                                        src="/icon-seller.png"
                                        alt="Seller"
                                        width={50}
                                        height={50}
                                        className='w-10 h-10'
                                    />
                                    <span className="text-xl font-semibold text-slate-900">
                                        {Seller} 설정
                                    </span>
                                </div>


                                {/* nickname */}
                                <div className='w-full flex flex-row gap-2 items-center justify-between'>
                                    <div className="flex flex-row items-center gap-2">
                                        {/* dot */}
                                        <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                        <span className="text-sm font-semibold text-slate-600">
                                            회원아이디
                                        </span>
                                    </div>
                                    <span className="text-2xl font-semibold text-emerald-700">
                                        {nickname}
                                    </span>
                                </div>

                                {/* seller?.status */}
                                {/* status: pending, confirmed */}
                                <div className="w-full grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
                                    <div className='w-full flex flex-row gap-2 items-center justify-between border-t border-slate-200/80 pt-4 lg:pt-3'>
                                        <div className="flex flex-row items-center gap-2">
                                            {/* dot */}
                                            <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                            <span className="text-sm font-semibold text-slate-600">
                                                판매자 상태
                                            </span>
                                        </div>
                                        {seller?.status === 'confirmed' ? (
                                            <span className="inline-flex min-w-[150px] items-center justify-center rounded-full border border-emerald-200/80 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm">
                                                판매가능상태
                                            </span>
                                        ) : (
                                            <span className="inline-flex min-w-[150px] items-center justify-center rounded-full border border-amber-200/80 bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-700 shadow-sm">
                                                판매불가능상태
                                            </span>
                                        )}
                                    </div>

                                    {/* seller?.enabled */}
                                    {/* 판매시작 여부 */}
                                    {/* toggle seller enabled */}
                                    <div className='w-full flex flex-row gap-2 items-center justify-between border-t border-slate-200/80 pt-4 lg:pt-3'>
                                        <div className="flex flex-row items-center gap-2">
                                            {/* dot */}
                                            <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                            <span className="text-sm font-semibold text-slate-600">
                                                판매자 활동 상태
                                            </span>
                                        </div>
                                        {seller?.enabled ? (
                                            <button
                                                onClick={toggleSellerEnabled}
                                                className="flex flex-row items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-full shadow-sm transition hover:bg-emerald-500"
                                            >
                                                <span className="text-sm font-semibold">
                                                    판매중
                                                </span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={toggleSellerEnabled}
                                                className="flex flex-row items-center gap-2 bg-slate-200 text-slate-600 px-4 py-1.5 rounded-full shadow-sm transition hover:bg-slate-300"
                                            >
                                                <span className="text-sm font-semibold">
                                                    판매중지
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                


                                <div className='mt-3 lg:mt-2 w-full rounded-2xl border border-slate-200/80 bg-white/95 p-5 lg:p-3 shadow-sm'>
                                    <div className="flex w-full flex-row items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                                                <Image
                                                    src="/icon-bank-check.png"
                                                    alt="Bank"
                                                    width={24}
                                                    height={24}
                                                    className="h-6 w-6"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-slate-900">입금받을 계좌 정보</span>
                                                <span className="text-xs text-slate-500">계좌 정보 신청 시 즉시 심사완료 처리됩니다.</span>
                                            </div>
                                        </div>
                                        <span
                                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                                bankInfoStatus === 'approved'
                                                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                                    : bankInfoStatus === 'rejected'
                                                    ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                                                    : bankInfoStatus === 'pending'
                                                    ? 'border-amber-200/80 bg-amber-50 text-amber-700'
                                                    : 'border-slate-200/80 bg-slate-50 text-slate-600'
                                            }`}
                                        >
                                            {bankInfoStatusLabel}
                                        </span>
                                    </div>

                                    <div className="mt-3 flex flex-col gap-1 text-sm text-slate-600">
                                        {seller?.bankInfo?.bankName ? (
                                          seller?.bankInfo?.bankName === '연락처송금' ? (
                                            <>
                                              <span className="font-semibold text-emerald-700">입금 방법: 연락처송금</span>
                                              {seller?.bankInfo?.contactMemo && (
                                                <span className="text-xs text-slate-600 mt-0.5">
                                                  내용: {seller.bankInfo.contactMemo}
                                                </span>
                                              )}
                                            </>
                                          ) : (
                                            <>
                                              <span>은행: {seller?.bankInfo?.bankName}</span>
                                              <span>계좌번호: {seller?.bankInfo?.accountNumber}</span>
                                              <span>예금주: {seller?.bankInfo?.accountHolder}</span>
                                            </>
                                          )
                                        ) : (
                                          <span>등록된 계좌 정보가 없습니다.</span>
                                        )}
                                        {bankInfoStatus === 'approved' && (
                                            <span className="text-xs text-emerald-600">
                                                승인된 계좌 정보입니다. 승인 시간: {seller?.bankInfo?.reviewedAt ? new Date(seller.bankInfo.reviewedAt).toLocaleString() : '-'}
                                            </span>
                                        )}
                                        {bankInfoStatus === 'pending' && (
                                            <span className="text-xs text-amber-600">
                                                신청 시간: {seller?.bankInfo?.submittedAt ? new Date(seller.bankInfo.submittedAt).toLocaleString() : '-'}
                                            </span>
                                        )}
                                        {bankInfoStatus === 'rejected' && seller?.bankInfo?.rejectionReason && (
                                            <span className="text-xs text-rose-600">거절 사유: {seller.bankInfo.rejectionReason}</span>
                                        )}
                                    </div>
                                </div>


                                {/* 입금 자동 처리 시작 / 중지 토글 버튼 */}
                                {/*
                                <div className='w-full flex flex-row gap-2 items-center justify-between
                                    border-t border-gray-300 pt-4'>
                                    <div className="flex flex-row items-center gap-2">
                                        <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                                        <span className="text-lg">
                                            입금 자동 처리 상태
                                        </span>
                                    </div>
                                    {seller?.autoProcessDeposit ? (
                                        <button
                                            onClick={toggleAutoProcessDeposit}
                                            className={`
                                                ${togglingAutoProcessDeposit ? 'bg-gray-300 text-gray-400' : 'bg-green-500 text-zinc-100'}
                                                flex flex-row items-center gap-2 p-2 rounded-lg
                                            `}
                                            disabled={togglingAutoProcessDeposit}
                                        >
                                            <span className="text-lg font-semibold">
                                                자동 처리 중
                                            </span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={toggleAutoProcessDeposit}
                                            className={`
                                                ${togglingAutoProcessDeposit ? 'bg-gray-300 text-gray-400' : 'bg-gray-300 text-gray-600'}
                                                flex flex-row items-center gap-2 p-2 rounded-lg
                                            `}
                                            disabled={togglingAutoProcessDeposit}
                                        >
                                            <span className="text-lg font-semibold">
                                                자동 처리 중지
                                            </span>
                                        </button>
                                    )}
                                </div>
                                */}

                            </div>

                            <div className='mt-3 lg:mt-0 w-full flex flex-col gap-4 lg:gap-2 items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 lg:p-3 lg:col-span-7'>
                                <div className='w-full flex flex-row gap-2 items-center justify-between'>
                                    <div className="flex flex-row items-center gap-2">
                                        <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                        <span className="text-sm font-semibold text-slate-600">
                                            입금받을 계좌 정보 신청
                                        </span>
                                    </div>

                                    {bankInfoStatus === 'pending' ? (
                                        <div className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm">
                                            심사중
                                        </div>
                                    ) : applying ? (
                                        <div className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
                                            {Applying}...
                                        </div>
                                    ) : (
                                        <button
                                            disabled={applying || !verifiedOtp}
                                            onClick={() => {
                                                apply();
                                            }}
                                            className={`
                                                ${!verifiedOtp ? 'bg-slate-200 text-slate-400'
                                                : 'bg-emerald-600 text-white hover:bg-emerald-500'}
                                                px-4 py-2 rounded-full text-sm font-semibold shadow-sm transition
                                            `}
                                        >
                                            {Apply}
                                        </button>
                                    )}
                                </div>

                                {/* 은행명, 계좌번호, 예금주 */}
                                <div className='flex flex-col gap-2 items-start justify-between w-full'>
                                    <div className="flex w-full flex-row items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm">
                                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 accent-emerald-600"
                                                checked={useContactTransfer}
                                                disabled={applying || bankInfoStatus === 'pending'}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setUseContactTransfer(checked);
                                                    if (checked) {
                                                        setBankName('');
                                                        setAccountNumber('');
                                                        setAccountHolder('');
                                                        setContactMemo(seller?.bankInfo?.contactMemo || '');
                                                    }
                                                }}
                                            />
                                            연락처송금으로 받기
                                        </label>
                                        <span className="text-xs text-slate-500">
                                            연락처송금을 선택하면 은행/계좌 정보 없이 송금 요청을 받습니다.
                                        </span>
                                    </div>
                                    {useContactTransfer && (
                                        <div className="w-full rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm shadow-sm">
                                            <label className="text-xs font-semibold text-emerald-700">내용</label>
                                            <textarea
                                                disabled={applying || bankInfoStatus === 'pending'}
                                                className="mt-1 w-full resize-none rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                                rows={2}
                                                placeholder="연락처송금 안내 메시지를 입력하세요."
                                                value={contactMemo}
                                                onChange={(e) => setContactMemo(e.target.value)}
                                                maxLength={200}
                                            />
                                            <div className="mt-1 text-right text-[11px] text-emerald-600">
                                                {contactMemo.length}/200
                                            </div>
                                        </div>
                                    )}
                                    <select
                                        disabled={!address || bankInfoStatus === 'pending' || applying || useContactTransfer}
                                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm
                                        focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                        value={useContactTransfer ? '' : bankName}
                                        onChange={(e) => {
                                            setBankName(e.target.value);
                                        }}
                                    >
                                        <option value="" selected={bankName === ""}>
                                            은행선택
                                        </option>
                                        <option value="카카오뱅크" selected={bankName === "카카오뱅크"}>
                                            카카오뱅크
                                        </option>
                                        <option value="케이뱅크" selected={bankName === "케이뱅크"}>
                                            케이뱅크
                                        </option>
                                        <option value="토스뱅크" selected={bankName === "토스뱅크"}>
                                            토스뱅크
                                        </option>
                                        <option value="국민은행" selected={bankName === "국민은행"}>
                                            국민은행
                                        </option>
                                        <option value="우리은행" selected={bankName === "우리은행"}>
                                            우리은행
                                        </option>
                                        <option value="신한은행" selected={bankName === "신한은행"}>
                                            신한은행
                                        </option>
                                        <option value="농협" selected={bankName === "농협"}>
                                            농협
                                        </option>
                                        <option value="기업은행" selected={bankName === "기업은행"}>
                                            기업은행
                                        </option>
                                        <option value="하나은행" selected={bankName === "하나은행"}>
                                            하나은행
                                        </option>
                                        <option value="외환은행" selected={bankName === "외환은행"}>
                                            외환은행
                                        </option>
                                        <option value="부산은행" selected={bankName === "부산은행"}>
                                            부산은행
                                        </option>
                                        <option value="대구은행" selected={bankName === "대구은행"}>
                                            대구은행
                                        </option>
                                        <option value="전북은행" selected={bankName === "전북은행"}>
                                            전북은행
                                        </option>
                                        <option value="경북은행" selected={bankName === "경북은행"}>
                                            경북은행
                                        </option>
                                        <option value="광주은행" selected={bankName === "광주은행"}>
                                            광주은행
                                        </option>
                                        <option value="수협" selected={bankName === "수협"}>
                                            수협
                                        </option>
                                        <option value="씨티은행" selected={bankName === "씨티은행"}>
                                            씨티은행
                                        </option>
                                        <option value="대신은행" selected={bankName === "대신은행"}>
                                            대신은행
                                        </option>
                                        <option value="동양종합금융" selected={bankName === "동양종합금융"}>
                                            동양종합금융
                                        </option>
                                        <option value="SC제일은행" selected={bankName === "SC제일은행"}>
                                            SC제일은행
                                        </option>
                                        <option value="한국씨티은행" selected={bankName === "한국씨티은행"}>
                                            한국씨티은행
                                        </option>
                                        <option value="산업은행" selected={bankName === "산업은행"}>
                                            산업은행
                                        </option>
                                        <option value="JT친애저축은행" selected={bankName === "JT친애저축은행"}>
                                            JT친애저축은행
                                        </option>
                                    </select>

                                    <input 
                                        disabled={applying || bankInfoStatus === 'pending' || useContactTransfer}
                                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                        placeholder={Enter_your_account_number}
                                        value={accountNumber}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        onChange={(e) => {
                                            e.target.value = e.target.value.replace(/[^0-9]/g, '');
                                            setAccountNumber(e.target.value);
                                        }}
                                    />
                                    <input 
                                        disabled={applying || bankInfoStatus === 'pending' || useContactTransfer}
                                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                        placeholder={Enter_your_account_holder}
                                        value={accountHolder}
                                        type='text'
                                        onChange={(e) => {
                                            setAccountHolder(e.target.value);
                                        }}
                                    />
                                    {useContactTransfer && (
                                        <p className="text-xs text-emerald-600 font-semibold">
                                            계좌 정보 없이 연락처송금으로 신청합니다.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 lg:mt-0 w-full rounded-2xl border border-slate-200/80 bg-white/95 p-5 lg:p-3 shadow-sm lg:col-span-5">
                                <div className="flex w-full flex-row items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                                            <Image
                                                src="/icon-kyc.png"
                                                alt="KYC"
                                                width={24}
                                                height={24}
                                                className="h-6 w-6"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-slate-900">신분증 인증 (KYC)</span>
                                            <span className="text-xs text-slate-500">주민증/운전면허증/여권 중 1장 업로드</span>
                                        </div>
                                    </div>
                                    <span
                                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                            kycStatus === 'approved'
                                                ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                                : kycStatus === 'rejected'
                                                ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                                                : kycStatus === 'pending'
                                                ? 'border-amber-200/80 bg-amber-50 text-amber-700'
                                                : 'border-slate-200/80 bg-slate-50 text-slate-600'
                                        }`}
                                    >
                                        {kycStatusLabel}
                                    </span>
                                </div>

                                <div className="mt-4 flex flex-col gap-3">
                                    {kycStatus === 'pending' ? (
                                        <>
                                            <div className="flex flex-col gap-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-700 shadow-sm">
                                                <span className="font-semibold">심사 신청이 접수되었습니다.</span>
                                                <span className="text-xs">
                                                    신청 시간: {seller?.kyc?.submittedAt ? new Date(seller.kyc.submittedAt).toLocaleString() : '-'}
                                                </span>
                                            </div>
                                            {kycPreview && (
                                                <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-sm">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={kycPreview}
                                                        alt="KYC Preview"
                                                        className="h-40 lg:h-32 w-full object-cover"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : kycStatus === 'approved' ? (
                                        <>
                                            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 shadow-sm">
                                                <span className="font-semibold">승인된 신분증입니다.</span>
                                                <span className="mt-1 text-xs text-emerald-600">
                                                    승인 시간: {seller?.kyc?.reviewedAt ? new Date(seller.kyc.reviewedAt).toLocaleString() : '-'}
                                                </span>
                                            </div>
                                            {kycPreview && (
                                                <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-sm">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={kycPreview}
                                                        alt="KYC Preview"
                                                        className="h-40 lg:h-32 w-full object-cover"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <label
                                                htmlFor="kyc-id-upload-seller"
                                                className="cursor-pointer rounded-xl border border-dashed border-slate-200/80 bg-slate-50/80 px-4 py-4 text-center shadow-sm transition hover:border-slate-300"
                                            >
                                                <input
                                                    id="kyc-id-upload-seller"
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={handleKycFileChange}
                                                />
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className="text-sm font-semibold text-slate-700">신분증 사진 업로드</span>
                                                    <span className="text-xs text-slate-500">JPG/PNG, 10MB 이하</span>
                                                </div>
                                            </label>
                                            {kycPreview && (
                                                <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-sm">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={kycPreview}
                                                        alt="KYC Preview"
                                                        className="h-40 lg:h-32 w-full object-cover"
                                                    />
                                                </div>
                                            )}
                                            {kycStatus === 'rejected' && seller?.kyc?.rejectionReason && (
                                                <span className="text-xs text-rose-600">거절 사유: {seller.kyc.rejectionReason}</span>
                                            )}
                                            <p className="text-xs text-slate-500">
                                                업로드 후 심사까지 영업일 기준 1-2일 소요될 수 있습니다.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={submitKyc}
                                                disabled={kycSubmitting || (!kycFile && !kycImageUrl)}
                                                className={`inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition sm:w-auto sm:self-start ${
                                                    kycSubmitting || (!kycFile && !kycImageUrl)
                                                        ? 'bg-slate-200 text-slate-400'
                                                        : 'bg-slate-900 text-white hover:bg-slate-800'
                                                }`}
                                            >
                                                {kycSubmitting ? '심사 신청 중...' : '심사신청하기'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            </div>
                        )}


                        {!loadingUserData && seller?.escrowWalletAddress && (
                            
                            <div className='w-full flex flex-col gap-3 lg:gap-2 items-start justify-between mt-4 lg:mt-3 rounded-2xl border border-slate-200/80 bg-white/95 p-5 lg:p-3 shadow-sm'>

                                <div className='w-full flex flex-row gap-2 items-center justify-start mb-2'>
                                    <Image
                                        src="/icon-escrow-wallet.png"
                                        alt="Escrow Wallet"
                                        width={50}
                                        height={50}
                                        className='w-10 h-10'
                                    />
                                    <span className="text-xl font-semibold text-slate-900">
                                        에스크로 지갑 정보
                                    </span>
                                </div>
                                {/* 설명 */}
                                {/* 에스크로 지갑에 잔액이 있어야 구매주문을 자동으로 처리할 수 있습니다. */}
                                <div className="text-sm text-slate-600 mb-3 lg:mb-2">
                                    에스크로 지갑에 잔액이 있어야 구매주문을 자동으로 처리할 수 있습니다.
                                </div>

                                <div className="w-full grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-3">
                                    <div className="w-full flex flex-col gap-2 lg:col-span-7">
                                        <div className="flex flex-row items-center gap-2">
                                            <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                            <span className="text-sm font-semibold text-slate-600">
                                                에스크로 지갑 주소
                                            </span>
                                        </div>

                                        <div className='w-full flex flex-row gap-2 items-start lg:items-center justify-between'>
                                            <div className="flex flex-row items-center gap-2">
                                                <Image
                                                    src="/icon-smart-wallet.png"
                                                    alt="Smart Wallet"
                                                    width={50}
                                                    height={50}
                                                    className='w-8 h-8'
                                                />
                                                <button
                                                    className="text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(seller?.escrowWalletAddress || "");
                                                        toast.success("에스크로 지갑 주소가 복사되었습니다" );
                                                    } }
                                                >
                                                    {seller?.escrowWalletAddress.slice(0, 6)}...{seller?.escrowWalletAddress.slice(-4)}
                                                </button>
                                            </div>
                                            {/* QR code */}
                                            <Canvas text={seller?.escrowWalletAddress || ""} />
                                        </div>
                                        <div className="w-full flex flex-row items-center justify-between">
                                            <span className="text-xs text-slate-500">
                                                입금·출금 기록을 확인하세요.
                                            </span>
                                        </div>
                                    </div>

                                    <div className="w-full flex flex-col gap-2 lg:col-span-5">
                                        <div className='w-full flex flex-row gap-2 items-center justify-between border-t border-slate-200/80 pt-4 lg:pt-3'>
                                            <div className="flex flex-row items-center gap-2">
                                                <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                                <span className="text-sm font-semibold text-slate-600">
                                                    에스크로 잔액
                                                </span>
                                            </div>
                                            <div className='flex flex-row items-center gap-2'>
                                                <span className="text-2xl xl:text-4xl font-semibold text-emerald-700 tabular-nums tracking-tight"
                                                    style={{ fontFamily: 'monospace' }}
                                                >
                                                    {escrowBalance.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 flex flex-col gap-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold">거래중인 수량</span>
                                                <span className="font-bold text-slate-900">
                                                    {inTradeLoading
                                                        ? '확인 중...'
                                                        : inTradeAmount !== null
                                                        ? `${inTradeAmount.toFixed(2)} USDT`
                                                        : '거래중인 수량이 없습니다.'}
                                                </span>
                                            </div>
                                            {inTradeError && (
                                                <span className="text-[11px] font-semibold text-rose-500">
                                                    {inTradeError}
                                                </span>
                                            )}
                                            <div className="text-xs text-slate-500">
                                                거래중인 수량을 제외한 금액만 회수 가능합니다.
                                            </div>
                                        </div>

                                        {/* 설명 */}
                                        {/* 에스크로 지갑 잔액을 모두 나의 지갑 (address) 으로 회수할 수 있습니다. */}
                                        <div className="text-sm text-slate-600">
                                            에스크로 지갑 잔액을 모두 나의 지갑 ({address?.slice(0,6)}...{address?.slice(-4)}) 으로 회수할 수 있습니다.
                                        </div>
                                        {/* 잔액 회수하기 버튼 */}
                                        <div className='w-full flex flex-row flex-wrap gap-2 items-center justify-end'>
                                            <button
                                                onClick={openChargeModal}
                                                className="px-4 py-2 rounded-full text-sm font-semibold shadow-sm transition border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                            >
                                                충전하기
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEscrowHistoryOpen(true)}
                                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                                            >
                                                입출금내역 보기
                                            </button>
                                            {/* if escrowBalance is 0, disable the button */}
                                            <button
                                            onClick={() => setWithdrawModalOpen(true)}
                                            className={`
                                                ${clearingSellerEscrowWalletBalance ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-500'}
                                                px-4 py-2 rounded-full text-sm font-semibold shadow-sm transition
                                            `}
                                            disabled={clearingSellerEscrowWalletBalance || escrowBalance <= 0}
                                        >
                                            {clearingSellerEscrowWalletBalance ? '회수중...' : '회수하기'}
                                        </button>

                                        </div>
                                    </div>
                                </div>


                                {/* 판매금액(원) 설정 */}
                                <div className='w-full flex flex-col gap-2 items-start justify-between mt-3 lg:mt-2
                                border-t border-slate-200/80 pt-4'>

                                    <div className="flex flex-row items-center gap-2">
                                        <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                        <span className="text-sm font-semibold text-slate-600">
                                            1 USDT 당 판매금액(원) 설정
                                        </span>

                                        {/* seller.usdtToKrwRate */}
                                        <span className="text-sm text-slate-500">
                                            (현재 설정: {seller?.usdtToKrwRate || 0} 원)
                                        </span>
                                    </div>


                                    {/* market 연동 or 지정가 설정 */}
                                    {/* market 연동: upbit or bithumb or korbit */}
                                    {/* market중 하나 선택, 또는 지정가 선택 */}
                                    {/* checkbox style */}
                                    <div className='w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-start'>

                                        <div className="flex flex-row items-center gap-1 sm:gap-2">
                                            <span className="text-sm font-semibold text-slate-700">
                                                가격 설정 방식:
                                            </span>
                                            {' '}
                                            <span className="text-sm text-slate-500">
                                                (현재 설정: {seller?.priceSettingMethod === 'market' ? 'Market 연동' : '지정가'})
                                            </span>
                                        </div>

                                        <div className="flex w-full flex-row gap-2 sm:w-auto">
                                            <button
                                                onClick={() => {
                                                    setPriceSettingMethodFunc('market');
                                                }}
                                                className={`
                                                    ${seller?.priceSettingMethod === 'market'
                                                        ? 'bg-slate-900 text-white'
                                                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}
                                                    flex-1 whitespace-nowrap px-3 py-2 rounded-full text-sm font-semibold shadow-sm transition
                                                `}
                                                disabled={seller?.priceSettingMethod === 'market'}
                                            >
                                                Market 연동
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setPriceSettingMethodFunc('fixed');
                                                }}
                                                className={`
                                                    ${seller?.priceSettingMethod === 'fixed'
                                                        ? 'bg-slate-900 text-white'
                                                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}
                                                    flex-1 whitespace-nowrap px-3 py-2 rounded-full text-sm font-semibold shadow-sm transition
                                                `}
                                                disabled={seller?.priceSettingMethod === 'fixed'}
                                            >
                                                지정가
                                            </button>
                                        </div>

                                    </div>

                                    {/* priceSettingMethod 가 fixed 일 때만 보이기 */}
                                    {seller?.priceSettingMethod === 'fixed' && (

                                        <div className='w-full flex flex-row gap-2 items-center justify-end'>

                                            <input 
                                                className="w-36 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                                placeholder="예: 1300"
                                                value={usdtToKrwRate}
                                                type='number'
                                                onChange={(e) => {
                                                    // check if the value is a number
                                                    e.target.value = e.target.value.replace(/[^0-9]/g, '');
                                                    setUsdtToKrwRate(Number(e.target.value));
                                                }}
                                            />

                                            <button
                                                disabled={updatingUsdtToKrw}
                                                onClick={updateUsdtToKrwRate}
                                                className={`
                                                    ${updatingUsdtToKrw ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-500'}
                                                    px-4 py-2 rounded-full text-sm font-semibold shadow-sm transition
                                                `}
                                            >
                                                {updatingUsdtToKrw ? '수정중...' : '수정하기'}
                                            </button>

                                        </div>
                                    )}

                                    {/* priceSettingMethod 가 market 일 때만 보이기 */}
                                    {/* market 중 한개 선택 upbit, bithumb, korbit */}
                                    {/* combo box style */}
                                    {seller?.priceSettingMethod === 'market' && (


                                        <div className='w-full flex flex-col gap-2 items-start justify-between'>

                                            <span className="text-sm font-semibold text-slate-700">
                                                연동할 마켓 선택:
                                            </span>
                                            <div className='w-full flex flex-row gap-2 items-center justify-end'>

                                                <button
                                                    onClick={() => {
                                                        //setMarket('upbit');
                                                        setMarketFunc('upbit');
                                                    }}
                                                    className={`
                                                        ${seller?.market === 'upbit'
                                                            ? 'bg-slate-900 text-white'
                                                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}
                                                        px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm transition
                                                    `}
                                                    disabled={seller?.market === 'upbit'}
                                                >
                                                    <div className='flex flex-row items-center gap-2'>
                                                        <Image
                                                            src="/icon-market-upbit.png"
                                                            width={24}
                                                            height={24}
                                                            className='w-6 h-6'
                                                            alt="Upbit"
                                                        />
                                                        <span>
                                                            Upbit
                                                        </span>
                                                    </div>
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        //setMarket('bithumb');
                                                        setMarketFunc('bithumb');
                                                    }}
                                                    className={`
                                                        ${seller?.market === 'bithumb'
                                                            ? 'bg-slate-900 text-white'
                                                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}
                                                        px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm transition
                                                    `}
                                                    disabled={seller?.market === 'bithumb'}
                                                >
                                                    <div className='flex flex-row items-center gap-2'>
                                                        <Image
                                                            src="/icon-market-bithumb.png"
                                                            width={24}
                                                            height={24}
                                                            className='w-6 h-6'
                                                            alt="Bithumb"
                                                        />
                                                        <span>
                                                            Bithumb
                                                        </span>
                                                    </div>
                                                </button>
                                
                                                <button
                                                    onClick={() => {
                                                        //setMarket('korbit');
                                                        setMarketFunc('korbit');

                                                    }}
                                                    className={`
                                                        ${seller?.market === 'korbit'
                                                            ? 'bg-slate-900 text-white'
                                                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}
                                                        px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm transition
                                                    `}
                                                    disabled={seller?.market === 'korbit'}
                                                >
                                                    <div className='flex flex-row items-center gap-2'>
                                                        <Image
                                                            src="/icon-market-korbit.png"
                                                            width={24}
                                                            height={24}
                                                            className='w-6 h-6'
                                                            alt="Korbit"
                                                        />
                                                        <span>
                                                            Korbit
                                                        </span>
                                                    </div>
                                                </button>


                                            </div>

                                            {/* setMarketFunc */}
                                            {/*
                                            <button
                                                disabled={settingMarket || !market}
                                                onClick={() => {
                                                    setMarketFunc(market);
                                                } }

                                                className={`
                                                    ${settingMarket ? 'bg-gray-300 text-gray-400' : 'bg-green-500 text-zinc-100'}
                                                    p-2 rounded-lg text-sm font-semibold
                                                `}
                                            >
                                                {settingMarket ? '설정중...' : '설정하기'}
                                            </button>
                                            */}

                                        </div>

                                    )}

                        
                                    {/* 판매 홍보 문구 설정 */}
                                    <div className='w-full flex flex-col gap-2 items-start justify-between mt-4
                                    border-t border-slate-200/80 pt-4'>

                                        <div className="flex flex-row items-center gap-2">
                                            <div className='w-2 h-2 bg-emerald-500 rounded-full'></div>
                                            <span className="text-sm font-semibold text-slate-600">
                                                판매 홍보 문구 설정
                                            </span>
                                        </div>
                                        {/* 이미 설정되어 있는 문구가 있으면 보여주기 */}
                                        {seller?.promotionText && (
                                            <div className="text-sm text-slate-500">
                                                현재 설정된 문구: {seller?.promotionText}
                                            </div>
                                        )}

                                        <textarea
                                            className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                            placeholder="예: 빠르고 안전한 USDT 구매, 지금 바로 거래하세요!"
                                            value={promotionText}
                                            onChange={(e) => {
                                                setPromotionText(e.target.value);
                                            }}
                                            rows={4}
                                        ></textarea>

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                disabled={generatingPromotionText || updatingPromotionText}
                                                onClick={generatePromotionText}
                                                className={`
                                                    ${generatingPromotionText || updatingPromotionText
                                                        ? 'bg-slate-200 text-slate-400'
                                                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}
                                                    px-4 py-2 rounded-full text-sm font-semibold shadow-sm transition
                                                `}
                                            >
                                                {generatingPromotionText ? '자동 생성중...' : '자동 생성'}
                                            </button>
                                            <button
                                                disabled={updatingPromotionText || generatingPromotionText}
                                                onClick={updatePromotionText}
                                                className={`
                                                    ${updatingPromotionText || generatingPromotionText
                                                        ? 'bg-slate-200 text-slate-400'
                                                        : 'bg-emerald-600 text-white hover:bg-emerald-500'}
                                                    px-4 py-2 rounded-full text-sm font-semibold shadow-sm transition
                                                `}
                                            >
                                                {updatingPromotionText ? '수정중...' : '수정하기'}
                                            </button>
                                        </div>
                                        {promotionGenerateError && (
                                            <div className="text-xs font-semibold text-rose-500">
                                                {promotionGenerateError}
                                            </div>
                                        )}
                                    </div>

                                    <div className="w-full mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <Image
                                                src="/icon-info.png"
                                                alt="Guide"
                                                width={18}
                                                height={18}
                                                className="h-4 w-4"
                                            />
                                            <span className="text-sm font-semibold text-slate-700">
                                                이 페이지에서 설정할 항목
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">
                                            판매 금액(원), 가격 설정 방식(시장가/고정가), 마켓 연동 선택, 판매 홍보 문구를 설정합니다.
                                        </p>
                                    </div>

                                </div>

                            </div>
                        )}

                    </div>
                )}

            </div>
            {/* Escrow history side panel */}
            <div
                className={`fixed inset-0 z-50 ${escrowHistoryOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
            >
                <div
                    className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-300 ${
                        escrowHistoryOpen ? 'opacity-100' : 'opacity-0'
                    }`}
                    onClick={() => setEscrowHistoryOpen(false)}
                />
                <div
                    className={`absolute left-0 top-0 h-full w-full max-w-md transform bg-white shadow-2xl transition-transform duration-300 ${
                        escrowHistoryOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                >
                    <div className="relative border-b border-slate-200 px-4 pt-5 pb-3">
                        <button
                            type="button"
                            onClick={() => setEscrowHistoryOpen(false)}
                            className="absolute top-5 left-4 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                        >
                            닫기
                        </button>
                        <div className="flex flex-col gap-0.5 pl-16 pr-4">
                            <span className="text-sm font-semibold text-slate-800">
                                에스크로 입출금 내역
                            </span>
                            {seller?.escrowWalletAddress && (
                                <span className="text-[11px] text-slate-500 break-all">
                                    {seller.escrowWalletAddress}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="h-[calc(100%-56px)] overflow-y-auto px-4 py-4">
                        {escrowHistoryLoading && (
                            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                                입출금 내역을 불러오는 중...
                            </div>
                        )}
                        {escrowHistoryError && !escrowHistoryLoading && (
                            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm">
                                {escrowHistoryError}
                            </div>
                        )}
                        {!escrowHistoryLoading &&
                            !escrowHistoryError &&
                            escrowHistory.length === 0 && (
                                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-sm">
                                    최근 200,000 블록 내 입출금 기록이 없습니다.
                                </div>
                            )}
                        {!escrowHistoryLoading &&
                            !escrowHistoryError &&
                            escrowHistory.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <div className="mb-2 text-xs text-slate-500">
                                        최근 {historyDays}일 범위의 기록입니다.
                                    </div>
                                    {escrowHistory.map((item, idx) => {
                                        const explorerBase =
                                            selectedChain === 'ethereum'
                                                ? 'https://etherscan.io/tx/'
                                                : selectedChain === 'arbitrum'
                                                ? 'https://arbiscan.io/tx/'
                                                : selectedChain === 'bsc'
                                                ? 'https://bscscan.com/tx/'
                                                : 'https://polygonscan.com/tx/';
                                        return (
                                            <div
                                                key={`${item.txHash}-${item.logIndex ?? idx}`}
                                                className="rounded-xl border border-slate-100 bg-white px-3 py-3 shadow-sm"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span
                                                        className={`text-xs font-semibold ${
                                                            item.direction === 'in'
                                                                ? 'text-emerald-600'
                                                                : 'text-rose-600'
                                                        }`}
                                                    >
                                                        {item.direction === 'in' ? '입금' : '출금'}
                                                    </span>
                                                    <span className="text-lg font-semibold text-slate-900">
                                                        {item.amount.toLocaleString(undefined, {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 6,
                                                        })}{' '}
                                                        USDT
                                                    </span>
                                                </div>
                                                <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                                                    {item.from && (
                                                        <div className="flex justify-between gap-2">
                                                            <span>From</span>
                                                            <span className="truncate text-right">
                                                                {item.from}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {item.to && (
                                                        <div className="flex justify-between gap-2">
                                                            <span>To</span>
                                                            <span className="truncate text-right">
                                                                {item.to}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                                                    <span>
                                                        블록 #{item.blockNumber?.toString() || '-'}
                                                    </span>
                                                    {item.txHash && (
                                                        <a
                                                            href={`${explorerBase}${item.txHash}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="font-semibold text-slate-600 underline decoration-dotted underline-offset-2 transition hover:text-slate-900"
                                                        >
                                                            트랜잭션 보기
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {historyDays < MAX_HISTORY_DAYS && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setHistoryDays((prev) =>
                                                    Math.min(prev + HISTORY_STEP_DAYS, MAX_HISTORY_DAYS)
                                                )
                                            }
                                            className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                                            disabled={escrowHistoryLoading}
                                        >
                                            {escrowHistoryLoading ? '불러오는 중...' : `더보기 (+${HISTORY_STEP_DAYS}일)`}
                                        </button>
                                    )}
                                </div>
                            )}
                    </div>
                </div>
            </div>

            {/* Charge escrow modal */}
            {chargeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <span className="text-sm font-semibold text-slate-800">에스크로 지갑 충전</span>
                            <button
                                type="button"
                                onClick={() => setChargeModalOpen(false)}
                                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                            >
                                닫기
                            </button>
                        </div>
                        <div className="px-4 py-4 space-y-3">
                            <div className="text-xs text-slate-500">
                                내 지갑 → 에스크로 지갑({seller?.escrowWalletAddress?.slice(0, 6)}...{seller?.escrowWalletAddress?.slice(-4)})
                            </div>
                            <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 shadow-sm">
                                <span className="text-sm font-semibold text-emerald-700">내 지갑 잔액</span>
                                <span className="text-lg font-bold text-emerald-800">
                                    {userBalanceLoading ? '조회 중...' : userBalance !== null ? `${userBalance.toFixed(4)} USDT` : '-'}
                                </span>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">충전 수량 (USDT)</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*[.]?[0-9]*"
                                    value={chargeAmount}
                                    onChange={(e) => {
                                        const next = e.target.value.replace(/\s+/g, '');
                                        if (!/^\d*(\.\d*)?$/.test(next)) return; // allow digits and single dot
                                        if (userBalance !== null && next !== '' && next !== '.') {
                                            const numeric = Number(next);
                                            if (!isNaN(numeric) && numeric > userBalance) {
                                                setChargeAmount(userBalance.toString());
                                                return;
                                            }
                                        }
                                        setChargeAmount(next);
                                    }}
                                    className="w-full rounded-2xl border-2 border-emerald-100 bg-white px-4 py-3 text-lg font-semibold text-slate-900 text-right shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                                    placeholder="예: 50"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={chargeEscrow}
                                disabled={charging}
                                className={`w-full rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                                    charging
                                        ? 'bg-slate-200 text-slate-400'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-500'
                                }`}
                            >
                                {charging ? '충전 중...' : '충전하기'}
                            </button>
                            {charging && (
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                                    전송 중입니다. 지갑 승인 후 잠시 기다려주세요.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Withdraw escrow modal */}
            {withdrawModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <span className="text-sm font-semibold text-slate-800">에스크로 잔액 회수</span>
                            <button
                                type="button"
                                onClick={() => setWithdrawModalOpen(false)}
                                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800"
                            >
                                닫기
                            </button>
                        </div>
                        <div className="px-4 py-4 space-y-3">
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                                    <span>에스크로 잔액</span>
                                    <span className="text-lg text-slate-900">
                                        {escrowBalance.toFixed(2)} USDT
                                    </span>
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
                                    <span>거래중인 수량</span>
                                    <span className="text-lg text-slate-900">
                                        {inTradeLoading
                                            ? '확인 중...'
                                            : inTradeAmount !== null
                                            ? `${inTradeAmount.toFixed(2)} USDT`
                                            : '0.00 USDT'}
                                    </span>
                                </div>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                                <div className="flex items-center justify-between text-sm font-semibold text-emerald-700">
                                    <span>회수 가능 수량</span>
                                    <span className="text-lg text-emerald-900">
                                        {Math.max(escrowBalance - (inTradeAmount || 0), 0).toFixed(2)} USDT
                                    </span>
                                </div>
                                <div className="mt-1 text-[11px] text-emerald-700">
                                    거래중인 수량을 제외한 금액만 회수됩니다.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (withdrawing) return;
                                    const withdrawable = Math.max(escrowBalance - (inTradeAmount || 0), 0);
                                    if (withdrawable <= 0) {
                                        toast.error('회수할 수 있는 금액이 없습니다.');
                                        return;
                                    }
                                    setWithdrawing(true);
                                    try {
                                        await clearSellerEscrowWalletBalance();
                                        setWithdrawModalOpen(false);
                                        await fetchEscrowBalance();
                                        await fetchInTradeAmount();
                                    } catch (err) {
                                        console.error(err);
                                        const message =
                                            err instanceof Error ? err.message : '회수에 실패했습니다.';
                                        toast.error(message);
                                    } finally {
                                        setWithdrawing(false);
                                    }
                                }}
                                disabled={withdrawing}
                                className={`w-full rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                                    withdrawing
                                        ? 'bg-slate-200 text-slate-400'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-500'
                                }`}
                            >
                                {withdrawing ? '회수 중...' : '회수하기'}
                            </button>
                            {withdrawing && (
                                <div className="text-xs text-amber-700 font-semibold text-center">
                                    회수 중에는 창을 닫지 마세요.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>

    );

}

          
