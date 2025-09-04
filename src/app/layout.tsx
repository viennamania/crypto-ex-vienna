'use client';

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
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


import { useRouter }from "next//navigation";



const pretendard = localFont({
  src: "../static/fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});



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

    <html lang="ko" className={`${pretendard.variable}`}>

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
        <title>Vienna Stable</title>
        <meta name="description" content="Gate for Crypto OTC." />
        <link rel="icon" href="/favicon.ico" />




      </head>


          {/*
      <body className={inter.className}>
      */}
      <body className={pretendard.className}>



        <ThirdwebProvider>

          <Toaster />




          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
          



          <Analytics />
          <SpeedInsights />

        </ThirdwebProvider>

      </body>
    </html>
  );


}
