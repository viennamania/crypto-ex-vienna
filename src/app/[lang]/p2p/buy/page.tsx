'use client';

import { useState, useEffect, use, act } from "react";

import Image from "next/image";



// open modal

///import Modal from '@/components/modal';

import ModalUser from '@/components/modal-user';

import { useRouter }from "next//navigation";


import { toast } from 'react-hot-toast';

import {
  clientId,
  client
} from "../../../client";



import {
  getContract,
  sendAndConfirmTransaction,
  sendTransaction,
  waitForReceipt,
  sendBatchTransaction,

  readContract,
} from "thirdweb";



import {
  //ConnectButton,

  useActiveAccount,
  useActiveWallet,
  useWalletBalance,

  useSetActiveWallet,

  useConnectedWallets,

  AutoConnect,

} from "thirdweb/react";

import {
  inAppWallet,
  createWallet,
} from "thirdweb/wallets";





import { getUserPhoneNumber } from "thirdweb/wallets/in-app";


import { balanceOf, transfer } from "thirdweb/extensions/erc20";
import { add } from "thirdweb/extensions/farcaster/keyGateway";
 


import AppBarComponent from "@/components/Appbar/AppBar";
import { getDictionary } from "../../../dictionaries";
//import Chat from "@/components/Chat";
import { ClassNames } from "@emotion/react";


import useSound from 'use-sound';

import { useSearchParams } from 'next/navigation';
import { useClientWallets } from "@/lib/useClientWallets";

import { getAllUsersForSettlementOfStore } from "@/lib/api/user";


import { paymentUrl } from "../../../config/payment";
import { version } from "../../../config/version";


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



import { useAnimatedNumber } from "@/components/useAnimatedNumber";




import { ConnectButton } from '@/components/OrangeXConnectButton';

interface BuyOrder {
  _id: string;
  createdAt: string;
  walletAddress: string;
  isWeb3Wallet: boolean;
  nickname: string;
  avatar: string;
  trades: number;
  price: number;
  available: number;
  limit: string;
  paymentMethods: string[];

  usdtAmount: number;
  krwAmount: number;
  rate: number;



  seller: any;

  tradeId: string;
  status: string;
  acceptedAt: string;
  paymentRequestedAt: string;
  paymentConfirmedAt: string;
  paymentAmount: number;
  cancelledAt: string;


  buyer: any;

  canceller: string;

  escrowTransactionHash: string;
  transactionHash: string;

  storecode: string;
  store: any;

  settlement: any;

  agentFeeRate: number;
  centerFeeRate: number;
  tradeFeeRate: number;

  cancelTradeReason: string;


  autoConfirmPayment: boolean;

  agent: any;

  userStats: any;


  settlementUpdatedAt: string;
  settlementUpdatedBy: string; // who updates the settlement

  transactionHashFail: boolean; // if the transaction failed, set this to true

  audioOn: boolean; // default true, used for audio notification in trade history page



  paymentMethod: string;

  escrowWallet: {
    address: string;
    balance: number;
    transactionHash: string;
  };

  platformFee: {
    percentage: number;
    address: string;
  };

}



const walletAuthOptions = ["email", "google", "phone"];
const SELLER_CARD_TONES = [
  {
    card: "border-slate-200 bg-white",
    header: "border-slate-200 bg-slate-50",
  },
  {
    card: "border-slate-200 bg-white",
    header: "border-slate-200 bg-slate-50",
  },
  {
    card: "border-slate-200 bg-white",
    header: "border-slate-200 bg-slate-50",
  },
];

const SELLER_STATUS_LABEL: Record<string, string> = {
  accepted: '주문 수락됨',
  paymentRequested: '입금 요청',
  paymentConfirmed: '입금 확인',
  cancelled: '거래 취소',
  ordered: '주문 대기',
};

const SELLER_STATUS_BADGE: Record<string, string> = {
  accepted: 'border-amber-200 bg-amber-50 text-amber-800',
  paymentRequested: 'border-blue-200 bg-blue-50 text-blue-800',
  paymentConfirmed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-800',
  ordered: 'border-slate-200 bg-slate-50 text-slate-700',
};

const SELLER_STATUS_DOT: Record<string, string> = {
  accepted: 'bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.16)]',
  paymentRequested: 'bg-blue-500 shadow-[0_0_0_6px_rgba(59,130,246,0.16)]',
  paymentConfirmed: 'bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.16)]',
  cancelled: 'bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.16)]',
  ordered: 'bg-slate-400 shadow-[0_0_0_6px_rgba(148,163,184,0.16)]',
};



export default function Index({ params }: any) {

  const searchParams = useSearchParams();
  const { wallet, wallets } = useClientWallets({
    authOptions: walletAuthOptions,
    defaultSmsCountryCode: 'KR',
  });
  const availableWallets = wallets.length ? wallets : [wallet];
 
  ////////const wallet = searchParams.get('wallet');


  // limit, page number params
  /*
  const limit = searchParams.get('limit') || 20;
  const page = searchParams.get('page') || 1;

  useEffect(() => {
    if (searchParams.get('limit')) {
      setLimitValue(searchParams.get('limit') || 20);
    }
    if (searchParams.get('page')) {
      setPageValue(searchParams.get('page') || 1);
    }
  }, [searchParams]);
  */


 




  const searchParamsStorecode = searchParams.get('storecode') || "";


  const activeWallet = useActiveWallet();


  const contract = getContract({
    // the client you have created via `createThirdwebClient()`
    client,
    // the chain the contract is deployed on
    
    
    //chain: arbitrum,
    chain:  chain === "ethereum" ? ethereum :
            chain === "polygon" ? polygon :
            chain === "arbitrum" ? arbitrum :
            chain === "bsc" ? bsc : arbitrum,
  
  
  
    // the contract's address
    ///address: contractAddressArbitrum,

    address: chain === "ethereum" ? ethereumContractAddressUSDT :
            chain === "polygon" ? polygonContractAddressUSDT :
            chain === "arbitrum" ? arbitrumContractAddressUSDT :
            chain === "bsc" ? bscContractAddressUSDT : arbitrumContractAddressUSDT,


    // OPTIONAL: the contract's abi
    //abi: [...],
  });




  const contractMKRW = getContract({
    // the client you have created via `createThirdwebClient()`
    client,

    // the chain the contract is deployed on
    chain: bsc,

    // the contract's address
    address: bscContractAddressMKRW,

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
    Buy: "",
    Sell: "",
    Amount: "",
    Price: "",
    Total: "",
    Orders: "",
    Trades: "",
    Search_my_trades: "",

    Anonymous: "",

    Seller: "",
    Buyer: "",
    Me: "",

    Buy_USDT: "",
    Rate: "",
    Payment: "",
    Bank_Transfer: "",

    I_agree_to_the_terms_of_trade: "",
    I_agree_to_cancel_the_trade: "",

    Opened_at: "",
    Cancelled_at: "",
    Completed_at: "",


    Opened: "",
    Completed: "",
    Cancelled: "",


    Waiting_for_seller_to_deposit: "",

    to_escrow: "",
    If_the_seller_does_not_deposit_the_USDT_to_escrow: "",
    this_trade_will_be_cancelled_in: "",

    Cancel_My_Trade: "",


    Order_accepted_successfully: "",
    Order_has_been_cancelled: "",
    My_Order: "",

    hours: "",
    minutes: "",
    seconds: "",

    hours_ago: "",
    minutes_ago: "",
    seconds_ago: "",

    Order_Opened: "",
    Trade_Started: "",
    Expires_in: "",

    Accepting_Order: "",

    Escrow: "",

    Chat_with_Seller: "",
    Chat_with_Buyer: "",

    Table_View: "",

    TID: "",

    Status: "",

    Sell_USDT: "",

    Buy_Order_Opened: "",
  
    Insufficient_balance: "",


    Request_Payment: "",

    Payment_has_been_confirmed: "",

    Confirm_Payment: "",

    Escrow_Completed: "",

    Buy_Order_Accept: "",

    Payment_Amount: "",

    Buy_Amount: "",

    Deposit_Name: "",

    My_Balance: "",

    Make_Escrow_Wallet: "",
    Escrow_Wallet_Address_has_been_created: "",
    Failed_to_create_Escrow_Wallet_Address: "",

    Newest_order_has_been_arrived: "",
    Payment_request_has_been_sent: "",
    Escrow_balance_is_less_than_payment_amount: "",

    Copied_Wallet_Address: "",


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
    Buy,
    Sell,
    Amount,
    Price,
    Total,
    Orders,
    Trades,
    Search_my_trades,

    Anonymous,

    Seller,
    Buyer,
    Me,

    Buy_USDT,
    Rate,
    Payment,
    Bank_Transfer,
    I_agree_to_the_terms_of_trade,
    I_agree_to_cancel_the_trade,

    Opened_at,
    Cancelled_at,
    Completed_at,

    Opened,
    Completed,
    Cancelled,

    Waiting_for_seller_to_deposit,

    to_escrow,

    If_the_seller_does_not_deposit_the_USDT_to_escrow,
    this_trade_will_be_cancelled_in,

    Cancel_My_Trade,

    Order_accepted_successfully,
    Order_has_been_cancelled,
    My_Order,

    hours,
    minutes,
    seconds,

    hours_ago,
    minutes_ago,
    seconds_ago,

    Order_Opened,
    Trade_Started,
    Expires_in,

    Accepting_Order,

    Escrow,

    Chat_with_Seller,
    Chat_with_Buyer,

    Table_View,

    TID,

    Status,

    Sell_USDT,

    Buy_Order_Opened,

    Insufficient_balance,

    Request_Payment,

    Payment_has_been_confirmed,

    Confirm_Payment,

    Escrow_Completed,

    Buy_Order_Accept,

    Payment_Amount,

    Buy_Amount,

    Deposit_Name,

    My_Balance,

    Make_Escrow_Wallet,
    Escrow_Wallet_Address_has_been_created,
    Failed_to_create_Escrow_Wallet_Address,

    Newest_order_has_been_arrived,
    Payment_request_has_been_sent,
    Escrow_balance_is_less_than_payment_amount,

    Copied_Wallet_Address,

  } = data;




  const router = useRouter();
  const isContactTransferBank = (bankInfo: any) => bankInfo?.bankName === '연락처송금';



  /*
  const setActiveAccount = useSetActiveWallet();
 

  const connectWallets = useConnectedWallets();

  const smartConnectWallet = connectWallets?.[0];
  const inAppConnectWallet = connectWallets?.[1];
  */


  const activeAccount = useActiveAccount();

  const address = activeAccount?.address;
  const shortAddress = address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : '';
  const [walletCopied, setWalletCopied] = useState(false);

  const handleCopyWallet = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success(Copied_Wallet_Address || '지갑주소가 복사되었습니다.');
      setWalletCopied(true);
      window.setTimeout(() => setWalletCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy wallet address', error);
      toast.error('복사에 실패했습니다.');
    }
  };



  const [phoneNumber, setPhoneNumber] = useState("");

  
  useEffect(() => {

    if (address) {

  

      //const phoneNumber = await getUserPhoneNumber({ client });
      //setPhoneNumber(phoneNumber);


      getUserPhoneNumber({ client }).then((phoneNumber) => {
        setPhoneNumber(phoneNumber || "");
      });

    }

  } , [address]);
  


  //const [nativeBalance, setNativeBalance] = useState(0);
  const [balance, setBalance] = useState(0);
  useEffect(() => {

    // get the balance
    const getBalance = async () => {

      if (!address) {
        setBalance(0);
        return;
      }

      
      const result = await balanceOf({
        contract,
        address: address,
      });

  
      if (chain === 'bsc') {
        setBalance( Number(result) / 10 ** 18 );
      } else {
        setBalance( Number(result) / 10 ** 6 );
      }


    };


    if (address) getBalance();

    
    const interval = setInterval(() => {
      if (address) getBalance();
    } , 5000);

    return () => clearInterval(interval);
    

  } , [address, contract]);




  // balance of MKRW
  const [mkrwBalance, setMkrwBalance] = useState(0);
  useEffect(() => {
    if (!address) {
      return;
    }
    // get the balance
    const getMkrwBalance = async () => {
      const result = await balanceOf({
        contract: contractMKRW,
        address: address,
      });
  
      setMkrwBalance( Number(result) / 10 ** 18 );

  
    };
    if (address) getMkrwBalance();
    const interval = setInterval(() => {
      if (address) getMkrwBalance();
    } , 5000);
    return () => clearInterval(interval);
  }, [address, contractMKRW]);











  const [escrowWalletAddress, setEscrowWalletAddress] = useState('');
  const [makeingEscrowWallet, setMakeingEscrowWallet] = useState(false);

  const makeEscrowWallet = async () => {
      
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }


    setMakeingEscrowWallet(true);

    fetch('/api/order/getEscrowWalletAddress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lang: params.lang,
        storecode: "admin",
        walletAddress: address,
        //isSmartAccount: activeWallet === inAppConnectWallet ? false : true,
        isSmartAccount: false,
      }),
    })
    .then(response => response.json())
    .then(data => {
        
        //console.log('getEscrowWalletAddress data.result', data.result);


        if (data.result) {
          setEscrowWalletAddress(data.result.escrowWalletAddress);
          toast.success(Escrow_Wallet_Address_has_been_created);
        } else {
          toast.error(Failed_to_create_Escrow_Wallet_Address);
        }
    })
    .finally(() => {
      setMakeingEscrowWallet(false);
    });

  }

  //console.log("escrowWalletAddress", escrowWalletAddress);




  // get escrow wallet address and balance
  
  const [escrowBalance, setEscrowBalance] = useState(0);
  const [escrowNativeBalance, setEscrowNativeBalance] = useState(0);

  
  useEffect(() => {

    const getEscrowBalance = async () => {

      if (!address) {
        setEscrowBalance(0);
        return;
      }

      if (!escrowWalletAddress || escrowWalletAddress === '') return;


      
      const result = await balanceOf({
        contract,
        address: escrowWalletAddress,
      });

      //console.log('escrowWalletAddress balance', result);

  
      setEscrowBalance( Number(result) / 10 ** 6 );
            


      /*
      await fetch('/api/user/getUSDTBalanceByWalletAddress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storecode: "admin",
          walletAddress: escrowWalletAddress,
        }),
      })
      .then(response => response?.json())
      .then(data => {

        console.log('getUSDTBalanceByWalletAddress data.result.displayValue', data.result?.displayValue);

        setEscrowBalance(data.result?.displayValue);

      } );
       */




      await fetch('/api/user/getBalanceByWalletAddress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storecode: "admin",
          walletAddress: escrowWalletAddress,
        }),
      })
      .then(response => response?.json())
      .then(data => {


        ///console.log('getBalanceByWalletAddress data', data);


        setEscrowNativeBalance(data.result?.displayValue);

      });
      



    };

    getEscrowBalance();

    const interval = setInterval(() => {
      getEscrowBalance();
    } , 5000);

    return () => clearInterval(interval);

  } , [address, escrowWalletAddress, contract,]);
  

  //console.log('escrowBalance', escrowBalance);







  

  // get User by wallet address
  const [isAdmin, setIsAdmin] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  
  useEffect(() => {

    if (!address) {

      setUser(null);
      return;
    }

    setLoadingUser(true);

    fetch('/api/user/getUser', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            storecode: "admin",
            walletAddress: address,
        }),
    })
    .then(response => response.json())
    .then(data => {
        
        //console.log('data.result', data.result);


        setUser(data.result);

        setEscrowWalletAddress(data.result.escrowWalletAddress);

        setIsAdmin(data.result?.role === "admin");

    })
    .catch((error) => {
        console.error('Error:', error);
    });


    setLoadingUser(false);

  } , [address]);



  const [isPlaying, setIsPlaying] = useState(false);
  //const [play, { stop }] = useSound(galaxySfx);
  const [play, { stop }] = useSound('/ding.mp3');

  function playSong() {
    setIsPlaying(true);
    play();
  }

  function stopSong() {
    setIsPlaying(false);
    stop();
  }






  const [isModalOpen, setModalOpen] = useState(false);

  const closeModal = () => setModalOpen(false);
  const openModal = () => setModalOpen(true);

  
  
  
  
  const [searchStorecode, setSearchStorecode] = useState("");
  useEffect(() => {
    setSearchStorecode(searchParamsStorecode || "");
  }, [searchParamsStorecode]);






  const [searchStoreName, setSearchStoreName] = useState("");




  const [searchOrderStatusCancelled, setSearchOrderStatusCancelled] = useState(false);
  const [searchOrderStatusCompleted, setSearchOrderStatusCompleted] = useState(false);


  const [searchMyOrders, setSearchMyOrders] = useState(false);






  /*
  // search form date to date
  const [searchFormDate, setSearchFromDate] = useState("");
  // from date is not today, but today - 30 days
  useEffect(() => {
    
    ///from date isAdmin not today, but today - 30 days
    const today = new Date();
    const formattedDate = new Date(today.setDate(today.getDate() - 30)).toISOString().split('T')[0]; // YYYY-MM-DD format
    setSearchFromDate(formattedDate);
  }, []);



  const [searchToDate, setSearchToDate] = useState("");
  useEffect(() => {
    const today = new Date();
    const toDate = new Date(today.setDate(today.getDate() + 1)); // add 1 day to today
    setSearchToDate(toDate.toISOString().split('T')[0]); // YYYY-MM-DD format
  }, []);
  */



  /*
  // limit number
  const [limitValue, setLimitValue] = useState(limit || 20);

  // page number
  const [pageValue, setPageValue] = useState(page || 1);
  */

 const [limitValue, setLimitValue] = useState(20);
  useEffect(() => {
    const limit = searchParams.get('limit') || 20;
    setLimitValue(Number(limit));
  }, [searchParams]);



  const [pageValue, setPageValue] = useState(1);
  useEffect(() => {
    const page = searchParams.get('page') || 1;
    setPageValue(Number(page));
  }, [searchParams]);



  const today = new Date();
  today.setHours(today.getHours() + 9); // Adjust for Korean timezone (UTC+9)
  const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format

  // search form date to date
  const [searchFromDate, setSearchFromDate] = useState(formattedDate);
  const [searchToDate, setSearchToDate] = useState(formattedDate);





  //const [totalCount, setTotalCount] = useState(0);
    
  const [buyOrders, setBuyOrders] = useState<BuyOrder[]>([]);



  /*
  getAllBuyOrders result totalCount 367
getAllBuyOrders result totalKrwAmount 91645000
getAllBuyOrders result totalUsdtAmount 66409.36
getAllBuyOrders result totalSettlementCount 367
getAllBuyOrders result totalSettlementAmount 66021.883
getAllBuyOrders result totalSettlementAmountKRW 91110233
getAllBuyOrders result totalFeeAmount 387.477
getAllBuyOrders result totalFeeAmountKRW 534718.74
getAllBuyOrders result totalAgentFeeAmount 0
getAllBuyOrders result totalAgentFeeAmountKRW 0
*/
  /*
  const [buyOrderStats, setBuyOrderStats] = useState({
    totalCount: 0,
    totalKrwAmount: 0,
    totalUsdtAmount: 0,
    totalSettlementCount: 0,
    totalSettlementAmount: 0,
    totalSettlementAmountKRW: 0,
    totalFeeAmount: 0,
    totalFeeAmountKRW: 0,
    totalAgentFeeAmount: 0,
    totalAgentFeeAmountKRW: 0,
  });

  */

 const [buyOrderStats, setBuyOrderStats] = useState<{
    totalCount: number;
    totalKrwAmount: number;
    totalUsdtAmount: number;
    totalSettlementCount: number;
    totalSettlementAmount: number;
    totalSettlementAmountKRW: number;
    totalFeeAmount: number;
    totalFeeAmountKRW: number;
    totalAgentFeeAmount: number;
    totalAgentFeeAmountKRW: number;

    /*
    totalByUserType: Array<{
      _id: string;
      totalCount: number;
      totalKrwAmount: number;
      totalUsdtAmount: number;
    }>;
    */

    totalByBuyerDepositName: Array<{
        _id: string;
        totalCount: number;
        totalKrwAmount: number;
        totalUsdtAmount: number;
      }>;
    totalReaultGroupByBuyerDepositNameCount: number;

    /*
    totalBySellerBankAccountNumber: Array<{
      _id: string;
      totalCount: number;
      totalKrwAmount: number;
      totalUsdtAmount: number;
      bankUserInfo: any;
    }>;
    */
  }>({
    totalCount: 0,
    totalKrwAmount: 0,
    totalUsdtAmount: 0,
    totalSettlementCount: 0,
    totalSettlementAmount: 0,
    totalSettlementAmountKRW: 0,
    totalFeeAmount: 0,
    totalFeeAmountKRW: 0,
    totalAgentFeeAmount: 0,
    totalAgentFeeAmountKRW: 0,

    //totalByUserType: [],
    
    totalByBuyerDepositName: [],
    totalReaultGroupByBuyerDepositNameCount: 0,

    
    //totalBySellerBankAccountNumber: [],
  });




  const animatedTotalCount = useAnimatedNumber(buyOrderStats.totalCount);
  const animatedTotalUsdtAmount = useAnimatedNumber(buyOrderStats.totalUsdtAmount, { decimalPlaces: 3 });
  const animatedTotalKrwAmount = useAnimatedNumber(buyOrderStats.totalKrwAmount);

  const animatedTotalSettlementCount = useAnimatedNumber(buyOrderStats.totalSettlementCount);
  const animatedTotalSettlementAmount = useAnimatedNumber(buyOrderStats.totalSettlementAmount, { decimalPlaces: 3 });
  const animatedTotalSettlementAmountKRW = useAnimatedNumber(buyOrderStats.totalSettlementAmountKRW);







  const [buyerDisplayValueArray, setBuyerDisplayValueArray] = useState<number[]>([]);
  function updateBuyerDisplayValue(index: number, value: number) {
    setBuyerDisplayValueArray((prevValues) => {
      const newValues = [...prevValues];
      newValues[index] = value;
      return newValues;
    });
  }

  useEffect(() => {
    buyOrderStats.totalByBuyerDepositName.forEach((item, index) => {
      const targetValue = item.totalKrwAmount;
      const duration = 1000; // animation duration in ms
      const startValue = buyerDisplayValueArray[index] || 0;
      const startTime = performance.now();
      function animate(currentTime: number) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentValue = startValue + (targetValue - startValue) * progress;
        updateBuyerDisplayValue(index, Math.round(currentValue));
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      }
      requestAnimationFrame(animate);
    });
  }, [buyOrderStats.totalByBuyerDepositName]);










  //console.log('buyOrders', buyOrders);


  // cancel buy order function

  const [cancellingBuyOrders, setCancellingBuyOrders] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
    cancellingBuyOrders.push(false);
  }

  const cancelBuyOrderByAdmin = (index: number, orderId: string) => {
    if (cancellingBuyOrders[index]) {
      return;
    }
    setCancellingBuyOrders(
      cancellingBuyOrders.map((item, idx) => idx === index ? true : item)
    );
    fetch('/api/order/cancelBuyOrderByAdmin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress: address,
        orderId: orderId,
      }),
    })
    .then(response => response.json())
    .then(data => {
      console.log('cancelBuyOrder data', data);
      if (data.result) {
        toast.success('Buy order has been cancelled');
        setBuyOrders(
          buyOrders.filter((item, idx) => idx !== index)
        );
      } else {
        toast.error('Failed to cancel buy order');
      }
    })
    .finally(() => {
      setCancellingBuyOrders(
        cancellingBuyOrders.map((item, idx) => idx === index ? false : item)
      );
    });
  }


  



  /* agreement for trade */
  const [agreementForTrade, setAgreementForTrade] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
      agreementForTrade.push(false);
  }
  /*
  useEffect(() => {
      setAgreementForTrade (
          buyOrders.map((item, idx) => {
              return false;
          })
      );
  } , [buyOrders]);
    */
    
    
  // initialize false array of 100
  const [acceptingBuyOrder, setAcceptingBuyOrder] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
      acceptingBuyOrder.push(false);
  }

   



   
    /*
    useEffect(() => {
        setAcceptingBuyOrder (
            buyOrders.map((item, idx) => {
                return false;
            })
        );
    } , [buyOrders]);
     */


    /*
    // sms receiver mobile number array
    const [smsReceiverMobileNumbers, setSmsReceiverMobileNumbers] = useState([] as string[]);
    useEffect(() => {
        setSmsReceiverMobileNumbers(
            buyOrders.map((item, idx) => {
                return user?.mobile || '';
            })
        );
    } , [buyOrders, user]);
    */

  const [smsReceiverMobileNumber, setSmsReceiverMobileNumber] = useState('');
  useEffect(() => {
      setSmsReceiverMobileNumber(phoneNumber);
  } , [phoneNumber]);



  const acceptBuyOrder = (
    index: number,
    orderId: string,
    smsNumber: string,

    tradeId: string,
    walletAddress: string,
  ) => {

      if (!address) {
          toast.error('Please connect your wallet');
          return;
      }

      /*
      if (!escrowWalletAddress || escrowWalletAddress === '') {
        toast.error('에스크로 지갑이 없습니다.');
        return;
      }
      */

      setAcceptingBuyOrder (
        acceptingBuyOrder.map((item, idx) => idx === index ? true : item)
      );


      fetch('/api/order/acceptBuyOrder', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              lang: params.lang,
              storecode: "admin",
              orderId: orderId,
              sellerWalletAddress: address,
              sellerStorecode: "admin",

              /*
              sellerNickname: user ? user.nickname : '',
              sellerAvatar: user ? user.avatar : '',

              //buyerMobile: user.mobile,

              sellerMobile: smsNumber,
              */



              seller: user?.seller,

              tradeId: tradeId,
              buyerWalletAddress: walletAddress,

          }),
      })
      .then(response => response.json())
      .then(data => {

          console.log('data', data);

          //setBuyOrders(data.result.orders);
          //openModal();

          toast.success(Order_accepted_successfully);

          playSong();



          fetch('/api/order/getAllBuyOrders', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify(
                {
                  storecode: searchStorecode,
                  limit: Number(limitValue),
                  page: Number(pageValue),
                  walletAddress: address,
                  searchMyOrders: searchMyOrders,
                  searchOrderStatusCancelled: searchOrderStatusCancelled,
                  searchOrderStatusCompleted: searchOrderStatusCompleted,

                  searchStoreName: searchStoreName,

                  fromDate: searchFromDate,
                  toDate: searchToDate,

                }
              ),
          })
          .then(response => response.json())
          .then(data => {
              ///console.log('data', data);
              setBuyOrders(data.result.orders);

              //setTotalCount(data.result.totalCount);

              setBuyOrderStats({
                totalCount: data.result.totalCount,
                totalKrwAmount: data.result.totalKrwAmount,
                totalUsdtAmount: data.result.totalUsdtAmount,
                totalSettlementCount: data.result.totalSettlementCount,
                totalSettlementAmount: data.result.totalSettlementAmount,
                totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
                totalFeeAmount: data.result.totalFeeAmount,
                totalFeeAmountKRW: data.result.totalFeeAmountKRW,
                totalAgentFeeAmount: data.result.totalAgentFeeAmount,
                totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

                totalByBuyerDepositName: data.result.totalByBuyerDepositName,
                totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
              });

          })



      })
      .catch((error) => {
          console.error('Error:', error);
      })
      .finally(() => {


          setAgreementForTrade (
            agreementForTrade.map((item, idx) => idx === index ? false : item)
          );


          setAcceptingBuyOrder (
              acceptingBuyOrder.map((item, idx) => idx === index ? false : item)
          );

      } );


  }







  // agreement for cancel trade
  const [agreementForCancelTrade, setAgreementForCancelTrade] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
    agreementForCancelTrade.push(false);
  }
  /*
  useEffect(() => {
    setAgreementForCancelTrade(
      buyOrders.map(() => false)
    );
  } , [buyOrders]);
   */


  // cancelReason
  const [cancelTradeReason, setCancelTradeReason] = useState([] as string[]);
  for (let i = 0; i < 100; i++) {
    cancelTradeReason.push('');
  }




    // cancel sell order state
    const [cancellings, setCancellings] = useState([] as boolean[]);
    for (let i = 0; i < 100; i++) {
      cancellings.push(false);
    }
    /*
    useEffect(() => {
      setCancellings(buyOrders.map(() => false));
    }, [buyOrders]);
    */





  const cancelTrade = async (orderId: string, index: number) => {



    if (cancellings[index]) {
      return;
    }



    setCancellings(
      cancellings.map((item, i) => i === index ? true : item)
    );


    // if escrowWallet is exists, call cancelTradeBySellerWithEscrow API
    const buyOrder = buyOrders[index];

    if (buyOrder?.escrowWallet && buyOrder?.escrowWallet?.transactionHash) {

      try {

      const result = await fetch('/api/order/cancelTradeBySellerWithEscrow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: orderId,
          storecode: "admin",
          walletAddress: address,
          cancelTradeReason: cancelTradeReason[index],
        })

      });

      const data = await result.json();
      //console.log('cancelTradeBySellerWithEscrow data', data);


      if (data.result) {

        toast.success(Order_has_been_cancelled);

        playSong();

        await fetch('/api/order/getAllBuyOrders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(
            {
              storecode: searchStorecode,
              limit: Number(limitValue),
              page: Number(pageValue),
              walletAddress: address,
              searchMyOrders: searchMyOrders,
              searchOrderStatusCancelled: searchOrderStatusCancelled,
              searchOrderStatusCompleted: searchOrderStatusCompleted,

              searchStoreName: searchStoreName,

              fromDate: searchFromDate,
              toDate: searchToDate,
            }
          )
        }).then(async (response) => {
          const data = await response.json();
          //console.log('data', data);
          if (data.result) {
            setBuyOrders(data.result.orders);

            ////setTotalCount(data.result.totalCount);

            setBuyOrderStats({
              totalCount: data.result.totalCount,
              totalKrwAmount: data.result.totalKrwAmount,
              totalUsdtAmount: data.result.totalUsdtAmount,
              totalSettlementCount: data.result.totalSettlementCount,
              totalSettlementAmount: data.result.totalSettlementAmount,
              totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
              totalFeeAmount: data.result.totalFeeAmount,
              totalFeeAmountKRW: data.result.totalFeeAmountKRW,
              totalAgentFeeAmount: data.result.totalAgentFeeAmount,
              totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

              totalByBuyerDepositName: data.result.totalByBuyerDepositName,
              totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
            });

          }
        });

      } else {
        toast.error('판매취소에 실패했습니다.');
      }




      } catch (error) {
        console.error('Error cancelling trade with escrow:', error);
        toast.error('판매취소에 실패했습니다.');
        setCancellings(
          cancellings.map((item, i) => i === index ? false : item)
        );
        return;
    }


    } else {

      const response = await fetch('/api/order/cancelTradeBySeller', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: orderId,
          storecode: "admin",
          walletAddress: address,
          cancelTradeReason: cancelTradeReason[index],
        })
      });

      if (!response.ok) {
        toast.error('판매취소에 실패했습니다.');
        setCancellings(
          cancellings.map((item, i) => i === index ? false : item)
        );
        return;
      }

      const data = await response.json();

      ///console.log('data', data);

      if (data.result) {

        toast.success(Order_has_been_cancelled);

        //playSong();


        await fetch('/api/order/getAllBuyOrders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(
            {
              storecode: searchStorecode,
              limit: Number(limitValue),
              page: Number(pageValue),
              walletAddress: address,
              searchMyOrders: searchMyOrders,
              searchOrderStatusCancelled: searchOrderStatusCancelled,
              searchOrderStatusCompleted: searchOrderStatusCompleted,

              searchStoreName: searchStoreName,

              fromDate: searchFromDate,
              toDate: searchToDate,
            }
          )
        }).then(async (response) => {
          const data = await response.json();
          //console.log('data', data);
          if (data.result) {
            setBuyOrders(data.result.orders);

            //setTotalCount(data.result.totalCount);

            setBuyOrderStats({
              totalCount: data.result.totalCount,
              totalKrwAmount: data.result.totalKrwAmount,
              totalUsdtAmount: data.result.totalUsdtAmount,
              totalSettlementCount: data.result.totalSettlementCount,
              totalSettlementAmount: data.result.totalSettlementAmount,
              totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
              totalFeeAmount: data.result.totalFeeAmount,
              totalFeeAmountKRW: data.result.totalFeeAmountKRW,
              totalAgentFeeAmount: data.result.totalAgentFeeAmount,
              totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

              totalByBuyerDepositName: data.result.totalByBuyerDepositName,
              totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
            });


          }
        });

      } else {
        toast.error('판매취소에 실패했습니다.');
      }


    }



    setAgreementForCancelTrade(
      agreementForCancelTrade.map((item, i) => i === index ? false : item)
    );

    setCancellings(
      cancellings.map((item, i) => i === index ? false : item)
    );

  }









    // request payment check box
    const [requestPaymentCheck, setRequestPaymentCheck] = useState([] as boolean[]);
    for (let i = 0; i < 100; i++) {
      requestPaymentCheck.push(false);
    }

    /*
    useEffect(() => {
        
        setRequestPaymentCheck(
          new Array(buyOrders.length).fill(false)
        );
  
    } , [buyOrders]);
     */
    




    // array of escrowing
    const [escrowing, setEscrowing] = useState([] as boolean[]);
    for (let i = 0; i < 100; i++) {
      escrowing.push(false);
    }

    /*
    useEffect(() => {
        
        setEscrowing(
          new Array(buyOrders.length).fill(false)
        );
  
    } , [buyOrders]);
     */

    // array of requestingPayment
    const [requestingPayment, setRequestingPayment] = useState([] as boolean[]);
    for (let i = 0; i < 100; i++) {
      requestingPayment.push(false);
    }


    /*
    useEffect(() => {

      setRequestingPayment(

        new Array(buyOrders.length).fill(false)

      );

    } , [buyOrders]);
      */





  // without escrow
  const [isWithoutEscrow, setIsWithoutEscrow] = useState(true);


  const requestPayment = async (
    index: number,
    orderId: string,
    tradeId: string,
    amount: number,
    storecode: string,


    bankInfo: any,
  ) => {


    // check escrowWalletAddress

    if (!isWithoutEscrow && escrowWalletAddress === '') {
      toast.error('Recipient wallet address is empty');
      return;
    }

    // check balance
    // send payment request

    if (balance < amount) {
      toast.error(Insufficient_balance);
      return;
    }


    // check all escrowing is false
    if (!isWithoutEscrow && escrowing.some((item) => item === true)) {
      toast.error('Escrowing');
      return;
    }




    // check all requestingPayment is false
    if (requestingPayment.some((item) => item === true)) {
      toast.error('Requesting Payment');
      return;
    }


    if (!isWithoutEscrow) {


      setEscrowing(
        escrowing.map((item, idx) =>  idx === index ? true : item) 
      );
  

  


      // send USDT
      // Call the extension function to prepare the transaction
      const transaction = transfer({
        contract,
        to: escrowWalletAddress,
        amount: amount,
      });
      


      try {


        /*
        const transactionResult = await sendAndConfirmTransaction({
            account: smartAccount as any,
            transaction: transaction,
        });

        //console.log("transactionResult===", transactionResult);
        */

        /*
        const { transactionHash } = await sendTransaction({
          
          account: activeAccount as any,

          transaction,
        });
        */

        // sendAndConfirmTransaction
        const transactionHash = await sendAndConfirmTransaction({
          account: activeAccount as any,
          transaction,
        });



        ///console.log("transactionHash===", transactionHash);


        /*
        const transactionResult = await waitForReceipt({
          client,
          chain: arbitrum ,
          maxBlocksWaitTime: 1,
          transactionHash: transactionHash,
        });


        console.log("transactionResult===", transactionResult);
        */
  

        // send payment request

        //if (transactionResult) {
        if (transactionHash) {

          
          setRequestingPayment(
            requestingPayment.map((item, idx) => idx === index ? true : item)
          );
          
          
          


        
          const response = await fetch('/api/order/buyOrderRequestPayment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              lang: params.lang,
              storecode: storecode,
              orderId: orderId,
              //transactionHash: transactionResult.transactionHash,
              transactionHash: transactionHash,
            })
          });

          const data = await response.json();

          //console.log('/api/order/buyOrderRequestPayment data====', data);


          /*
          setRequestingPayment(
            requestingPayment.map((item, idx) => {
              if (idx === index) {
                return false;
              }
              return item;
            })
          );
          */
          


          if (data.result) {

            toast.success(Payment_request_has_been_sent);

            //toast.success('Payment request has been sent');

            playSong();
            

            
            await fetch('/api/order/getAllBuyOrders', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(
                {
                  storecode: searchStorecode,
                  limit: Number(limitValue),
                  page: Number(pageValue),
                  walletAddress: address,
                  searchMyOrders: searchMyOrders,
                  searchOrderStatusCancelled: searchOrderStatusCancelled,
                  searchOrderStatusCompleted: searchOrderStatusCompleted,

                  searchStoreName: searchStoreName,


                  fromDate: searchFromDate,
                  toDate: searchToDate,
                }
              )
            }).then(async (response) => {
              const data = await response.json();
              //console.log('data', data);
              if (data.result) {
                setBuyOrders(data.result.orders);
    
                //setTotalCount(data.result.totalCount);

                setBuyOrderStats({
                  totalCount: data.result.totalCount,
                  totalKrwAmount: data.result.totalKrwAmount,
                  totalUsdtAmount: data.result.totalUsdtAmount,
                  totalSettlementCount: data.result.totalSettlementCount,
                  totalSettlementAmount: data.result.totalSettlementAmount,
                  totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
                  totalFeeAmount: data.result.totalFeeAmount,
                  totalFeeAmountKRW: data.result.totalFeeAmountKRW,
                  totalAgentFeeAmount: data.result.totalAgentFeeAmount,
                  totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

                  totalByBuyerDepositName: data.result.totalByBuyerDepositName,
                  totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
                });

              }
            });


            // refresh balance

            const result = await balanceOf({
              contract,
              address: address || "",
            });

            //console.log(result);

            setBalance( Number(result) / 10 ** 6 );


          

          } else {
            toast.error('Payment request has been failed');
          }

        }


      } catch (error) {
        console.error('Error:', error);

        toast.error('Payment request has been failed');
      }

      setEscrowing(
        escrowing.map((item, idx) =>  idx === index ? false : item)
      );



    } else {
      // without escrow


      try {

        const transactionHash = '0x';


        setRequestingPayment(
          requestingPayment.map((item, idx) => idx === index ? true : item)
        );
        


      
        const response = await fetch('/api/order/buyOrderRequestPayment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            lang: params.lang,
            storecode: storecode,
            orderId: orderId,
            //transactionHash: transactionResult.transactionHash,
            transactionHash: transactionHash,

            // payment bank information


            paymentBankInfo: bankInfo,




          })
        });

        const data = await response.json();


        if (data.result) {

          toast.success(Payment_request_has_been_sent);

          //toast.success('Payment request has been sent');

          playSong();
          
          await fetch('/api/order/getAllBuyOrders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(
              {
                storecode: searchStorecode,
                limit: Number(limitValue),
                page: Number(pageValue),
                walletAddress: address,
                searchMyOrders: searchMyOrders,
                searchOrderStatusCancelled: searchOrderStatusCancelled,
                searchOrderStatusCompleted: searchOrderStatusCompleted,

                searchStoreName: searchStoreName,

                fromDate: searchFromDate,
                toDate: searchToDate,
              }
            )
          }).then(async (response) => {
            const data = await response.json();
            //console.log('data', data);
            if (data.result) {
              setBuyOrders(data.result.orders);
  
              //setTotalCount(data.result.totalCount);

              setBuyOrderStats({
                totalCount: data.result.totalCount,
                totalKrwAmount: data.result.totalKrwAmount,
                totalUsdtAmount: data.result.totalUsdtAmount,
                totalSettlementCount: data.result.totalSettlementCount,
                totalSettlementAmount: data.result.totalSettlementAmount,
                totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
                totalFeeAmount: data.result.totalFeeAmount,
                totalFeeAmountKRW: data.result.totalFeeAmountKRW,
                totalAgentFeeAmount: data.result.totalAgentFeeAmount,
                totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

                totalByBuyerDepositName: data.result.totalByBuyerDepositName,
                totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
              });

            }
          });


          // refresh balance

          const result = await balanceOf({
            contract,
            address: address || "",
          });

          //console.log(result);

          setBalance( Number(result) / 10 ** 6 );


        } else {
          toast.error('결제요청이 실패했습니다.');
        }

      } catch (error) {
        console.error('Error:', error);

        toast.error('결제요청이 실패했습니다.');
      }

      
    } // end of without escrow


    setRequestingPayment(
      requestingPayment.map((item, idx) => idx === index ? false : item)
    );


  }









  // array of confirmingPayment

  const [confirmingPayment, setConfirmingPayment] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
    confirmingPayment.push(false);
  }

  /*
  useEffect(() => {
      
      setConfirmingPayment(
        new Array(buyOrders.length).fill(false)
      );

  } , [buyOrders]);
   */


  // confirm payment check box
  const [confirmPaymentCheck, setConfirmPaymentCheck] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
    confirmPaymentCheck.push(false);
  }

  /*
  useEffect(() => {
      
      setConfirmPaymentCheck(
        new Array(buyOrders.length).fill(false)
      );

  } , [buyOrders]);
    */




  // payment amoount array
  const [paymentAmounts, setPaymentAmounts] = useState([] as number[]);
  useEffect(() => {

    // default payment amount is from sellOrders krwAmount
      
    setPaymentAmounts(
      buyOrders.map((item) => item.krwAmount)
      );

  } , [buyOrders]);

  const [paymentAmountsUsdt, setPaymentAmountsUsdt] = useState([] as number[]);
  useEffect(() => {

    // default payment amount is from sellOrders krwAmount
      
    setPaymentAmountsUsdt(
      buyOrders.map((item) => item.usdtAmount)
      );

  } , [buyOrders]);



  // confirm payment
  const confirmPayment = async (

    index: number,
    orderId: string,
    //paymentAmount: number,
    krwAmount: number,
    //paymentAmountUsdt: number,
    usdtAmount: number,

    buyerWalletAddress: string,

    paymentMethod: string, // 'bank' or 'mkrw' or 'usdt'

  ) => {
    // confirm payment
    // send usdt to buyer wallet address


    // if escrowWalletAddress balance is less than paymentAmount, then return

    //console.log('escrowBalance', escrowBalance);
    //console.log('paymentAmountUsdt', paymentAmountUsdt);
    

    // check balance
    // if balance is less than paymentAmount, then return
    /*
    if (balance < usdtAmount) {
      toast.error(Insufficient_balance);
      return;
    }
      */

    const storecode = "admin";


    if (confirmingPayment[index]) {
      return;
    }

    setConfirmingPayment(
      confirmingPayment.map((item, idx) =>  idx === index ? true : item)
    );




        // transfer my wallet to buyer wallet address

        //const buyerWalletAddress = buyOrders[index].walletAddress;

      try {


        /*
        const transaction = transfer({
          contract,
          to: buyerWalletAddress,
          amount: usdtAmount,
        });


        //const { transactionHash } = await sendAndConfirmTransaction({

        const { transactionHash } = await sendTransaction({
          transaction: transaction,
          account: activeAccount as any,
        });
        */

        const transactionHash = '0x';

        console.log("transactionHash===", transactionHash);



        if (transactionHash) {


          if (paymentMethod === 'mkrw') {

            const response = await fetch('/api/order/buyOrderConfirmPaymentWithEscrow', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                lang: params.lang,
                storecode: storecode,
                orderId: orderId,
                paymentAmount: krwAmount,
                transactionHash: transactionHash,
                ///isSmartAccount: activeWallet === inAppConnectWallet ? false : true,
                isSmartAccount: false,
              })
            });

            const data = await response.json();



          } else {

            const response = await fetch('/api/order/buyOrderConfirmPaymentWithoutEscrow', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                lang: params.lang,
                storecode: storecode,
                orderId: orderId,
                paymentAmount: krwAmount,
                transactionHash: transactionHash,
                ///isSmartAccount: activeWallet === inAppConnectWallet ? false : true,
                isSmartAccount: false,
              })
            });

            const data = await response.json();

            //console.log('data', data);

          }




          
          await fetch('/api/order/getAllBuyOrders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(
              {
                storecode: searchStorecode,
                limit: Number(limitValue),
                page: Number(pageValue),
                walletAddress: address,
                searchMyOrders: searchMyOrders,
                searchOrderStatusCancelled: searchOrderStatusCancelled,
                searchOrderStatusCompleted: searchOrderStatusCompleted,

                searchStoreName: searchStoreName,

                fromDate: searchFromDate,
                toDate: searchToDate,
              }
            )
          }).then(async (response) => {
            const data = await response.json();
            //console.log('data', data);
            if (data.result) {
              setBuyOrders(data.result.orders);
  
              //setTotalCount(data.result.totalCount);

              setBuyOrderStats({
                totalCount: data.result.totalCount,
                totalKrwAmount: data.result.totalKrwAmount,
                totalUsdtAmount: data.result.totalUsdtAmount,
                totalSettlementCount: data.result.totalSettlementCount,
                totalSettlementAmount: data.result.totalSettlementAmount,
                totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
                totalFeeAmount: data.result.totalFeeAmount,
                totalFeeAmountKRW: data.result.totalFeeAmountKRW,
                totalAgentFeeAmount: data.result.totalAgentFeeAmount,
                totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

                totalByBuyerDepositName: data.result.totalByBuyerDepositName,
                totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
              });


            }
          });
          

          // update sellersBalance seller.buyOrder.status to 'paymentConfirmed'
          /*
          setSellersBalance((prev) =>
            prev.map((seller) =>
              seller.walletAddress === address
                ? { ...seller, seller: { ...seller.seller, buyOrder: { ...seller.seller.buyOrder, status: 'paymentConfirmed' } } }
                : seller

            )
          );
          */



          toast.success(Payment_has_been_confirmed);
          ////playSong();






        } else {
          toast.error('결제확인이 실패했습니다.');
        }

    } catch (error) {
      console.error('Error:', error);
      //toast.error('결제확인이 실패했습니다.');
    }



    setConfirmingPayment(
      confirmingPayment.map((item, idx) => idx === index ? false : item)
    );

    setConfirmPaymentCheck(
      confirmPaymentCheck.map((item, idx) => idx === index ? false : item)
    );
  

  }








  // send payment
  const sendPayment = async (

    index: number,
    orderId: string,
    //paymentAmount: number,
    krwAmount: number,
    //paymentAmountUsdt: number,
    usdtAmount: number,

    buyerWalletAddress: string,

  ) => {
    // confirm payment
    // send usdt to buyer wallet address


    // if escrowWalletAddress balance is less than paymentAmount, then return

    //console.log('escrowBalance', escrowBalance);
    //console.log('paymentAmountUsdt', paymentAmountUsdt);
    

    // check balance
    // if balance is less than paymentAmount, then return
    if (balance < usdtAmount) {
      toast.error(Insufficient_balance);
      return;
    }

    const storecode = "admin";


    if (confirmingPayment[index]) {
      return;
    }

    setConfirmingPayment(
      confirmingPayment.map((item, idx) =>  idx === index ? true : item)
    );

      try {


        const transaction = transfer({
          contract,
          to: buyerWalletAddress,
          amount: usdtAmount,
        });



        //const { transactionHash } = await sendAndConfirmTransaction({
        const { transactionHash } = await sendTransaction({
          transaction: transaction,
          account: activeAccount as any,
        });

        console.log("transactionHash===", transactionHash);



        if (transactionHash) {


          //alert('USDT 전송이 완료되었습니다.');


          const response = await fetch('/api/order/buyOrderConfirmPaymentWithoutEscrow', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              lang: params.lang,
              storecode: storecode,
              orderId: orderId,
              paymentAmount: krwAmount,
              transactionHash: transactionHash,
              ///isSmartAccount: activeWallet === inAppConnectWallet ? false : true,
              isSmartAccount: false,
            })
          });

          const data = await response.json();

          //console.log('data', data);


          await fetch('/api/order/getAllBuyOrders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(
              {
                storecode: searchStorecode,
                limit: Number(limitValue),
                page: Number(pageValue),
                walletAddress: address,
                searchMyOrders: searchMyOrders,
                searchOrderStatusCancelled: searchOrderStatusCancelled,
                searchOrderStatusCompleted: searchOrderStatusCompleted,

                searchStoreName: searchStoreName,

                fromDate: searchFromDate,
                toDate: searchToDate,
              }
            )
          }).then(async (response) => {
            const data = await response.json();
            //console.log('data', data);
            if (data.result) {
              setBuyOrders(data.result.orders);
  
              //setTotalCount(data.result.totalCount);


              setBuyOrderStats({
                totalCount: data.result.totalCount,
                totalKrwAmount: data.result.totalKrwAmount,
                totalUsdtAmount: data.result.totalUsdtAmount,
                totalSettlementCount: data.result.totalSettlementCount,
                totalSettlementAmount: data.result.totalSettlementAmount,
                totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
                totalFeeAmount: data.result.totalFeeAmount,
                totalFeeAmountKRW: data.result.totalFeeAmountKRW,
                totalAgentFeeAmount: data.result.totalAgentFeeAmount,
                totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

                totalByBuyerDepositName: data.result.totalByBuyerDepositName,
                totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
              });

            }
          });

          toast.success(Payment_has_been_confirmed);
          playSong();


        } else {
          toast.error('결제확인이 실패했습니다.');
        }

    } catch (error) {
      console.error('Error:', error);
      //toast.error('결제확인이 실패했습니다.');
    }



    setConfirmingPayment(
      confirmingPayment.map((item, idx) => idx === index ? false : item)
    );

    setConfirmPaymentCheck(
      confirmPaymentCheck.map((item, idx) => idx === index ? false : item)
    );
  

  }







  
  // array of rollbackingPayment
  const [rollbackingPayment, setRollbackingPayment] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
    rollbackingPayment.push(false);
  }
  /*
  useEffect(() => {
      
      setRollbackingPayment(
        new Array(buyOrders.length).fill(false)
      );

  } , [buyOrders]);
   */

  // rollback payment check box
  const [rollbackPaymentCheck, setRollbackPaymentCheck] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
    rollbackPaymentCheck.push(false);
  }
  /*
  useEffect(() => {
      
      setRollbackPaymentCheck(
        new Array(buyOrders.length).fill(false)
      );

  } , [buyOrders]);
   */


  // rollback payment
  const rollbackPayment = async (

    index: number,
    orderId: string,
    paymentAmount: number,
    paymentAmountUsdt: number,

  ) => {
    // rollback payment
    // send usdt to seller wallet address

    if (rollbackingPayment[index]) {
      return;
    }


    /*
    // if escrowWalletAddress balance is less than paymentAmount, then return
    if (escrowBalance < paymentAmountUsdt) {
      toast.error(Escrow_balance_is_less_than_payment_amount);
      return;
    }

    // if escrowNativeBalance is less than 0.1, then return
    if (escrowNativeBalance < 0.1) {
      toast.error('ETH balance is less than 0.1');
      return;
    }
      */
    


    setRollbackingPayment(
      rollbackingPayment.map((item, idx) => idx === index ? true : item)
    );


    try {

      const response = await fetch('/api/order/buyOrderRollbackPayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lang: params.lang,
          storecode: "admin",
          orderId: orderId,
          paymentAmount: paymentAmount,
          ///isSmartAccount: activeWallet === inAppConnectWallet ? false : true,
          isSmartAccount: false,
        })
      });

      const data = await response.json();

      //console.log('data', data);

      if (data.result) {


        toast.success('Payment has been rollbacked');

        playSong();

        
        ///fetchBuyOrders();

        // fetch Buy Orders
        await fetch('/api/order/getAllBuyOrders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            {
              storecode: searchStorecode,
              limit: Number(limitValue),
              page: Number(pageValue),
              walletAddress: address,
              searchMyOrders: searchMyOrders,
              searchOrderStatusCancelled: searchOrderStatusCancelled,
              searchOrderStatusCompleted: searchOrderStatusCompleted,

              searchStoreName: searchStoreName,

              fromDate: searchFromDate,
              toDate: searchToDate,
            }
          ),
        })
        .then(response => response.json())
        .then(data => {
            ///console.log('data', data);
            setBuyOrders(data.result.orders);

            //setTotalCount(data.result.totalCount);

            setBuyOrderStats({
              totalCount: data.result.totalCount,
              totalKrwAmount: data.result.totalKrwAmount,
              totalUsdtAmount: data.result.totalUsdtAmount,
              totalSettlementCount: data.result.totalSettlementCount,
              totalSettlementAmount: data.result.totalSettlementAmount,
              totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
              totalFeeAmount: data.result.totalFeeAmount,
              totalFeeAmountKRW: data.result.totalFeeAmountKRW,
              totalAgentFeeAmount: data.result.totalAgentFeeAmount,
              totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

              totalByBuyerDepositName: data.result.totalByBuyerDepositName,
              totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
            });

        })

      }

    } catch (error) {
      console.error('Error:', error);
      toast.error('Rollback payment has been failed');
    }



    setRollbackingPayment(
      rollbackingPayment.map((item, idx) => idx === index ? false : item)
    );

    setRollbackPaymentCheck(
      rollbackPaymentCheck.map((item, idx) => idx === index ? false : item)
    );


  }




  // settlement
 
  // array of settlement

  const [loadingSettlement, setLoadingSettlement] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
    loadingSettlement.push(false);
  }

  // settlement check box
  const [settlementCheck, setSettlementCheck] = useState([] as boolean[]);
  for (let i = 0; i < 100; i++) {
    settlementCheck.push(false);
  }

  const settlementRequest = async (index: number, orderId: string) => {
    // settlement

    if (loadingSettlement[index]) {
      return;
    }

    setLoadingSettlement(
      loadingSettlement.map((item, idx) => idx === index ? true : item)
    );

    // api call to settlement
    try {
      const response = await fetch('/api/order/updateBuyOrderSettlement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: orderId,
        })
      });
      const data = await response.json();

      //console.log('data', data);

      if (data.result) {

        toast.success('정산이 완료되었습니다.');

        playSong();

        // fetch Buy Orders
        await fetch('/api/order/getAllBuyOrders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            {
              storecode: searchStorecode,
              limit: Number(limitValue),
              page: Number(pageValue),
              walletAddress: address,
              searchMyOrders: searchMyOrders,
              searchOrderStatusCancelled: searchOrderStatusCancelled,
              searchOrderStatusCompleted: searchOrderStatusCompleted,

              searchStoreName: searchStoreName,

              fromDate: searchFromDate,
              toDate: searchToDate,
            }
          ),
        })
        .then(response => response.json())
        .then(data => {
            ///console.log('data', data);
            setBuyOrders(data.result.orders);

            //setTotalCount(data.result.totalCount);

            setBuyOrderStats({
              totalCount: data.result.totalCount,
              totalKrwAmount: data.result.totalKrwAmount,
              totalUsdtAmount: data.result.totalUsdtAmount,
              totalSettlementCount: data.result.totalSettlementCount,
              totalSettlementAmount: data.result.totalSettlementAmount,
              totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
              totalFeeAmount: data.result.totalFeeAmount,
              totalFeeAmountKRW: data.result.totalFeeAmountKRW,
              totalAgentFeeAmount: data.result.totalAgentFeeAmount,
              totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

              totalByBuyerDepositName: data.result.totalByBuyerDepositName,
              totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
            });

        })

      } else {
        toast.error('Settlement has been failed');
      }

    } catch (error) {
      console.error('Error:', error);
      toast.error('Settlement has been failed');
    }


    setLoadingSettlement(
      loadingSettlement.map((item, idx) => idx === index ? false : item)
    );

    setSettlementCheck(
      settlementCheck.map((item, idx) => idx === index ? false : item)
    );

  }















  // transfer escrow balance to seller wallet address

  const [amountOfEscrowBalance, setAmountOfEscrowBalance] = useState("");

  const [transferingEscrowBalance, setTransferingEscrowBalance] = useState(false);


  const transferEscrowBalance = async () => {

    if (transferingEscrowBalance) {
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
          storecode: "admin",
          walletAddress: address,
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










  //const [latestBuyOrder, setLatestBuyOrder] = useState<BuyOrder | null>(null);


  useEffect(() => {


    const fetchBuyOrders = async () => {

      //console.log('fetchBuyOrders===============>');
      //console.log("address=", address);
      //console.log("searchMyOrders=", searchMyOrders);


      //console.log('acceptingBuyOrder', acceptingBuyOrder);
      //console.log('escrowing', escrowing);
      //console.log('requestingPayment', requestingPayment);
      //console.log('confirmingPayment', confirmingPayment);



      // check all agreementForTrade is false

      if (
        //!address || !searchMyOrders
        agreementForTrade.some((item) => item === true)
        || acceptingBuyOrder.some((item) => item === true)
        || agreementForCancelTrade.some((item) => item === true)
        || confirmPaymentCheck.some((item) => item === true)
        || rollbackPaymentCheck.some((item) => item === true)
        || acceptingBuyOrder.some((item) => item === true)
        || escrowing.some((item) => item === true)
        || requestingPayment.some((item) => item === true)
        || confirmingPayment.some((item) => item === true)
        || rollbackingPayment.some((item) => item === true)
      ) {
        return;
      }


      

      const response = await fetch('/api/order/getAllBuyOrders', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify(

            {
              storecode: searchStorecode,
              limit: Number(limitValue),
              page: Number(pageValue),
              walletAddress: address,
              searchMyOrders: searchMyOrders,
              searchOrderStatusCancelled: searchOrderStatusCancelled,
              searchOrderStatusCompleted: searchOrderStatusCompleted,

              searchStoreName: searchStoreName,

              fromDate: searchFromDate,
              toDate: searchToDate,
            }

        ),
      });

      if (!response.ok) {
        return;
      }



      const data = await response.json();

      //console.log('data', data);


      // if data.result is different from buyOrders
      // check neweset order is different from buyOrders
      // then toasts message
      //console.log('data.result.orders[0]', data.result.orders?.[0]);
      //console.log('buyOrders[0]', buyOrders);


      //console.log('buyOrders[0]', buyOrders?.[0]);

      /*
      if (data.result.orders?.[0]?._id !== latestBuyOrder?._id) {

        setLatestBuyOrder(data.result.orders?.[0] || null);

   
        
        //toast.success(Newest_order_has_been_arrived);
        toast.success('새로운 주문이 도착했습니다');




        // <audio src="/racing.mp3" typeof="audio/mpeg" autoPlay={soundStatus} muted={!soundStatus} />
        // audio play

        //setSoundStatus(true);

        // audio ding play

        playSong();

        // Uncaught (in promise) NotAllowedError: play() failed because the user didn't interact with the document first.


      }
      */



      setBuyOrders(data.result.orders);

      //setTotalCount(data.result.totalCount);

      setBuyOrderStats({
        totalCount: data.result.totalCount,
        totalKrwAmount: data.result.totalKrwAmount,
        totalUsdtAmount: data.result.totalUsdtAmount,
        totalSettlementCount: data.result.totalSettlementCount,
        totalSettlementAmount: data.result.totalSettlementAmount,
        totalSettlementAmountKRW: data.result.totalSettlementAmountKRW,
        totalFeeAmount: data.result.totalFeeAmount,
        totalFeeAmountKRW: data.result.totalFeeAmountKRW,
        totalAgentFeeAmount: data.result.totalAgentFeeAmount,
        totalAgentFeeAmountKRW: data.result.totalAgentFeeAmountKRW,

        totalByBuyerDepositName: data.result.totalByBuyerDepositName,
        totalReaultGroupByBuyerDepositNameCount: data.result.totalReaultGroupByBuyerDepositNameCount,
      });


    }


    fetchBuyOrders();

    
    
    const interval = setInterval(() => {

      fetchBuyOrders();


    }, 3000);


    return () => clearInterval(interval);
    


  } , [

    address,
    searchMyOrders,
    agreementForTrade,
    acceptingBuyOrder,
    escrowing,
    requestingPayment,
    confirmingPayment,
    rollbackingPayment,
    agreementForCancelTrade,
    confirmPaymentCheck,
    rollbackPaymentCheck,

    ///latestBuyOrder,
    searchOrderStatusCancelled,
    searchOrderStatusCompleted,
    

    //searchStoreName,

    limitValue,
    pageValue,
    searchStorecode,
    searchFromDate,
    searchToDate
]);



const [fetchingBuyOrders, setFetchingBuyOrders] = useState(false);

const fetchBuyOrders = async () => {


  if (fetchingBuyOrders) {
    return;
  }
  setFetchingBuyOrders(true);

  const response = await fetch('/api/order/getAllBuyOrders', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      {
        storecode: searchStorecode,
        limit: Number(limitValue),
        page: Number(pageValue),
        walletAddress: address,
        searchMyOrders: searchMyOrders,

        searchStoreName: searchStoreName,

        fromDate: searchFromDate,
        toDate: searchToDate,
      }

    ),
  });

  if (!response.ok) {
    setFetchingBuyOrders(false);
    toast.error('Failed to fetch buy orders');
    return;
  }
  const data = await response.json();
  //console.log('data', data);

  setBuyOrders(data.result.orders);
  //setTotalCount(data.result.totalCount);
  setFetchingBuyOrders(false);

  return data.result.orders;
}






  // check table view or card view
  const [tableView, setTableView] = useState(true);


    /*
    const [storeCodeNumber, setStoreCodeNumber] = useState('');

    useEffect(() => {
  
      const fetchStoreCode = async () => {
  
        const response = await fetch('/api/order/getStoreCodeNumber', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
  
        const data = await response.json();
  
        //console.log('getStoreCodeNumber data', data);
  
        setStoreCodeNumber(data?.storeCodeNumber);
  
      }
  
      fetchStoreCode();
  
    } , []);

    */

    
    



  const [selectedItem, setSelectedItem] = useState<any>(null);
    


  const [storeAdminWalletAddress, setStoreAdminWalletAddress] = useState("");

  const [fetchingStore, setFetchingStore] = useState(false);
  const [store, setStore] = useState(null) as any;

  useEffect(() => {

    setFetchingStore(true);

    const fetchData = async () => {
        const response = await fetch("/api/store/getOneStore", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
              storecode: "admin",
              ///walletAddress: address,
            }),
        });

        const data = await response.json();


        if (data.result) {

          setStore(data.result);

          setStoreAdminWalletAddress(data.result?.adminWalletAddress);

        }

        setFetchingStore(false);
    };

    fetchData();

  } , [address]);


  
  /*
  const [tradeSummary, setTradeSummary] = useState({
      totalCount: 0,
      totalKrwAmount: 0,
      totalUsdtAmount: 0,
      totalSettlementCount: 0,
      totalSettlementAmount: 0,
      totalSettlementAmountKRW: 0,
      
      totalFeeAmount: 0,
      totalFeeAmountKRW: 0,

      totalAgentFeeAmount: 0,
      totalAgentFeeAmountKRW: 0,

      orders: [] as BuyOrder[],

      totalClearanceCount: 0,
      totalClearanceAmount: 0,
      totalClearanceAmountUSDT: 0,
    });
    const [loadingTradeSummary, setLoadingTradeSummary] = useState(false);


    const getTradeSummary = async () => {
      if (!address) {
        return;
      }
      setLoadingTradeSummary(true);
      const response = await fetch('/api/summary/getTradeSummary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({

          agentcode: params.agentcode,
          storecode: searchStorecode,
          walletAddress: address,
          searchMyOrders: searchMyOrders,
          searchOrderStatusCancelled: searchOrderStatusCancelled,
          searchOrderStatusCompleted: searchOrderStatusCompleted,
          
          //searchBuyer: searchBuyer,
          searchBuyer: '',
          //searchDepositName: searchDepositName,
          searchDepositName: '',
          //searchStoreBankAccountNumber: searchStoreBankAccountNumber,
          searchStoreBankAccountNumber: '',






        })
      });
      if (!response.ok) {
        setLoadingTradeSummary(false);
        toast.error('Failed to fetch trade summary');
        return;
      }
      const data = await response.json();
      
      //console.log('getTradeSummary data', data);


      setTradeSummary(data.result);

      setLoadingTradeSummary(false);
      return data.result;
    }



    useEffect(() => {

      if (!address) {
        return;
      }

      getTradeSummary();

      // fetch trade summary every 10 seconds
      const interval = setInterval(() => {
        getTradeSummary();
      }, 10000);
      return () => clearInterval(interval);


    } , [address, searchMyOrders, searchStorecode, searchOrderStatusCancelled, searchOrderStatusCompleted, ]);
    */







     // get All stores
  const [fetchingAllStores, setFetchingAllStores] = useState(false);
  const [allStores, setAllStores] = useState([] as any[]);
  const [storeTotalCount, setStoreTotalCount] = useState(0);
  const fetchAllStores = async () => {
    if (fetchingAllStores) {
      return;
    }
    setFetchingAllStores(true);
    const response = await fetch('/api/store/getAllStores', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        {
          limit: 100,
          page: 1,
        }
      ),
    });

    if (!response.ok) {
      setFetchingAllStores(false);
      toast.error('가맹점 검색에 실패했습니다.');
      return;
    }

    const data = await response.json();
    
    //console.log('getAllStores data', data);




    setAllStores(data.result.stores);
    setStoreTotalCount(data.result.totalCount);
    setFetchingAllStores(false);
    return data.result.stores;
  }
  useEffect(() => {
 
      setAllStores([]);
 
    fetchAllStores();
  }, []); 




  // totalNumberOfBuyOrders
  const [loadingTotalNumberOfBuyOrders, setLoadingTotalNumberOfBuyOrders] = useState(false);
  const [totalNumberOfBuyOrders, setTotalNumberOfBuyOrders] = useState(0);
  const [processingBuyOrders, setProcessingBuyOrders] = useState([] as BuyOrder[]);
  const [totalNumberOfAudioOnBuyOrders, setTotalNumberOfAudioOnBuyOrders] = useState(0);


  // Move fetchTotalBuyOrders outside of useEffect to avoid self-reference error
  const fetchTotalBuyOrders = async (): Promise<void> => {
    setLoadingTotalNumberOfBuyOrders(true);
    const response = await fetch('/api/order/getTotalNumberOfBuyOrders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      console.error('Failed to fetch total number of buy orders');
      setLoadingTotalNumberOfBuyOrders(false);
      return;
    }
    const data = await response.json();
    //console.log('getTotalNumberOfBuyOrders data', data);
    setTotalNumberOfBuyOrders(data.result.totalCount);
    setProcessingBuyOrders(data.result.orders);
    setTotalNumberOfAudioOnBuyOrders(data.result.audioOnCount);

    setLoadingTotalNumberOfBuyOrders(false);
  };

  useEffect(() => {

    setProcessingBuyOrders([]);

    fetchTotalBuyOrders();

    const interval = setInterval(() => {
      fetchTotalBuyOrders();
    }, 5000);
    return () => clearInterval(interval);

  }, []);

      
  /*
  useEffect(() => {
    if (totalNumberOfBuyOrders > 0 && loadingTotalNumberOfBuyOrders === false) {
      const audio = new Audio('/notification.wav'); 
      audio.play();
    }
  }, [totalNumberOfBuyOrders, loadingTotalNumberOfBuyOrders]);
  

  useEffect(() => {
    if (totalNumberOfAudioOnBuyOrders > 0 && loadingTotalNumberOfBuyOrders === false) {
      const audio = new Audio('/notification.wav');
      audio.play();
    }
  }, [totalNumberOfAudioOnBuyOrders, loadingTotalNumberOfBuyOrders]);
  */







  // totalNumberOfClearanceOrders
  /*
  const [loadingTotalNumberOfClearanceOrders, setLoadingTotalNumberOfClearanceOrders] = useState(false);
  const [totalNumberOfClearanceOrders, setTotalNumberOfClearanceOrders] = useState(0);
  useEffect(() => {
    if (!address) {
      setTotalNumberOfClearanceOrders(0);
      return;
    }

    const fetchTotalClearanceOrders = async () => {
      setLoadingTotalNumberOfClearanceOrders(true);
      const response = await fetch('/api/order/getTotalNumberOfClearanceOrders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        }),
      });
      if (!response.ok) {
        console.error('Failed to fetch total number of clearance orders');
        return;
      }
      const data = await response.json();
      //console.log('getTotalNumberOfClearanceOrders data', data);
      setTotalNumberOfClearanceOrders(data.result.totalCount);

      setLoadingTotalNumberOfClearanceOrders(false);
    };

    fetchTotalClearanceOrders();

    const interval = setInterval(() => {
      fetchTotalClearanceOrders();
    }, 5000);
    return () => clearInterval(interval);

  }, [address]);

  useEffect(() => {
    if (totalNumberOfClearanceOrders > 0 && loadingTotalNumberOfClearanceOrders === false) {
      const audio = new Audio('/notification.wav');
      audio.play();
    }
  }, [totalNumberOfClearanceOrders, loadingTotalNumberOfClearanceOrders]);
  */


    // audio notification state
  const [audioNotification, setAudioNotification] = useState<boolean[]>([]);
  
  // keep audioNotification in sync with buyOrders
  useEffect(() => {
    setAudioNotification(
      buyOrders.map((item) => !!item.audioOn)
    );
  }, [buyOrders]);
  
  // handleAudioToggle
  const handleAudioToggle = (index: number, orderId: string) => {
    // api call
    fetch('/api/order/toggleAudioNotification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: orderId,
        audioOn: !audioNotification[index],
        walletAddress: address,
      }),
    })
    .then(response => response.json())
    .then(data => {
      
      //console.log('toggleAudioNotification data', data);
      //alert('toggleAudioNotification data: ' + JSON.stringify(data));
      /*
      {"success":true,"message":"Audio notification setting updated successfully"}
      */

      if (data.success) {
        // update local state for immediate UI feedback
        setAudioNotification((prev) =>
          prev.map((v, i) => (i === index ? !v : v))
        );
        toast.success('오디오 알림 설정이 변경되었습니다.');
      } else {
        toast.error('오디오 알림 설정 변경에 실패했습니다.');
      }
    })
    .catch(error => {
      console.error('Error toggling audio notification:', error);
      toast.error('오디오 알림 설정 변경에 실패했습니다.' + error.message);
    });
  };




  // /api/user/getAllSellersForBalance
  const [sellersBalance, setSellersBalance] = useState([] as any[]);
  const [sellersBalanceRefreshing, setSellersBalanceRefreshing] = useState(false);
  const [sellersBalanceLastUpdatedAt, setSellersBalanceLastUpdatedAt] = useState<Date | null>(null);
  const [sellerSearch, setSellerSearch] = useState('');
  const SELLERS_BALANCE_POLL_INTERVAL = 30000;
  const fetchSellersBalance = async () => {
    setSellersBalanceRefreshing(true);
    try {
      const response = await fetch('/api/user/getAllSellersForBalance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          {
            storecode: "admin",
            limit: 100,
            page: 1,
          }
        )
      });

      const data = await response.json();

      ///console.log('getAllSellersForBalance data', data);

      if (data.result) {
        //setSellersBalance(data.result.users);

        // if seller.walletAddress of data.result.users is address,
        // then order first
        // and others is ordered by seller.usdtToKrwRate ascending
        /*
        const sortedSellers = data.result.users.sort((a: any, b: any) => {
          if (a.walletAddress === address) return -1;
          if (b.walletAddress === address) return 1;
          return 0;
        });
        */


        const sortedSellers = data.result.users;
        const pricedSellers = sortedSellers.filter((seller: any) => {
          const rate = Number(seller?.seller?.usdtToKrwRate ?? 0);
          const enabled = seller?.seller?.enabled === true;
          return rate > 0 && enabled;
        });

        // if walletAddress is address, then order first
        // and then others is ordered by seller.totalPaymentConfirmedUsdtAmount descending

        /*
        const finalSortedSellers = sortedSellers.sort((a: any, b: any) => {
          if (a.walletAddress === address) return -1;
          if (b.walletAddress === address) return 1;
          return a.seller?.usdtToKrwRate - b.seller?.usdtToKrwRate;
        });
        */

        /*
        const finalSortedSellers = sortedSellers.sort((a: any, b: any) => {
          if (a.walletAddress === address) return -1;
          if (b.walletAddress === address) return 1;
          return b.totalPaymentConfirmedUsdtAmount - a.totalPaymentConfirmedUsdtAmount;
        });
        */
        // remove walletAddress is a address from sortedSellers
        const filteredSellers = pricedSellers.filter((seller: any) => seller.walletAddress !== address);
        // sort filteredSellers by totalPaymentConfirmedUsdtAmount descending
        filteredSellers.sort((a: any, b: any) => {
          return b.totalPaymentConfirmedUsdtAmount - a.totalPaymentConfirmedUsdtAmount;
        });




      /*
      // reorder status is 'accepted' first, then 'paymentRequested', then 'paymentConfirmed', then 'cancelled'
      const finalSortedSellers = sortedSellers.sort((a: any, b: any) => {
        const statusOrder = ['accepted', 'paymentRequested', 'paymentConfirmed', 'cancelled'];
        const aStatusIndex = statusOrder.indexOf(a.status);
        const bStatusIndex = statusOrder.indexOf(b.status);
        return aStatusIndex - bStatusIndex;
      });

      // usdtToKrwRate ascending
      finalSortedSellers.sort((a: any, b: any) => {
        return a.usdtToKrwRate - b.usdtToKrwRate;
      });
      */
      

        //setSellersBalance(finalSortedSellers);
        setSellersBalance(filteredSellers);
        setSellersBalanceLastUpdatedAt(new Date());

      } else {
        console.error('Error fetching sellers balance');
      }
    } catch (error) {
      console.error('Error fetching sellers balance', error);
    } finally {
      setSellersBalanceRefreshing(false);
    }
  };
  useEffect(() => {
    /*
    if (!address) {
      setSellersBalance([]);
      return;
    }
    */

    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(fetchSellersBalance, SELLERS_BALANCE_POLL_INTERVAL);
    };
    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSellersBalance();
        startPolling();
      } else {
        stopPolling();
      }
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [address]);


  // sellersBalance.reduce((acc, seller) => acc + seller.currentUsdtBalance, 0)
  // animated totalUsdtBalance
  const [animatedTotalUsdtBalance, setAnimatedTotalUsdtBalance] = useState(0);
  function animateTotalUsdtBalance(targetBalance: number) {
    const animationDuration = 1000; // 1 second
    const frameRate = 30; // 30 frames per second
    const totalFrames = Math.round((animationDuration / 1000) * frameRate);
    const initialBalance = animatedTotalUsdtBalance;
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const progress = Math.min(frame / totalFrames, 1);
      const newBalance = initialBalance + (targetBalance - initialBalance) * progress;
      setAnimatedTotalUsdtBalance(newBalance);
      if (frame >= totalFrames) {
        clearInterval(interval);
      }
    }, 1000 / frameRate);
  }
  useEffect(() => {
    const targetBalance = sellersBalance.reduce((acc, seller) => acc + (seller.currentUsdtBalance || 0), 0);
    animateTotalUsdtBalance(targetBalance);
  }, [sellersBalance]);




  // usdtToKrwRate animation
  const [usdtKrwRateAnimationArray, setUsdtKrwRateAnimationArray] = useState<number[]>([]);
  function animateUsdtKrwRate(targetRates: number[]) {
    const animationDuration = 1000; // 1 second
    const frameRate = 30; // 30 frames per second
    const totalFrames = Math.round((animationDuration / 1000) * frameRate);
    const initialRates = usdtKrwRateAnimationArray.length === targetRates.length
      ? [...usdtKrwRateAnimationArray]
      : targetRates.map(() => 0);
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const newRates = targetRates.map((target, index) => {
        const initial = initialRates[index];
        const progress = Math.min(frame / totalFrames, 1);
        return initial + (target - initial) * progress;
      });
      setUsdtKrwRateAnimationArray(newRates);
      if (frame >= totalFrames) {
        clearInterval(interval);
      }
    }, 1000 / frameRate);
  }
  useEffect(() => {
    const targetRates = sellersBalance.map((seller) => seller.seller?.usdtToKrwRate || 0);
    animateUsdtKrwRate(targetRates);
  }, [sellersBalance]);








  // currentUsdtBalance array for animated display
  const [currentUsdtBalanceArray, setCurrentUsdtBalanceArray] = useState<number[]>([]);
  function animateUsdtBalance(targetBalances: number[]) {
    const animationDuration = 1000; // 1 second
    const frameRate = 30; // 30 frames per second
    const totalFrames = Math.round((animationDuration / 1000) * frameRate);
    const initialBalances = currentUsdtBalanceArray.length === targetBalances.length
      ? [...currentUsdtBalanceArray]
      : targetBalances.map(() => 0);

    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const newBalances = targetBalances.map((target, index) => {
        const initial = initialBalances[index];
        const progress = Math.min(frame / totalFrames, 1);
        return initial + (target - initial) * progress;
      });
      setCurrentUsdtBalanceArray(newBalances);
      if (frame >= totalFrames) {
        clearInterval(interval);
      }
    }, 1000 / frameRate);
  }
  useEffect(() => {
    const targetBalances = sellersBalance.map((seller) => seller.currentUsdtBalance || 0);
    animateUsdtBalance(targetBalances);
  }, [sellersBalance]);



  // updateUsdtToKrwRate
  const [updatingUsdtToKrwRateArray, setUpdatingUsdtToKrwRateArray] = useState<boolean[]>([]);

  const updateUsdtToKrwRate = async (index: number, sellerId: string, newRate: number) => {
    try {

      updatingUsdtToKrwRateArray[index] = true;
      setUpdatingUsdtToKrwRateArray([...updatingUsdtToKrwRateArray]);

      const response = await fetch('/api/user/updateSellerUsdtToKrwRate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({

          storecode: "admin",
          walletAddress: address,
          usdtToKrwRate: newRate,

          //sellerId,
          //newRate,
        }),
      });
      const data = await response.json();
      //console.log('updateUsdtToKrwRate data', data);
      if (data.result) {
        toast.success('USDT to KRW rate has been updated');
        // refresh sellers balance
        //fetchSellersBalance();

        // update local state for immediate UI feedback
        setSellersBalance((prev) =>
          prev.map((seller, idx) =>
            idx === index ? { ...seller, seller: { ...seller.seller, usdtToKrwRate: newRate } } : seller
          )
        );


      } else {
        toast.error('Failed to update USDT to KRW rate');
      }
    } catch (error) {
      console.error('Error updating USDT to KRW rate:', error);
      toast.error('Failed to update USDT to KRW rate');
    }

    updatingUsdtToKrwRateArray[index] = false;
    setUpdatingUsdtToKrwRateArray([...updatingUsdtToKrwRateArray]);
  };



  // api/market/upbit
  // get upbit usdt to krw rate every 10 seconds

  const [upbitUsdtToKrwRate, setUpbitUsdtToKrwRate] = useState(0);
  useEffect(() => {
    const fetchUpbitRate = async () => {
      const response = await fetch('/api/market/upbit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      //console.log('upbit usdt to krw rate data', data);

      /*
      if (data.data && data.data.length > 0) {
        setUpbitUsdtToKrwRate(data.data[0].trade_price);
        setUpbitUsdtToKrwRateTimestamp(data.data[0].trade_timestamp);
        setTradeDateKst(data.data[0].trade_date_kst);
        setTradeTimeKst(data.data[0].trade_time_kst);
      }
      */

      // data.result
      if (data?.result) {
        setUpbitUsdtToKrwRate(data.result.trade_price);
      }
    };
    fetchUpbitRate();
    const interval = setInterval(() => {
      fetchUpbitRate();
    }, 5000);
    return () => clearInterval(interval);
  }, []);



  // /api/user/toggleAutoProcessDeposit
  const [togglingAutoProcessDeposit, setTogglingAutoProcessDeposit] = useState(false);
  const toggleAutoProcessDeposit = async (currentValue: boolean) => {
    if (togglingAutoProcessDeposit) {
      return;
    }
    setTogglingAutoProcessDeposit(true);
    try {
      const response = await fetch('/api/user/toggleAutoProcessDeposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storecode: "admin",
          walletAddress: address,
          autoProcessDeposit: !currentValue,
        }),
      });
      const data = await response.json();
      //console.log('toggleAutoProcessDeposit data', data);
      if (data.result) {
        // update local state
        setSellersBalance((prev) =>
          prev.map((seller) =>
            seller.walletAddress === address
              ? { ...seller, seller: { ...seller.seller, autoProcessDeposit: !currentValue } }
              : seller
          )
        );
        toast.success('자동 입금 처리 설정이 변경되었습니다.');
      } else {
        toast.error('자동 입금 처리 설정 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error toggling auto process deposit:', error);
      toast.error('자동 입금 처리 설정 변경에 실패했습니다.');
    }
    setTogglingAutoProcessDeposit(false);
  };



  // updatingPromotionText
  // /api/user/updatePromotionText
  const [promotionText, setPromotionText] = useState('');
  const [updatingPromotionText, setUpdatingPromotionText] = useState(false);
  const updatePromotionText = async () => {
      
      setUpdatingPromotionText(true);
      try {
          const response = await fetch('/api/user/updatePromotionText', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  storecode: "admin",
                  walletAddress: address,
                  promotionText: promotionText,
              }),
          });
          const data = await response.json();
          //console.log('updatePromotionText data', data);
          if (data.result) {
              toast.success('프로모션 문구가 업데이트되었습니다.');

              // update local state for seller
              setSellersBalance((prev) =>
                prev.map((seller) =>
                  seller.walletAddress === address
                    ? { ...seller, seller: { ...seller.seller, promotionText: promotionText } }
                    : seller
                )
              );
              


          } else {
              toast.error('프로모션 문구 업데이트에 실패했습니다.');
          }
      } catch (error) {
          console.error('Error updating promotion text:', error);
          toast.error('프로모션 문구 업데이트에 실패했습니다.');
      }
      setUpdatingPromotionText(false);
  };




  // 판매자를 정해서 구매주문하기 function
  // API /api/order/buyOrderPrivateSale

  // buyAmountInputs
  const [buyAmountInputs, setBuyAmountInputs] = useState<number[]>([]);

  const [buyOrderingPrivateSaleArray, setBuyOrderingPrivateSaleArray] = useState<boolean[]>([]);

  const buyOrderPrivateSale = async (
    index: number,
    sellerWalletAddress: string,
  ) => {
    if (!address) {
      toast.error('지갑을 연결해주세요.');
      return;
    }


    if (buyOrderingPrivateSaleArray[index]) {
      return;
    }

    if (!buyAmountInputs[index] || buyAmountInputs[index] <= 0) {
      toast.error('구매 금액을 입력해주세요.');
      return;
    }

    // if buyAmountInputs[index] is more than currentUsdtBalanceArray[index], show error
    if (buyAmountInputs[index] > currentUsdtBalanceArray[index]) {
      toast.error('구매 금액이 판매자의 잔여 USDT 잔고를 초과합니다.');
      return;
    }

    setBuyOrderingPrivateSaleArray((prev) => {
      const newArray = [...prev];
      newArray[index] = true;
      return newArray;
    });

    const response = await fetch('/api/order/buyOrderPrivateSale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buyerWalletAddress: address,
        sellerWalletAddress: sellerWalletAddress,
        usdtAmount: buyAmountInputs[index],
      }),
    })

    const data = await response.json();
    if (data.result) {
      toast.success('구매 주문이 생성되었습니다.');
      // update local seller buyOrders state to 'paymentRequested', 'paymentRequestedAt' to now
      // by finding the seller with sellerWalletAddress
      setSellersBalance((prev) =>
        prev.map((seller, idx) =>
          seller.walletAddress === sellerWalletAddress
            ? { ...seller, seller: { ...seller.seller, status: 'paymentRequested', paymentRequestedAt: new Date().toISOString() } }
            : seller
        )
      );

      // refetch buy orders
      ///fetchBuyOrders();

    } else {
      toast.error('구매 주문 생성에 실패했습니다: ' + data.message);
    }
    setBuyOrderingPrivateSaleArray((prev) => {
      const newArray = [...prev];
      newArray[index] = false;
      return newArray;
    });



    /*
    .then((response) => response.json())
    .then((data) => {
      //console.log('buyOrderPrivateSale data', data);
      if (data.result) {
        toast.success('구매 주문이 생성되었습니다.');
        
        // update local buyOrders state
        //setBuyOrders((prev) => [data.result, ...prev]);
        // refetch buy orders
        fetchBuyOrders();

      } else {
        toast.error('구매 주문 생성에 실패했습니다: ' + data.message);
      }
      setBuyOrderingPrivateSaleArray((prev) => {
        const newArray = [...prev];
        newArray[index] = false;
        return newArray;
      });
    })
    .catch((error) => {
      console.error('Error creating buy order for private seller:', error);
      toast.error('구매 주문 생성에 실패했습니다: ' + error.message);
      setBuyOrderingPrivateSaleArray((prev) => {
        const newArray = [...prev];
        newArray[index] = false;
        return newArray;
      });
    });
    */


  };
    




    // customRate
  const [customRate, setCustomRate] = useState<number | null>(null);

  // placingCustomBuyOrder
  const [placingCustomBuyOrder, setPlacingCustomBuyOrder] = useState(false);
  const placeCustomBuyOrder = async () => {
    if (!address) {
      toast.error('지갑을 연결해주세요.');
      return;
    }
    if (!customRate || customRate <= 0) {
      toast.error('구매 환율을 입력해주세요.');
      return;
    }
    setPlacingCustomBuyOrder(true);
    const response = await fetch('/api/order/buyOrderCustomRate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        buyerWalletAddress: address,
        usdtToKrwRate: customRate,
      }),
    });
    const data = await response.json();
    if (data.result) {
      toast.success('맞춤형 구매 주문이 생성되었습니다.');
      // refetch buy orders
      fetchBuyOrders();
    } else {
      toast.error('맞춤형 구매 주문 생성에 실패했습니다: ' + data.message);
    }
    setPlacingCustomBuyOrder(false);
  };

  // seller search filter
  const normalizedSellerSearch = sellerSearch.trim().toLowerCase();
  const matchesSellerSearch = (seller: any) => {
    if (!normalizedSellerSearch) return true;
    const fields = [
      seller?.nickname,
      seller?.walletAddress,
      seller?.seller?.bankInfo?.bankName,
      seller?.seller?.bankInfo?.accountNumber,
      seller?.seller?.status,
    ]
      .filter(Boolean)
      .map((v: any) => String(v).toLowerCase());
    return fields.some((f: string) => f.includes(normalizedSellerSearch));
  };
  const filteredSellersBalance = sellersBalance.filter(matchesSellerSearch);







  //if (!address) {
  if (false) {
    return (
      <div className="flex flex-col items-center justify-center">

        <AutoConnect
            client={client}
            wallets={[wallet]}
        />


        {/*
        <h1 className="text-2xl font-bold">로그인</h1>

          <ConnectButton
            accountAbstraction={{
              chain: chain === "ethereum" ? ethereum :
                      chain === "polygon" ? polygon :
                      chain === "arbitrum" ? arbitrum :
                      chain === "bsc" ? bsc : arbitrum,
              sponsorGas: true
            }}

            client={client}
            wallets={wallets}
            chain={chain === "ethereum" ? ethereum :
                    chain === "polygon" ? polygon :
                    chain === "arbitrum" ? arbitrum :
                    chain === "bsc" ? bsc : arbitrum}
            
            theme={"light"}

            // button color is dark skyblue convert (49, 103, 180) to hex
            connectButton={{
              style: {
                backgroundColor: "#0047ab", // cobalt blue

                color: "#f3f4f6", // gray-300 
                padding: "2px 2px",
                borderRadius: "10px",
                fontSize: "14px",
                //width: "40px",
                height: "38px",
              },
              label: "웹3 로그인",
            }}

            connectModal={{
              size: "wide", 
              //size: "compact",
              titleIcon: "https://crypto-ex-vienna.vercel.app/logo.png",                           
              showThirdwebBranding: false,
            }}

            locale={"ko_KR"}
            //locale={"en_US"}
          />
        */}

      </div>
    );
  }





  

  if (address && loadingUser) {
    return (
      <main className="p-4 pb-28 min-h-[100vh] flex items-start justify-center mx-auto w-full max-w-4xl bg-white">
        <div className="py-0 w-full flex flex-col items-center justify-center gap-4">

          <Image
            src="/banner-loading.gif"
            alt="Loading"
            width={200}
            height={200}
          />

          <div className="text-lg text-slate-600">회원 정보를 불러오는 중</div>
        </div>
      </main>
    );
  }




  return (

    <main className="p-4 pb-28 min-h-[100vh] flex items-start justify-center mx-auto w-full max-w-4xl bg-white text-slate-800 antialiased [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:rounded-md">

      <AutoConnect
          client={client}
          wallets={availableWallets}
      />





      {/* fixed position right and vertically center */}
      {/*
      <div className="
        flex
        fixed right-4 top-1/2 transform -translate-y-1/2
        z-40
        ">

          <div className="w-full flex flex-col items-end justify-center gap-4">

            <div className="
              h-20
              flex flex-row items-center justify-center gap-2
              bg-white/80
              p-2 rounded-lg shadow-md
              backdrop-blur-md
            ">
              {loadingTotalNumberOfBuyOrders ? (
                <Image
                  src="/loading.png"
                  alt="Loading"
                  width={20}
                  height={20}
                  className="w-6 h-6 animate-spin"
                />
              ) : (
                <Image
                  src="/icon-buyorder.png"
                  alt="Buy Order"
                  width={35}
                  height={35}
                  className="w-6 h-6"
                />
              )}

              {processingBuyOrders.length > 0 && (
              <div className="flex flex-row items-center justify-center gap-1">
                {processingBuyOrders.slice(0, 3).map((order: BuyOrder, index: number) => (

                  <div className="flex flex-col items-center justify-center
                  bg-white p-1 rounded-lg shadow-md
                  "
                  key={index}>
                    <Image
                      src={order?.store?.storeLogo || '/logo.png'}
                      alt={order?.store?.storeName || 'Store'}
                      width={20}
                      height={20}
                      className="w-5 h-5 rounded-lg object-cover"
                    />
                    <span className="text-xs text-slate-700">
                      {order?.store?.storeName || 'Store'}
                    </span>
                    <span className="text-sm text-gray-800 font-semibold">
                      {order?.buyer.depositName || 'Buyer'}
                    </span>
                  </div>

                ))}

                {processingBuyOrders.length > 3 && (
                  <span className="text-sm text-slate-700">
                    +{processingBuyOrders.length - 3}
                  </span>
                )}
              </div>
              )}

              <p className="text-lg text-red-500 font-semibold">
                {
                totalNumberOfBuyOrders
                }
              </p>

              {totalNumberOfBuyOrders > 0 && (
                <div className="flex flex-row items-center justify-center gap-2">
                  <Image
                    src="/icon-notification.gif"
                    alt="Notification"
                    width={50}
                    height={50}
                    className="w-15 h-15 object-cover"
                    
                  />
                </div>
              )}
            </div>

        
          </div>

        </div>
        */}







      <div className="py-0 w-full">
        <div className="mb-4 w-full rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6h15l-1.5 9h-13L6 6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/>
                  <path d="M18 22a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"/>
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Buyer View</p>
                <h2 className="text-lg font-semibold text-slate-900">구매자가 보는 구매하기 페이지</h2>
                <p className="text-xs text-slate-600 sm:text-sm">판매자는 판매하기 메뉴에서 거래를 진행합니다.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/' + params.lang + '/p2p')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 11l9-7 9 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5 10.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              홈으로 돌아가기
            </button>
          </div>
        </div>


        <div className="w-full grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-start mb-4">
          <div className="w-full">
            <div className="relative w-full flex flex-col items-start justify-start gap-3
            rounded-lg border border-slate-200 bg-white p-3">
              <div className="relative w-full flex flex-col items-start justify-start gap-2">
                <button
                  onClick={() => router.push('/' + params.lang + '/p2p')}
                  className="group inline-flex items-center justify-center gap-2 rounded-md border border-slate-200
                  bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Image
                    src="/logo-orangex.png"
                    alt="logo"
                    width={100}
                    height={100}
                    className="h-6 w-auto object-contain"
                  />
                  <span className="text-sm font-semibold text-slate-700">OrangeX</span>
                </button>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">P2P BUY</span>
                  <span className="text-base font-semibold text-slate-900">구매 센터</span>
                </div>
              </div>


              {address && !loadingUser && (


                <div className="relative w-full flex flex-col items-start gap-2">
              
              {user?.nickname && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      router.push('/' + params.lang + '/p2p/profile-settings');
                    }}
                    className="group inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white
                    px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:text-xs"
                  >
                    {user?.seller?.totalPaymentConfirmedUsdtAmount > 20 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.18em] text-amber-800">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M4 10l4-4 4 4 4-4 4 4-2 8H6l-2-8z"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M8 18h8"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                        BEST
                      </span>
                    )}
                    <div className="flex flex-row items-center justify-center gap-2">
                      {isAdmin && (
                        <div className="flex flex-row items-center justify-center gap-2">
                          <Image
                            src="/icon-admin.png"
                            alt="Admin"
                            width={20}
                            height={20}
                            className="rounded-lg w-4 h-4 opacity-70 grayscale"
                          />
                        </div>
                      )}
                      <span className="text-sm text-slate-700">
                        {user?.nickname}
                      </span>

                    </div>
                  </button>
                  <span
                    className={`inline-flex min-w-[140px] items-center justify-center rounded-md border px-3 py-1 text-[11px] font-semibold ${
                      user?.buyer?.status === 'confirmed'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {user?.buyer?.status === 'confirmed' ? '구매가능상태' : '구매불가능상태'}
                  </span>
                </div>
              )}

              {/* 구매자 설정 */}
              {user?.buyer && (
                <button
                  onClick={() => {
                    router.push('/' + params.lang + '/p2p/buyer-settings');
                  }}
                  className="group inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:text-xs"
                >
                  <div className="flex flex-row items-center justify-center gap-2">
                    <Image
                      src="/icon-buyer.png"
                      alt="Buyer"
                      width={20}
                      height={20}
                      className="rounded-lg w-4 h-4 opacity-70 grayscale"
                    />
                    <span className="text-sm">구매자 설정보기</span>
                  </div>
                </button>
              )}


                </div>

              )}


              {/*!address && (
            <ConnectButton

              accountAbstraction={{
                chain: chain === "ethereum" ? ethereum :
                        chain === "polygon" ? polygon :
                        chain === "arbitrum" ? arbitrum :
                        chain === "bsc" ? bsc : arbitrum,
                sponsorGas: true
              }}

              client={client}
              wallets={wallets}

              chain={chain === "ethereum" ? ethereum :
                      chain === "polygon" ? polygon :
                      chain === "arbitrum" ? arbitrum :
                      chain === "bsc" ? bsc : arbitrum}
              
              theme={"light"}

              // button color is dark skyblue convert (49, 103, 180) to hex
              connectButton={{
                style: {
                  backgroundColor: "#0047ab", // cobalt blue

                  color: "#f3f4f6", // gray-300 
                  padding: "2px 2px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  //width: "40px",
                  height: "38px",
                },
                label: "웹3 로그인",
              }}

              connectModal={{
                size: "wide", 
                //size: "compact",
                titleIcon: "https://crypto-ex-vienna.vercel.app/logo.png",                           
                showThirdwebBranding: false,
              }}

              locale={"ko_KR"}
              //locale={"en_US"}
            />

              )*/}
            </div>


          </div>

          <section className="w-full lg:col-span-1 self-start rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                  <Image
                    src="/icon-today.png"
                    alt="Today"
                    width={20}
                    height={20}
                    className="h-5 w-5 object-cover"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Today</span>
                  <h3 className="text-base font-semibold text-slate-900">오늘의 거래</h3>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                실시간
              </span>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-slate-500">거래수</span>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">
                    {animatedTotalCount}
                  </span>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-slate-500">거래량(USDT)</span>
                  <div className="flex items-center gap-1">
                    <Image
                      src="/icon-tether.png"
                      alt="Tether"
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                    <span className="text-lg font-semibold text-slate-900 tabular-nums" style={{ fontFamily: 'monospace' }}>
                      {animatedTotalUsdtAmount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    </span>
                  </div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-slate-500">거래금액(원)</span>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums" style={{ fontFamily: 'monospace' }}>
                    {animatedTotalKrwAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                </div>
              </div>
            </div>

            {processingBuyOrders.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">진행중 주문</span>
                <div className="flex items-center -space-x-2">
                  {processingBuyOrders.slice(0, 5).map((order: BuyOrder, index: number) => (
                    <Image
                      key={`${order._id}-${index}`}
                      src={order?.store?.storeLogo || '/logo.png'}
                      alt={order?.store?.storeName || 'Store'}
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full border border-white object-cover"
                    />
                  ))}
                </div>
                {processingBuyOrders.length > 5 && (
                  <span className="text-xs font-semibold text-slate-500">
                    +{processingBuyOrders.length - 5}
                  </span>
                )}
              </div>
            )}
          </section>
          
        </div>
          <div className="w-full grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start mb-4">
        <div className="w-full flex flex-col gap-2">
                    {!address && (
                      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                            OrangeX
                          </span>
                          <Image
                            src="/logo-orangex.png"
                            alt="OrangeX"
                            width={160}
                            height={48}
                            className="h-10 w-auto"
                          />
                        </div>
                        <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-md border border-slate-200 bg-white">
                          <Image src="/logo-wallet.png" alt="Wallet" width={32} height={32} className="h-8 w-8" />
                        </div>
                        <h2 className="mt-4 text-xl font-semibold text-slate-900 sm:text-2xl">
                          지갑 연결이 필요합니다
                        </h2>
                        <p className="mt-2 text-sm text-slate-500">
                          USDT 출금을 위해 지갑을 연결해 주세요.
                        </p>
                        <div className="mt-5">
                          <ConnectButton
                            client={client}
                            wallets={availableWallets}
                            chain={
                              chain === "ethereum"
                                ? ethereum
                                : chain === "polygon"
                                ? polygon
                                : chain === "arbitrum"
                                ? arbitrum
                                : bsc
                            }
                            connectButton={{
                              label: "지갑 연결하기",
                              className:
                                "inline-flex w-full items-center justify-center rounded-xl !border !border-orange-500 !bg-gradient-to-r !from-orange-500 !to-amber-500 px-4 py-3 text-sm font-bold tracking-tight !text-white shadow-md shadow-orange-500/25 transition hover:!from-orange-600 hover:!to-amber-600 hover:shadow-lg hover:shadow-orange-600/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 [&_*]:!text-white hover:[&_*]:!text-white focus-visible:[&_*]:!text-white",
                              style: {
                                color: "#ffffff",
                                WebkitTextFillColor: "#ffffff",
                              },
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {address && (
                      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M12 2l7 7-7 7-7-7 7-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          <div className="flex flex-col">
                            <p className="text-sm font-semibold text-slate-900">로그인된 지갑주소</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-semibold text-slate-700" title={address}>
                                {shortAddress}
                              </p>
                              <button
                                type="button"
                                onClick={handleCopyWallet}
                                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition ${
                                  walletCopied
                                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200/80 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                {walletCopied ? (
                                  <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    복사됨
                                  </>
                                ) : (
                                  <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                                      <rect x="4" y="4" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                                    </svg>
                                    복사하기
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {address && !loadingUser && (!user || !user?.nickname) && (
                      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <circle cx="12" cy="17" r="1.5" fill="currentColor" />
                              <path d="M10.3 4.5h3.4L21 20H3L10.3 4.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          <div className="flex flex-col">
                            <p className="text-sm font-semibold text-slate-900">프로필 설정이 필요합니다</p>
                            <p className="text-xs text-slate-600">
                              프로필 정보를 입력해야 구매를 진행할 수 있습니다.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            router.push('/' + params.lang + '/p2p/profile-settings');
                          }}
                          className="inline-flex w-full items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 sm:w-auto sm:self-start"
                        >
                          프로필 설정하기
                        </button>
                      </div>
                    )}
                    {address && !loadingUser && user?.nickname && !user?.buyer && (
                      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <circle cx="12" cy="17" r="1.5" fill="currentColor" />
                              <path d="M10.3 4.5h3.4L21 20H3L10.3 4.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          <div className="flex flex-col">
                            <p className="text-sm font-semibold text-slate-900">구매자 설정이 필요합니다</p>
                            <p className="text-xs text-slate-600">
                              구매자 설정을 완료해야 구매를 진행할 수 있습니다.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            router.push('/' + params.lang + '/p2p/buyer-settings');
                          }}
                          className="inline-flex w-full items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 sm:w-auto sm:self-start"
                        >
                          구매자 설정하기
                        </button>
                      </div>
                    )}
                  </div>
        <section className="w-full rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Image
                            src="/icon-seller.png"
                            alt="Seller"
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-lg object-cover"
                          />
                          <h2 className="text-base font-semibold text-slate-800">판매자 요약</h2>
                        </div>
                        <span className="text-xs font-semibold text-slate-500">실시간 집계</span>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3">
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                            <span className="h-2 w-2 rounded-full bg-slate-400" />
                            판매자수(명)
                          </div>
                          <span className="text-xl font-semibold text-slate-900 tabular-nums" style={{ fontFamily: 'monospace' }}>
                            {sellersBalance.length.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                            <span className="h-2 w-2 rounded-full bg-slate-400" />
                            에스크로 총량(USDT)
                          </div>
                          <div className="flex items-center gap-1">
                            <Image
                              src="/icon-tether.png"
                              alt="Tether"
                              width={16}
                              height={16}
                              className="h-4 w-4"
                            />
                            <span className="text-xl font-semibold text-slate-900 tabular-nums" style={{ fontFamily: 'monospace' }}>
                              {animatedTotalUsdtBalance.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </section>
      </div>

      <div className="flex flex-col items-start justify-center gap-4 mt-4">
          {/* USDT 가격 binance market price */}
          {/*
          <div
            className="
              h-20
              w-full flex
              binance-widget-marquee
            flex-row items-center justify-center gap-2
            p-2
            "


            data-cmc-ids="1,1027,52,5426,3408,74,20947,5994,24478,13502,35336,825"
            data-theme="dark"
            data-transparent="true"
            data-locale="ko"
            data-fiat="KRW"
            //data-powered-by="Powered by Vienna Mania"
            //data-disclaimer="Disclaimer"
          ></div>
          */}
          



          {/*
          {address && (
              <div className="w-full flex flex-col items-end justify-center gap-4">

                  <div className="flex flex-row items-center justify-center gap-2">
                      <Image
                          src="/icon-shield.png"
                          alt="Wallet"
                          width={50}
                          height={50}
                          className="w-6 h-6"
                      />
                      <button
                          className="text-lg text-zinc-600 underline"
                          onClick={() => {
                              navigator.clipboard.writeText(address);
                              toast.success(Copied_Wallet_Address);
                          } }
                      >
                          {address.substring(0, 6)}...{address.substring(address.length - 4)}
                      </button>

                  </div>

                  <div className="flex flex-row items-center justify-center  gap-2">
                    <Image
                        src="/icon-tether.png"
                        alt="USDT"
                        width={50}
                        height={50}
                        className="w-6 h-6"
                    />
                    <span className="text-2xl xl:text-4xl font-semibold text-[#409192]"
                      style={{ fontFamily: 'monospace' }}
                    >
                        {Number(balance).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    </span>
                  </div>

              </div>
          )}
          */}







          {/*
          <div className="w-full flex flex-row items-center justify-end gap-2">

            <div className="flex flex-row items-center justify-center gap-2
            bg-white/80
            p-2 rounded-lg shadow-md
            backdrop-blur-md
            ">
              {loadingTotalNumberOfBuyOrders ? (
                <Image
                  src="/icon-loading.png"
                  alt="Loading"
                  width={20}
                  height={20}
                  className="w-6 h-6 animate-spin"
                />
              ) : (
                <Image
                  src="/icon-buyorder.png"
                  alt="Buy Order"
                  width={35}
                  height={35}
                  className="w-6 h-6"
                />
              )}


              <p className="text-lg text-red-500 font-semibold">
                {
                totalNumberOfBuyOrders
                }
              </p>

              {totalNumberOfBuyOrders > 0 && (
                <div className="flex flex-row items-center justify-center gap-2">
                  <Image
                    src="/icon-notification.gif"
                    alt="Notification"
                    width={50}
                    height={50}
                    className="w-15 h-15 object-cover"
                    
                  />
                </div>
              )}
            </div>

            {version !== 'bangbang' && (
            <div className="hidden flex-row items-center justify-center gap-2
            bg-white/80
            p-2 rounded-lg shadow-md
            backdrop-blur-md
            ">

              {loadingTotalNumberOfClearanceOrders ? (
                <Image
                  src="/icon-loading.png"
                  alt="Loading"
                  width={20}
                  height={20}
                  className="w-6 h-6 animate-spin"
                />
              ) : (
                <Image
                  src="/icon-clearance.png"
                  alt="Clearance"
                  width={35}
                  height={35}
                  className="w-6 h-6"
                />
              )}

              <p className="text-lg text-yellow-500 font-semibold">
                {
                totalNumberOfClearanceOrders
                }
              </p>

              {totalNumberOfClearanceOrders > 0 && (
                <div className="flex flex-row items-center justify-center gap-2">
                  <Image
                    src="/icon-notification.gif"
                    alt="Notification"
                    width={50}
                    height={50}
                    className="w-15 h-15 object-cover"
                    
                  />
                  <button
                    onClick={() => {
                      router.push('/' + params.lang + '/administration/clearance-history');
                    }}
                    className="flex items-center justify-center gap-2
                    bg-[#0047ab] text-sm text-[#f3f4f6] px-4 py-2 rounded-lg hover:bg-[#0047ab]/80"
                  >
                    <span className="text-sm">
                      청산관리
                    </span>
                  </button>
                </div>
              )}
            </div>
            )}
        
          </div>
          */}



          

            {/* 지정가로 구매주문하기 */}
            {/*
            <div className="w-full flex flex-col items-center justify-center">

              <div className="w-full max-w-md
              flex flex-col items-center justify-center gap-2
              bg-white/90
              p-4 rounded-lg shadow-xl
              backdrop-blur-md
              border border-slate-200
              ">
                <h3 className="text-md font-bold text-slate-800">
                  지정가로 구매주문하기
                </h3>

                <p className="text-sm text-slate-600 text-center">
                  지정가로 구매주문하면 판매자중에서 가장 유리한 환율을 제시한 판매자와 매칭됩니다.
                </p>
                <div className="w-full flex flex-col items-center justify-center gap-2">

                  <input
                    type="number"
                    min="1"
                    
                    //value={customRate}
                    value ={customRate && customRate > 0 ? customRate : ''}

                    onChange={(e) => setCustomRate(Number(e.target.value))}
                    placeholder="지정가(원/USDT)를 입력하세요"
                    className="w-full
                    bg-white/90
                    text-slate-800
                    placeholder-slate-500
                    px-4 py-2
                    rounded-lg
                    border border-slate-200
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                    "
                  />
                  
                  <button
                    disabled={placingCustomBuyOrder}
                    className={`
                      ${placingCustomBuyOrder
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-white hover:text-white hover:shadow-blue-500/50 cursor-pointer'
                      } bg-blue-600 hover:bg-blue-700
                      px-4 py-2 rounded-lg
                      shadow-lg
                      `}
                    onClick={() => {
                      // place custom buy order
                      placeCustomBuyOrder();
                    }}
                  >
                    <div className="flex flex-row gap-2 items-center justify-center">
                      { placingCustomBuyOrder && (
                          <Image
                            src="/loading.png"
                            alt="Loading"
                            width={20}
                            height={20}
                            className="w-5 h-5
                            animate-spin"
                          />
                      )}
                      <span className="text-md font-semibold">
                        구매주문하기
                      </span>
                    </div>

                  </button>

                </div>
              </div>
            </div>
            */}
            



            <div className="mt-4 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.12)]" />
                  판매자 검색
                </div>
                <div className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm md:w-96">
                  <svg
                    className="h-4 w-4 text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-3.5-3.5" />
                  </svg>
                  <input
                    type="text"
                    value={sellerSearch}
                    onChange={(e) => setSellerSearch(e.target.value)}
                    placeholder="닉네임, 지갑주소, 은행명, 상태 검색"
                    className="w-full bg-transparent text-slate-800 placeholder:text-slate-400 focus:outline-none"
                  />
                  {sellerSearch && (
                    <button
                      type="button"
                      onClick={() => setSellerSearch('')}
                      className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {filteredSellersBalance.length} / {sellersBalance.length}명
                </span>
              </div>
            </div>

            {filteredSellersBalance.length > 0 && (
              <div className="w-full grid grid-cols-1 md:grid-cols-2 items-stretch gap-4 mt-4">

                {sellersBalance.map((seller, index) => {
                  if (!matchesSellerSearch(seller)) return null;
                  const buyOrderStatus = seller?.seller?.buyOrder?.status as string | undefined;
                  const statusLabel = buyOrderStatus
                    ? SELLER_STATUS_LABEL[buyOrderStatus] ?? '거래 진행중'
                    : '거래 가능';
                  const statusBadgeClass = buyOrderStatus
                    ? SELLER_STATUS_BADGE[buyOrderStatus] ?? 'border-slate-200 bg-slate-50 text-slate-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800';
                  const statusDotClass = buyOrderStatus
                    ? SELLER_STATUS_DOT[buyOrderStatus] ?? 'bg-slate-400'
                    : 'bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.16)]';
                  const isMyOrder = seller?.seller?.buyOrder?.walletAddress === address;

                  return (
                    <div
                      key={seller.walletAddress || index}
                      className={`relative w-full h-full flex flex-col items-start justify-start gap-3
                      rounded-lg border border-slate-200/80 bg-white/80 px-4 py-4 text-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.04)] border-l-2 border-l-slate-300
                      
                      ${(
                        (seller.seller.buyOrder?.status === 'ordered'
                        || seller.seller.buyOrder?.status === 'paymentRequested')
                      && (seller.walletAddress !== address && seller.seller?.buyOrder?.walletAddress !== address)
                      ) ?
                        'border-l-red-400' : ''
                      }
                      
                      ${seller.walletAddress === address
                      ? 'border-l-amber-400' : ''
                      }

                      ${(
                        (seller.seller.buyOrder?.status === 'ordered' ||
                        seller.seller?.buyOrder?.status === 'paymentRequested')
                      && seller.seller?.buyOrder?.walletAddress === address)
                      ? 'border-l-yellow-400' : ''
                      }

                      `}
                    >

                      <div className="w-full flex flex-col gap-3">
                        <div className="flex items-end justify-between gap-3 pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                              <Image
                                src={seller.avatar || "/icon-seller.png"}
                                alt={seller.nickname || "Seller"}
                                width={36}
                                height={36}
                                className="h-9 w-9 object-cover"
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                판매자
                              </span>
                              <span className="max-w-[180px] truncate text-sm font-semibold text-slate-900">
                                {seller.nickname || "Seller"}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 text-right">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                              판매금액
                            </span>
                            <div className="flex items-baseline justify-end gap-2">
                              <span className="text-base font-semibold text-slate-900 tabular-nums leading-tight tracking-tight" style={{ fontFamily: 'monospace' }}>
                                {(usdtKrwRateAnimationArray[index] ?? seller.seller?.usdtToKrwRate ?? 0)
                                  .toFixed(0)
                                  .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                              </span>
                              <span className="text-[11px] text-slate-500">KRW</span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {seller.seller?.priceSettingMethod === 'market' ? '시장가' : '고정가'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            거래상태
                          </span>
                          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass}`}>
                            <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                            <span>{statusLabel}</span>
                            {isMyOrder && (
                              <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                내 주문
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            에스크로 잔고
                          </span>
                          <span className="text-base font-semibold text-slate-900 tabular-nums" style={{ fontFamily: 'monospace' }}>
                            {(currentUsdtBalanceArray[index] ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} USDT
                          </span>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="flex items-start justify-between rounded-md border border-slate-200 px-3 py-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              정상거래
                            </div>
                            <div className="text-right text-[11px] text-slate-500">
                              <div className="font-medium text-slate-700 tabular-nums">
                                {Number(seller.seller?.totalPaymentConfirmedCount ?? 0).toLocaleString()}건
                              </div>
                              <div className="tabular-nums text-slate-600">
                                {Number(seller.seller?.totalPaymentConfirmedUsdtAmount ?? 0).toLocaleString()} USDT
                              </div>
                            </div>
                          </div>
                          <div className="flex items-start justify-between rounded-md border border-slate-200 px-3 py-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
                              중재거래
                            </div>
                            <div className="text-right text-[11px] text-slate-500">
                              <div className="font-medium text-slate-700 tabular-nums">
                                {Number(seller.seller?.totalDisputeResolvedCount ?? 0).toLocaleString()}건
                              </div>
                              <div className="tabular-nums text-slate-600">
                                {Number(seller.seller?.totalDisputeResolvedUsdtAmount ?? 0).toLocaleString()} USDT
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            프로모션
                          </span>
                          <p className="text-sm text-slate-700 break-words">
                            {seller.seller?.promotionText || '프로모션이 없습니다.'}
                          </p>
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const sellerOwnerWalletAddress = seller?.walletAddress || seller?.seller?.walletAddress;
                                if (!sellerOwnerWalletAddress) {
                                  return;
                                }
                                router.push(`/${params.lang}/seller-escrow/${sellerOwnerWalletAddress}`);
                              }}
                              className="seller-contact-cta group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100 px-3 py-1.5 text-[11px] font-semibold text-amber-900 shadow-[0_10px_30px_rgba(251,191,36,0.35)] transition-all duration-300 hover:scale-[1.05] hover:border-amber-400 hover:shadow-[0_14px_36px_rgba(251,191,36,0.45)] focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1 active:scale-[0.98]"
                            >
                              <span
                                className="pointer-events-none absolute inset-0 rounded-full bg-amber-200/40 opacity-90 blur-md animate-[seller-glow_2.8s_ease-in-out_infinite]"
                                aria-hidden="true"
                              />
                              <span
                                className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-white/0 via-white/65 to-white/0 animate-[seller-shimmer_2.4s_ease-in-out_infinite]"
                                aria-hidden="true"
                              />
                              <span className="relative z-10 flex items-center gap-1.5">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                >
                                  <path d="M8 11h4m-8-6h12a2 2 0 012 2v5a2 2 0 01-2 2H9l-4 3v-3H4a2 2 0 01-2-2V7a2 2 0 012-2z" />
                                </svg>
                                판매자에게 문의하기
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>



                      
                      {/* if seller nickname is 'seller', then show withdraw button */}
                      {/*
                      {seller.nickname === 'seller' && (
                        <button
                          onClick={() => {
                            router.push('/' + params.lang + '/admin/withdraw-vault?walletAddress=' + seller.walletAddress);
                          }}
                          className="bg-[#3167b4] text-sm text-[#f3f4f6] px-4 py-2 rounded-lg hover:bg-[#3167b4]/80"
                        >
                          출금하기
                        </button>
                      )}
                      */}

                    </div>
                  );
                })}

              </div>
            )}
          </div>



          <div className='hidden
            flex-row items-center space-x-4'>
              <Image
                src="/icon-buyorder.png"
                alt="Trade"
                width={35}
                height={35}
                className="w-6 h-6"
              />

              <div className="text-xl font-semibold">
                구매주문 내역
              </div>
          </div>

          <div className="hidden
            w-full flex-col xl:flex-row items-center justify-between gap-5">

            <div className="flex flex-col xl:flex-row items-center gap-2">


              {/* select storecode */}
              <div className="flex flex-row items-center gap-2">
                {fetchingAllStores ? (
                  <Image
                    src="/icon-loading.png"
                    alt="Loading"
                    width={20}
                    height={20}
                    className="animate-spin"
                  />
                ) : (
                  <div className="flex flex-row items-center gap-2">

                    
                    <Image
                      src="/icon-store.png"
                      alt="Store"
                      width={20}
                      height={20}
                      className="rounded-lg w-5 h-5"
                    />

                    <span className="
                      w-32
                      text-sm font-semibold">
                      가맹점선택
                    </span>


                    <select
                      value={searchStorecode}
                      
                      //onChange={(e) => setSearchStorecode(e.target.value)}

                      // storecode parameter is passed to fetchBuyOrders
                      onChange={(e) => {
                        router.push('/' + params.lang + '/administration/buyorder?storecode=' + e.target.value);
                      }}



                      className="w-full p-2 bg-slate-100 border border-slate-200 text-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">전체</option>
                      {allStores && allStores.map((item, index) => (
                        <option key={index} value={item.storecode}
                          className="flex flex-row items-center justify-start gap-2"
                        >
                          
                          {item.storeName}{' '}({item.storecode})

                        </option>
                      ))}
                    </select>


                  </div>

                )}
              </div>


              <div className="flex
                flex-row items-center gap-2">
                {/* checkbox for searchOrderStatus is 'cancelled' */}
                {/* 판매취소 */}
                {/* 판매완료 */}
                {/* only one checkbox can be checked */}
                <div className="flex flex-row items-center gap-2">
                  <input
                    type="checkbox"
                    checked={searchOrderStatusCancelled}
                    onChange={(e) => {
                      setSearchOrderStatusCancelled(e.target.checked);
                      setPageValue(1);
                      //fetchBuyOrders();
                    }}
                    className="w-5 h-5"
                  />
                  <label className="text-sm text-slate-700">판매취소</label>
                </div>
                <div className="flex flex-row items-center gap-2">
                  <input
                    type="checkbox"
                    checked={searchOrderStatusCompleted}
                    onChange={(e) => {
                      setSearchOrderStatusCompleted(e.target.checked);
                      setPageValue(1);
                      
                      //fetchBuyOrders();
                    }}
                    className="w-5 h-5"
                  />
                  <label className="text-sm text-slate-700">판매완료</label>
                </div>
                
              </div>


              {/* serach fromDate and toDate */}
              {/* DatePicker for fromDate and toDate */}
              <div className="flex
                flex-col xl:flex-row items-center gap-2">
                <div className="flex flex-row items-center gap-2">
                  <Image
                    src="/icon-calendar.png"
                    alt="Calendar"
                    width={20}
                    height={20}
                    className="rounded-lg w-5 h-5"
                  />
                  <input
                    type="date"
                    value={searchFromDate}
                    onChange={(e) => setSearchFromDate(e.target.value)}
                    className="w-full p-2 bg-slate-100 border border-slate-200 text-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <span className="text-sm text-slate-600">~</span>

                <div className="flex flex-row items-center gap-2">
                  <Image
                    src="/icon-calendar.png"
                    alt="Calendar"
                    width={20}
                    height={20}
                    className="rounded-lg w-5 h-5"
                  />
                  <input
                    type="date"
                    value={searchToDate}
                    onChange={(e) => setSearchToDate(e.target.value)}
                    className="w-full p-2 bg-slate-100 border border-slate-200 text-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-row items-center gap-2">
                    {/* 오늘, 어제 */}
                    <button
                      onClick={() => {
                        // korea time
                        const today = new Date();
                        today.setHours(today.getHours() + 9); // Adjust for Korean timezone (UTC+9)
                        setSearchFromDate(today.toISOString().split("T")[0]);
                        setSearchToDate(today.toISOString().split("T")[0]);
                      }}
                      className="text-sm text-slate-600 underline hover:text-slate-800"
                    >
                      오늘
                    </button>
                    <button
                      onClick={() => {
                        // korea time yesterday
                        const today = new Date();
                        today.setHours(today.getHours() + 9); // Adjust for Korean timezone (UTC+9)
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);
                        setSearchFromDate(yesterday.toISOString().split("T")[0]);
                        setSearchToDate(yesterday.toISOString().split("T")[0]);
                      }}
                      className="text-sm text-slate-600 underline hover:text-slate-800"
                    >
                      어제
                    </button>
                  </div>

              </div>



            </div>



          </div>

          {/* 통장 */}
          {/*}
          {address && user?.seller?.bankInfo && (
            <div className="flex flex-row items-center gap-2 mt-4">
              <Image
                src="/icon-bank.png"
                alt="Bank"
                width={35}
                height={35}
                className="w-6 h-6"
              />
              <div className="text-sm xl:text-xl font-semibold">
                {user?.seller?.bankInfo.bankName}{' '}
                {user?.seller?.bankInfo.accountNumber}{' '}
                {user?.seller?.bankInfo.accountHolder}
              </div>

              <div className="flex flex-row gap-2 items-center justify-center">
                <Image
                  src="/icon-bank-auto.png"
                  alt="Bank Auto"
                  width={20}
                  height={20}
                  className="animate-spin"
                />
                <span className="text-sm font-semibold text-zinc-500">
                  자동자동입금확인중
                </span>
              </div>

            </div>
          )}
          */}

          {/*}
          {address && !user?.seller?.bankInfo && (
            <div className="flex flex-row items-center gap-2 mt-4">
              <Image
                src="/icon-bank.png"
                alt="Bank"
                width={35}
                height={35}
                className="w-6 h-6"
              />
              <div className="text-sm text-zinc-500 font-semibold">
                입금통장정보가 없습니다. 입금통장정보가 없으면 판매가 불가능합니다.
              </div>
            </div>
          )}
          */}

          {/* trade summary */}

          <div className="hidden
            flex-col xl:flex-row items-start justify-between gap-2
            w-full
            bg-zinc-100/50
            p-4 rounded-lg shadow-md
            ">

            <div className="xl:w-1/3 w-full
              flex flex-col xl:flex-row items-start justify-start gap-4">

              <Image
                src="/icon-trade.png"
                alt="Trade"
                width={50}
                height={50}
                className="w-16 h-16 rounded-lg object-cover"
              />

              <div className="flex flex-col gap-2 items-center">
                <div className="text-sm text-slate-700">거래수(건)</div>
                <div className="text-4xl font-semibold text-slate-800">
                  {
                    //buyOrderStats.totalCount?.toLocaleString()
                    animatedTotalCount
                  }
                </div>
              </div>

              <div className="flex flex-row items-center justify-center gap-2">

                <div className="flex flex-col gap-2 items-center">
                  <div className="text-sm">거래량(USDT)</div>
                  <div className="flex flex-row items-center justify-center gap-1">
                    <Image
                      src="/icon-tether.png"
                      alt="Tether"
                      width={20}
                      height={20}
                      className="w-5 h-5"
                    />
                    {/* RGB: 64, 145, 146 */}
                    <span className="text-4xl text-[#409192]"
                      style={{ fontFamily: 'monospace' }}>
                      {
                        //buyOrderStats.totalUsdtAmount
                        //? buyOrderStats.totalUsdtAmount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                        //: '0.000'
                        animatedTotalUsdtAmount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                      }
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <div className="text-sm">거래금액(원)</div>
                  <div className="flex flex-row items-center justify-center gap-1">
                    <span className="text-4xl text-yellow-600"
                      style={{ fontFamily: 'monospace' }}>
                      {
                        //buyOrderStats.totalKrwAmount?.toLocaleString()
                        animatedTotalKrwAmount.toLocaleString()
                      }
                    </span>
                  </div>
                </div>

              </div>

            </div>

            {/* divider */}
            {/*
            <div className="hidden xl:block w-0.5 h-20 bg-zinc-300"></div>
            <div className="xl:hidden w-full h-0.5 bg-zinc-300"></div>

            <div className="xl:w-2/3 w-full
              flex flex-col xl:flex-row items-start justify-end gap-4">

              <Image
                src="/icon-payment.png"
                alt="Payment"
                width={50}
                height={50}
                className="w-16 h-16 rounded-lg object-cover"
              />

              <div className="flex flex-col xl:flex-row items-start justify-start gap-2">

                <div className="flex flex-col gap-2 items-center">
                  <div className="text-sm text-slate-700">가맹점 결제수(건)</div>
                    <span className="text-4xl font-semibold text-slate-700">
                      {buyOrderStats.totalSettlementCount?.toLocaleString()}
                    </span>
                </div>

                <div className="flex flex-row items-center justify-center gap-2">

                  <div className="flex flex-col gap-2 items-center">
                    <div className="text-sm text-slate-700">가맹점 결제량(USDT)</div>
                    <div className="flex flex-row items-center justify-center gap-1">
                      <Image
                        src="/icon-tether.png"
                        alt="Tether"
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                      <span className="text-xl font-semibold text-[#409192]"
                        style={{ fontFamily: 'monospace' }}>
                        {buyOrderStats.totalSettlementAmount
                          ? buyOrderStats.totalSettlementAmount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                          : '0.000'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 items-center">
                    <div className="text-sm text-slate-700">가맹점 결제금액(원)</div>
                    <div className="flex flex-row items-center justify-center gap-1">
                      <span className="text-xl font-semibold text-yellow-600"
                        style={{ fontFamily: 'monospace' }}>
                        {buyOrderStats.totalSettlementAmountKRW?.toLocaleString()}
                      </span>
                    </div>
                  </div>

                </div>

              </div>

          
              <div className="flex flex-col gap-2 items-center">

                <div className="flex flex-row gap-2 items-center
                  border-b border-slate-200 pb-2">

                  <div className="flex flex-col gap-2 items-center">
                    <div className="text-sm text-slate-700">센터 수수료량(USDT)</div>
                    <div className="w-full flex flex-row items-center justify-end gap-1">
                      <Image
                        src="/icon-tether.png"
                        alt="Tether"
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                      <span className="text-xl font-semibold text-[#409192]"
                        style={{ fontFamily: 'monospace' }}>
                        {buyOrderStats.totalFeeAmount
                          ? buyOrderStats.totalFeeAmount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                          : '0.000'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 items-center">
                    <div className="text-sm text-slate-700">센터 수수료금액(원)</div>
                    <div className="w-full flex flex-row items-center justify-end gap-1">
                      <span className="text-xl font-semibold text-yellow-600"
                        style={{ fontFamily: 'monospace' }}>
                        {buyOrderStats.totalFeeAmountKRW
                          ? buyOrderStats.totalFeeAmountKRW.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                          : '0'}
                      </span>
                    </div>
                  </div>

                </div>


                <div className="flex flex-row gap-2 items-center">

                  <div className="flex flex-col gap-2 items-center">
                    <div className="text-sm text-slate-700">AG 수수료량(USDT)</div>
                    <div className="w-full flex flex-row items-center justify-end gap-1">
                      <Image
                        src="/icon-tether.png"
                        alt="Tether"
                        width={20}
                        height={20}
                        className="w-5 h-5"
                      />
                      <span className="text-xl font-semibold text-[#409192]"
                        style={{ fontFamily: 'monospace' }}>
                        {buyOrderStats.totalAgentFeeAmount
                          ? buyOrderStats.totalAgentFeeAmount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                          : '0.000'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 items-center">
                    <div className="text-sm">AG 수수료금액(원)</div>
                    <div className="w-full flex flex-row items-center justify-end gap-1">
                      <span className="text-xl font-semibold text-yellow-600"
                        style={{ fontFamily: 'monospace' }}>
                        {buyOrderStats.totalAgentFeeAmountKRW
                          ? buyOrderStats.totalAgentFeeAmountKRW.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                          : '0'}
                      </span>
                    </div>
                  </div>

                </div>

              </div>
              

            </div>
            */}

            
            {/* divider */}
            {/*}
            <div className="hidden xl:block w-0.5 h-10 bg-zinc-300"></div>
            <div className="xl:hidden w-full h-0.5 bg-zinc-300"></div>

            <div className="xl:w-1/4 flex flex-row items-center justify-center gap-2">
              <div className="flex flex-col gap-2 items-center">
                <div className="text-sm">총 청산수(건)</div>
                <div className="text-xl font-semibold text-zinc-500">
                  {tradeSummary.totalClearanceCount?.toLocaleString()}
                </div>
              </div>

              <div className="flex flex-col gap-2 items-center">
                <div className="text-sm">총 청산금액(원)</div>
                <div className="text-xl font-semibold text-zinc-500">
                  {tradeSummary.totalClearanceAmount?.toLocaleString()} 원
                </div>
              </div>
              <div className="flex flex-col gap-2 items-center">
                <div className="text-sm">총 청산수량(USDT)</div>
                <div className="text-xl font-semibold text-zinc-500">
                  {tradeSummary.totalClearanceAmountUSDT?.toLocaleString()} USDT
                </div>
              </div>
            </div>
            */}
            
          </div>


          {/* buyOrderStats.totalByBuyerDepositName */}
          
          <div className="hidden
            w-full
            grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6
            gap-4
            items-start justify-start
            border-t border-zinc-300
            py-4
            ">
            {buyOrderStats.totalByBuyerDepositName?.map((item, index) => (
              <div
                key={index}
                className={`w-full flex flex-col items-start justify-center gap-2
                p-2 rounded-lg shadow-md
                backdrop-blur-md
                ${buyerDisplayValueArray && buyerDisplayValueArray[index] !== undefined && buyerDisplayValueArray[index] !== item.totalKrwAmount
                  ? 'bg-yellow-100/80 animate-pulse'
                  : 'bg-white/80'}
                `}
              >
                <div className="flex flex-row items-start justify-start gap-1">
                  <Image
                    src="/icon-user.png"
                    alt="User"
                    width={30}
                    height={30}
                    className="w-6 h-6"
                  />          
                  {item._id.length > 1 ? item._id.slice(0, 1) + '*' .repeat(item._id.length - 1) : item._id}  
                </div>
                <div className="w-full flex flex-row items-center justify-between gap-1">
                  <span className="text-sm text-zinc-500">
                    {item.totalCount?.toLocaleString() || '0'}건
                  </span>
                  ｜
                  <span className="text-sm text-green-600"
                    style={{ fontFamily: 'monospace' }}>
                    {(item.totalUsdtAmount || 0).toLocaleString()}테더
                  </span>
                  ｜
                  <span className="text-sm text-yellow-600"
                    style={{ fontFamily: 'monospace' }}>
                    {(item.totalKrwAmount || 0).toLocaleString()}원
                  </span>
                </div>
              </div>
            ))}


            {buyOrderStats.totalReaultGroupByBuyerDepositNameCount! - buyOrderStats.totalByBuyerDepositName!.length > 0 && (

              <div className="text-xl font-bold text-red-500
                flex items-center justify-center"
              >
                +{buyOrderStats.totalReaultGroupByBuyerDepositNameCount! - buyOrderStats.totalByBuyerDepositName!.length} 명
              </div>

            )}
          </div>


          {/* table view is horizontal scroll */}
          {tableView ? (


            <div className="
              hidden
              w-full overflow-x-auto">

              <table className="w-full table-auto border-collapse border border-zinc-800 rounded-md">

                <thead
                  className="bg-[#0047ab] text-white text-sm font-semibold"
                  //style={{
                  //  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  //}}
                >
                  <tr>

                    <th className="p-2 text-start">
                      <div className="flex flex-col items-start justify-center gap-2">
                        <span className="text-sm text-zinc-50 font-semibold">
                          가맹점
                        </span>
                        <span className="text-sm text-zinc-50 font-semibold">
                          P2P거래번호
                        </span>
                        <span className="text-sm text-zinc-50 font-semibold">
                          거래시작시간
                        </span>
                      </div>
                    </th>

                    <th className="p-2 text-start">
                      <div className="flex flex-col items-start justify-center gap-2">
                        <span className="text-sm text-zinc-50 font-semibold">
                          구매자 아이디
                        </span>
                        <span className="text-sm text-zinc-50 font-semibold">
                          USDT지갑
                        </span>
                        <span className="text-sm text-zinc-50 font-semibold">
                          입금자
                        </span>
                      </div>
                    </th>
                    
                    <th className="p-2 text-end">
                      <div className="flex flex-col items-end justify-center gap-2">
                        <span className="text-sm text-zinc-50 font-semibold">
                          {Buy_Amount}(USDT)
                        </span>
                        <span className="text-sm text-zinc-50 font-semibold">
                          구매금액(원)
                        </span>
                        <span className="text-sm text-zinc-50 font-semibold">
                          단가(원)
                        </span>
                      </div>
                    </th>
                    {/*
                    <th className="p-2">{Payment_Amount}</th>
                    */}

                    <th className="p-2 text-start">
                      <div className="flex flex-col items-start justify-center gap-2">

                        <div className="flex flex-col items-start justify-center gap-2">
                            <span className="text-sm text-zinc-50 font-semibold">
                              판매자 아이디
                            </span>
                            <span className="text-sm text-zinc-50 font-semibold">
                              USDT지갑
                            </span>
                        </div>

                        <div className="flex flex-row items-center justify-center gap-2">
                          <span>자동매칭</span>
                          <Image
                            src="/icon-matching.png"
                            alt="Auto Matching"
                            width={20}
                            height={20}

                            /*
                            className="
                            bg-zinc-100 rounded-full
                            w-5 h-5 animate-spin"
                            */
                            // if buyOrders.filter((item) => item.status === 'ordered').length > 0, then animate spin
                            className={`
                              w-5 h-5
                              ${buyOrders.filter((item) => item.status === 'ordered').length > 0 ? 'animate-spin' : ''}
                            `}
                          />

                          {/* the count of status is ordered */}
                          <span className="text-sm text-zinc-50 font-semibold">
                            {
                              buyOrders.filter((item) => item.status === 'ordered').length
                            }
                          </span>

                          <span className="text-sm text-zinc-50 font-semibold">
                            거래상태
                          </span>

                        </div>

                      </div>
                    </th>


                    <th className="p-2">
                      <div className="flex flex-col items-center justify-center gap-2">

                        <div className="flex flex-row items-center justify-center gap-2">
                          <span>
                            자동입금확인
                          </span>
                          <Image
                            src="/icon-bank-auto.png"
                            alt="Bank Auto"
                            width={20}
                            height={20}

                            //className="w-5 h-5 animate-spin"
                            className={`
                              w-5 h-5
                              ${buyOrders.filter((item) => item.status === 'paymentRequested').length > 0 ? 'animate-spin' : ''}
                            `}
                          />
                          <span className="text-sm text-zinc-50 font-semibold">
                            {
                              buyOrders.filter((item) => item.status === 'paymentRequested').length
                            }
                          </span>

                        </div>

                        <div className="w-full flex flex-col items-end justify-center gap-2">
                          <span className="text-sm text-zinc-50 font-semibold">
                            입금통장
                          </span>
                          <span className="text-sm text-zinc-50 font-semibold">
                            입금액(원)
                          </span>
                        </div>

                      </div>
                    </th>


                    <th className="p-2">
                      <div className="flex flex-col xl:flex-row items-center justify-center gap-2">
                        <span>
                          판매취소
                        </span>
                        <span>
                          판매완료
                        </span>
                      </div>
                    </th>

                    {/*
                    <th className="
                      p-2">
                      정산비율(%)
                    </th>
                    */}

                    <th className="hidden
                      p-2">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="flex flex-row items-center justify-center gap-2">
                          <span>
                            자동결제 및 정산(USDT)
                          </span>
                          <Image
                            src="/icon-settlement.png"
                            alt="Settlement"
                            width={20}
                            height={20}
                            ///className="w-5 h-5 animate-spin"
                            className={`
                              w-5 h-5
                              ${buyOrders.filter((item) =>
                                item.status === 'paymentConfirmed'
                                && item?.settlement?.status !== "paymentSettled"
                                && item?.storecode !== 'admin' // admin storecode is not included
                              ).length > 0
                              ? 'animate-spin' : ''}
                            `}
                          />

                          <span className="text-sm text-zinc-50 font-semibold">
                            {
                              buyOrders.filter((item) => item.status === 'paymentConfirmed'
                              && item?.settlement?.status !== "paymentSettled"
                              && item?.storecode !== 'admin' // admin storecode is not included
                            ).length
                            }
                          </span>

                        </div>


                      </div>

                    </th>
                    

                  </tr>
                </thead>

                {/* if my trading, then tr has differenc color */}
                <tbody>

                  {buyOrders.map((item, index) => (

                    
                    <tr key={index} className={`
                      ${
                        index % 2 === 0 ? 'bg-zinc-100' : 'bg-zinc-200'


                        //item.walletAddress === address ?
                        

                      }
                    `}>
                    

                      <td className="
                        p-2
                      "
                      >

                        <div className="
                          w-36 
                          flex flex-col items-start justify-start gap-2
                          bg-slate-100
                          rounded-lg
                          border border-slate-200
                          hover:bg-slate-200
                          cursor-pointer
                          transition-all duration-200 ease-in-out
                          hover:scale-105
                          hover:shadow-lg
                          hover:shadow-slate-500/50
                          hover:cursor-pointer
                          p-2

                          "
                          onClick={() => {
                            // copy traideId to clipboard
                            navigator.clipboard.writeText(item.tradeId);
                            toast.success("거래번호가 복사되었습니다.");
                          }}
                        
                        >

                          <div className="flex flex-row items-center justify-start gap-2">
                            <Image
                              src={item?.store?.storeLogo || "/icon-store.png"}
                              alt="Store Logo"
                              width={35}
                              height={35}
                              className="
                              rounded-lg
                              w-8 h-8 object-cover"
                            />
                            
                            <div className="flex flex-col items-start justify-start">
                              <span className="text-sm text-slate-800 font-bold">
                                {
                                  item?.store?.storeName?.length > 5 ?
                                  item?.store?.storeName?.substring(0, 5) + '...' :
                                  item?.store?.storeName
                                }
                              </span>
                              <span className="text-sm text-slate-700">
                                {
                                  item?.agent.agentName?.length > 5 ?
                                  item?.agent.agentName?.substring(0, 5) + '...' :
                                  item?.agent.agentName
                                }
                              </span>
                            </div>
                          </div>


                          <span className="text-sm text-slate-700 font-semibold">
                          {
                            "#" + item.tradeId
                          }
                          </span>

                          <div className="flex flex-row items-center justify-start gap-2">

                            <div className="flex flex-col items-start justify-start">

                              <span className="text-sm text-zinc-800 font-semibold">
                                {new Date(item.createdAt).toLocaleTimeString('ko-KR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                              {/*
                              <span className="text-sm text-zinc-500">
                                {new Date(item.createdAt).toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                })}
                              </span>
                              */}

                              <div className="flex flex-row items-center justify-start gap-1">
                                <span className="text-sm text-slate-700 font-semibold">
                                  {params.lang === 'ko' ? (
                                    <p>{
                                      new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 ? (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000) + ' ' + seconds_ago
                                      ) :
                                      new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                      ) : (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                      )
                                    }</p>
                                  ) : (
                                    <p>{
                                      new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 ? (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000) + ' ' + seconds_ago
                                      ) :
                                      new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                      ) : (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                      )
                                    }</p>
                                  )}
                                </span>
                                {/* audioOn */}
                                {item.status === 'ordered' || item.status === 'paymentRequested' && (
                                  <div className="flex flex-row items-center justify-center gap-1">
                                    <span className="text-xl text-slate-700 font-semibold">
                                      {item.audioOn ? (
                                        '🔊'
                                      ) : '🔇'}
                                    </span>
                                    {/* audioOn off button */}
                                    <button
                                      className="text-sm text-blue-600 font-semibold underline"
                                      onClick={() => handleAudioToggle(
                                        index,
                                        item._id
                                      )}
                                    >
                                      {item.audioOn ? '끄기' : '켜기'}
                                    </button>
                                  </div>
                                )}
                              </div>

                            </div>
                            {/*
                            <span className="text-sm text-zinc-500 font-semibold">
                              {params.lang === 'ko' ? (
                                <p>{
                                  new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 ? (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000) + ' ' + seconds_ago
                                  ) :
                                  new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 * 60 ? (
                                  ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                  ) : (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                  )
                                }</p>
                              ) : (
                                <p>{
                                  new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 ? (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000) + ' ' + seconds_ago
                                  ) :
                                  new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 * 60 ? (
                                  ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                  ) : (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                  )
                                }</p>
                              )}
                            </span>
                            */}
                          </div>

                        </div>

                      </td>
                      
                      <td className="p-2">
                        <div className="
                          w-36  
                          flex flex-col items-start justify-start gap-2">
                          
                          <div className="w-full flex flex-col gap-2 items-center justify-start">

                            <div className="w-full flex flex-row items-center justify-start gap-2">
                              <Image
                                src={item?.buyer?.avatar || "/icon-user.png"}
                                alt="Avatar"
                                width={20}
                                height={20}
                                className="rounded-full w-5 h-5"
                                style={{
                                  objectFit: 'cover',
                                }}
                              />
                              <span className="text-lg text-slate-700 font-semibold">
                                {
                                  item?.nickname?.length > 10 ?
                                  item?.nickname?.substring(0, 10) + '...' :
                                  item?.nickname
                                }
                              </span>
                            </div>

                            {/* wallet address */}
                            <div className="w-full flex flex-row items-start justify-start gap-1">
                              <Image
                                src="/icon-shield.png"
                                alt="Wallet Address"
                                width={20}
                                height={20}
                                className="w-5 h-5"
                              />
                              <button
                                className="text-sm text-blue-600 font-semibold underline
                                "
                                onClick={() => {
                                  navigator.clipboard.writeText(item.walletAddress);
                                  toast.success(Copied_Wallet_Address);
                                }}
                              >
                                {item.walletAddress.substring(0, 6)}...{item.walletAddress.substring(item.walletAddress.length - 4)}
                              </button>
                            </div>


                            {
                            item?.paymentMethod === 'mkrw' ? (
                              <></>
                            ) : (
                              <div className="w-full flex flex-row items-center justify-start gap-2">
                                <span className="text-lg text-slate-800 font-bold">
                                  {
                                    item?.buyer?.depositName
                                  }
                                </span>
                                <span className="
                                  hidden xl:flex
                                  text-sm text-slate-700">
                                  {
                                    item?.buyer?.depositBankName
                                  }
                                </span>
                                <span className="
                                  text-sm text-slate-700">
                                  {
                                    item?.buyer?.depositBanktAccountNumber &&
                                    item?.buyer?.depositBanktAccountNumber.substring(0, 3) + '...'
                                  }
                                </span>
                              </div>
                            )}


                          </div>


                          
                          {/* userStats */}
                          {/* userStats.totalPaymentConfirmedCount */}
                          {/* userStats.totalPaymentConfirmedKrwAmount */}
                          <div className="flex flex-row items-center justify-center gap-2">
                            <span className="text-sm text-slate-700">
                              {
                                item?.userStats?.totalPaymentConfirmedCount
                                ? item?.userStats?.totalPaymentConfirmedCount.toLocaleString() + ' 건' :
                                0 + ' 건'
                              }
                            </span>
                            <span className="text-sm text-slate-700">
                              {
                                item?.userStats?.totalPaymentConfirmedKrwAmount &&
                                item?.userStats?.totalPaymentConfirmedKrwAmount.toLocaleString() + ' 원'
                              }
                            </span>

                            {!item?.userStats?.totalPaymentConfirmedCount && (
                              <Image
                                src="/icon-new-user.png"
                                alt="New User"
                                width={50}
                                height={50}
                                className="w-10 h-10"
                              />
                            )}
                          </div>

                        </div>

                      </td>


                      <td className="p-2">
                        <div className="
                          w-32
                          flex flex-col gap-2 items-end justify-start">

                          <div className="flex flex-row items-center justify-end gap-2">
                            <Image
                              src="/icon-tether.png"
                              alt="Tether"
                              width={20}
                              height={20}
                              className="w-5 h-5"
                            />
                            <span className="text-xl text-[#409192] font-semibold"
                              style={{
                                fontFamily: 'monospace',
                              }}
                            >
                              {
                              Number(item.usdtAmount).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                              }
                            </span>
                          </div>


                          <div className="flex flex-row items-center justify-end gap-1">
                            <span className="text-xl text-yellow-600 font-semibold"
                              style={{
                                fontFamily: 'monospace',
                              }}
                            >
                              {
                                item.krwAmount?.toLocaleString()
                              }
                            </span>
                          </div>

                          <span className="text-sm text-zinc-500"
                            style={{
                              fontFamily: 'monospace',
                            }}
                          >
                            {
                              Number(item.rate).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                              //Number(item.krwAmount / item.usdtAmount).toFixed(3)
                            }
                          </span>

                          {/* paymentMethod */}
                          <div className="flex flex-col items-end justify-end gap-2">
                            
                            <div className="flex flex-row items-center justify-center gap-2">
                              <span className="text-sm text-zinc-500">
                                결제방법
                              </span>
                              <span className="text-sm text-zinc-500">
                                {item.paymentMethod === 'bank' ? '은행'
                                : item.paymentMethod === 'card' ? '카드'
                                : item.paymentMethod === 'pg' ? 'PG'
                                : item.paymentMethod === 'cash' ? '현금'
                                : item.paymentMethod === 'crypto' ? '암호화폐'
                                : item.paymentMethod === 'giftcard' ? '기프트카드'
                                : item.paymentMethod === 'mkrw' ? 'MKRW' : '기타'
                                }
                              </span>
                            </div>

                            {item.paymentMethod === 'mkrw' && item?.escrowWallet?.address && (
                              <div className="flex flex-col items-end justify-center gap-2">

                                <div className="flex flex-row items-center justify-center gap-2">
                                  <Image
                                    src="/icon-shield.png"
                                    alt="Escrow Wallet"
                                    width={20}
                                    height={20}
                                    className="w-5 h-5"
                                  />
                                  <button
                                    className="text-sm text-blue-600 font-semibold underline"
                                    onClick={() => {
                                      navigator.clipboard.writeText(item?.escrowWallet.address);
                                      toast.success(Copied_Wallet_Address);
                                    }}
                                  >
                                      {item?.escrowWallet.address.substring(0, 6)}...{item?.escrowWallet.address.substring(item?.escrowWallet.address.length - 4)}
                                  </button>
                                </div>

                                {/* balance */}
                                {item?.escrowWallet?.balance ? (
                                  <div className="flex flex-row items-center justify-center gap-1">
                                    <Image
                                      src="/token-mkrw-icon.png"
                                      alt="MKRW Token"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5"
                                    />
                                    <span className="text-lg text-yellow-600 font-semibold"
                                      style={{
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {
                                        item?.escrowWallet?.balance.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                      }
                                    </span>
                                  </div>

                                ) : (
                                  <div className="flex flex-row items-center justify-center gap-1">
                                    <Image
                                      src="/icon-loading.png"
                                      alt="Loading"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5 animate-spin"
                                    />
                                    <span className="text-sm text-slate-700">
                                      에스크로 진행중...
                                    </span>
                                  </div>
                                )}

                              </div>

                            )}
       
                          </div>

                        </div>
                      </td>


                      <td className="p-2">

                        <div className="
                          w-52
                          flex flex-row items-start justify-start gap-2">
                            
                          {/* status */}
                          {item.status === 'ordered' && (
                            <div className="w-full flex flex-col gap-2 items-center justify-center">

                              <div className="flex flex-row items-center justify-center gap-2">
                                <Image
                                  src="/icon-searching-seller.gif"
                                  alt="Auto Matching"
                                  width={50}
                                  height={50}
                                  className="w-8 h-8"
                                />
                                <span className="text-sm text-slate-700 font-semibold">
                                  판매자<br/>매칭중
                                </span>
                              </div>

                              <div
                                className="w-full flex items-center justify-center text-sm text-red-600 font-semibold
                                  border border-red-600 rounded-lg p-2"
                              >
                                {Buy_Order_Opened}
                              </div>

                            </div>
                          )}



                      

                          {item.status === 'ordered' ? (
                            <div className="w-full flex flex-col gap-2 items-start justify-start">

                              {/* cancel buy order button */}
                              {/* 주문취소하기 */}
                              <button

                                disabled={cancellingBuyOrders[index]}
            
                                className="w-full flex items-center justify-center
                                  text-sm text-red-600 font-semibold
                                  border border-red-500 rounded-lg p-2
                                  bg-red-900/20
                                  text-center
                                  hover:bg-red-900/30
                                  cursor-pointer
                                  transition-all duration-200 ease-in-out
                                  hover:scale-105
                                  hover:shadow-lg
                                  hover:shadow-red-500/50
                                "  
                                onClick={() => {
                                  confirm("정말로 구매주문을 취소하시겠습니까?") && cancelBuyOrderByAdmin(index, item._id);
                                }}
                              >
                                <div className="flex flex-row gap-2 items-center justify-center">
                                  {cancellingBuyOrders[index] && (
                                    <Image
                                      src="/icon-loading.png"
                                      alt="Loading"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5
                                      animate-spin"
                                    />
                                  )}
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L10 10.586 7.707 8.293a1 1 0 00-1.414 1.414l2.999 2.999a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-sm">
                                    취소하기
                                  </span>
                                </div>
                              
                              </button>
                              
                            </div>
                          ) : (

                            <>
                              {item.seller && (
                              <div className="w-full flex flex-col gap-2 items-start justify-start">

                                <div className="flex flex-row items-center justify-center gap-2"> 
                                  <Image
                                    src={item?.seller?.avatar || "/icon-seller.png"}
                                    alt="Avatar"
                                    width={20}
                                    height={20}
                                    className="rounded-full w-5 h-5"
                                  />
                                  <span className="text-lg font-semibold text-slate-700">
                                    {
                                      item.seller?.nickname &&
                                      item.seller.nickname.length > 8 ?
                                      item.seller.nickname.slice(0, 8) + '...' :
                                      item.seller?.nickname
                                    }
                                  </span>
                                </div>

                                {/* wallet address */}
                                <div className="flex flex-row items-center justify-center gap-1">
                                  <Image
                                    src="/icon-shield.png"
                                    alt="Wallet Address"
                                    width={20}
                                    height={20}
                                    className="w-5 h-5"
                                  />
                                  <button
                                    className="text-sm text-blue-600 font-semibold underline
                                    "
                                    onClick={() => {
                                      navigator.clipboard.writeText(item.seller?.walletAddress);
                                      toast.success(Copied_Wallet_Address);
                                    }}
                                  >
                                    {item.seller?.walletAddress && item.seller?.walletAddress.substring(0, 6) + '...' + item.seller?.walletAddress.substring(item.seller?.walletAddress.length - 4)}
                                  </button>
                                </div>
  
                                <div className="flex flex-row items-center justify-center gap-2">
                                  <Image
                                    src="/icon-matching-completed.png"
                                    alt="Matching Completed"
                                    width={20}
                                    height={20}
                                    className="w-5 h-5"
                                  />
                                  <span className="text-sm text-slate-700 font-semibold">
                                    자동매칭
                                  </span>
                                </div>

                              </div>
                              )}

                            </>
                          )}


                          {item.status === 'accepted' && (

                            <div className="w-full flex flex-col gap-2 items-start justify-start">
                              <button
                                className="text-sm text-blue-600 font-semibold
                                  border border-blue-500 rounded-lg p-2 bg-blue-900/20"
                              >
                                {Trade_Started}
                              </button>
                              
                              <div className="text-sm text-slate-700">

                                {params.lang === 'ko' ? (
                                  <p>{
                                    new Date().getTime() - new Date(item.acceptedAt).getTime() < 1000 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000) + ' ' + seconds_ago
                                    ) :
                                    new Date().getTime() - new Date(item.acceptedAt).getTime() < 1000 * 60 * 60 ? (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                    ) : (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                    )
                                  }</p>
                                ) : (
                                  <p>{
                                    new Date().getTime() - new Date(item.acceptedAt).getTime() < 1000 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000) + ' ' + seconds_ago
                                    ) :
                                    new Date().getTime() - new Date(item.acceptedAt).getTime() < 1000 * 60 * 60 ? (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                    ) : (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                    )
                                  }</p>
                                )}

                              </div>


                            </div>
                          )}

                          {item.status === 'paymentRequested' && (

                            <div className="w-full flex flex-col gap-2 items-start justify-start">

                              <button
                                className="text-sm text-amber-400 font-semibold
                                  border border-amber-500 rounded-lg p-2 bg-amber-900/20"
                              >
                                {Request_Payment}
                              </button>


                              {/*
                              <div className="text-sm text-white">
                                {item.seller?.nickname}
                              </div>
                              */}

                              <div className="text-sm text-slate-600">
                                {/* from now */}
                                {
                                  new Date().getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 ? (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000) + ' ' + seconds_ago
                                  ) : new Date().getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 * 60 ? (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                  ) : (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                  )
                                }
                              </div>


                            </div>
                          )}

                          {item.status === 'cancelled' && (
                            <div className="w-full flex flex-col gap-2 items-start justify-start">

                                {/*
                                <div className="text-lg text-red-600 font-semibold
                                  border border-red-600 rounded-lg p-2
                                  bg-red-100
                                  w-full text-center
                                  ">
                                  {
                                    Cancelled_at
                                  }
                                </div>
                                */}
                                <button
                                  className="w-full flex items-center justify-center text-sm text-red-600 font-semibold
                                    border border-red-600 rounded-lg p-2"
                                >
                                  {Cancelled_at}
                                </button>



                                {/*
                                <span className="text-sm text-white">
                                  {item.seller?.nickname}
                                </span>
                                */}

                                <div className="text-sm text-zinc-500">
                                  {
                                    // from now
                                    new Date().getTime() - new Date(item.cancelledAt).getTime() < 1000 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.cancelledAt).getTime()) / 1000) + ' ' + seconds_ago
                                    ) : new Date().getTime() - new Date(item.cancelledAt).getTime() < 1000 * 60 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.cancelledAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                    ) : (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.cancelledAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                    )
                                  }
                                </div>

                            </div>
                          )}


                          {/* if status is accepted, show payment request button */}
                          {item.status === 'paymentConfirmed' && (
                            <div className="w-full flex flex-col gap-2 items-start justify-start">

                              {/*
                              <span className="text-lg text-[#409192] font-semibold
                                border border-green-600 rounded-lg p-2
                                bg-green-100
                                w-full text-center
                                ">


                                {Completed}
                              </span>
                              */}
                              {/*
                              <span className="text-sm font-semibold text-white">
                                {item.seller?.nickname}
                              </span>
                              */}



                              <button
                                className="w-full flex items-center justify-center text-sm text-[#409192] font-semibold
                                  border border-green-600 rounded-lg p-2"
                              >
                                {Completed}
                              </button>
                              {/* new window */}
                              <a
                                href={`${paymentUrl}/${params.lang}/${clientId}/${item?.storecode}/pay-usdt-reverse/${item?._id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 font-semibold underline"
                              >
                                새창
                              </a>

                              <span
                                className="text-sm text-zinc-500"
                              >{
                                //item.paymentConfirmedAt && new Date(item.paymentConfirmedAt)?.toLocaleString()
                                // from now
                                new Date().getTime() - new Date(item.paymentConfirmedAt).getTime() < 1000 * 60 ? (
                                  ' ' + Math.floor((new Date().getTime() - new Date(item.paymentConfirmedAt).getTime()) / 1000) + ' ' + seconds_ago
                                ) : new Date().getTime() - new Date(item.paymentConfirmedAt).getTime() < 1000 * 60 * 60 ? (
                                  ' ' + Math.floor((new Date().getTime() - new Date(item.paymentConfirmedAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                ) : (
                                  ' ' + Math.floor((new Date().getTime() - new Date(item.paymentConfirmedAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                )

                              }</span>
                            </div>
                          )}





                          {item.status === 'completed' && (
                            <div className="w-full flex flex-col gap-2 items-start justify-start">
                              
                              {Completed_at}
                            </div>
                          )}

                        </div>

                      </td>



                      <td className="p-2">

                        {
                        //!item?.escrowTransactionHash &&
                        item?.status === 'paymentConfirmed' && (
                          <div className="
                            w-36
                            flex flex-col gap-2 items-end justify-start">
                            
                            {item?.autoConfirmPayment === true ? (
                            
                              <div className="flex flex-row gap-2 items-center justify-end">
                                <Image
                                  src="/icon-bank-check.png"
                                  alt="Bank Check"
                                  width={20}
                                  height={20}
                                  className="w-5 h-5 rounded-full"
                                />
                                <span className="text-sm font-semibold text-zinc-500">
                                  자동입금확인
                                </span>
                              </div>

                            ) : (

                              <div className="flex flex-row gap-2 items-center justify-end">
                                <Image
                                  src="/icon-bank-check.png"
                                  alt="Bank Check"
                                  width={20}
                                  height={20}
                                  className="w-5 h-5 rounded-full"
                                />
                                <span className="text-sm font-semibold text-zinc-500">
                                  수동입금확인
                                </span>
                              </div>

                            )}

                            {/* seller bank info */}
                            <div className="flex flex-row gap-2 items-center justify-end">
                              {isContactTransferBank(item.seller?.bankInfo) ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="text-sm font-semibold text-emerald-600">
                                    연락처송금
                                  </span>
                                  {item.seller?.bankInfo?.contactMemo && (
                                    <span className="text-xs text-slate-500 text-right">
                                      {item.seller.bankInfo.contactMemo}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <span className="text-sm text-zinc-500">
                                    {item.seller?.bankInfo?.bankName}
                                  </span>
                                  <span className="text-lg text-gray-800 font-bold">
                                    {item.seller?.bankInfo?.accountHolder}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* paymentAmount */}
                            <div className="flex flex-row gap-1 items-center justify-end">
                              <span className="text-xl text-yellow-600 font-semibold"
                                style={{ fontFamily: 'monospace' }}>
                                {
                                  item.paymentAmount?.toLocaleString()
                                }
                              </span>
                            </div>

                            <span className="text-sm text-purple-600 font-semibold">
                              {params.lang === 'ko' ? (
                                <p>{
                                  new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 ? (
                                    ' ' + Math.floor((new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000) + ' ' + '초 경과'
                                  ) :
                                  new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 * 60 ? (
                                  ' ' + Math.floor((new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60) + ' ' + '분 경과'
                                  ) : (
                                    ' ' + Math.floor((new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60 / 60) + ' ' + '시간 경과'
                                  )
                                }</p>
                              ) : (
                                <p>{
                                  new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 ? (
                                    ' ' + Math.floor((new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000) + ' ' + '초 경과'
                                  ) :
                                  new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 * 60 ? (
                                  ' ' + Math.floor((new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60) + ' ' + '분 경과'
                                  ) : (
                                    ' ' + Math.floor((new Date(item.paymentConfirmedAt).getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60 / 60) + ' ' + '시간 경과'
                                  )
                                }</p>
                              )}
                            </span>

                          </div>
                        )}

                        {item?.status === 'paymentRequested' && (

                          <div className="
                            w-32
                            flex flex-col gap-2 items-end justify-start">

                            {item?.paymentMethod === 'mkrw' ? (
                              <div className="flex flex-row gap-2 items-center justify-end">
                                <Image
                                  src="/token-mkrw-icon.png"
                                  alt="MKRW"
                                  width={20}
                                  height={20}
                                  className="w-5 h-5 rounded-full"
                                />
                                <span className="text-sm font-semibold text-slate-700">
                                  MKRW
                                </span>
                              </div>
                            ) : (

                              <div className="flex flex-col gap-2 items-end justify-center">

                                <div className="flex flex-row gap-2 items-center justify-end">
                                  <Image
                                    src="/icon-bank-auto.png"
                                    alt="Bank Auto"
                                    width={20}
                                    height={20}
                                    className="animate-spin"
                                  />
                                  {item?.autoConfirmPayment === true ? (
                                    <span className="text-sm font-semibold text-slate-700">
                                      자동입금확인중
                                    </span>
                                  ) : (
                                    <span className="text-sm font-semibold text-slate-700">
                                      자동입금확인중
                                    </span>
                                  )}

                                </div>



                                <div className="flex flex-row gap-1 items-center justify-end">
                                  {isContactTransferBank(item.seller?.bankInfo) ? (
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="text-sm font-semibold text-emerald-600">
                                        연락처송금
                                      </span>
                                      {item.seller?.bankInfo?.contactMemo && (
                                        <span className="text-xs text-slate-500 text-right">
                                          {item.seller.bankInfo.contactMemo}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <>
                                      <div className="text-sm text-slate-600">
                                        {item.seller?.bankInfo?.bankName}
                                      </div>
                                      <div className="text-lg text-slate-800 font-bold">
                                        {item.seller?.bankInfo?.accountHolder}
                                      </div>
                                    </>
                                  )}
                                </div>
                                {/*
                                <div className="flex flex-row items-end justify-start text-sm text-zinc-500">
                                  {item.seller?.bankInfo?.accountNumber}
                                </div>
                                */}

                                <div className="flex flex-col items-between justify-center">

                                  <span className="text-sm text-purple-400 font-semibold">
                                    {params.lang === 'ko' ? (
                                      <p>{
                                        new Date().getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 ? (
                                          ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000) + ' ' + '초 경과'
                                        ) :
                                        new Date().getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 * 60 ? (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60) + ' ' + '분 경과'
                                        ) : (
                                          ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60 / 60) + ' ' + '시간 경과'
                                        )
                                      }</p>
                                    ) : (
                                      <p>{
                                        new Date().getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 ? (
                                          ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000) + ' ' + '초 경과'
                                        ) :
                                        new Date().getTime() - new Date(item.paymentRequestedAt).getTime() < 1000 * 60 * 60 ? (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60) + ' ' + '분 경과'
                                        ) : (
                                          ' ' + Math.floor((new Date().getTime() - new Date(item.paymentRequestedAt).getTime()) / 1000 / 60 / 60) + ' ' + '시간 경과'
                                        )
                                      }</p>
                                    )}
                                  </span>

                                  {
                                  false
                                  //item.seller
                                  //&& item.seller.walletAddress === address
                                  
                                  ///////////////&& item?.autoConfirmPayment

                                  && (

                                    <div className="flex flex-col gap-2 items-center justify-center">

                                      {/* 입금자명과 입금액이 일치하는지 확인 후, 수동으로 입금확인 처리 */}
                        

                                      <div className="flex flex-row gap-2">
                                        
                                        <button

                                          disabled={confirmingPayment[index]}
                                          
                                          className={`
                                            ${confirmingPayment[index]
                                            ? 'text-gray-400 border-gray-400 bg-gray-100 cursor-not-allowed'
                                            : 'text-yellow-600 hover:text-yellow-700 hover:shadow-yellow-500/50 cursor-pointer'
                                            } bg-yellow-100 border border-yellow-600 rounded-lg p-2
                                          `}

                                          onClick={() => {
                                            confirm("수동으로 입금확인을 처리하시겠습니까?") &&
                                            confirmPayment(
                                              index,
                                              item._id,
                                              //paymentAmounts[index],
                                              //paymentAmountsUsdt[index],

                                              item.krwAmount,
                                              item.usdtAmount,
                                              
                                              item.walletAddress,

                                              item.paymentMethod,
                                            );
                                          }}

                                        >
                                          <div className="flex flex-row gap-2 items-center justify-center">
                                            { confirmingPayment[index] && (
                                                <Image
                                                  src="/loading.png"
                                                  alt="Loading"
                                                  width={20}
                                                  height={20}
                                                  className="w-5 h-5
                                                  animate-spin"
                                                />
                                            )}
                                            <span className="text-sm">
                                              입금완료하기
                                            </span>
                                          </div>

                                        </button>


                                      </div>

                                    </div>


                                  )}


                                </div>

                              </div>
                              
                            )}

                          </div>

                        )}
                      </td>



                      <td className="p-2">
                        <div className="
                        w-60
                        flex flex-col gap-2 items-center justify-center">

                        {/*
                        {
                          user?.seller &&
                          item.status === 'ordered'  && (

                          <div className="bg-gray-500/10
                            rounded-md
                            p-2
                            flex flex-col xl:flex-row gap-2 items-start justify-start">
                            <div className="
                              w-full
                              flex flex-col gap-2 items-end justify-center">

                              <div className="flex flex-row gap-2">
                                <input
                                  type="checkbox"
                                  checked={agreementForTrade[index]}
                                  onChange={(e) => {
                                    setAgreementForTrade(
                                      agreementForTrade.map((item, idx) => idx === index ? e.target.checked : item)
                                    );
                                  }}
                                />
                                <button
                                  disabled={acceptingBuyOrder[index] || !agreementForTrade[index]}
                                  className="
                                    text-sm text-blue-600 font-semibold
                                    border border-blue-600 rounded-lg p-2
                                    bg-blue-100
                                    w-full text-center
                                    hover:bg-blue-200
                                    cursor-pointer
                                    transition-all duration-200 ease-in-out
                                    hover:scale-105
                                    hover:shadow-lg
                                    hover:shadow-blue-500/50
                                  "
                                  onClick={() => {
                                    acceptBuyOrder(index, item._id, smsReceiverMobileNumber, item.tradeId, item.walletAddress)
                                  }}
                                >
                                  <div className="flex flex-row gap-2 items-center justify-center">
                                    {acceptingBuyOrder[index] && (
                                      <Image
                                        src="/icon-loading.png"
                                        alt="Loading"
                                        width={20}
                                        height={20}
                                        className="animate-spin"
                                      />
                                    )}
                                    <span className="text-sm">{Buy_Order_Accept}</span>
                                  </div>
                                </button>

                              </div>

                              <div className="flex flex-row gap-2 items-center justify-center">
                                <Image
                                  src={user?.avatar || "/icon-seller.png"}
                                  alt="User"
                                  width={20}
                                  height={20}
                                  className="w-5 h-5"
                                />
                                <div className="text-lg text-zinc-500 font-semibold">
                                  {user?.nickname}
                                </div>
                              </div>


                            </div>

                          </div>

                        )}
                        */}



                        {item?.seller?.walletAddress === address && (

                          <>



                        {/* 상태가 cancelled 이고, escrowTransactionHash가 없을 경우 */}
                        {/* 에스크로 돌아주기 버튼 */}
                        { item.status === 'cancelled'
                        && item?.escrowWallet?.transactionHash
                        && item?.escrowWallet?.transactionHash !== '0x'
                        && (!item?.escrowTransactionHash || item?.escrowTransactionHash === '0x')
                        && (
                          <button
                            className="text-sm text-blue-600 font-semibold
                              border border-blue-600 rounded-lg p-2
                              bg-blue-100
                              w-full text-center
                              hover:bg-blue-200
                              cursor-pointer
                              transition-all duration-200 ease-in-out
                              hover:scale-105
                              hover:shadow-lg
                              hover:shadow-blue-500/50
                            "
                            onClick={() => {
                              // TODO: implement return to escrow logic
                            }}
                          >
                            <div className="flex flex-row gap-2 items-center justify-start ml-2">
                              <Image
                                src={`/token-mkrw-icon.png`}
                                alt="MKRW Logo"
                                width={20}
                                height={20}
                                className="w-5 h-5"
                              />
                              <Image
                                src={`/logo-chain-${chain}.png`}
                                alt={`${chain} Logo`}
                                width={20}
                                height={20}
                                className="w-5 h-5"
                              />
                              <span className="text-sm">
                                {item?.escrowWallet?.balance?.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} MKRW 회수하기
                              </span>
                            </div>
                          </button>
                        )}





                            {/*
                            <button
                              onClick={() => {
                                
                                //router.push(`/chat?channel=${item._id}`);

                                router.push(`/${params.lang}/${item.storecode}/chat/${item._id}`);


                              }}
                              className="w-8 h-8
                              flex items-center justify-center
                              bg-white rounded-lg shadow-md
                              hover:bg-gray-100
                              transition-all duration-200 ease-in-out
                              hover:scale-105
                              hover:shadow-lg
                              hover:shadow-blue-500/50
                              cursor-pointer
                              p-1

                              "
                            >
                              <Image
                                src="/icon-chat.png"
                                alt="Chat"
                                width={24}
                                height={24}
                              />
                            </button>
                            */}


                          </>


                        )}




                        {item?.seller?.walletAddress !== address ? (

                          <div className="flex flex-col gap-2 items-center justify-center">

                            {item.status === 'paymentConfirmed' &&
                            !item?.settlement &&
                            (!item?.transactionHash || item?.transactionHash === '0x') && (
                              <div className="flex flex-row gap-2 items-center justify-center">
                                <Image
                                  src="/icon-loading.png"
                                  alt="Loading Icon"
                                  width={20}
                                  height={20}
                                  className="w-5 h-5 animate-spin"
                                />
                                <span className="text-sm text-zinc-500">
                                  판매자가 테더(USDT)를 구매자에게 보내는 중
                                </span>
                              </div>
                            )}

                          </div>

                        ) : (

                          <div className={`
                            ${
                            //item.status === 'accepted' ? 'bg-blue-500/10'
                            //: item.status === 'paymentRequested' ? 'bg-blue-500/10'
                            //: item.status === 'paymentConfirmed' ? 'bg-blue-500/10'
                            //: item.status === 'cancelled' ? 'bg-red-500/10'
                            //: item.status === 'paymentConfirmed' ? 'bg-green-500/10'
                            //: 'bg-gray-500/10'
                            <></>
                            } 

                            rounded-md
                            p-2
                            w-full
                            flex flex-col xl:flex-row gap-2 items-start justify-start
                            `}>


                            
                            <div className="
                              w-full
                              flex flex-col gap-2 items-start justify-start">


                              {
                              (item.status === 'accepted' || item.status === 'paymentRequested')
                              && item.seller && item.seller.walletAddress === address && (
                                
                                <div className="flex flex-col items-center gap-2">

                                  
                                  <div className="flex flex-row items-center gap-2">
                                    {/*
                                    <input
                                      type="checkbox"
                                      checked={agreementForCancelTrade[index]}
                                      onChange={(e) => {
                                        setAgreementForCancelTrade(
                                          agreementForCancelTrade.map((item, idx) => idx === index ? e.target.checked : item)
                                        );
                                      }}
                                    />
                                    */}
                                    <button
                                      //disabled={cancellings[index] || !agreementForCancelTrade[index]}
                                      disabled={cancellings[index]}
                  
                                      className="text-sm text-red-600 font-semibold
                                        border border-red-600 rounded-lg p-2
                                        bg-red-100
                                        w-full text-center
                                        hover:bg-red-200
                                        cursor-pointer
                                        transition-all duration-200 ease-in-out
                                        hover:scale-105
                                        hover:shadow-lg
                                        hover:shadow-red-500/50
                                      "  
                                      onClick={() => {
                                        confirm("정말로 판매를 취소하시겠습니까?") && cancelTrade(item._id, index);
                                      }}
                                    >
                                      <div className="flex flex-row gap-2 items-center justify-center">
                                        {cancellings[index] && (
                                          <Image
                                            src="/icon-loading.png"
                                            alt="Loading"
                                            width={20}
                                            height={20}
                                            className="w-5 h-5
                                            animate-spin"
                                          />
                                        )}
                                        <span className="text-sm">{Cancel_My_Trade}</span>
                                      </div>
                                    
                                    </button>
                                  </div>

                                  <input 
                                    type="text"
                                    value={cancelTradeReason[index]}
                                    onChange={(e) => {
                                      setCancelTradeReason(
                                        cancelTradeReason.map((item, idx) => idx === index ? e.target.value : item)
                                      );
                                    }}
                                    placeholder="판매취소사유"
                                    className="w-full h-8
                                    text-center rounded-md text-sm text-zinc-500 font-semibold bg-zinc-100 border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  />
                                  <div className="text-xs text-red-500">
                                    취소사유가 없을 경우 판매자 평가에 영향을 미칠 수 있습니다.
                                  </div>
                                


                                </div>

                              )}

                              {/*
                              {item.status === 'cancelled' && (

                                <div className="w-full flex flex-col gap-2 items-center justify-center">
                                  <span className="text-sm text-red-600">
                                    {item.cancelTradeReason ? item.cancelTradeReason :
                                      "판매취소사유 없음"
                                    }
                                  </span>
                                </div>

                              )}
                              */}

                            </div>
                            

                            <div className="
                            w-full
                            flex flex-col gap-2 items-start justify-start">

                              {/*
                              {item.status === 'accepted' && item.seller && item.seller.walletAddress === address && (
                                
                                <div className="flex flex-row items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={agreementForCancelTrade[index]}
                                    onChange={(e) => {
                                      setAgreementForCancelTrade(
                                        agreementForCancelTrade.map((item, idx) => idx === index ? e.target.checked : item)
                                      );
                                    }}
                                  />
                                  <button
                                    disabled={cancellings[index] || !agreementForCancelTrade[index]}

                                    className={`flex flex-row gap-1 text-sm text-white px-2 py-1 rounded-md ${cancellings[index] || !agreementForCancelTrade[index] ? 'bg-slate-200' : 'bg-red-600'}`}
                                      
                                    onClick={() => {
                                      cancelTrade(item._id, index);
                                    }}
                                  >
                                    {cancellings[index] && (
                                      <Image
                                        src="/icon-loading.png"
                                        alt="Loading"
                                        width={20}
                                        height={20}
                                        className="animate-spin"
                                      />
                                    )}
                                    
                                    <span className="text-sm">{Cancel_My_Trade}</span>
                                  
                                  </button>
                                </div>

                              )}
                              */}


                              {
                                item.seller && item.seller.walletAddress === address &&
                                item.status === 'accepted' && (


                                <div className="
                                  w-full
                                  flex flex-col gap-2 items-center justify-center">

                                  {item.seller?.bankInfo ? (

                                    <div className="flex flex-row items-center gap-2">

                                      {/*
                                      <input
                                        disabled={escrowing[index] || requestingPayment[index]}
                                        type="checkbox"
                                        checked={requestPaymentCheck[index]}
                                        onChange={(e) => {
                                          setRequestPaymentCheck(
                                            requestPaymentCheck.map((item, idx) => {
                                              if (idx === index) {
                                                return e.target.checked;
                                              }
                                              return item;
                                            })
                                          );
                                        }}
                                      />
                                      */}

                                      <button
                                        disabled={escrowing[index] || requestingPayment[index] }
                                        
                                        className="text-sm text-amber-600 font-semibold
                                          border border-amber-600 rounded-lg p-2
                                          bg-amber-100/10
                                          w-full text-center
                                          hover:bg-amber-100/20
                                          cursor-pointer
                                          transition-all duration-200 ease-in-out
                                          hover:scale-105
                                          hover:shadow-lg
                                          hover:shadow-amber-500/50
                                        "
                                        onClick={() => {

                                          requestPayment(
                                            index,
                                            item._id,
                                            item.tradeId,
                                            item.usdtAmount,
                                            item.storecode,

                                            item.seller?.bankInfo,
                                          );
                                        }}
                                      >

                                        <div className="flex flex-row gap-2 items-center justify-center">
                                          { (escrowing[index] || requestingPayment[index]) && (
                                              <Image
                                                src="/icon-loading.png"
                                                alt="Loading"
                                                width={20}
                                                height={20}
                                                className="w-5 h-5
                                                animate-spin"
                                              />
                                          )}
                                          <span className="text-sm">
                                            {Request_Payment}
                                          </span>
                                        </div>
                                      
                                      </button>

                                    </div>

                                  ) : (
                                    <div className="flex flex-row gap-2 items-center justify-center">
                                      <Image
                                        src="/icon-bank.png"
                                        alt="Bank"
                                        width={20}
                                        height={20}
                                        className="w-5 h-5"
                                      />
                                      <span className="text-sm text-red-600 font-semibold">
                                        결제은행정보 없음
                                      </span>
                                    </div>
                                  )}
                                  

                                  {/* seller bank info */}

                                  {item?.paymentMethod === 'bank' && (

                                    <div className="flex flex-col gap-2 items-center justify-center">
                                      {isContactTransferBank(item.seller?.bankInfo) ? (
                                        <div className="flex flex-col items-center gap-1">
                                          <span className="text-sm font-semibold text-emerald-600">
                                            연락처송금
                                          </span>
                                          {item.seller?.bankInfo?.contactMemo && (
                                            <span className="text-xs text-slate-500 text-center">
                                              {item.seller.bankInfo.contactMemo}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex flex-row gap-2 items-center justify-center">
                                          <span className="text-sm text-zinc-500">
                                            {item.seller?.bankInfo?.accountHolder}
                                          </span>
                                          <span className="text-sm text-zinc-500">
                                            {item.seller?.bankInfo?.bankName}
                                          </span>
                                        </div>
                                      )}
                                      {/*
                                      <span className="text-sm text-zinc-500">
                                        {
                                          item.seller?.bankInfo?.accountNumber &&
                                          item.seller?.bankInfo?.accountNumber.length > 5 &&
                                          item.seller?.bankInfo?.accountNumber.substring(0, 5) + '...'
                                        }
                                      </span>
                                      */}

                                      {/* 결제요청을 하면 회원에게 입금 안내가 전송됩니다. */}
                                      <div className="text-xs text-red-500">
                                        결제요청을 하면 회원에게 입금 안내가 전송됩니다.
                                      </div>

                                    </div>

                                  )}
        
                                </div>
                              )}


                              {/*}
                              {item.seller
                              && item.seller.walletAddress === address
                              && item.status === 'paymentRequested'
                              
                              ///////////////&& item?.autoConfirmPayment

                              && (

                                <div className="
                                  w-full
                                  flex flex-col gap-2 items-center justify-center">
                                  
                                  <div className="flex flex-row gap-2">

                                    <button
                                      disabled={confirmingPayment[index]}
                                      
                                      className="text-sm text-[#409192] font-semibold
                                        border border-green-600 rounded-lg p-2
                                        bg-green-100
                                        w-full text-center
                                        hover:bg-green-200
                                        cursor-pointer
                                        transition-all duration-200 ease-in-out
                                        hover:scale-105
                                        hover:shadow-lg
                                        hover:shadow-green-500/50
                                      "
                                      
                                      onClick={() => {
                                        confirmPayment(
                                          index,
                                          item._id,
                                          //paymentAmounts[index],
                                          //paymentAmountsUsdt[index],

                                          item.krwAmount,
                                          item.usdtAmount,
                                          
                                          item.walletAddress,

                                          item.paymentMethod,
                                        );
                                      }}

                                    >
                                      <div className="flex flex-row gap-2 items-center justify-center">
                                        { confirmingPayment[index] && (
                                            <Image
                                              src="/icon-loading.png"
                                              alt="Loading"
                                              width={20}
                                              height={20}
                                              className="w-5 h-5
                                              animate-spin"
                                            />
                                        )}
                                        <span className="text-sm">
                                          수동입금확인
                                        </span>
                                      </div>

                                    </button>


                                  </div>


                                  {!isWithoutEscrow && (
                                    <div className="flex flex-row gap-2">

                                      <input
                                        disabled={rollbackingPayment[index]}
                                        type="checkbox"
                                        checked={rollbackPaymentCheck[index]}
                                        onChange={(e) => {
                                          setRollbackPaymentCheck(
                                            rollbackPaymentCheck.map((item, idx) => {
                                              if (idx === index) {
                                                return e.target.checked;
                                              }
                                              return item;
                                            })
                                          );
                                        }}
                                      />

                                      <button
                                        disabled={rollbackingPayment[index] || !rollbackPaymentCheck[index]}
                                        className={`flex flex-row gap-1 text-sm text-white px-2 py-1 rounded-md ${rollbackingPayment[index] || !rollbackPaymentCheck[index] ? 'bg-gray-500' : 'bg-red-500'}`}
                                        onClick={() => {
                                          rollbackPayment(
                                            index,
                                            item._id,
                                            paymentAmounts[index],
                                            paymentAmountsUsdt[index]
                                          );
                                        }}

                                      >
                                        <div className="flex flex-row gap-2 items-center justify-center">
                                          <Image
                                            src="/icon-loading.png"
                                            alt="loading"
                                            width={16}
                                            height={16}
                                            className={rollbackingPayment[index] ? 'animate-spin' : 'hidden'}
                                          />
                                          <span className="text-sm">
                                            에스크로 취소
                                          </span>
                                        </div>

                                      </button>

                                    </div>
                                  )}


                                  <div className="w-full flex flex-row gap-2 items-center justify-center">
                                    <input
                                      disabled={true}
                                      type="number"
                                      value={paymentAmounts[index]}
                                      onChange={(e) => {
                                        setPaymentAmounts(
                                          paymentAmounts.map((item, idx) => idx === index ? Number(e.target.value) : item)
                                        );
                                      }}
                                      className="w-20 h-8 rounded-md text-right text-lg text-zinc-500 font-semibold bg-zinc-100 border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />{' '}원
                                  </div>


                                </div>


                              )}

                              */}



                              {/* paymentConfirmed */}
                              {/* paymentAmount */}
                              {item.status === 'paymentConfirmed' && (

                                <div className="
                                  w-full
                                  flex flex-col gap-2 items-center justify-center">





                                  {/* 자동입금처리일경우 */}
                                  {/* 수동으로 결제완료처리 버튼 */}
                                
                                  { !item?.settlement &&

                                  ///item?.autoConfirmPayment &&

                                  (item?.transactionHash === '0x' || item?.transactionHash === undefined) &&
                                  
                                  (


                                    <div className="w-full flex flex-row items-center justify-center gap-2">

                                      {/*
                                      <input
                                        disabled={confirmingPayment[index]}
                                        type="checkbox"
                                        checked={confirmPaymentCheck[index]}
                                        onChange={(e) => {
                                          setConfirmPaymentCheck(
                                            confirmPaymentCheck.map((item, idx) => {
                                              if (idx === index) {
                                                return e.target.checked;
                                              }
                                              return item;
                                            })
                                          );
                                        }}
                                        className="w-5 h-5 rounded-md border border-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                      />
                                      */}

                                      <button
                                        //disabled={confirmingPayment[index] || !confirmPaymentCheck[index]}
                                        disabled={confirmingPayment[index]}

                                        /*
                                        className={`
                                          w-full
                                        flex flex-row gap-1 text-sm text-white px-2 py-1 rounded-md
                                        border border-green-600
                                        hover:border-green-700
                                        hover:shadow-lg
                                        hover:shadow-green-500/50
                                        transition-all duration-200 ease-in-out

                                        ${confirmingPayment[index] ? 'bg-red-500' : 'bg-green-500'}
                                        ${!confirmPaymentCheck[index] ? 'bg-gray-500' : 'bg-green-500'}
                                        
                                        `}
                                        */

                                        className={`
                                          w-full
                                          flex flex-row gap-1 text-sm text-white px-2 py-1 rounded-md
                                          border border-green-600
                                          hover:border-green-700
                                          hover:shadow-lg
                                          hover:shadow-green-500/50
                                          transition-all duration-200 ease-in-out

                                          ${confirmingPayment[index] ? 'bg-red-500' : 'bg-green-500'}
                                        `}

                                        onClick={() => {
                                          //confirmPayment(
                                          sendPayment(

                                            index,
                                            item._id,
                                            
                                            //paymentAmounts[index],
                                            item.krwAmount,

                                            //paymentAmountsUsdt[index],
                                            item.usdtAmount,


                                            item.walletAddress,
                                          );
                                        }}


                                      >

                                        <div className="flex flex-row gap-2 items-center justify-center">
                                          <Image
                                            src="/icon-transfer.png"
                                            alt="Transfer"
                                            width={20}
                                            height={20}
                                            className={`
                                            ${confirmingPayment[index] ? 'animate-spin' : 'animate-pulse'}
                                              w-5 h-5
                                            `}
                                          />
                                          <span className="text-sm">
                                            구매자에게 USDT 전송
                                          </span>
                                        </div>

                                      </button>

                                    </div>




                                  )}

                                </div>
                              )}


                            </div>


                          </div>

                        )}


                        {item.status === 'cancelled' && (

                          <div className="w-full flex flex-col gap-2 items-center justify-center">
                            <span className="text-sm text-red-600">
                              {item.cancelTradeReason ? item.cancelTradeReason :
                                "판매취소사유 없음"
                              }
                            </span>
                          </div>

                        )}



                        {item?.transactionHash
                        && item?.transactionHash !== '0x'
                        && (
                          <button
                            className="
                              flex flex-row gap-2 items-center justify-between
                              text-sm text-blue-600 font-semibold
                              border border-blue-600 rounded-lg p-2
                              bg-blue-100
                              text-center
                              hover:bg-blue-200
                              cursor-pointer
                              transition-all duration-200 ease-in-out
                              hover:scale-105
                              hover:shadow-lg
                              hover:shadow-blue-500/50
                            "
                            onClick={() => {
                              let url = '';
                              if (chain === "ethereum") {
                                url = `https://etherscan.io/tx/${item.transactionHash}`;
                              } else if (chain === "polygon") {
                                url = `https://polygonscan.com/tx/${item.transactionHash}`;
                              } else if (chain === "arbitrum") {
                                url = `https://arbiscan.io/tx/${item.transactionHash}`;
                              } else if (chain === "bsc") {
                                url = `https://bscscan.com/tx/${item.transactionHash}`;
                              } else {
                                url = `https://arbiscan.io/tx/${item.transactionHash}`;
                              }
                              window.open(url, '_blank');

                            }}
                          >
                              <div className="flex flex-col gap-2 items-start justify-start ml-2">
                                <div className="flex flex-col gap-1 items-start justify-start">
                                  <span className="text-sm">
                                    판매한 테더(USDT) 수량
                                  </span>
                                  <div className="flex flex-row gap-1 items-center justify-start">
                                    <Image
                                      src={`/token-usdt-icon.png`}
                                      alt="USDT Logo"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5"
                                    />
                                    <span className="text-lg text-[#409192] font-semibold"
                                      style={{
                                        fontFamily: 'monospace',
                                      }}>
                                      {item?.usdtAmount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    </span>
                                  </div>
                                  <span className="text-sm text-zinc-500">
                                    테더(USDT) 전송내역
                                  </span>
                                </div>
                              </div>
                              {/* chain logo */}
                              <Image
                                src={`/logo-chain-${chain}.png`}
                                alt={`${chain} Logo`}
                                width={20}
                                height={20}
                                className="w-5 h-5"
                              />
                          </button>
                        )}


                        {item?.settlement &&
                        (!item?.transactionHash || item?.transactionHash === '0x') && (
                          <div
                            className="
                              flex flex-row gap-2 items-center justify-between
                              text-sm text-blue-600 font-semibold
                              border border-blue-600 rounded-lg p-2
                              bg-blue-100
                              text-center
                              hover:bg-blue-200
                              cursor-pointer
                              transition-all duration-200 ease-in-out
                              hover:scale-105
                              hover:shadow-lg
                              hover:shadow-blue-500/50
                            "
                          >
                              <div className="flex flex-col gap-2 items-start justify-start ml-2">
                                <div className="flex flex-col gap-1 items-start justify-start">
                                  <span className="text-sm">
                                    판매한 테더(USDT) 수량
                                  </span>
                                  <div className="flex flex-row gap-1 items-center justify-start">
                                    <Image
                                      src={`/token-usdt-icon.png`}
                                      alt="USDT Logo"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5"
                                    />
                                    <span className="text-lg text-[#409192] font-semibold"
                                      style={{
                                        fontFamily: 'monospace',
                                      }}>
                                      {item?.usdtAmount.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    </span>
                                  </div>
                                  <span className="text-sm text-zinc-500">
                                    TXID 저장누락
                                  </span>
                                </div>
                              </div>
                              {/* chain logo */}
                              <Image
                                src={`/logo-chain-${chain}.png`}
                                alt={`${chain} Logo`}
                                width={20}
                                height={20}
                                className="w-5 h-5"
                              />
                          </div>
                        )}



                        {item?.escrowTransactionHash
                        && item?.escrowTransactionHash !== '0x'
                        && (
                          <button
                            className={`
                              ${item.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-purple-100 text-purple-600'}
                              flex flex-row gap-2 items-center justify-between
                              text-sm font-semibold
                              border border-purple-600 rounded-lg p-2
                              w-full text-center
                              hover:bg-purple-200
                              cursor-pointer
                              transition-all duration-200 ease-in-out
                              hover:scale-105
                              hover:shadow-lg
                              hover:shadow-purple-500/50
                            `}

                            
                            onClick={() => {
                              let url = '';
                              if (chain === "ethereum") {
                                url = `https://etherscan.io/tx/${item.escrowTransactionHash}`;
                              } else if (chain === "polygon") {
                                url = `https://polygonscan.com/tx/${item.escrowTransactionHash}`;
                              } else if (chain === "arbitrum") {
                                url = `https://arbiscan.io/tx/${item.escrowTransactionHash}`;
                              } else if (chain === "bsc") {
                                url = `https://bscscan.com/tx/${item.escrowTransactionHash}`;
                              } else {
                                url = `https://arbiscan.io/tx/${item.escrowTransactionHash}`;
                              }
                              window.open(url, '_blank');

                            }}
                          >
                            <div className="flex flex-row gap-2 items-center justify-start ml-2">
                              <Image
                                src={`/token-mkrw-icon.png`}
                                alt="MKRW Logo"
                                width={20}
                                height={20}
                                className="w-5 h-5"
                              />
                              <span className="text-sm">
                                {item?.status === 'cancelled' ?
                                  '에스크로(MKRW) 회수내역'
                                  :
                                  '에스크로(MKRW) 전송내역'
                                }
                              </span>
                            </div>
                            <Image
                              src={`/logo-chain-${chain}.png`}
                              alt={`${chain} Logo`}
                              width={20}
                              height={20}
                              className="w-5 h-5"
                            />
                          </button>
                        )}

                        </div>

                      </td>


                      <td className="p-2 hidden
                      ">
                        <div className="w-full
                          flex flex-col gap-2 items-center justify-center
                          border border-dashed border-zinc-300 rounded-lg p-2">

                          {item.status === "paymentConfirmed" &&
                            (!item?.transactionHash || item?.transactionHash === '0x') &&
                            !item?.settlement && (
                            
                            <div className="flex flex-col gap-2">
                              {/* 자동결제 지갑주소 */}

                              <div className="w-full flex flex-row gap-2 items-center justify-start">
                                <Image
                                  src={item?.store?.storeLogo || '/icon-store.png'}
                                  alt="Store Logo"
                                  width={30}
                                  height={30}
                                  className="w-6 h-6 rounded-lg object-cover"
                                />
                                <span className="text-sm font-semibold text-zinc-500">
                                  {item?.store?.storeName}{' '}가맹점 자동결제 지갑주소
                                </span>
                              </div>


                              <div className="flex flex-row gap-1 items-center">
                                <Image
                                  src="/icon-shield.png"
                                  alt="Wallet Icon"
                                  width={16}
                                  height={16}
                                  className="w-4 h-4 rounded-lg object-cover"
                                />
                                <span className="text-sm font-semibold text-zinc-500">
                                  {item.store?.settlementWalletAddress ?
                                    item.store.settlementWalletAddress.slice(0, 5) + '...' + item.store.settlementWalletAddress.slice(-4)
                                    : '없음'}
                                </span>
                              </div>

                              {/* info P2P 판매완료후 자동으로 결제와 정산을 진행합니다. */}
                              <div className="flex flex-row gap-1 items-center">
                                <Image
                                  src="/icon-info.png"
                                  alt="Info Icon"
                                  width={16}
                                  height={16}
                                  className="w-4 h-4 rounded-lg object-cover"
                                />
                                <span className="text-sm font-semibold text-zinc-500">
                                  P2P 판매완료후 자동으로 결제와 정산을 진행합니다.
                                </span>
                              </div>

                            </div>
                          )}


                          {item?.settlement && (

                            <div className="w-full flex flex-row gap-2 items-center justify-start">
                              <Image
                                src="/icon-payment.png"
                                alt="Payment Icon"
                                width={30}
                                height={30}
                                className="w-6 h-6 rounded-lg object-cover"
                              />
                              <Image
                                src={item?.store?.storeLogo || '/icon-store.png'}
                                alt="Store Logo"
                                width={30}
                                height={30}
                                className="w-6 h-6 rounded-lg object-cover"
                              />
                              <span className="text-sm font-semibold text-zinc-500">
                                {item?.store?.storeName}{' '}가맹점 결제 및 정산완료
                              </span>
                            </div>

                          )}


                          <div className="flex flex-row gap-2 items-between justify-center">

                            {item?.settlement && (
                              <div className="flex flex-col gap-2 items-end justify-center">

                                <div className="w-full flex flex-row gap-2 items-center justify-center">
                                  <span className="
                                  w-14 
                                  text-xs text-zinc-500">
                                    가맹점 결제
                                  </span>
                                  <span className="
                                  w-12 text-end
                                  text-sm text-zinc-500"
                                    style={{
                                      fontFamily: 'monospace',
                                    }}>
                                    {Number(
                                      100 - (item.store?.agentFeePercent ? item.store?.agentFeePercent : 0.0)
                                      - (item.store.settlementFeePercent ? item.store.settlementFeePercent : 0.0)
                                      - (item?.platformFee?.percentage ? item?.platformFee?.percentage : 0.0)
                                    ).toFixed(2)
                                    }%
                                  </span>
                                </div>

                                {/*
                                <div className="w-full flex flex-row gap-2 items-center justify-center">
                                  <span className="
                                  w-14
                                  text-xs text-zinc-500">
                                    PG 수수료
                                  </span>
                                  <span className="
                                  w-12 text-end
                                  text-sm text-zinc-500"
                                    style={{
                                      fontFamily: 'monospace',
                                    }}>
                                    {Number(item?.platformFee?.percentage ? item?.platformFee?.percentage : 0.0).toFixed(2)}%
                                  </span>
                                </div>

                                <div className="w-full flex flex-row gap-2 items-center justify-center">
                                  <span className="
                                  w-14
                                  text-xs text-zinc-500">
                                    센터 수수료
                                  </span>
                                  <span className="
                                  w-12  text-end
                                  text-sm text-zinc-500"
                                    style={{
                                      fontFamily: 'monospace',
                                    }}>
                                    {Number(item.store.settlementFeePercent ? item.store.settlementFeePercent : 0.3).toFixed(2)}%
                                  </span>
                                </div>

                                <div className="w-full flex flex-row gap-2 items-center justify-center">
                                  <span className="
                                  w-14
                                  text-xs text-zinc-500">
                                    AG 수수료
                                  </span>
                                  <span className="
                                  w-12 text-end
                                  text-sm text-zinc-500"
                                    style={{
                                      fontFamily: 'monospace',
                                    }}>
                                    {Number(item.store?.agentFeePercent ? item.store?.agentFeePercent : 0.0).toFixed(2)}%
                                  </span>
                                </div>
                                */}

                              </div>
                            )}


                            {/*
                            {item?.settlement ? (


                              <button
                                className="
                                w-48
                                flex flex-col gap-2 items-center justify-center
                                bg-purple-500 text-white px-2 py-1 rounded-md hover:bg-purple-600
                                text-sm
                                transition duration-300 ease-in-out
                                transform hover:scale-105
                                hover:shadow-lg
                                hover:shadow-purple-500/50
                                hover:cursor-pointer
                                hover:transition-transform
                                hover:duration-300
                                hover:ease-in-out

                                "

                                onClick={() => {
                                  let url = '';
                                  if (chain === "ethereum") {
                                    url = `https://etherscan.io/tx/${item.settlement.txid}`;
                                  } else if (chain === "polygon") {
                                    url = `https://polygonscan.com/tx/${item.settlement.txid}`;
                                  } else if (chain === "arbitrum") {
                                    url = `https://arbiscan.io/tx/${item.settlement.txid}`;
                                  } else if (chain === "bsc") {
                                    url = `https://bscscan.com/tx/${item.settlement.txid}`;
                                  } else {
                                    url = `https://arbiscan.io/tx/${item.settlement.txid}`;
                                  }
                                  window.open(url, '_blank');
                                }}
                              >


                                <div className="flex flex-col gap-2 items-end justify-center"
                                  style={{
                                    fontFamily: 'monospace',
                                  }}
                                >
            
                                  <span>
                                    {item?.settlement?.settlementAmount?.toLocaleString()}
                                    {' '}
                                    {
                                      item?.settlement?.settlementWalletAddress &&
                                    item?.settlement?.settlementWalletAddress?.slice(0, 5) + '...'}
                                  </span>
                                  <span>
                                    {
                                      item?.settlement?.agentFeeAmount ?
                                      item?.settlement?.agentFeeAmount?.toLocaleString()
                                      : '0'
                                    }
                                    {' '}
                                    {
                                      item?.settlement?.agentFeeWalletAddress &&
                                    item?.settlement?.agentFeeWalletAddress?.slice(0, 5) + '...'}
                                  </span>
                                  <span>
                                    {item?.settlement?.feeAmount?.toLocaleString()}
                                    {' '}
                                    {
                                      item?.settlement?.feeWalletAddress &&
                                    item?.settlement?.feeWalletAddress?.slice(0, 5) + '...'}
                                  </span>

                                </div>

                              </button>

                            ) : (
                              <>
                                {item.status === 'paymentConfirmed'
                                && item?.transactionHash !== '0x'
                                && (
                                  <div className="flex flex-row gap-2 items-center justify-center">

                                    {item.storecode === 'admin' ? (

                                      <div className="flex flex-row gap-2 items-center justify-center">
                                        일반 회원 구매
                                      </div>

                                    ) : (
                                    
                                      <div className="flex flex-col gap-2 items-center justify-center">

                                        <div className="flex flex-row gap-2 items-center justify-center">
                                          <Image
                                            src="/icon-settlement.png"
                                            alt="Settlement"
                                            width={20}
                                            height={20}
                                            className="animate-spin"
                                          />
                                          <span className="text-sm font-semibold text-zinc-500">
                                            가맹점 결제 및 정산중
                                          </span>
                                        </div>

                                        <div className="flex flex-row gap-2 items-center justify-center">
                                          <Image
                                            src={item.store?.storeLogo || '/icon-store.png'}
                                            alt="Store Logo"
                                            width={20}
                                            height={20}
                                            className="rounded-lg w-6 h-6"
                                          />
                                          <span className="text-sm font-semibold text-zinc-500">
                                            {item.store?.storeName}
                                          </span>
                                        </div>

                                        <div className="flex flex-row gap-1 items-center justify-center">
                                          <Image
                                            src="/token-usdt-icon.png"
                                            alt="USDT"
                                            width={20}
                                            height={20}
                                            className="rounded-lg w-6 h-6"
                                          />
                                          <span className="text-lg font-semibold text-[#409192]"
                                            style={{
                                              fontFamily: 'monospace',
                                            }}
                                          >
                                            {
                                            Number(item.usdtAmount).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                            }
                                          </span>
                                        </div>

                                        {item.transactionHash &&
                                          new Date().getTime() - new Date(item.paymentConfirmedAt).getTime() > 1000 * 5 * 60 && (

                                          <div className="flex flex-row gap-2 items-center justify-center">
                                            <input
                                              disabled={loadingSettlement[index]}
                                              type="checkbox"
                                              checked={settlementCheck[index]}
                                              onChange={(e) => {
                                                setSettlementCheck(
                                                  settlementCheck.map((item, idx) => {
                                                    if (idx === index) {
                                                      return e.target.checked;
                                                    }
                                                    return item;
                                                  })
                                                );
                                              }}
                                              className="w-5 h-5
                                              rounded-md"

                                            />

                                            <button
                                              disabled={
                                                !settlementCheck[index]
                                                || loadingSettlement[index]
                                              }
                                              className={`
                                                ${settlementCheck[index] ? 'bg-blue-500' : 'bg-gray-500'}
                                                w-full
                                                flex flex-row gap-1 text-sm text-white px-2 py-1 rounded-md
                                                hover:bg-blue-600
                                                hover:shadow-lg
                                                hover:shadow-blue-500/50
                                                transition-all duration-200 ease-in-out
                                                ${!settlementCheck[index] || loadingSettlement[index]
                                                ? 'cursor-not-allowed' : 'cursor-pointer'}
                                              `}

                                              onClick={() => {
                                              
                                                settlementRequest(
                                                  index,
                                                  item._id,
                                                );
                                                

                                              }}
                                            >
                                              <div className="flex flex-row gap-2 items-center justify-center">
                                                {loadingSettlement[index] ? (
                                                  <span className="text-sm">
                                                    정산중...
                                                  </span>
                                                ) : (
                                                  <span className="text-sm">
                                                    수동으로 정산하기
                                                  </span>
                                                )}
                                              </div>

                                            </button>
                                          </div>
                                        )}



                                      </div>

                                    )}


                                  </div>
                                )}
                              </>
                            )}
                            */}


                            {item?.settlement && item?.settlement?.settlementAmount ? (

                              <div className="flex flex-row gap-2 items-center justify-center">

                                <button
                                  /*
                                  className="
                                  w-44        
                                  flex flex-col gap-2 items-center justify-center
                                  bg-purple-500 text-white px-2 py-1 rounded-md hover:bg-purple-600
                                  text-sm
                                  transition duration-300 ease-in-out
                                  transform hover:scale-105
                                  hover:shadow-lg
                                  hover:shadow-purple-500/50
                                  hover:cursor-pointer
                                  hover:transition-transform
                                  hover:duration-300
                                  hover:ease-in-out

                                  "
                                  */
                                  disabled={item.settlement.txid === "0x" || !item.settlement.txid}

                                  className={`
                                    ${item.settlement.txid === "0x" || !item.settlement.txid ? "bg-slate-200 cursor-not-allowed" : "bg-slate-100 hover:bg-slate-200 cursor-pointer hover:shadow-lg hover:shadow-slate-500/50 border border-slate-300"}
                                    text-sm
                                    text-white px-2 py-1 rounded-md
                                    transition duration-300 ease-in-out
                                    transform hover:scale-105
                                    hover:shadow-lg
                                    hover:shadow-blue-500/50
                                    hover:cursor-pointer
                                    hover:transition-transform
                                    hover:duration-300
                                    hover:ease-in-out
                                  `}

                                  onClick={() => {
                                    if (item.settlement.txid === "0x" || !item.settlement.txid) {
                                      alert("트랙젝션 해시가 없습니다.");
                                      return;
                                    } else {
                                      window.open(
                                        
                                        chain === 'ethereum' ? `https://etherscan.io/tx/${item.settlement.txid}`
                                        : chain === 'polygon' ? `https://polygonscan.com/tx/${item.settlement.txid}`
                                        : chain === 'arbitrum' ? `https://arbiscan.io/tx/${item.settlement.txid}`
                                        : chain === 'bsc' ? `https://bscscan.com/tx/${item.settlement.txid}`
                                        : `https://arbiscan.io/tx/${item.settlement.txid}`,

                                        '_blank'
                                      );
                                    }
                                  }}
                                >


                                  <div className="flex flex-col gap-2 items-end justify-center"
                                    style={{
                                      fontFamily: 'monospace',
                                    }}
                                  >
              
                                    <span>
                                      {item?.settlement?.settlementAmount?.toLocaleString()}
                                      {' '}
                                      {
                                        item?.settlement?.settlementWalletAddress &&
                                      item?.settlement?.settlementWalletAddress?.slice(0, 5) + '...'}
                                    </span>

                                    {/*
                                    <span>
                                      {
                                        item?.settlement?.platformFeeAmount ?
                                        item?.settlement?.platformFeeAmount?.toLocaleString()
                                        : '0'
                                      }
                                      {' '}
                                      {
                                        item?.settlement?.platformFeeWalletAddress &&
                                      item?.settlement?.platformFeeWalletAddress?.slice(0, 5) + '...'}
                                    </span>

                                    <span>
                                      {item?.settlement?.feeAmount?.toLocaleString()}
                                      {' '}
                                      {
                                        item?.settlement?.feeWalletAddress &&
                                      item?.settlement?.feeWalletAddress?.slice(0, 5) + '...'}
                                    </span>

                                    <span>
                                      {
                                        item?.settlement?.agentFeeAmount ?
                                        item?.settlement?.agentFeeAmount?.toLocaleString()
                                        : '0'
                                      }
                                      {' '}
                                      {
                                        item?.settlement?.agentFeeWalletAddress &&
                                      item?.settlement?.agentFeeWalletAddress?.slice(0, 5) + '...'}
                                    </span>
                                    */}



                                  </div>

                                </button>



                              
                                <div className="  
                                w-24 
                                flex flex-col gap-2 items-end justify-center"
                                >
                                  <div className="flex flex-col gap-1 items-center justify-center">
                                    <Image
                                      src={item.avatar || "/icon-user.png"}
                                      alt="User Icon"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5"
                                    />
                                    <span className="text-lg font-semibold text-blue-600">
                                      {item.nickname.slice(0, 6)}...
                                    </span>
                                  </div>
                                  <span className="text-sm text-zinc-500">
                                    충전금액(원)
                                  </span>
                                  <span className="text-sm text-blue-600 font-semibold"
                                    style={{
                                      fontFamily: 'monospace',
                                    }}
                                  >
                                    {Number(item.krwAmount).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                  </span>
                                </div>



                              </div>

                            ) : (
                              <>
                                {item.status === 'paymentConfirmed'
                                && item?.transactionHash !== '0x'
                                && item?.transactionHashFail !== true
                                && (
                                  <div className="flex flex-row gap-2 items-center justify-center">

                                    {item.storecode === 'admin' ? (

                                      <div className="flex flex-row gap-2 items-center justify-center">
                                        일반 회원 구매
                                      </div>

                                    ) : (
                                    
                                      <div className="flex flex-col gap-2 items-center justify-center">

                                        <div className="flex flex-row gap-2 items-center justify-center">
                                          <Image
                                            src="/icon-payment.gif"
                                            alt="Payment Processing"
                                            width={30}
                                            height={30}
                                          />
                                          <span className="text-sm font-semibold text-zinc-500">
                                            가맹점 결제 및 정산중
                                          </span>
                                        </div>

                                        <div className="flex flex-row gap-2 items-center justify-center">
                                          <Image
                                            src={item.store?.storeLogo || '/icon-store.png'}
                                            alt="Store Logo"
                                            width={20}
                                            height={20}
                                            className="rounded-lg w-6 h-6 object-cover"
                                          />
                                          <span className="text-sm font-semibold text-zinc-500">
                                            {item.store?.storeName}
                                          </span>
                                        </div>

                                        <div className="flex flex-row gap-1 items-center justify-center">
                                          <Image
                                            src="/token-usdt-icon.png"
                                            alt="USDT"
                                            width={20}
                                            height={20}
                                            className="rounded-lg w-6 h-6 object-cover"
                                          />
                                          <span className="text-lg font-semibold text-[#409192]"
                                            style={{
                                              fontFamily: 'monospace',
                                            }}
                                          >
                                            {Number(item.usdtAmount).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                          </span>
                                        </div>

                                        {/*
                                          if item.paymentConfirmedAt (2025-07-03T09:26:37.818Z)
                                            is last 1 hour, show button to settlement
                                        */}

                                        {/*
                                        {item.transactionHash &&
                                          new Date().getTime() - new Date(item.paymentConfirmedAt).getTime() > 1000 * 5 * 60 && (

                                          <div className="flex flex-row gap-2 items-center justify-center">
                                            <input
                                              disabled={loadingSettlement[index]}
                                              type="checkbox"
                                              checked={settlementCheck[index]}
                                              onChange={(e) => {
                                                setSettlementCheck(
                                                  settlementCheck.map((item, idx) => {
                                                    if (idx === index) {
                                                      return e.target.checked;
                                                    }
                                                    return item;
                                                  })
                                                );
                                              }}
                                              className="w-5 h-5
                                              rounded-md"

                                            />

                                            <button
                                              disabled={
                                                !settlementCheck[index]
                                                || loadingSettlement[index]
                                              }
                                              className={`
                                                ${settlementCheck[index] ? 'bg-blue-500' : 'bg-gray-500'}
                                                w-full
                                                flex flex-row gap-1 text-sm text-white px-2 py-1 rounded-md
                                                hover:bg-blue-600
                                                hover:shadow-lg
                                                hover:shadow-blue-500/50
                                                transition-all duration-200 ease-in-out
                                                ${!settlementCheck[index] || loadingSettlement[index]
                                                ? 'cursor-not-allowed' : 'cursor-pointer'}
                                              `}

                                              onClick={() => {
                                              
                                                settlementRequest(
                                                  index,
                                                  item._id,
                                                );
                                                

                                              }}
                                            >
                                              <div className="flex flex-row gap-2 items-center justify-center">
                                                {loadingSettlement[index] ? (
                                                  <span className="text-sm">
                                                    정산중...
                                                  </span>
                                                ) : (
                                                  <span className="text-sm">
                                                    수동으로 정산하기
                                                  </span>
                                                )}
                                              </div>

                                            </button>
                                          </div>
                                        )}
                                        */}


                                      </div>

                                    )}


                                  </div>
                                )}
                              </>
                            )}






                          </div>

                        </div>

                      </td>




                      {/* 상세보기 */}
                      {/*
                      <td className="p-2">
                        <div className="
                          w-20
                        flex flex-col gap-2 items-center justify-center">
                          <button
                            className="text-sm bg-zinc-500 text-white px-2 py-1 rounded-md hover:bg-zinc-600"

                            onClick={() => {
                              setSelectedItem(item);
                              openModal();
                              
                            }}

                          >
                            거래보기
                          </button>
      

                          {item?.settlement && item?.settlement?.txid && (
                          <button
                            className="text-sm bg-zinc-500 text-white px-2 py-1 rounded-md hover:bg-zinc-600"
                            onClick={() => {
                              window.open(
                                `https://arbiscan.io/tx/${item.settlement.txid}`,
                                '_blank'
                              );
                            }}
                          >
                            정산보기
                          </button>
                          )}
                        </div>
                      </td>
                      */}


                    </tr>

                  ))}

                </tbody>

              </table>

            </div>


          ) : (

            <div className="w-full grid gap-4 lg:grid-cols-2 xl:grid-cols-3 justify-center ">

                {buyOrders.map((item, index) => (
    
                  <div
                    key={index}
                    className="relative flex flex-col items-center justify-center"
                  >


                    {item.status === 'ordered' && (new Date().getTime() - new Date(item.createdAt).getTime() > 1000 * 60 * 60 * 24) && (
                      <div className="absolute inset-0 flex justify-center items-center z-10
                        bg-black bg-opacity-50
                      ">
                        <Image
                          src="/icon-expired.png"
                          alt="Expired"
                          width={100}
                          height={100}
                          className="opacity-20"
                        />
                      </div>
                    )}

                    {item.status === 'cancelled' && (
                      <div className="absolute inset-0 flex justify-center items-center z-10
                        bg-black bg-opacity-50
                      ">
                        <Image
                          src="/icon-cancelled.png"
                          alt="Cancelled"
                          width={100}
                          height={100}
                          className="opacity-20"
                        />
                      </div>
                    )}


                    <article
                        //key={index}
                        className={` w-96 xl:w-full h-full relative
                          ${item.walletAddress === address ? 'border-green-500' : 'border-gray-200'}

                          ${item.status === 'accepted' || item.status === 'paymentRequested' ? 'border-red-600' : 'border-gray-200'}

                          p-4 rounded-md border bg-black bg-opacity-50
                      `}
                    >

                      {item.status === 'ordered' && (


                        <div className="w-full flex flex-col gpa-2 items-start justify-start">


                            <div className="w-full flex flex-row items-center justify-between gap-2">

                              <div className="flex flex-row items-center gap-2">

                                {/* if createdAt is recent 1 hours, show new badge */}
                                {new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 * 60 && (
                                  <Image
                                    src="/icon-new.png"
                                    alt="New"
                                    width={28}
                                    height={28}
                                  />
                                )}

                                <Image
                                  src="/icon-public-sale.png"
                                  alt="Public Sale"
                                  width={28}
                                  height={28}
                                />

                              

                                {params.lang === 'ko' ? (

                                  <p className="text-sm text-zinc-500">

                                  
                                    {

                                      new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 ? (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000) + ' ' + seconds_ago
                                      ) :
                                      new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                      ) : (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                      )
                                    }{' '}{Buy_Order_Opened} 

                                  </p>
                                  
                                  ) : (

                                    <p className="text-sm text-zinc-500">


                                  
                                    {Buy_Order_Opened}{' '}{

                                      new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 ? (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000) + ' ' + seconds_ago
                                      ) :
                                      new Date().getTime() - new Date(item.createdAt).getTime() < 1000 * 60 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                      ) : (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                      )
                                    }



                                  </p>


                                )}

                              </div>



                              {/* share button */}
                              {/*
                              <button
                                className="text-sm bg-blue-500 text-white px-2 py-1 rounded-md hover:bg-blue-600"
                                onClick={() => {

                                  window.open(`https://gold.goodtether.com/${params.lang}/sell-usdt/${item._id}`, '_blank');

                                }}
                              >
                                <Image
                                  src="/icon-share.png"
                                  alt="Share"
                                  width={20}
                                  height={20}
                                />
                              </button>
                              */}


                            </div>


                            {24 - Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60 / 60) > 0 ? (

                              <div className="mt-2 flex flex-row items-center space-x-2">
                                <Image
                                  src="/icon-timer.webp"
                                  alt="Timer"
                                  width={28}
                                  height={28}
                                />
                                <p className="text-sm text-zinc-500">{Expires_in} {

                                  24 - Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60 / 60) - 1

                                  } {hours} {
                                    60 - Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000 / 60) % 60
                                  } {minutes}

                                </p>
                              </div>

                            ) : (
                              <div className="mt-2 flex flex-row items-center space-x-2">
                                {/*
                                <Image
                                  src="/icon-timer.webp"
                                  alt="Expired"
                                  width={28}
                                  height={28}
                                />
                                <p className="text-sm text-zinc-500">Expired</p>
                                */}
                              </div>
                            )}

                        </div>

                      )}





                      { (item.status === 'accepted' || item.status === 'paymentRequested' || item.status === 'cancelled') && (
                          
                        <div className={`
                          ${item.status !== 'cancelled' && 'h-16'}

                          mb-4 flex flex-row items-center bg-zinc-800 px-2 py-1 rounded-md`}>
                            <Image
                              src="/icon-trade.png"
                              alt="Trade"
                              width={32}
                              height={32}
                            />


                            <p className="text-sm font-semibold text-[#409192] ">
                              {item.tradeId}
                            </p>

                            {item.status === 'cancelled' ? (
                              <p className="ml-2 text-sm text-zinc-500">
                                {new Date(item.acceptedAt)?.toLocaleString()}
                              </p>
                            ) : (
                              
                              <>
                                {params.lang === 'ko' ? (

                                  <p className="ml-2 text-sm text-zinc-500">

                                  
                                    {new Date().getTime() - new Date(item.acceptedAt).getTime() < 1000 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000) + ' ' + seconds_ago
                                    ) :
                                    new Date().getTime() - new Date(item.acceptedAt).getTime() < 1000 * 60 * 60 ? (
                                    ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                    ) : (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                    )
                                    }{' '}{Trade_Started}

                                  </p>



                                ) : (

                                  <p className="ml-2 text-sm text-zinc-500">

                                    {Trade_Started} {
                                      new Date().getTime() - new Date(item.acceptedAt).getTime() < 1000 * 60 ? (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000) + ' ' + seconds_ago
                                      ) :
                                      new Date().getTime() - new Date(item.acceptedAt).getTime() < 1000 * 60 * 60 ? (
                                      ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60) + ' ' + minutes_ago
                                      ) : (
                                        ' ' + Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60 / 60) + ' ' + hours_ago
                                      )
                                    }

                                  </p>

                                )}




                              </>
                            
                            )}



                              {/* share button */}
                              <button
                                className="ml-5 text-sm bg-blue-500 text-white px-2 py-1 rounded-md hover:bg-blue-600"
                                onClick={() => {

                                  //window.open(`https://gold.goodtether.com/${params.lang}/${"admin"}/sell-usdt/${item._id}`, '_blank');

                                  // copy to clipboard

                                  navigator.clipboard.writeText(`https://gold.goodtether.com/${params.lang}/${"admin"}/sell-usdt/${item._id}`);

                                  toast.success('Link copied to clipboard');

                                }}
                              >
                                <Image
                                  src="/icon-share.png"
                                  alt="Share"
                                  width={20}
                                  height={20}
                                />
                              </button>



                          </div>
                      )}


                        {/*
                        
                        {item.acceptedAt && (
                          <p className="mb-2 text-sm text-zinc-500">
                            Trade started at {new Date(item.acceptedAt).toLocaleDateString() + ' ' + new Date(item.acceptedAt).toLocaleTimeString()}
                          </p>
                        )}
                        */}




                      {item.status === 'cancelled' && (
                          <div className="mt-4 flex flex-row items-center gap-2">
                            <Image
                              src='/icon-cancelled.webp'
                              alt='cancel'
                              width={20}
                              height={20}
                            />
                            <p className="text-sm text-red-500">
                              {Cancelled_at} {
                                new Date(item.cancelledAt).toLocaleDateString() + ' ' + new Date(item.cancelledAt).toLocaleTimeString()
                              }
                            </p>
                          </div>
                        )}




              

                        <div className="mt-4 flex flex-col items-start">



                          <p className="text-xl text-zinc-500"
                            style={{ fontFamily: 'monospace' }}>
                            {Price}: {
                              // currency
                            
                              Number(item.krwAmount)?.toLocaleString() + ' 원'

                            }
                          </p>

                          <div className="mt-2 flex flex-row items-start gap-2">

                            <p className="text-xl font-semibold text-zinc-500">
                              {item.usdtAmount}{' '}USDT
                            </p>
                            <p className="text-lg font-semibold text-zinc-500">{Rate}: {

                              Number(item.krwAmount / item.usdtAmount).toFixed(3)

                              }</p>
                          </div>


                        </div>

                

                        <div className="mb-4 flex flex-col items-start text-sm ">
                          {Payment}: {Bank_Transfer} ({item.seller?.bankInfo?.bankName})
                          {isContactTransferBank(item.seller?.bankInfo) && item.seller?.bankInfo?.contactMemo && (
                            <span className="mt-1 text-xs text-slate-600">
                              {item.seller.bankInfo.contactMemo}
                            </span>
                          )}
                        </div>



                        <div className="flex flex-col items-start justify-start gap-2">
                          <p className="mt-2 mb-2 flex items-center gap-2">

                            <Image
                                src={item.avatar || '/icon-user.png'}
                                alt="Avatar"
                                width={32}
                                height={32}
                                priority={true} // Added priority property
                                className="rounded-full"
                                style={{
                                    objectFit: 'cover',
                                    width: '32px',
                                    height: '32px',
                                }}
                            />

                            <div className="flex flex-col gap-2 items-start">
                              <div className="flex items-center space-x-2">{Buyer}:</div>

                              <div className="text-sm font-semibold">
                                {item.nickname}
                              </div>
                              <div className="text-lg text-[#409192]">
                                {item.buyer?.depositName}
                              </div>
                            </div>

                            <Image
                              src="/verified.png"
                              alt="Verified"
                              width={20}
                              height={20}
                              className="rounded-lg"
                            />

                            <Image
                              src="/best-buyer.png"
                              alt="Best Buyer"
                              width={20}
                              height={20}
                              className="rounded-lg"
                            />

                          </p>


                          {address && item.walletAddress !== address && item?.buyer && item?.buyer?.walletAddress === address && (
                            <button
                              className="bg-green-500 text-white px-4 py-2 rounded-lg"
                              onClick={() => {
                                  //console.log('Buy USDT');
                                  // go to chat
                                  // close modal
                                  //closeModal();
                                  ///goChat(item._id, item.tradeId);

                                  router.push(`/${params.lang}/${"admin"}/sell-usdt/${item._id}`);

                              }}
                            >
                              {Chat_with_Buyer + ' ' + item.nickname}
                            </button>
                          )}


                        </div>




                        {/* buyer cancelled the trade */}
                        {item.status === 'cancelled' && (
                          <div className="mt-4 flex flex-col gap-2 items-start justify-center">
                            <div className="flex flex-row items-center gap-2">
                              <Image
                                src={item?.buyer?.avatar || "/icon-user.png"}
                                alt="Profile Image"
                                width={32}
                                height={32}
                                priority={true} // Added priority property
                                className="rounded-full"
                                style={{
                                    objectFit: 'cover',
                                    width: '32px',
                                    height: '32px',
                                }}
                              />
                              <p className="text-sm text-red-500 font-semibold">
                                {Buyer}: {
                                  address && item?.buyer?.nickname ? item?.buyer?.nickname : Anonymous
                                }
                              </p>

                            </div>


                          </div>
                        )}



                        {(item.status === 'accepted' || item.status === 'paymentRequested') && (
                    
                          <div className="mt-4 flex flex-row items-center gap-2">
                            <Image
                              src={item.seller?.avatar || "/icon-seller.png"}
                              alt="Profile Image"
                              width={32}
                              height={32}
                              priority={true} // Added priority property
                              className="rounded-full"
                              style={{
                                  objectFit: 'cover',
                                  width: '32px',
                                  height: '32px',
                              }}
                            />
                            <p className="text-xl text-[#409192] font-semibold">
                              {Seller}: {
                                item.seller?.nickname
                              }
                            </p>
                            <Image
                              src="/verified.png"
                              alt="Verified"
                              width={20}
                              height={20}
                              className="rounded-lg"
                            />
                          </div>
                        
                        )}
                      

                        {/* waiting for escrow */}
                        {item.status === 'accepted' && (



                          <div className="mt-4 flex flex-col gap-2 items-center justify-start">


                              
                              
                            <div className="mt-4 flex flex-row gap-2 items-center justify-start">
                              <Image
                                src="/icon-loading.png"
                                alt="Escrow"
                                width={32}
                                height={32}
                                className="animate-spin"
                              />

                              <div className="flex flex-col gap-2 items-start">
                                <span>
                                  {Waiting_for_seller_to_deposit} {item.usdtAmount} USDT {to_escrow}...
                                </span>

                                <span className="text-sm text-zinc-500">

                                  {If_the_seller_does_not_deposit_the_USDT_to_escrow},

                                  {this_trade_will_be_cancelled_in} {

                                    (1 - Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60 / 60) - 1) > 0
                                    ? (1 - Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60 / 60) - 1) + ' ' + hours
                                    : (60 - Math.floor((new Date().getTime() - new Date(item.acceptedAt).getTime()) / 1000 / 60) % 60) + ' ' + minutes

                                  } 

                                </span>
                              </div>
                            </div>





                            {item.buyer?.walletAddress === address && (

                              <div className="mt-4 flex flex-col items-center justify-center gap-2">



                                <div className="flex flex-row items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={agreementForCancelTrade[index]}
                                    onChange={(e) => {
                                      setAgreementForCancelTrade(
                                        buyOrders.map((item, idx) => {
                                          if (idx === index) {
                                            return e.target.checked;
                                          } else {
                                            return false;
                                          }
                                        })
                                      );
                                    }}
                                  />
                                  <label className="text-sm text-zinc-500">
                                    {I_agree_to_cancel_the_trade}
                                  </label>
                                </div>


                                <div className="mt-5 flex flex-row items-center gap-2">

                                  <button
                                    disabled={cancellings[index] || !agreementForCancelTrade[index]}
                                    className={`text-sm bg-red-500 text-white px-2 py-1 rounded-md ${cancellings[index] || !agreementForCancelTrade[index] ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-600'}`}
                                    onClick={() => {

                                      cancelTrade(item._id, index);

                                    }}
                                  >

                                    <div className="flex flex-row items-center gap-2 px-2 py-1">
                                      {cancellings[index] ? (
                                        <div className="
                                          w-4 h-4
                                          border-2 border-zinc-800
                                          rounded-full
                                          animate-spin
                                        ">
                                          <Image
                                            src="/icon-loading.png"
                                            alt="loading"
                                            width={16}
                                            height={16}
                                          />
                                        </div>
                                      ) : (
                                        <Image
                                          src="/icon-cancelled.png"
                                          alt="Cancel"
                                          width={16}
                                          height={16}
                                        />
                                      )}
                                      {Cancel_My_Trade}
                                    </div>
                                      
                                  
                                  </button>
                                </div>

                              </div>

                            )}


                          </div>
                        )}



                        {/* if status is accepted, show payment request button */}
                        {item.status === 'paymentConfirmed' && (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-[#409192]">
                              {Completed}
                            </span>
                            <span>{
                              item.paymentConfirmedAt && new Date(item.paymentConfirmedAt)?.toLocaleString()
                            }</span>
                          </div>
                        )}

                        {
                        item.seller && item.seller.walletAddress === address &&
                        item.status === 'accepted' && (
                          <div className="flex flex-row gap-1">

                            {/* check box for agreement */}
                            <input
                              disabled={escrowing[index] || requestingPayment[index]}
                              type="checkbox"
                              checked={requestPaymentCheck[index]}
                              onChange={(e) => {
                                setRequestPaymentCheck(
                                  requestPaymentCheck.map((item, idx) => {
                                    if (idx === index) {
                                      return e.target.checked;
                                    }
                                    return item;
                                  })
                                );
                              }}
                            />

                            <button
                              disabled={escrowing[index] || requestingPayment[index] || !requestPaymentCheck[index]}
                              
                              className={`flex flex-row gap-1 text-sm text-white px-2 py-1 rounded-md ${escrowing[index] || requestingPayment[index] || !requestPaymentCheck[index] ? 'bg-gray-500' : 'bg-green-500'}`}
                              onClick={() => {

                                requestPayment(
                                  index,
                                  item._id,
                                  item.tradeId,
                                  item.usdtAmount,
                                  item.storecode,

                                  item.seller?.bankInfo,
                                );
                              }}
                            >
                              <Image
                                src="/icon-loading.png"
                                alt="loading"
                                width={16}
                                height={16}
                                className={escrowing[index] || requestingPayment[index] ? 'animate-spin' : 'hidden'}
                              />
                              <span>{Request_Payment}</span>
                            
                            </button>

                          </div>
                        )}


                        {/* waiting for payment */}
                        {item.status === 'paymentRequested' && (

                            <div className="mt-4 flex flex-col gap-2 items-start justify-start">

                              <div className="flex flex-row items-center gap-2">

                                <Image
                                  src="/smart-contract.png"
                                  alt="Smart Contract"
                                  width={32}
                                  height={32}
                                />
                                <div>{Escrow}: {item.usdtAmount} USDT</div>
                                <button
                                  className="bg-white text-black px-2 py-2 rounded-md"

                                  onClick={() => {
                                    let url = '';
                                    if (chain === "ethereum") {
                                      url = `https://etherscan.io/tx/${item.escrowTransactionHash}`;
                                    } else if (chain === "polygon") {
                                      url = `https://polygonscan.com/tx/${item.escrowTransactionHash}`;
                                    } else if (chain === "arbitrum") {
                                      url = `https://arbiscan.io/tx/${item.escrowTransactionHash}`;
                                    } else if (chain === "bsc") {
                                      url = `https://bscscan.com/tx/${item.escrowTransactionHash}`;
                                    } else {
                                      url = `https://arbiscan.io/tx/${item.escrowTransactionHash}`;
                                    }
                                    window.open(url, '_blank');
                                  }}

                                >
                                  <Image
                                    src='/logo-arbitrum.png'
                                    alt="Chain"
                                    width={20}
                                    height={20}
                                  />
                                </button>
                              </div>

                              <div className="flex flex-row gap-2 items-center justify-start">

                                {/* rotate loading icon */}
                              
                                <Image
                                  src="/icon-loading.png"
                                  alt="Escrow"
                                  width={32}
                                  height={32}
                                  className="animate-spin"
                                />

                                <div>Waiting for buyer to send {
                                item.krwAmount?.toLocaleString('ko-KR', {
                                  style: 'currency',
                                  currency: 'KRW',
                                })} to seller...</div>
                              

                              </div>


                            </div>
                        )}



                      





                        {item.status === 'ordered' && (
                          <>

                          {acceptingBuyOrder[index] ? (

                            <div className="flex flex-row items-center gap-2">
                              <Image
                                src='/icon-loading.png'
                                alt='loading'
                                width={35}
                                height={35}
                                className="animate-spin"
                              />
                              <div>{Accepting_Order}...</div>
                            </div>


                          ) : (
                            <>
                              
                              {item.walletAddress === address ? (
                                <div className="flex flex-col space-y-4">
                                  {My_Order}
                                </div>
                              ) : (
                                <div className="w-full flex items-center justify-center">

                                  {item.status === 'ordered' && (
                                    
                                    // check if the order is expired
                                    new Date().getTime() - new Date(item.createdAt).getTime() > 1000 * 60 * 60 * 24

                                  ) ? (

                                    <>
                                      {/*
                                      <Image
                                        src="/icon-expired.png"
                                        alt="Expired"
                                        width={80}
                                        height={80}
                                      />
                                      */}
                                  
                                  </>
                                  ) : (
                                    <>

                                      {user?.seller && user?.seller?.bankInfo && (

          

                                        <div className="mt-4 flex flex-col items-center justify-center">

                                          {/* agreement for trade */}
                                          <div className="flex flex-row items-center space-x-2">
                                            <input
                                              disabled={!address}
                                              type="checkbox"
                                              checked={agreementForTrade[index]}
                                              onChange={(e) => {
                                                  setAgreementForTrade(
                                                      buyOrders.map((item, idx) => {
                                                          if (idx === index) {
                                                              return e.target.checked;
                                                          } else {
                                                              return false;
                                                          }
                                                      })
                                                  );
                                              }}
                                            />
                                            <label className="text-sm text-zinc-500">
                                              {I_agree_to_the_terms_of_trade}
                                            </label>
                                          </div>



                                          {/* input sms receiver mobile number */}

                                          {address && agreementForTrade[index] && (
                                            <div className="mt-8 flex flex-row items-center justify-start gap-2">

                                              <span className="text-sm text-zinc-500">SMS</span>

                                              <div className="flex flex-col items-start justify-start">
                                                <input
                                                  disabled={!address || !agreementForTrade[index]}
                                                  type="text"
                                                  placeholder="SMS Receiver Mobile Number"
                                                  className={`w-full px-4 py-2 rounded-md text-black`}
                                                  value={smsReceiverMobileNumber}
                                                  onChange={(e) => {
                                                      setSmsReceiverMobileNumber(e.target.value);
                                                  }}
                                                />
                                              </div>
                                            </div>
                                          )}

                                          <button
                                            disabled={!address || !agreementForTrade[index]}
                                            className={`m-10 text-lg text-white px-4 py-2 rounded-md
                                              ${!address || !agreementForTrade[index] ? 'bg-zinc-800' : 'bg-green-500 hover:bg-green-600'}
                                              `}
                                            onClick={() => {
  
                                                acceptBuyOrder(index, item._id, smsReceiverMobileNumber, item.tradeId, item.walletAddress)
                                          

                                            }}
                                          >
                                            {Buy_Order_Accept} {item.usdtAmount} USDT
                                          </button>


                                        </div>

                                      )}

                                    </>

                                  )}

                                </div>



                                )}

                              </>

                            )}

                          </>

                        )}



                    </article>




                    {/* status */}
                    {/*
                    <div className="absolute bottom-4 right-4 flex flex-row items-start justify-start">
                      <div className="text-sm text-zinc-500">
                        {item.status === 'ordered' ? 'Order opened at ' + new Date(item.createdAt)?.toLocaleString()
                        : item.status === 'accepted' ? 'Trade started at ' + new Date(item.acceptedAt)?.toLocaleString()
                        : item.status === 'paymentRequested' ? 'Payment requested at ' + new Date(item.paymentRequestedAt)?.toLocaleString()
                        : item.status === 'cancelled' ? 'Trade cancelled at ' + new Date(item.cancelledAt)?.toLocaleString()
                        : item.status === 'paymentConfirmed' ? 'Trade completed at ' + new Date(item.paymentConfirmedAt)?.toLocaleString()
                        : 'Unknown'}
                      </div>
                    </div>
                    */}






                  </div>
            
                ))}

            </div>

          )}

          


        </div>

      

        {/* pagination */}
        {/* url query string */}
        {/* 1 2 3 4 5 6 7 8 9 10 */}
        {/* ?limit=10&page=1 */}
        {/* submit button */}
        {/* totalPage = Math.ceil(totalCount / limit) */}
        <div className="hidden
        mt-4 flex-row items-center justify-center gap-4">


          <div className="flex flex-row items-center gap-2">
            <select
              value={limitValue}
              onChange={(e) =>
                router.push(`/${params.lang}/administration/buyorder?storecode=${searchStorecode}&limit=${Number(e.target.value)}&page=${pageValue}`)
              }

              className="text-sm bg-zinc-800 text-zinc-200 px-2 py-1 rounded-md"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* 처음으로 */}
          <button
            disabled={Number(pageValue) <= 1}
            className={`text-sm text-white px-4 py-2 rounded-md ${Number(pageValue) <= 1 ? 'bg-gray-500' : 'bg-green-500 hover:bg-green-600'}`}
            onClick={() => {
              router.push(`/${params.lang}/administration/buyorder?storecode=${searchStorecode}&limit=${Number(limitValue)}&page=1`)
            }}
          >
            처음으로
          </button>


          <button
            disabled={Number(pageValue) <= 1}
            className={`text-sm text-white px-4 py-2 rounded-md ${Number(pageValue) <= 1 ? 'bg-gray-500' : 'bg-green-500 hover:bg-green-600'}`}
            onClick={() => {

              router.push(`/${params.lang}/administration/buyorder?storecode=${searchStorecode}&limit=${Number(limitValue)}&page=${Number(pageValue) - 1}`)


            }}
          >
            이전
          </button>


          <span className="text-sm text-zinc-500">
            {pageValue} / {Math.ceil(Number(buyOrderStats.totalCount) / Number(limitValue))}
          </span>


          <button
            disabled={Number(pageValue) >= Math.ceil(Number(buyOrderStats.totalCount) / Number(limitValue))}
            className={`text-sm text-white px-4 py-2 rounded-md ${Number(pageValue) >= Math.ceil(Number(buyOrderStats.totalCount) / Number(limitValue)) ? 'bg-gray-500' : 'bg-green-500 hover:bg-green-600'}`}
            onClick={() => {

              router.push(`/${params.lang}/administration/buyorder?storecode=${searchStorecode}&limit=${Number(limitValue)}&page=${Number(pageValue) + 1}`)

            }}
          >
            다음
          </button>

          {/* 마지막으로 */}
          <button
            disabled={Number(pageValue) >= Math.ceil(Number(buyOrderStats.totalCount) / Number(limitValue))}
            className={`text-sm text-white px-4 py-2 rounded-md ${Number(pageValue) >= Math.ceil(Number(buyOrderStats.totalCount) / Number(limitValue)) ? 'bg-gray-500' : 'bg-green-500 hover:bg-green-600'}`}
            onClick={() => {

              router.push(`/${params.lang}/administration/buyorder?storecode=${searchStorecode}&limit=${Number(limitValue)}&page=${Math.ceil(Number(buyOrderStats.totalCount) / Number(limitValue))}`)

            }}
          >
            마지막으로
          </button>

        </div>

          
        {/*
        <Modal isOpen={isModalOpen} onClose={closeModal}>
            <TradeDetail
                closeModal={closeModal}
                //goChat={goChat}
            />
        </Modal>
        */}


        <ModalUser isOpen={isModalOpen} onClose={closeModal}>
            <UserPaymentPage
                closeModal={closeModal}
                selectedItem={selectedItem}
            />
        </ModalUser>

        <style jsx global>{`
          @keyframes seller-shimmer {
            0% {
              transform: translateX(-120%);
            }
            50% {
              transform: translateX(120%);
            }
            100% {
              transform: translateX(120%);
            }
          }
          @keyframes seller-glow {
            0%,
            100% {
              opacity: 0.35;
              transform: scale(0.96);
            }
            50% {
              opacity: 0.9;
              transform: scale(1.04);
            }
          }
        `}</style>

    </main>

  );


};




const UserPaymentPage = (
  {
      closeModal = () => {},
      selectedItem = null as {
        _id: string;
        nickname: string;
        storecode: string;
        buyer?: {
          depositBankName?: string;
          depositBankAccountNumber?: string;
          depositName?: string
        }
      } | null,
  }
) => {

  return (
    <div className="w-full flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">거래정보</h1>
      
      {/* iframe */}
      <iframe
        src={`${paymentUrl}/ko/${clientId}/${selectedItem?.storecode}/pay-usdt-reverse/${selectedItem?._id}`}

        
          
        width="400px"
        height="500px"
        className="border border-zinc-300 rounded-lg"
        title="Page"
      ></iframe>


      <button
        onClick={closeModal}
        className="bg-[#0047ab] text-white px-4 py-2 rounded-lg hover:bg-[#0047ab]/80"
      >
        닫기
      </button>
    </div>
  );

};




// close modal

const TradeDetail = (
    {
        closeModal = () => {},
        goChat = () => {},
        
    }
) => {


    const [amount, setAmount] = useState(1000);
    const price = 91.17; // example price
    const receiveAmount = (amount / price).toFixed(3);
    const commission = 0.01; // example commission
  
    return (

      <div className="max-w-2xl mx-auto bg-white shadow-2xl rounded-lg p-6 border border-slate-200">
        <div className="flex items-center">
          <span className="inline-block w-4 h-4 rounded-full bg-emerald-500 mr-2"></span>
          <h2 className="text-lg font-semibold text-slate-900 ">Iskan9</h2>
          <span className="ml-2 text-blue-600 text-sm">318 trades</span>
        </div>
        <p className="text-slate-600 mt-2">The offer is taken from another source. You can only use chat if the trade is open.</p>
        
        <div className="mt-4">
          <div className="flex justify-between text-slate-700">
            <span>Price</span>
            <span>{price} KRW</span>
          </div>
          <div className="flex justify-between text-slate-700 mt-2">
            <span>Limit</span>
            <span>40680.00 KRW - 99002.9 KRW</span>
          </div>
          <div className="flex justify-between text-slate-700 mt-2">
            <span>Available</span>
            <span>1085.91 USDT</span>
          </div>
          <div className="flex justify-between text-slate-700 mt-2">
            <span>Seller&apos;s payment method</span>
            <span className="bg-slate-100 text-amber-400 px-2 rounded-full border border-slate-200">Tinkoff</span>
          </div>
          <div className="mt-4 text-slate-700">
            <p>24/7</p>
          </div>
        </div>
  
        <div className="mt-6 border-t border-slate-200 pt-4 text-slate-700">
          <div className="flex flex-col space-y-4">
            <div>
              <label className="block text-slate-700 font-medium">I want to pay</label>
              <input 
                type="number"
                value={amount}
                onChange={(e) => setAmount(
                    e.target.value === '' ? 0 : parseInt(e.target.value)
                ) }

                className="mt-1 block w-full px-3 py-2 bg-slate-100 border border-slate-200 text-slate-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium">I will receive</label>
              <input 
                type="text"
                value={`${receiveAmount} USDT`}
                readOnly
                className="mt-1 block w-full px-3 py-2 bg-slate-100 border border-slate-200 text-slate-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-medium">Commission</label>
              <input 
                type="text"
                value={`${commission} USDT`}
                readOnly
                className="mt-1 block w-full px-3 py-2 bg-slate-100 border border-slate-200 text-slate-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>
          
          <div className="mt-6 flex space-x-4">
            <button
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg border border-emerald-500 shadow-md"
                onClick={() => {
                    console.log('Buy USDT');
                    // go to chat
                    // close modal
                    closeModal();
                    goChat();

                }}
            >
                Buy USDT
            </button>
            <button
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-lg border border-slate-200 shadow-md"
                onClick={() => {
                    console.log('Cancel');
                    // close modal
                    closeModal();
                }}
            >
                Cancel
            </button>
          </div>

        </div>


      </div>
    );
  };
