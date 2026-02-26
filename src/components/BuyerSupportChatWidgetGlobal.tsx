'use client';

import { useEffect, useState } from 'react';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@example.com';
const USER_STORECODE = 'admin';

const BuyerSupportChatWidgetGlobal = () => {
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const address = activeAccount?.address ?? activeWallet?.getAccount?.()?.address ?? '';
  const isLoggedIn = Boolean(address);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isCheckingRole, setIsCheckingRole] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) {
      setIsAdmin(false);
      setIsCheckingRole(false);
      return;
    }

    let active = true;

    const fetchUserRole = async () => {
      setIsCheckingRole(true);
      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storecode: USER_STORECODE, walletAddress: address }),
        });
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        setIsAdmin(data?.result?.role === 'admin');
      } catch {
        if (!active) return;
        setIsAdmin(false);
      } finally {
        if (!active) return;
        setIsCheckingRole(false);
      }
    };

    void fetchUserRole();

    return () => {
      active = false;
    };
  }, [address]);

  const handleCopyEmail = async () => {
    if (!SUPPORT_EMAIL) return;

    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  if (!isLoggedIn || isAdmin || isCheckingRole) {
    return null;
  }

  return (
    <div className="fixed bottom-28 left-6 z-50 w-[320px] max-w-[92vw] rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.7)] backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Support</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">고객센터 채팅은 종료되었습니다.</p>
      <p className="mt-1 text-xs text-slate-600">문의는 이메일로 부탁드립니다.</p>

      <div className="mt-3 flex items-center gap-2">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex min-w-0 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:border-slate-400"
          title={SUPPORT_EMAIL}
        >
          <span className="truncate">{SUPPORT_EMAIL}</span>
        </a>
        <button
          type="button"
          onClick={() => {
            void handleCopyEmail();
          }}
          className="inline-flex h-[34px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
    </div>
  );
};

export default BuyerSupportChatWidgetGlobal;
