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
          ? 'w-full rounded-2xl border border-white/70 bg-white/75 p-6 text-center shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)] backdrop-blur'
          : 'flex flex-col gap-3'
      }
    >
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-1 text-xs text-slate-600">{description}</p>
      </div>
      <div className={centered ? 'mt-2' : ''}>
        <ConnectButton
          client={client}
          wallets={wallets}
          chain={chain}
          locale={lang === 'en' ? 'en_US' : 'ko_KR'}
          theme="light"
          connectButton={{
            label: '지갑 연결',
            className:
              'inline-flex h-10 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800',
          }}
        />
      </div>
    </div>
  );
}
