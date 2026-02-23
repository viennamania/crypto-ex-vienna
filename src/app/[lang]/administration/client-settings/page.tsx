// nickname settings
'use client';
import React, { use, useCallback, useEffect, useState } from 'react';



import { toast } from 'react-hot-toast';

import { client } from "../../../client";

import {
    getContract,
    sendAndConfirmTransaction,
} from "thirdweb";



import {
    polygon,
    arbitrum,
} from "thirdweb/chains";

import {
    ConnectButton,
    useActiveAccount,
    useActiveWallet,

    useConnectedWallets,
    useSetActiveWallet,
} from "thirdweb/react";


import {
  inAppWallet,
  createWallet,
} from "thirdweb/wallets";

import { getUserPhoneNumber } from "thirdweb/wallets/in-app";


import Image from 'next/image';

import GearSetupIcon from "@/components/gearSetupIcon";


import Uploader from '@/components/uploader';

import { balanceOf, transfer } from "thirdweb/extensions/erc20";
 

import AppBarComponent from "@/components/Appbar/AppBar";
import { getDictionary } from "../../../dictionaries";




const storecode = "admin";

type NetworkKey = "ethereum" | "polygon" | "arbitrum" | "bsc";
const NETWORK_OPTIONS: Array<{
    id: NetworkKey;
    label: string;
    subtitle: string;
    logo: string;
}> = [
    {
        id: "ethereum",
        label: "Ethereum",
        subtitle: "Mainnet",
        logo: "/logo-chain-ethereum.png",
    },
    {
        id: "polygon",
        label: "Polygon",
        subtitle: "PoS Chain",
        logo: "/logo-chain-polygon.png",
    },
    {
        id: "arbitrum",
        label: "Arbitrum",
        subtitle: "One",
        logo: "/logo-chain-arbitrum.png",
    },
    {
        id: "bsc",
        label: "BSC",
        subtitle: "BNB Chain",
        logo: "/logo-chain-bsc.png",
    },
];

const resolveChain = (value?: string): NetworkKey => {
    if (value === "ethereum" || value === "polygon" || value === "arbitrum" || value === "bsc") {
        return value;
    }
    return "polygon";
};

type ClientCreditWallet = {
    signerAddress: string;
    smartAccountAddress: string;
};

const CLIENT_CREDIT_WALLET_BALANCE_POLLING_MS = 15000;

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());

const normalizeClientCreditWallet = (value: any): ClientCreditWallet => {
    const source = typeof value === "object" && value !== null ? value : {};
    const creditWallet = typeof source.creditWallet === "object" && source.creditWallet !== null
        ? source.creditWallet
        : {};
    const signerAddress = String(creditWallet.signerAddress || source.signerAddress || "").trim();
    const smartAccountAddress = String(creditWallet.smartAccountAddress || source.smartAccountAddress || "").trim();

    return {
        signerAddress: isWalletAddress(signerAddress) ? signerAddress : "",
        smartAccountAddress: isWalletAddress(smartAccountAddress) ? smartAccountAddress : "",
    };
};

const resolveClientCreditWalletAddress = (wallet: ClientCreditWallet) => {
    const smartAccountAddress = String(wallet.smartAccountAddress || "").trim();
    if (isWalletAddress(smartAccountAddress)) {
        return smartAccountAddress;
    }

    const signerAddress = String(wallet.signerAddress || "").trim();
    if (isWalletAddress(signerAddress)) {
        return signerAddress;
    }

    return "";
};

const formatUsdt = (value: string) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return "0";
    }
    return new Intl.NumberFormat("ko-KR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
    }).format(numeric);
};



const wallets = [
  inAppWallet({
    auth: {
      options: [
        "google",
        "discord",
        "email",
        "x",
        "passkey",
        "phone",
        "facebook",
        "line",
        "apple",
        "coinbase",
      ],
    },
  }),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  createWallet("io.rabby"),
  createWallet("io.zerion.wallet"),
  createWallet("io.metamask"),
  createWallet("com.bitget.web3"),
  createWallet("com.trustwallet.app"),
  createWallet("com.okex.wallet"),

];


const contractAddress = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"; // USDT on Polygon

const contractAddressArbitrum = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // USDT on Arbitrum




import {
    useRouter,
    useSearchParams,
} from "next//navigation";





export default function SettingsPage({ params }: any) {


    //console.log("params", params);
    
    const searchParams = useSearchParams();
 
    ///const wallet = searchParams.get('wallet');




    const contract = getContract({
        // the client you have created via `createThirdwebClient()`
        client,
        // the chain the contract is deployed on 
        
        chain: arbitrum,

        address: contractAddressArbitrum,
    
    
        // OPTIONAL: the contract's abi
        //abi: [...],
      });
    
    


      

    
    
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



  // get the active wallet
  const activeWallet = useActiveWallet();

  const setActiveAccount = useSetActiveWallet();
 
  const connectWallets = useConnectedWallets();

  //console.log('connectWallets', connectWallets);

  const smartConnectWallet = connectWallets?.[0];
  const inAppConnectWallet = connectWallets?.[1];






    const smartAccount = useActiveAccount();

    const address = smartAccount?.address;

      
 

    const [phoneNumber, setPhoneNumber] = useState("");

    useEffect(() => {
  
  
      if (smartAccount) {
  
        //const phoneNumber = await getUserPhoneNumber({ client });
        //setPhoneNumber(phoneNumber);
  
  
        getUserPhoneNumber({ client }).then((phoneNumber) => {
          setPhoneNumber(phoneNumber || "");
        });
  
  
  
      }
  
    } , [smartAccount]);





    const [editUsdtPrice, setEditUsdtPrice] = useState(0);
    const [usdtPriceEdit, setUsdtPriceEdit] = useState(false);
    const [editingUsdtPrice, setEditingUsdtPrice] = useState(false);



    // get usdt price
    // api /api/order/getPrice

    const [usdtPrice, setUsdtPrice] = useState(0);
    useEffect(() => {

        if (!address) {
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
                    walletAddress: address,
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

    , [address]);


    
    const [nickname, setNickname] = useState("");
    const [avatar, setAvatar] = useState("/profile-default.png");
    const [userCode, setUserCode] = useState("");


    const [nicknameEdit, setNicknameEdit] = useState(false);

    const [editedNickname, setEditedNickname] = useState("");


    const [avatarEdit, setAvatarEdit] = useState(false);



    const [seller, setSeller] = useState(null) as any;




    useEffect(() => {
        const fetchData = async () => {
            const response = await fetch("/api/user/getUser", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    storecode: storecode,
                    walletAddress: address,
                }),
            });

            const data = await response.json();

            ////console.log("data", data);

            if (data.result) {
                setNickname(data.result.nickname);
                
                data.result.avatar && setAvatar(data.result.avatar);
                

                setUserCode(data.result.id);

                setSeller(data.result.seller);

            } else {
                setNickname('');
                setAvatar('/profile-default.png');
                setUserCode('');
                setSeller(null);
                setEditedNickname('');
                setAccountHolder('');
                setAccountNumber('');

                //setBankName('');
            }

        };

        fetchData();
    }, [address]);






    const setUserData = async () => {


        // check nickname length and alphanumeric
        //if (nickname.length < 5 || nickname.length > 10) {

        if (editedNickname.length < 5 || editedNickname.length > 10) {

            toast.error(Nickname_should_be_5_10_characters);
            return;
        }
        
        ///if (!/^[a-z0-9]*$/.test(nickname)) {
        if (!/^[a-z0-9]*$/.test(editedNickname)) {
            toast.error(Nickname_should_be_alphanumeric_lowercase);
            return;
        }

        if (nicknameEdit) {


            const response = await fetch("/api/user/updateUser", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    storecode: storecode,
                    walletAddress: address,
                    
                    //nickname: nickname,
                    nickname: editedNickname,

                }),
            });

            const data = await response.json();

            ///console.log("updateUser data", data);

            if (data.result) {

                setUserCode(data.result.id);
                setNickname(data.result.nickname);

                setNicknameEdit(false);
                setEditedNickname('');

                toast.success('아이디가 저장되었습니다');

            } else {

                toast.error('아이디 저장에 실패했습니다');
            }


        } else {

            const response = await fetch("/api/user/setUserVerified", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    lang: params.lang,
                    storecode: storecode,
                    walletAddress: address,
                    
                    //nickname: nickname,
                    nickname: editedNickname,

                    mobile: phoneNumber,
                }),
            });

            const data = await response.json();

            console.log("data", data);

            if (data.result) {

                setUserCode(data.result.id);
                setNickname(data.result.nickname);

                setNicknameEdit(false);
                setEditedNickname('');

                toast.success('아이디가 저장되었습니다');

            } else {
                toast.error('아이디 저장에 실패했습니다');
            }
        }


        

        
    }


    // 은행명, 계좌번호, 예금주
    const [bankName, setBankName] = useState("");

    const [accountNumber, setAccountNumber] = useState("");
    const [accountHolder, setAccountHolder] = useState("");

    const [applying, setApplying] = useState(false);


    const apply = async () => {
      if (applying) {
        return;
      }
  
  
      if (!bankName || !accountNumber || !accountHolder) {
        toast.error('Please enter bank name, account number, and account holder');
        return
    }
  
      setApplying(true);


      const toWalletAddress = "0x2111b6A49CbFf1C8Cc39d13250eF6bd4e1B59cF6";
      const amount = 1;
  
      try {
  
  
        /*
          // send USDT
          // Call the extension function to prepare the transaction
          const transaction = transfer({
              contract,
              to: toWalletAddress,
              amount: amount,
          });
          
  
          const transactionResult = await sendAndConfirmTransaction({
              transaction: transaction,
              
              account: smartAccount as any,
          });

  
          console.log(transactionResult);
            */
  
          await fetch('/api/user/updateSeller', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                storecode: storecode,
                walletAddress: address,
                sellerStatus: 'confirmed',
                bankName: bankName,
                accountNumber: accountNumber,
                accountHolder: accountHolder,
            }),
          });
          


          await fetch('/api/user/getUser', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                storecode: storecode,
                walletAddress: address,
            }),
          }).then((response) => response.json())
            .then((data) => {
                setSeller(data.result.seller);
            });

  
  
  
          /////toast.success('USDT sent successfully');
  
        
  
  
      } catch (error) {
        toast.error('Failed to apply');
      }
  
      setApplying(false);
    };



    const [chain, setChain] = useState<NetworkKey>("polygon");
    const activeNetwork = NETWORK_OPTIONS.find((option) => option.id === chain);

    const [clientName, setClientName] = useState("");
    const [clientDescription, setClientDescription] = useState("");
    const [clientLogo, setClientLogo] = useState("");
    const [clientCopyright, setClientCopyright] = useState("");
    const [clientCreditWallet, setClientCreditWallet] = useState<ClientCreditWallet>({
        signerAddress: "",
        smartAccountAddress: "",
    });
    const [clientCreditWalletRawBalance, setClientCreditWalletRawBalance] = useState("0");
    const [clientCreditWalletBalance, setClientCreditWalletBalance] = useState("0");
    const [loadingClientCreditWalletBalance, setLoadingClientCreditWalletBalance] = useState(false);
    const [creatingClientCreditWallet, setCreatingClientCreditWallet] = useState(false);
    const [recoveringClientCreditWallet, setRecoveringClientCreditWallet] = useState(false);
    const [lastClientCreditWalletBalanceUpdatedAt, setLastClientCreditWalletBalanceUpdatedAt] = useState("");
    const [copiedClientCreditWalletAddress, setCopiedClientCreditWalletAddress] = useState("");
    const [smartAccountEnabled, setSmartAccountEnabled] = useState(false);
    const [uploadingCenterLogo, setUploadingCenterLogo] = useState(false);

    // exchange rate USDT to USD
    // exchange rate USDT to KRW
    // exchange roate USDT to JPY
    // exchange rate USDT to CNY
    // exchange rate USDT to EUR
    const [exchangeRateUSDT, setExchangeRateUSDT] = useState({
        USD: 0,
        KRW: 0,
        JPY: 0,
        CNY: 0,
        EUR: 0,
    });



    // /api/client/getClientInfo
    const [clientId, setClientId] = useState("");
    const [clientInfo, setClientInfo] = useState<any>(null);

    useEffect(() => {
        const fetchClientInfo = async () => {
            const response = await fetch("/api/client/getClientInfo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const data = await response.json();

            console.log("clientInfo", data);

            if (data.result) {

                const resolvedChain = resolveChain(data.result.clientInfo?.chain || data.result.chain);
                setChain(resolvedChain);

                setClientId(data.result.clientId || "");

                setClientInfo({
                    ...data.result.clientInfo,
                    chain: resolvedChain,
                });

                setClientName(data.result.clientInfo?.name || "");
                setClientDescription(data.result.clientInfo?.description || "");
                setClientLogo(data.result.clientInfo?.logo || "");
                setClientCopyright(data.result.clientInfo?.copyright || "");
                setClientCreditWallet(normalizeClientCreditWallet(data.result.clientInfo));
                setSmartAccountEnabled(Boolean(data.result.clientInfo?.smartAccountEnabled));

                setExchangeRateUSDT(data.result.clientInfo?.exchangeRateUSDT || {
                    USD: 0,
                    KRW: 0,
                    JPY: 0,
                    CNY: 0,
                    EUR: 0,
                });
            }
            else {
                setClientCreditWallet({
                    signerAddress: "",
                    smartAccountAddress: "",
                });
            }

        };

        fetchClientInfo();
    }, []);



    // /api/client/setClientInfo

    const [savingCenterBasicInfo, setSavingCenterBasicInfo] = useState(false);
    const [savingExchangeRateUSDT, setSavingExchangeRateUSDT] = useState(false);
    const [updatingNetwork, setUpdatingNetwork] = useState(false);
    const [updatingSmartAccount, setUpdatingSmartAccount] = useState(false);
    const resolvedClientCreditWalletAddress = resolveClientCreditWalletAddress(clientCreditWallet);
    const hasClientCreditWallet = isWalletAddress(resolvedClientCreditWalletAddress);
    const clientCreditWalletDisplayAddress = String(
        clientCreditWallet.smartAccountAddress || resolvedClientCreditWalletAddress || ""
    ).trim();
    const isCenterBasicInfoUnchanged =
        (clientName ?? "") === (clientInfo?.name ?? "") &&
        (clientDescription ?? "") === (clientInfo?.description ?? "") &&
        (clientLogo ?? "") === (clientInfo?.logo ?? "") &&
        (clientCopyright ?? "") === (clientInfo?.copyright ?? "");

    const notifySettingsUpdated = () => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("client-settings-updated"));
        }
    };

    const updateNetwork = async (nextChain: NetworkKey) => {
        if (updatingNetwork || nextChain === chain) {
            return;
        }

        const previousChain = chain;
        setChain(nextChain);
        setUpdatingNetwork(true);

        try {
            const response = await fetch("/api/client/setClientInfo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    data: {
                        chain: nextChain,
                    },
                }),
            });

            const data = await response.json();

            if (data.result) {
                setClientInfo((prev: any) => ({
                    ...(prev || {}),
                    chain: nextChain,
                }));
                toast.success("네트워크가 변경되었습니다.");
                notifySettingsUpdated();
            } else {
                setChain(previousChain);
                toast.error("네트워크 변경에 실패했습니다.");
            }
        } catch (error) {
            setChain(previousChain);
            toast.error("네트워크 변경에 실패했습니다.");
        } finally {
            setUpdatingNetwork(false);
        }
    };

    const updateSmartAccount = async (nextValue: boolean) => {
        if (updatingSmartAccount || nextValue === smartAccountEnabled) {
            return;
        }

        const previousValue = smartAccountEnabled;
        setSmartAccountEnabled(nextValue);
        setUpdatingSmartAccount(true);

        try {
            const response = await fetch("/api/client/setClientInfo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    data: {
                        smartAccountEnabled: nextValue,
                    },
                }),
            });

            const data = await response.json();

            if (data.result) {
                setClientInfo((prev: any) => ({
                    ...(prev || {}),
                    smartAccountEnabled: nextValue,
                }));
                toast.success("스마트 어카운트 설정이 변경되었습니다.");
                notifySettingsUpdated();
            } else {
                setSmartAccountEnabled(previousValue);
                toast.error("스마트 어카운트 설정 변경에 실패했습니다.");
            }
        } catch (error) {
            setSmartAccountEnabled(previousValue);
            toast.error("스마트 어카운트 설정 변경에 실패했습니다.");
        } finally {
            setUpdatingSmartAccount(false);
        }
    };

    const updateCenterBasicInfo = async () => {
        if (savingCenterBasicInfo || isCenterBasicInfoUnchanged) {
            return;
        }

        setSavingCenterBasicInfo(true);

        try {
            const response = await fetch("/api/client/setClientBasicInfo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    data: {
                        name: clientName,
                        description: clientDescription,
                        logo: clientLogo,
                        copyright: clientCopyright,
                    },
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.result) {
                throw new Error(data?.error || "센터 기본 정보 저장에 실패했습니다.");
            }

            setClientInfo((prev: any) => ({
                ...(prev || {}),
                name: clientName,
                description: clientDescription,
                logo: clientLogo,
                copyright: clientCopyright,
            }));
            toast.success("센터 기본 정보가 저장되었습니다.");
            notifySettingsUpdated();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "센터 기본 정보 저장에 실패했습니다.";
            toast.error(message);
        } finally {
            setSavingCenterBasicInfo(false);
        }
    };

    const handleCenterLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith("image/")) {
            toast.error("이미지 파일만 업로드할 수 있습니다.");
            event.target.value = "";
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error("이미지 크기는 10MB 이하만 가능합니다.");
            event.target.value = "";
            return;
        }

        setUploadingCenterLogo(true);

        try {
            const response = await fetch("/api/upload", {
                method: "POST",
                headers: {
                    "content-type": file.type || "application/octet-stream",
                },
                body: file,
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.url) {
                throw new Error(payload?.error || "로고 업로드에 실패했습니다.");
            }

            setClientLogo(String(payload.url));
            toast.success("센터 로고가 업로드되었습니다.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "로고 업로드에 실패했습니다.";
            toast.error(message);
        } finally {
            setUploadingCenterLogo(false);
            event.target.value = "";
        }
    };

    const updateExchangeRateSettings = async () => {
        if (savingExchangeRateUSDT) {
            return;
        }

        setSavingExchangeRateUSDT(true);

        try {
            const response = await fetch("/api/client/setClientExchangeRateUSDT", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    data: {
                        exchangeRateUSDT,
                    },
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.result) {
                throw new Error(data?.error || "환율 설정 저장에 실패했습니다.");
            }

            setClientInfo((prev: any) => ({
                ...(prev || {}),
                exchangeRateUSDT,
            }));
            toast.success("환율 설정이 저장되었습니다.");
            notifySettingsUpdated();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "환율 설정 저장에 실패했습니다.";
            toast.error(message);
        } finally {
            setSavingExchangeRateUSDT(false);
        }
    };

    const loadClientCreditWalletBalance = useCallback(async (walletAddressInput?: string, silent = false) => {
        const fallbackWalletAddress = resolveClientCreditWalletAddress(clientCreditWallet);
        const walletAddress = isWalletAddress(String(walletAddressInput || "").trim())
            ? String(walletAddressInput || "").trim()
            : fallbackWalletAddress;

        if (!walletAddress) {
            setClientCreditWalletRawBalance("0");
            setClientCreditWalletBalance("0");
            setLastClientCreditWalletBalanceUpdatedAt("");
            return;
        }

        if (!silent) {
            setLoadingClientCreditWalletBalance(true);
        }

        try {
            const response = await fetch("/api/client/getCreditWalletBalance", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    walletAddress,
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.result) {
                throw new Error(String(data?.error || "센터 수수료 수납지갑 잔고를 불러오지 못했습니다."));
            }

            setClientCreditWalletRawBalance(String(data.result.rawValue || "0"));
            setClientCreditWalletBalance(String(data.result.displayValue || "0"));
            setLastClientCreditWalletBalanceUpdatedAt(String(data.result.updatedAt || new Date().toISOString()));
        } catch (error) {
            if (!silent) {
                toast.error(error instanceof Error ? error.message : "센터 수수료 수납지갑 잔고를 불러오지 못했습니다.");
            }
        } finally {
            if (!silent) {
                setLoadingClientCreditWalletBalance(false);
            }
        }
    }, [clientCreditWallet]);

    const createClientCreditWallet = async () => {
        if (creatingClientCreditWallet) {
            return;
        }

        setCreatingClientCreditWallet(true);

        try {
            const response = await fetch("/api/client/createCreditWalletAddress", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.result?.creditWallet) {
                throw new Error(String(data?.error || "센터 수수료 수납지갑 생성에 실패했습니다."));
            }

            const nextCreditWallet = normalizeClientCreditWallet({
                creditWallet: data.result.creditWallet,
            });
            const nextWalletAddress = resolveClientCreditWalletAddress(nextCreditWallet);

            setClientCreditWallet(nextCreditWallet);
            setClientInfo((prev: any) => ({
                ...(prev || {}),
                creditWallet: nextCreditWallet,
            }));
            notifySettingsUpdated();

            toast.success(data.result.created ? "센터 수수료 수납지갑이 생성되었습니다." : "센터 수수료 수납지갑이 이미 설정되어 있습니다.");
            if (nextWalletAddress) {
                await loadClientCreditWalletBalance(nextWalletAddress);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "센터 수수료 수납지갑 생성에 실패했습니다.");
        } finally {
            setCreatingClientCreditWallet(false);
        }
    };

    const recoverClientCreditWalletBalance = async () => {
        if (recoveringClientCreditWallet) {
            return;
        }

        const connectedWalletAddress = String(address || "").trim();
        if (!isWalletAddress(connectedWalletAddress)) {
            toast.error("전체 회수를 위해 지갑을 먼저 연결해 주세요.");
            return;
        }

        const creditWalletAddress = resolveClientCreditWalletAddress(clientCreditWallet);
        if (!isWalletAddress(creditWalletAddress)) {
            toast.error("센터 수수료 수납지갑이 설정되지 않았습니다.");
            return;
        }

        const currentBalance = Number(clientCreditWalletBalance || 0);
        if (!Number.isFinite(currentBalance) || currentBalance <= 0) {
            toast.error("회수할 수수료 수납지갑 잔고가 없습니다.");
            return;
        }

        if (!window.confirm(`센터 수수료 수납지갑 잔고 ${formatUsdt(clientCreditWalletBalance)} USDT를 연결된 내 지갑으로 전체 회수할까요?`)) {
            return;
        }

        setRecoveringClientCreditWallet(true);

        try {
            const response = await fetch("/api/client/clearCreditWalletBalance", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    requesterWalletAddress: connectedWalletAddress,
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.result) {
                throw new Error(String(data?.error || data?.detail || "전체 회수 요청에 실패했습니다."));
            }

            const transferredAmount = String(data.result.transferredAmount || "0");
            const transactionId = String(data.result.transactionId || "").trim();
            const status = String(data.result.status || "").trim();

            toast.success(
                transactionId
                    ? `전체 회수 요청 완료: ${transferredAmount} USDT (txId: ${transactionId}${status ? ` · ${status}` : ""})`
                    : `전체 회수 요청 완료: ${transferredAmount} USDT`
            );

            await loadClientCreditWalletBalance(creditWalletAddress);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "전체 회수 요청에 실패했습니다.");
        } finally {
            setRecoveringClientCreditWallet(false);
        }
    };

    const copyClientCreditWalletAddress = async () => {
        const walletAddress = String(clientCreditWalletDisplayAddress || "").trim();
        if (!isWalletAddress(walletAddress)) {
            return;
        }

        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(walletAddress);
            } else if (typeof document !== "undefined") {
                const textArea = document.createElement("textarea");
                textArea.value = walletAddress;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
            }

            setCopiedClientCreditWalletAddress(walletAddress);
            window.setTimeout(() => {
                setCopiedClientCreditWalletAddress((current) => (current === walletAddress ? "" : current));
            }, 1600);
        } catch {
            toast.error("지갑주소 복사에 실패했습니다.");
        }
    };

    useEffect(() => {
        const walletAddress = resolveClientCreditWalletAddress(clientCreditWallet);

        if (!walletAddress) {
            setClientCreditWalletRawBalance("0");
            setClientCreditWalletBalance("0");
            setLastClientCreditWalletBalanceUpdatedAt("");
            return;
        }

        let active = true;

        const run = async () => {
            if (!active) {
                return;
            }
            await loadClientCreditWalletBalance(walletAddress, true);
        };

        void run();
        const intervalId = window.setInterval(() => {
            void run();
        }, CLIENT_CREDIT_WALLET_BALANCE_POLLING_MS);

        return () => {
            active = false;
            window.clearInterval(intervalId);
        };
    }, [clientCreditWallet, loadClientCreditWalletBalance]);






    return (

        <main className="min-h-[100vh] bg-[radial-gradient(120%_120%_at_0%_0%,#fff7ed_0%,#fef2f2_38%,#eff6ff_78%,#f8fafc_100%)] px-4 py-8">
            <div className="w-full max-w-screen-md mx-auto">
                <div className="rounded-[32px] border border-slate-200/70 bg-white/85 p-6 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.7)] backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                            onClick={() => window.history.back()}
                            className="group inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
                        >
                            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                                <Image
                                    src="/icon-back.png"
                                    alt="Back"
                                    width={18}
                                    height={18}
                                    className="rounded-full"
                                />
                            </span>
                            돌아가기
                        </button>
                        {storecode && (
                            <span className="rounded-full border border-slate-200/70 bg-slate-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                {storecode}
                            </span>
                        )}
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                                <Image
                                    src="/icon-gear.png"
                                    alt="Settings"
                                    width={20}
                                    height={20}
                                    className="rounded-full"
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                    Backoffice Center Settings
                                </span>
                                <span className="text-2xl font-semibold text-slate-900">
                                    센터 설정
                                </span>
                            </div>
                            <span className="ml-auto rounded-full border border-slate-200/70 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-500">
                                CLIENTID: {clientId || 'Loading...'}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500">
                            서비스 전체 운영 정보를 관리합니다.
                        </p>
                    </div>

                    {clientInfo ? (
                        <div className="mt-6 flex flex-col gap-5">
                            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.5)]">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                            서비스 네트워크
                                        </span>
                                        <h3 className="text-lg font-semibold text-slate-900">
                                            운영 체인 선택
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            네트워크 변경 시 즉시 적용됩니다.
                                        </p>
                                    </div>
                                    <span className="rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                        {activeNetwork?.label || chain}
                                    </span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {NETWORK_OPTIONS.map((option) => {
                                        const isSelected = chain === option.id;
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                disabled={updatingNetwork}
                                                onClick={() => updateNetwork(option.id)}
                                                className={`group flex flex-col items-start gap-2 rounded-2xl border px-3 py-3 text-left transition ${
                                                    isSelected
                                                        ? 'border-emerald-300/80 bg-emerald-50/70 shadow-[0_12px_30px_-24px_rgba(16,185,129,0.4)]'
                                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                                } ${updatingNetwork ? 'cursor-not-allowed opacity-60' : ''}`}
                                            >
                                                <div className="flex w-full items-center justify-between">
                                                    <Image
                                                        src={option.logo}
                                                        alt={`${option.label} logo`}
                                                        width={24}
                                                        height={24}
                                                        className="h-6 w-6 rounded-full"
                                                    />
                                                    {isSelected && (
                                                        <span className="rounded-full border border-emerald-200/70 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                                                            선택됨
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm font-semibold text-slate-900">
                                                    {option.label}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {option.subtitle}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                {updatingNetwork && (
                                    <p className="mt-3 text-xs font-semibold text-slate-400">
                                        네트워크 변경 중...
                                    </p>
                                )}
                            </section>

                            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.5)]">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                            회원 지갑 설정
                                        </span>
                                        <h3 className="text-lg font-semibold text-slate-900">
                                            스마트 어카운트 사용
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            true/false 설정은 즉시 적용됩니다.
                                        </p>
                                    </div>
                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                        smartAccountEnabled
                                            ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200/70 bg-slate-100 text-slate-600'
                                    }`}>
                                        {smartAccountEnabled ? "true" : "false"}
                                    </span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        disabled={updatingSmartAccount}
                                        onClick={() => updateSmartAccount(true)}
                                        className={`group flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                                            smartAccountEnabled
                                                ? 'border-emerald-300/80 bg-emerald-50/70 shadow-[0_12px_30px_-24px_rgba(16,185,129,0.4)]'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        } ${updatingSmartAccount ? 'cursor-not-allowed opacity-60' : ''}`}
                                    >
                                        <span className="text-sm font-semibold text-slate-900">true</span>
                                        <span className="text-xs text-slate-500">스마트 어카운트 사용</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={updatingSmartAccount}
                                        onClick={() => updateSmartAccount(false)}
                                        className={`group flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                                            !smartAccountEnabled
                                                ? 'border-slate-300 bg-slate-50 shadow-[0_12px_30px_-24px_rgba(148,163,184,0.5)]'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        } ${updatingSmartAccount ? 'cursor-not-allowed opacity-60' : ''}`}
                                    >
                                        <span className="text-sm font-semibold text-slate-900">false</span>
                                        <span className="text-xs text-slate-500">일반 지갑 사용</span>
                                    </button>
                                </div>
                                {updatingSmartAccount && (
                                    <p className="mt-3 text-xs font-semibold text-slate-400">
                                        스마트 어카운트 설정 변경 중...
                                    </p>
                                )}
                            </section>

                            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.5)]">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-slate-900">
                                        센터 기본 정보
                                    </h3>
                                    <span className="text-xs font-semibold text-slate-400">
                                        Service Profile
                                    </span>
                                </div>
                                <div className="mt-4 flex flex-col gap-4">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-slate-500">
                                            센터 로고
                                        </label>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                                {clientLogo ? (
                                                    <Image
                                                        src={clientLogo}
                                                        alt="센터 로고"
                                                        fill
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-400">
                                                        LOGO
                                                    </div>
                                                )}
                                            </div>
                                            <label className={`inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                                                uploadingCenterLogo
                                                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                            }`}>
                                                {uploadingCenterLogo ? '업로드 중...' : '로고 업로드'}
                                                <input
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                                                    className="hidden"
                                                    disabled={uploadingCenterLogo}
                                                    onChange={handleCenterLogoUpload}
                                                />
                                            </label>
                                            <span className="text-xs text-slate-400">
                                                PNG/JPG/WEBP/GIF/SVG (최대 10MB)
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-slate-500">
                                            센터 이름
                                        </label>
                                        <input
                                            type="text"
                                            value={clientName}
                                            onChange={(e) => setClientName(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            placeholder="센터 이름"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-slate-500">
                                            센터 소개
                                        </label>
                                        <textarea
                                            value={clientDescription}
                                            rows={4}
                                            onChange={(e) => setClientDescription(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            placeholder="센터 소개"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <label className="text-xs font-semibold text-slate-500">
                                            카피라이트 문구
                                        </label>
                                        <input
                                            type="text"
                                            value={clientCopyright}
                                            onChange={(e) => setClientCopyright(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            placeholder="Copyright © Your Center. All Rights Reserved"
                                        />
                                        <span className="text-xs text-slate-400">
                                            페이지 하단 푸터에 표시됩니다.
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <button
                                        type="button"
                                        disabled={savingCenterBasicInfo || isCenterBasicInfoUnchanged}
                                        onClick={updateCenterBasicInfo}
                                        className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
                                            savingCenterBasicInfo || isCenterBasicInfoUnchanged
                                                ? 'cursor-not-allowed bg-slate-300 text-slate-100'
                                                : 'bg-emerald-600 hover:bg-emerald-500'
                                        }`}
                                    >
                                        {savingCenterBasicInfo ? '저장 중...' : isCenterBasicInfoUnchanged ? '변경사항 없음' : '저장하기'}
                                    </button>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.5)]">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-slate-900">
                                        센터 수수료 수납지갑
                                    </h3>
                                    <span className="text-xs font-semibold text-slate-400">
                                        Credit Wallet
                                    </span>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    P2P 거래에서 발생한 플랫폼 수수료를 수납하기 위한 센터 전용 지갑입니다. 생성 시 `creditWallet` 형태로 `signerAddress`, `smartAccountAddress`가 저장됩니다.
                                </p>

                                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                            지갑주소 (smartAccountAddress)
                                        </span>
                                        {hasClientCreditWallet ? (
                                            <button
                                                type="button"
                                                onClick={copyClientCreditWalletAddress}
                                                className="w-full truncate rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                                                title={clientCreditWalletDisplayAddress}
                                            >
                                                {clientCreditWalletDisplayAddress}
                                            </button>
                                        ) : (
                                            <span className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
                                                아직 생성되지 않았습니다.
                                            </span>
                                        )}
                                        {copiedClientCreditWalletAddress && copiedClientCreditWalletAddress === clientCreditWalletDisplayAddress && (
                                            <span className="text-xs font-semibold text-emerald-600">지갑주소가 복사되었습니다.</span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-end justify-between gap-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                USDT 잔고
                                            </span>
                                            <span className="text-xl font-bold text-emerald-700">
                                                {formatUsdt(clientCreditWalletBalance)} USDT
                                            </span>
                                            <span className="text-[11px] text-slate-500">
                                                Raw: {clientCreditWalletRawBalance || "0"}
                                            </span>
                                            <span className="text-[11px] text-slate-500">
                                                마지막 갱신: {lastClientCreditWalletBalanceUpdatedAt ? new Date(lastClientCreditWalletBalanceUpdatedAt).toLocaleString("ko-KR") : "-"}
                                            </span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            {hasClientCreditWallet ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={loadingClientCreditWalletBalance}
                                                        onClick={() => loadClientCreditWalletBalance(undefined, false)}
                                                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                                            loadingClientCreditWalletBalance
                                                                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                                                                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                                        }`}
                                                    >
                                                        {loadingClientCreditWalletBalance ? "확인 중..." : "잔고 확인"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={recoveringClientCreditWallet || !isWalletAddress(String(address || "").trim())}
                                                        onClick={recoverClientCreditWalletBalance}
                                                        className={`rounded-xl px-3 py-2 text-sm font-semibold text-white transition ${
                                                            recoveringClientCreditWallet || !isWalletAddress(String(address || "").trim())
                                                                ? "cursor-not-allowed bg-slate-300 text-slate-100"
                                                                : "bg-rose-600 hover:bg-rose-500"
                                                        }`}
                                                    >
                                                        {recoveringClientCreditWallet ? "회수 요청 중..." : "전체 회수하기"}
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={creatingClientCreditWallet}
                                                    onClick={createClientCreditWallet}
                                                    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
                                                        creatingClientCreditWallet
                                                            ? "cursor-not-allowed bg-slate-300 text-slate-100"
                                                            : "bg-emerald-600 hover:bg-emerald-500"
                                                    }`}
                                                >
                                                    {creatingClientCreditWallet ? "생성 중..." : "생성하기"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.5)]">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-slate-900">
                                        환율 설정
                                    </h3>
                                    <span className="text-xs font-semibold text-slate-400">
                                        USDT 기준
                                    </span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                                    <div className="flex flex-col items-start justify-start space-y-1">
                                        <span className="text-xs font-semibold text-slate-500">
                                            USD
                                        </span>
                                        <input
                                            type="number"
                                            value={exchangeRateUSDT.USD}
                                            onChange={(e) => setExchangeRateUSDT({ ...exchangeRateUSDT, USD: Number(e.target.value) })}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        />
                                    </div>

                                    <div className="flex flex-col items-start justify-start space-y-1">
                                        <span className="text-xs font-semibold text-slate-500">
                                            KRW
                                        </span>
                                        <input
                                            type="number"
                                            value={exchangeRateUSDT.KRW}
                                            onChange={(e) => setExchangeRateUSDT({ ...exchangeRateUSDT, KRW: Number(e.target.value) })}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        />
                                    </div>

                                    <div className="flex flex-col items-start justify-start space-y-1">
                                        <span className="text-xs font-semibold text-slate-500">
                                            JPY
                                        </span>
                                        <input
                                            type="number"
                                            value={exchangeRateUSDT.JPY}
                                            onChange={(e) => setExchangeRateUSDT({ ...exchangeRateUSDT, JPY: Number(e.target.value) })}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        />
                                    </div>

                                    <div className="flex flex-col items-start justify-start space-y-1">
                                        <span className="text-xs font-semibold text-slate-500">
                                            CNY
                                        </span>
                                        <input
                                            type="number"
                                            value={exchangeRateUSDT.CNY}
                                            onChange={(e) => setExchangeRateUSDT({ ...exchangeRateUSDT, CNY: Number(e.target.value) })}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        />
                                    </div>

                                    <div className="flex flex-col items-start justify-start space-y-1">
                                        <span className="text-xs font-semibold text-slate-500">
                                            EUR
                                        </span>
                                        <input
                                            type="number"
                                            value={exchangeRateUSDT.EUR}
                                            onChange={(e) => setExchangeRateUSDT({ ...exchangeRateUSDT, EUR: Number(e.target.value) })}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <button
                                        type="button"
                                        disabled={savingExchangeRateUSDT}
                                        onClick={updateExchangeRateSettings}
                                        className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
                                            savingExchangeRateUSDT
                                                ? 'cursor-not-allowed bg-slate-300 text-slate-100'
                                                : 'bg-emerald-600 hover:bg-emerald-500'
                                        }`}
                                    >
                                        {savingExchangeRateUSDT ? '저장 중...' : '저장하기'}
                                    </button>
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className="mt-6 flex flex-col items-center justify-center">
                            <span className="text-sm text-slate-500">
                                Loading...
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </main>

    );

}

          
