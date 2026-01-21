'use client';

///import type { Metadata } from "next";
///import { Inter } from "next/font/google";

///import "./globals.css";

///import { ThirdwebProvider } from "thirdweb/react";

import { useState, useEffect } from "react";


//import Script from "next/script";

//import { Analytics } from '@vercel/analytics/next';
//import { SpeedInsights } from '@vercel/speed-insights/next';


//const inter = Inter({ subsets: ["latin"] });

////import localFont from "next/font/local";



import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import { Button, Menu, MenuItem, Typography } from "@mui/material";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { langs } from "@/utils/langs";




import Image from "next/image";

import { toast } from 'react-hot-toast';



import {
  getContract,
} from "thirdweb";

import {
  ConnectButton,
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
  getWalletBalance,
} from "thirdweb/wallets";


import {
  getUserPhoneNumber,
  getUserEmail,
} from "thirdweb/wallets/in-app";


import {
  balanceOf,
  transfer,
} from "thirdweb/extensions/erc20";


import {
  ethereum,
  polygon,
  arbitrum,
  bsc,
} from "thirdweb/chains";


import {
  clientId,
  client,
} from "./../app/client";

import {
  chain,
  ethereumContractAddressUSDT,
  polygonContractAddressUSDT,
  arbitrumContractAddressUSDT,
  bscContractAddressUSDT,

  bscContractAddressMKRW,
} from "@/app/config/contractAddresses";
import { add } from "thirdweb/extensions/farcaster/keyGateway";


import { useQRCode } from 'next-qrcode';
import { Connect } from "twilio/lib/twiml/VoiceResponse";


const wallets = [
  inAppWallet({
    auth: {
      options: [
        "google",
        "email",
        "phone",
      ],
    },
  }),
];


let wallet: ReturnType<typeof inAppWallet>;

// NEXT_PUBLIC_SMART_ACCOUNT=no
if (process.env.NEXT_PUBLIC_SMART_ACCOUNT === "no") {
    wallet = inAppWallet();
} else {
    wallet = inAppWallet({
        smartAccount: {    
            sponsorGas: false,
            chain: chain === "bsc" ? bsc : chain === "polygon" ? polygon : chain === "arbitrum" ? arbitrum : ethereum,
        }
    });
}  



const StabilityConsole = () => {

  const { Canvas } = useQRCode();

  const router = useRouter();


  /*
  useEffect(() => {
  
    window.googleTranslateElementInit = () => {
     new window.google.translate.TranslateElement({ pageLanguage: 'en' }, 'google_translate_element');
    };
  
   }, []);
   */


  //const [showChain, setShowChain] = useState(false);

  const activeWallet = useActiveWallet();

  const activeAccount = useActiveAccount();

  const address = activeAccount?.address;

  const networkLabel = chain === "ethereum"
    ? "Ethereum"
    : chain === "polygon"
    ? "Polygon"
    : chain === "arbitrum"
    ? "Arbitrum"
    : chain === "bsc"
    ? "BSC"
    : "Unknown";

  const networkTone = chain === "ethereum"
    ? "border-indigo-200/70 bg-indigo-50 text-indigo-700"
    : chain === "polygon"
    ? "border-violet-200/70 bg-violet-50 text-violet-700"
    : chain === "arbitrum"
    ? "border-sky-200/70 bg-sky-50 text-sky-700"
    : chain === "bsc"
    ? "border-amber-200/70 bg-amber-50 text-amber-700"
    : "border-slate-200/70 bg-slate-50 text-slate-600";



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




  const [balance, setBalance] = useState(0);
  const [nativeBalance, setNativeBalance] = useState(0);

  useEffect(() => {

    if (!address) return;
    // get the balance


    if (!contract) {
      return;
    }

    const getBalance = async () => {

      try {
        const result = await balanceOf({
          contract,
          address: address,
        });

        if (chain === 'bsc') {
          setBalance( Number(result) / 10 ** 18 );
        } else {
          setBalance( Number(result) / 10 ** 6 );
        }

      } catch (error) {
        console.error("Error getting balance", error);
      }


      // getWalletBalance
      const result = await getWalletBalance({
        address: address,
        client: client,
        chain: chain === "ethereum" ? ethereum :
                chain === "polygon" ? polygon :
                chain === "arbitrum" ? arbitrum :
                chain === "bsc" ? bsc : arbitrum,
      });

      if (result) {
        setNativeBalance(Number(result.value) / 10 ** result.decimals);
      }

      

    };

    if (address) getBalance();

    // get the balance in the interval

    const interval = setInterval(() => {
      if (address) getBalance();
    }, 5000);


    return () => clearInterval(interval);

  } , [address, contract]);




  return (

    <div
      className="console-shell relative mx-auto mb-4 w-full max-w-lg overflow-hidden rounded-[28px]
      bg-[radial-gradient(120%_120%_at_0%_0%,#fbfaf6_0%,#eff3f7_45%,#e1e8f1_100%)]
      p-6 shadow-[0_40px_80px_-50px_rgba(15,23,42,0.65)] ring-1 ring-[#d6dde7] md:p-7"
      style={{ fontFamily: '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif' }}
    >

      <AutoConnect
        client={client}
        wallets={[wallet]}
      />

      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full
        bg-[radial-gradient(circle_at_center,#9be8d9_0%,rgba(155,232,217,0.2)_45%,transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full
        bg-[radial-gradient(circle_at_center,#bcd1ff_0%,rgba(188,209,255,0.25)_40%,transparent_70%)] blur-2xl" />


      {/* address balance */}
      <div className="console-card relative flex w-full flex-col gap-6 rounded-[22px]
        border border-white/70 bg-white/80 p-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.45)]
        backdrop-blur-xl md:p-6">

        {address ? (

          <>
            <div
              className="console-row w-full rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm md:p-5"
              style={{ animationDelay: "0.05s" }}
            >
              <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
                <span>내 지갑주소</span>
              </div>

              <div className="mt-4 grid w-full gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200/70
                  bg-white/80 px-4 py-2 text-base font-semibold text-slate-900 shadow-sm
                  transition hover:border-slate-300 hover:shadow-md"
                  onClick={() => {
                    navigator.clipboard.writeText(address);
                    //toast.success(Copied_Wallet_Address);
                    alert("지갑주소가 복사되었습니다.");
                  }}
                >
                  <Image
                    src="/icon-shield.png"
                    alt="Shield"
                    width={20}
                    height={20}
                    className="h-5 w-5 opacity-70"
                  />
                  <span className="tracking-tight">
                    {address.substring(0, 6)}...{address.substring(address.length - 4)}
                  </span>
                </button>

                <div className="flex justify-center md:justify-end">
                  <div className="rounded-2xl bg-white p-3 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.35)]
                    ring-1 ring-slate-200/60">
                    <Canvas
                      text={address}
                      options={{
                        //level: 'M',
                        margin: 2,
                        scale: 4,
                        ///width: 200,
                        // width 100%
                        width: 140,
                        color: {
                          dark: '#0f172a',
                          light: '#ffffff',
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
      


            <div
              className="console-row w-full rounded-2xl border border-emerald-100/70
              bg-[linear-gradient(135deg,#f1fff8_0%,#f7fbff_100%)] p-4 shadow-[0_18px_40px_-30px_rgba(16,185,129,0.6)]
              md:p-5"
              style={{ animationDelay: "0.12s" }}
            >
              <div className="flex items-center gap-2 text-[12px] font-medium text-emerald-700/80">
                <Image
                  src="/token-usdt-icon.png"
                  alt="USDT"
                  width={35}
                  height={35}
                  className="h-6 w-6 rounded-lg bg-white p-1 shadow-sm"
                />
                <span>내 테더 잔액(USDT)</span>
              </div>

              <div className="mt-3 flex w-full items-baseline justify-between">
                <div
                  className="text-2xl font-semibold text-emerald-700 tabular-nums"
                  style={{ fontFamily: '"JetBrains Mono", "IBM Plex Mono", "Menlo", monospace' }}
                >
                  {Number(balance).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                </div>
                <span className="text-[11px] font-medium text-emerald-700/60">USDT</span>
              </div>


              {/*
              <button
                disabled={!address}
                onClick={() => {
                  // redirect to send USDT page
                  router.push(
                    "/kr/administration/withdraw-usdt"
                  );

                }}
                className="w-full flex items-center justify-center
                bg-[#0047ab]
                text-white px-4 py-2 rounded-lg hover:bg-blue-600"
              >
                <span className="text-sm text-gray-100">
                  출금하기
                </span>
                <Image
                  src="/icon-share.png"
                  alt="Withdraw USDT"
                  width={20}
                  height={20}
                  className="ml-2"
                />

              </button>
              */}

            </div>

            <div
              className="console-row w-full rounded-2xl border border-slate-200/60 bg-white/70 px-4 py-3"
              style={{ animationDelay: "0.18s" }}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image
                    src={`/logo-chain-${chain}.png`}
                    alt={`${chain} logo`}
                    width={20}
                    height={20}
                    className="rounded-lg"
                  />
                  <span className="text-[12px] font-medium text-slate-500">
                    가스보유량
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-lg font-semibold text-slate-900 tabular-nums"
                    style={{ fontFamily: '"JetBrains Mono", "IBM Plex Mono", "Menlo", monospace' }}
                  >
                    {Number(nativeBalance).toFixed(4)}
                  </span>
                  <span className="text-[12px] font-medium text-slate-500">
                    {chain === "ethereum" ? "ETH" :
                    chain === "polygon" ? "POL" :
                    chain === "arbitrum" ? "ETH" :
                    chain === "bsc" ? "BNB" : ""}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`console-row w-full rounded-2xl border px-4 py-3 ${networkTone}`}
              style={{ animationDelay: "0.2s" }}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-[0.2em]">
                  현재 네트워크
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">{networkLabel}</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">
                    {chain}
                  </span>
                </div>
              </div>
            </div>

            {/* if pol balance is 0, comment out the text */}
            {nativeBalance < 0.0001 && (
              <div
                className="console-row w-full rounded-xl border border-rose-200/70 bg-rose-50/80
                px-3 py-2 text-[12px] text-rose-600"
                style={{ animationDelay: "0.22s" }}
              >
                가스비용이 부족합니다.<br />가스비용이 부족하면 입금은 가능하지만 출금은 불가능합니다.
              </div>
            )}


            <div
              className="console-row w-full grid grid-cols-1 gap-3 md:grid-cols-2"
              style={{ animationDelay: "0.26s" }}
            >
              <button
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-900
                px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(15,23,42,0.6)]
                transition hover:-translate-y-0.5 hover:bg-slate-800"
                //onClick={() => router.push("/ko/administration/withdraw-usdt")}
                /* router and hide button for withdraw USDT */
                onClick={() => {
                  router.push("/ko/administration/withdraw-usdt");
                  //setShowChain(false);
                }}>
                  <Image
                    src={`/icon-withdraw.png`}
                    alt={`Withdraw icon`}
                    width={16}
                    height={16}
                  />
                  <span>USDT 출금하기</span>
              </button>

                <button
                  className="inline-flex items-center justify-center rounded-full border border-rose-200
                  bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 shadow-sm
                  transition hover:border-rose-300 hover:bg-rose-50"
                  onClick={() => {
                    // Add your disconnect wallet logic here
                    confirm("지갑 연결을 해제하시겠습니까?") && activeWallet?.disconnect()
                    .then(() => {
                      toast.success('로그아웃 되었습니다');
                    });
                    
                  }}>
                  지갑 연결 해제
                </button>


            </div>


          </>

        ) : (

          <div
            className="console-row w-full rounded-2xl border border-slate-200/70 bg-white/75 p-5 text-center shadow-sm"
            style={{ animationDelay: "0.08s" }}
          >
            {/* 로그인하고 나의 자산을 확인하세요 */}
            <span className="text-[13px] font-medium text-slate-500">
              로그인하고 나의 지갑주소에서 자산을 확인하세요
            </span>


            <div className="mt-4 flex justify-center">
              <ConnectButton
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
                    backgroundColor: "#0f172a",
                    color: "#f8fafc",
                    padding: "2px 12px",
                    borderRadius: "999px",
                    fontSize: "14px",
                    height: "42px",
                    boxShadow: "0 14px 30px -18px rgba(15, 23, 42, 0.6)",
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
            </div>

          </div>

        )}

      </div>

      <style jsx>{`
        .console-shell {
          animation: consoleShellIn 0.6s ease-out both;
        }
        .console-card {
          animation: consoleCardIn 0.7s ease-out 0.05s both;
        }
        .console-row {
          animation: consoleRowIn 0.6s ease-out both;
        }
        @keyframes consoleShellIn {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes consoleCardIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes consoleRowIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

    </div>

  );


};



StabilityConsole.displayName = "StabilityConsole";

export default StabilityConsole;
