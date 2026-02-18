'use client';

import React from 'react';
import type { Chain } from 'thirdweb/chains';

import { client } from '@/app/client';
import { ConnectButton } from '@/components/OrangeXConnectButton';

type WalletConnectPromptProps = {
  wallets: any[];
  chain: Chain;
  lang: string;
  title: string;
  description: string;
  centered?: boolean;
};

export default function WalletConnectPrompt({
  wallets,
  chain,
  lang,
  title,
  description,
  centered = false,
}: WalletConnectPromptProps) {
  return (
    <div
      className={
        centered
          ? 'w-full rounded-[28px] border border-cyan-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.98)_0%,rgba(240,249,255,0.98)_100%)] p-6 shadow-[0_26px_60px_-36px_rgba(14,116,144,0.65)] backdrop-blur'
          : 'flex flex-col gap-4'
      }
    >
      <div className={centered ? 'text-center' : ''}>
        <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-cyan-700">
          Wallet Connect
        </span>
        <p className="mt-2 text-base font-extrabold leading-snug text-slate-900">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
      <div className={centered ? 'mt-1' : ''}>
        <ConnectButton
          client={client}
          wallets={wallets}
          chain={chain}
          locale={lang === 'en' ? 'en_US' : 'ko_KR'}
          theme="light"
          connectButton={{
            label: '지갑 연결하고 시작하기',
            className:
              'inline-flex h-12 w-full items-center justify-center rounded-2xl border border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#0f766e_100%)] px-5 text-base font-extrabold tracking-tight text-white shadow-[0_20px_36px_-24px_rgba(15,23,42,0.95)] transition duration-200 hover:-translate-y-0.5 hover:text-white hover:brightness-105 active:translate-y-0',
          }}
        />
        <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
          전화번호 인증으로 빠르게 연결할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
