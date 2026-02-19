'use client';

import React, { useCallback, useState } from 'react';
import {
  useActiveWallet,
  useConnectedWallets,
  useDisconnect,
} from 'thirdweb/react';

import { useSyncConnectedWalletUser } from '@/components/wallet-management/useSyncConnectedWalletUser';
import { clearWalletConnectionState } from '@/lib/clearWalletConnectionState';

type WalletSummaryCardProps = {
  walletAddress: string;
  walletAddressDisplay: string;
  networkLabel: string;
  usdtBalanceDisplay: string;
  balanceUpdatedAtLabel?: string;
  balanceUpdatedAtWarning?: boolean;
  modeLabel: string;
  smartAccountEnabled?: boolean;
  onCopyAddress?: (walletAddress: string) => void;
  disconnectRedirectPath?: string;
};

export default function WalletSummaryCard({
  walletAddress,
  walletAddressDisplay,
  networkLabel,
  usdtBalanceDisplay,
  balanceUpdatedAtLabel,
  balanceUpdatedAtWarning = false,
  modeLabel,
  smartAccountEnabled = false,
  onCopyAddress,
  disconnectRedirectPath,
}: WalletSummaryCardProps) {
  useSyncConnectedWalletUser(walletAddress);
  const activeWallet = useActiveWallet();
  const connectedWallets = useConnectedWallets();
  const { disconnect } = useDisconnect();
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const hasConnectedWallet = Boolean(activeWallet) || connectedWallets.length > 0;
  const hasUsdtSuffix = /\sUSDT$/i.test(usdtBalanceDisplay.trim());
  const usdtBalanceValueText = hasUsdtSuffix
    ? usdtBalanceDisplay.trim().replace(/\sUSDT$/i, '')
    : usdtBalanceDisplay;
  const usdtBalanceDecimalMatch = usdtBalanceValueText.match(/([.,]\d{1,6})$/);
  const usdtBalanceMainText = usdtBalanceDecimalMatch
    ? usdtBalanceValueText.slice(0, -usdtBalanceDecimalMatch[1].length)
    : usdtBalanceValueText;
  const usdtBalanceDecimalText = usdtBalanceDecimalMatch?.[1] || '';

  const openDisconnectModal = useCallback(() => {
    if (!hasConnectedWallet || disconnecting) {
      return;
    }
    setDisconnectModalOpen(true);
  }, [disconnecting, hasConnectedWallet]);

  const closeDisconnectModal = useCallback(() => {
    if (disconnecting) {
      return;
    }
    setDisconnectModalOpen(false);
  }, [disconnecting]);

  const handleDisconnectWallet = useCallback(async () => {
    if (!hasConnectedWallet || disconnecting) {
      return;
    }

    setDisconnecting(true);
    try {
      for (const wallet of connectedWallets) {
        try {
          await disconnect(wallet);
        } catch (error) {
          console.warn('disconnect(connectedWallet) failed', error);
        }
      }

      if (activeWallet) {
        await disconnect(activeWallet);
      }
    } catch (error) {
      console.warn('disconnect() failed, fallback to wallet.disconnect()', error);
      try {
        await activeWallet?.disconnect?.();
      } catch (fallbackError) {
        console.warn('activeWallet.disconnect() failed', fallbackError);
      }
    } finally {
      clearWalletConnectionState();
      window.dispatchEvent(new Event('orangex-wallet-disconnected'));
      const fallbackPath = window.location.pathname + window.location.search;
      window.location.replace(disconnectRedirectPath || fallbackPath);
    }
  }, [
    activeWallet,
    connectedWallets,
    disconnect,
    disconnecting,
    disconnectRedirectPath,
    hasConnectedWallet,
  ]);

  return (
    <>
      <div className="mb-6 rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.5)] backdrop-blur">
        <section className="mb-3 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">USDT 잔액</p>
            {balanceUpdatedAtLabel && (
              <span
                className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold whitespace-nowrap ${
                  balanceUpdatedAtWarning
                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    balanceUpdatedAtWarning ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
                {balanceUpdatedAtLabel}
              </span>
            )}
          </div>
          <p className="mt-2 text-center text-[clamp(2.1rem,9.5vw,2.875rem)] font-black leading-none tracking-tight text-slate-800 tabular-nums">
            <span className="inline-flex items-end justify-center gap-0.5">
              <span className="leading-none">{usdtBalanceMainText}</span>
              {usdtBalanceDecimalText && (
                <span className="text-sm font-bold leading-none">
                  {usdtBalanceDecimalText}
                </span>
              )}
              {hasUsdtSuffix && <span className="text-sm font-bold leading-none">USDT</span>}
            </span>
          </p>
        </section>

        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Connected Wallet
            </p>
            {smartAccountEnabled && (
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                스마트 어카운트
              </span>
            )}
          </div>
          {hasConnectedWallet && (
            <button
              type="button"
              onClick={openDisconnectModal}
              disabled={disconnecting}
              className="inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M10 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 12H4" strokeLinecap="round" />
                <path d="m8 8-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {disconnecting ? '해제 중...' : '연결 해제'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">내 지갑</p>
            {onCopyAddress ? (
              <button
                type="button"
                className="mt-1.5 text-base font-semibold text-slate-800 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-900"
                onClick={() => onCopyAddress(walletAddress)}
              >
                {walletAddressDisplay}
              </button>
            ) : (
              <p className="mt-1.5 text-base font-semibold text-slate-800">{walletAddressDisplay}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">네트워크</p>
            <p className="mt-1.5 text-base font-semibold text-slate-800">{networkLabel}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">모드</p>
            <p className="mt-1.5 text-base font-semibold text-slate-800">{modeLabel}</p>
          </div>
        </div>
      </div>

      {disconnectModalOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={closeDisconnectModal}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(254,242,242,0.96)_100%)] p-5 shadow-[0_40px_80px_-44px_rgba(15,23,42,0.85)]"
            role="dialog"
            aria-modal="true"
            aria-label="지갑 연결 해제 확인"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 8v5m0 3h.01" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3l-8.47-14.14a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <h3 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
              지갑 연결을 해제할까요?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              자동 로그인 상태와 연결 캐시가 초기화됩니다.
              다시 사용하려면 전화번호 인증으로 재연결해야 합니다.
            </p>

            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-3">
              <p className="text-[12px] font-semibold text-rose-700">
                연결 해제 시 현재 화면이 새로고침됩니다.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeDisconnectModal}
                disabled={disconnecting}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDisconnectWallet}
                disabled={disconnecting}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-rose-600 text-sm font-semibold text-white shadow-[0_16px_30px_-20px_rgba(225,29,72,0.9)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {disconnecting ? '해제 중...' : '연결 해제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
