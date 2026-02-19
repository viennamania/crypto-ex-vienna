'use client';

import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Chain } from 'thirdweb/chains';
import { useConnectModal } from 'thirdweb/react';

import { client } from '@/app/client';
import { ORANGEX_CONNECT_OPTIONS, ORANGEX_WELCOME_SCREEN } from '@/lib/orangeXConnectModal';

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
  const { connect, isConnecting } = useConnectModal();
  const [showPreModal, setShowPreModal] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const connectLocale = useMemo(() => (lang === 'en' ? 'en_US' : 'ko_KR'), [lang]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleOpenPreModal = () => {
    setConnectError(null);
    setShowPreModal(true);
  };

  const handleClosePreModal = () => {
    if (isConnecting) return;
    setShowPreModal(false);
  };

  const handleConnectWallet = async () => {
    try {
      setConnectError(null);
      setShowPreModal(false);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      await connect({
        client,
        wallets,
        chain,
        locale: connectLocale,
        theme: 'light',
        ...ORANGEX_CONNECT_OPTIONS,
        welcomeScreen: {
          ...ORANGEX_WELCOME_SCREEN,
          subtitle: '전화번호 인증으로 빠르게 지갑을 연결하고 서비스를 시작하세요.',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '지갑 연결에 실패했습니다.';
      setConnectError(message);
      setShowPreModal(true);
    }
  };

  return (
    <>
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
          <button
            type="button"
            onClick={handleOpenPreModal}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#0f766e_100%)] px-5 text-base font-extrabold tracking-tight text-white shadow-[0_20px_36px_-24px_rgba(15,23,42,0.95)] transition duration-200 hover:-translate-y-0.5 hover:text-white hover:brightness-105 active:translate-y-0"
          >
            지갑 연결하고 시작하기
          </button>
          <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
            전화번호 인증으로 빠르게 연결할 수 있습니다.
          </p>
        </div>
      </div>

      {mounted &&
        showPreModal &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/45 p-4 sm:items-center">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-200/80 bg-white shadow-[0_30px_90px_-38px_rgba(2,132,199,0.72)]">
              <div className="relative bg-[linear-gradient(160deg,#ecfeff_0%,#ecfdf5_100%)] px-6 pb-5 pt-6">
                <button
                  type="button"
                  onClick={handleClosePreModal}
                  disabled={isConnecting}
                  className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="닫기"
                >
                  ×
                </button>
                <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] text-cyan-700">
                  ORANGEX CONNECT
                </span>
                <Image
                  src="/logo-orangex.png"
                  alt="OrangeX"
                  width={220}
                  height={54}
                  className="mt-3 h-9 w-auto"
                  priority
                />
                <p className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">지갑 연결 시작</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  안전한 전화번호 인증으로 지갑을 연결한 뒤, 결제와 구매 기능을 바로 이용할 수 있습니다.
                </p>
              </div>

              <div className="px-6 pb-6 pt-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">연결 안내</p>
                  <p className="mt-1.5 text-sm text-slate-700">
                    전화번호 인증 시 표기를 010 으로 시작해야 합니다  10 으로 시작하면 인증되지 않습니다.
                  </p>
                </div>

                {connectError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                    {connectError}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleClosePreModal}
                    disabled={isConnecting}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectWallet}
                    disabled={isConnecting}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#0f766e_100%)] text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isConnecting ? '연결 중...' : '전화번호로 연결'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
