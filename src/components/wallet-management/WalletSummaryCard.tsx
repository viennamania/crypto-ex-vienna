'use client';

import React from 'react';

type WalletSummaryCardProps = {
  walletAddress: string;
  walletAddressDisplay: string;
  networkLabel: string;
  usdtBalanceDisplay: string;
  modeLabel: string;
  smartAccountEnabled?: boolean;
  onCopyAddress?: (walletAddress: string) => void;
};

export default function WalletSummaryCard({
  walletAddress,
  walletAddressDisplay,
  networkLabel,
  usdtBalanceDisplay,
  modeLabel,
  smartAccountEnabled = false,
  onCopyAddress,
}: WalletSummaryCardProps) {
  return (
    <div className="mb-6 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)] backdrop-blur">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">내 지갑</p>
          {onCopyAddress ? (
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-slate-800 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900"
              onClick={() => onCopyAddress(walletAddress)}
            >
              {walletAddressDisplay}
            </button>
          ) : (
            <p className="mt-2 text-sm font-semibold text-slate-800">{walletAddressDisplay}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">네트워크</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{networkLabel}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">USDT 잔액</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{usdtBalanceDisplay}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">모드</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{modeLabel}</p>
          {smartAccountEnabled && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              스마트 어카운트
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
