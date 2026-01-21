'use client';

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@sendbird/uikit-react/dist/index.css";


import { ThirdwebProvider } from "thirdweb/react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";





import { Toaster } from "react-hot-toast";

import { useState, useEffect } from "react";


import Script from "next/script";

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';


//const inter = Inter({ subsets: ["latin"] });

import localFont from "next/font/local";



import Image from "next/image";



// import components
import StabilityConsole from '@/components/StabilityConsole';
import SellerSendbirdWidgetGlobal from '@/components/SellerSendbirdWidgetGlobal';
import MySellerWidgetGlobal from '@/components/MySellerWidgetGlobal';
import { ClientSettingsProvider } from '@/components/ClientSettingsProvider';





import {
  chain,
} from "@/app/config/contractAddresses";


import { useRouter }from "next//navigation";


import { toast } from "react-hot-toast";



/*
export const metadata: Metadata = {
  title: "WEB3 Starter",
  description:
    "Starter for  WEB3 Wallet.",
};
*/



const queryClient = new QueryClient();



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {




  const router = useRouter();

  /*
  useEffect(() => {
  
    window.googleTranslateElementInit = () => {
     new window.google.translate.TranslateElement({ pageLanguage: 'en' }, 'google_translate_element');
    };
  
   }, []);
   */


  const [showChain, setShowChain] = useState(false);




  return (

    <html lang="ko">

    {/*
    <html lang="en">
    */}



      <head>
        
        {/* Google Translate */}
        {/*}
        <Script
        src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        ></Script>
        */}

   

        {/* Google Translate CSS */}
        {/*
        <link
        rel="stylesheet"
        type="text/css"
        href="https://www.gstatic.com/_/translate_http/_/ss/k=translate_http.tr.26tY-h6gH9w.L.W.O/am=CAM/d=0/rs=AN8SPfpIXxhebB2A47D9J-MACsXmFF6Vew/m=el_main_css"
        />
        */}


        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>OrangX OTC</title>
        <meta name="description" content="Gate for Crypto OTC." />
        <link rel="icon" href="/favicon.ico" />




      </head>


          {/*
      <body className={inter.className}>
      */}
      <body>



        <ThirdwebProvider>
          <ClientSettingsProvider>
            <Toaster />

            <div className="flex w-full flex-col items-stretch p-4 bg-slate-900/80 rounded-lg shadow-xl mb-4 border border-slate-700">

            {/* fixed position vertically top */}
            <div className="
              flex
              fixed top-2 right-2
              z-[9999]
              flex-col items-end justify-center">


              {/* Display the current chain */}
              {/* show and hide button to toggle chain display */}
              {/* button bg is transparent black */}
              <button
                className={`group mb-2 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold
                shadow-[0_16px_40px_-24px_rgba(15,23,42,0.8)] transition-all duration-200 backdrop-blur
                ${showChain
                  ? 'border-emerald-300/60 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25'
                  : 'border-slate-700/80 bg-slate-900/70 text-slate-100 hover:bg-slate-900/90'}
                `}
                onClick={() => setShowChain(!showChain)}
              >
                <div className="flex flex-row items-center justify-center gap-2">

                  <Image
                    src={`/icon-dot-green.png`}
                    alt={`System Stability`}
                    width={16}
                    height={16}
                    className={`transition-transform duration-200 ${showChain ? 'scale-110' : 'scale-100'}`}
                  />

                  <span className="text-sm tracking-tight">
                    {showChain ? '내 지갑 닫기' : '내 지갑 열기'}
                  </span>

                </div>
              </button>

              {/* z order above all other elements */}
              {/* 나의 지갑 정보 표시 */}
              <div className={`flex flex-col items-center justify-center
                ${showChain ? 'bg-slate-900/80 border border-slate-700/70 ring-1 ring-white/10' : 'hidden'}
                p-4 rounded-2xl shadow-[0_24px_60px_-36px_rgba(15,23,42,0.8)]
                backdrop-blur-md transition-all duration-300 ease-in-out
              `}>

                {/* Display client ID */}
                {/*
                <div className="flex flex-col items-center justify-center border-b border-gray-200 pb-4 mb-4">

                  <div className="flex flex-col items-center gap-2">
                    <Image
                      src={`/icon-clientid.png`}
                      alt={`Client logo`}
                      width={50}
                      height={50}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                    <span className="text-sm text-gray-600">STABILITY ID</span>
                  </div>

                  <div className="flex flex-row items-center gap-2">
                    <Image
                      src={`/icon-stability.png`}
                      alt={`Stability logo`}
                      width={25}
                      height={25}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                    <span className="text-sm xl:text-lg font-semibold text-gray-800">
                      {clientId}
                    </span>
                  </div>

                </div>
                */}

                {/*
                <div className="flex flex-col items-center justify-center gap-4 border-b border-slate-600 pb-4 mb-4">

                  <div className="flex flex-col items-center justify-center">
                    <Image
                      src={`/icon-blockchain.png`}
                      alt={`Current Chain`}
                      width={50}
                      height={50}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                    <span className="text-sm text-slate-400">BLOCKCHAIN ID</span>
                  </div>

                  <div className="flex flex-row items-center justify-center gap-4 mb-4">
                    
                    <div className={`
                      w-20 h-20
                      flex flex-col items-center justify-center gap-1 ${chain === 'ethereum' ? 'border-2 border-blue-400 bg-blue-900/30 p-2 rounded' : ''}
                      hover:bg-blue-900/50 hover:text-white transition-colors duration-200`}>
                      <Image
                        src={`/logo-chain-ethereum.png`}
                        alt={`Chain logo for Ethereum`}
                        width={25}
                        height={25}
                        className="h-6 w-6 rounded-full"
                        style={{ objectFit: "cover" }}
                      />
                      <span className={`text-xs
                        ${chain === 'ethereum' ? 'text-blue-400' : 'text-slate-400'}
                        hover:text-blue-400
                      `}>
                        Ethereum
                      </span>
                    </div>

                    <div className={`
                      w-20 h-20
                      flex flex-col items-center justify-center gap-1 ${chain === 'polygon' ? 'border-2 border-purple-400 bg-purple-900/30 p-2 rounded' : ''}
                      hover:bg-purple-900/50 hover:text-white transition-colors duration-200`}>
                      <Image
                        src={`/logo-chain-polygon.png`}
                        alt={`Chain logo for Polygon`}
                        width={25}
                        height={25}
                        className="h-6 w-6 rounded-full"
                        style={{ objectFit: "cover" }}
                      />
                      <span className={`text-xs
                        ${chain === 'polygon' ? 'text-purple-400' : 'text-slate-400'}
                        hover:text-purple-400
                      `}>
                        Polygon
                      </span>
                    </div>

                    <div className={`
                      w-20 h-20
                      flex flex-col items-center justify-center gap-1 ${chain === 'bsc' ? 'border-2 border-amber-400 bg-amber-900/30 p-2 rounded' : ''}
                      hover:bg-amber-900/50 hover:text-white transition-colors duration-200`}>
                      <Image
                        src={`/logo-chain-bsc.png`}
                        alt={`Chain logo for BSC`}
                        width={25}
                        height={25}
                        className="h-6 w-6 rounded-full"
                        style={{ objectFit: "cover" }}
                      />
                      <span className={`text-xs
                        ${chain === 'bsc' ? 'text-amber-400' : 'text-slate-400'}
                        hover:text-amber-400
                      `}>
                        BSC
                      </span>
                    </div>

                    <div className={`
                      w-20 h-20
                      flex flex-col items-center justify-center gap-1 ${chain === 'arbitrum' ? 'border-2 border-blue-500 p-2 rounded' : ''}
                      hover:bg-blue-500 hover:text-white transition-colors duration-200`}>
                      <Image
                        src={`/logo-chain-arbitrum.png`}
                        alt={`Chain logo for Arbitrum`}
                        width={25}
                        height={25}
                        className="h-6 w-6 rounded-full"
                        style={{ objectFit: "cover" }}
                      />
                      <span className={`
                        ${chain === 'arbitrum' ? 'text-blue-500' : 'text-gray-600'}
                        hover:text-blue-500
                      `}>
                        Arbitrum
                      </span>
                    </div>

                  </div>

                </div>
                */}


                {/* my wallet */}
                
                <div className="w-fullflex flex-col items-start justify-center">

                  <StabilityConsole />

                </div>

              </div>

            </div>


              <QueryClientProvider client={queryClient}>
                {children}
              </QueryClientProvider>
              <SellerSendbirdWidgetGlobal />
              <MySellerWidgetGlobal />
            </div>

            <Analytics />
            <SpeedInsights />
          </ClientSettingsProvider>
        </ThirdwebProvider>

      </body>
    </html>
  );


}
