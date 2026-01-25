'use client';

import { useEffect, useRef, useState } from 'react';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';

const SENDBIRD_APP_ID = 'CCD67D05-55A6-4CA2-A6B1-187A5B62EC9D';
const SUPPORT_ADMIN_ID = process.env.NEXT_PUBLIC_SENDBIRD_MANAGER_ID || 'orangexManager';

const BuyerSupportChatWidgetGlobal = () => {
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const address =
    activeAccount?.address ?? activeWallet?.getAccount?.()?.address ?? '';
  const isLoggedIn = Boolean(address);

  const [isOpen, setIsOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [channelUrl, setChannelUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const connectingRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setIsOpen(false);
      setSessionToken(null);
      setChannelUrl(null);
      setErrorMessage(null);
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    let active = true;

    const connectChat = async () => {
      if (!isLoggedIn || !isOpen) {
        return;
      }
      if (sessionToken && channelUrl) {
        return;
      }
      if (connectingRef.current) {
        return;
      }
      connectingRef.current = true;
      setLoading(true);
      setErrorMessage(null);

      try {
        const sessionUrl =
          typeof window !== 'undefined'
            ? new URL('/api/sendbird/session-token', window.location.origin)
            : null;
        if (!sessionUrl) {
          throw new Error('세션 요청 URL을 만들지 못했습니다.');
        }
        sessionUrl.searchParams.set('userId', address);
        sessionUrl.searchParams.set('nickname', `buyer-${address.slice(0, 6)}`);

        const sessionResponse = await fetch(sessionUrl.toString(), {
          method: 'GET',
        });
        if (!sessionResponse.ok) {
          const error = await sessionResponse.json().catch(() => null);
          throw new Error(error?.error || '세션 토큰을 발급하지 못했습니다.');
        }
        const sessionData = (await sessionResponse.json()) as { sessionToken?: string };
        if (!sessionData.sessionToken) {
          throw new Error('세션 토큰이 비어 있습니다.');
        }

        const channelResponse = await fetch('/api/sendbird/group-channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyerId: address,
            sellerId: SUPPORT_ADMIN_ID,
          }),
        });
        if (!channelResponse.ok) {
          const error = await channelResponse.json().catch(() => null);
          throw new Error(error?.error || '채팅 채널을 생성하지 못했습니다.');
        }
        const channelData = (await channelResponse.json()) as { channelUrl?: string };

        if (active) {
          setSessionToken(sessionData.sessionToken);
          setChannelUrl(channelData.channelUrl || null);
        }
      } catch (error) {
        if (active) {
          const message =
            error instanceof Error ? error.message : '채팅을 불러오지 못했습니다.';
          setErrorMessage(message);
        }
      } finally {
        connectingRef.current = false;
        if (active) {
          setLoading(false);
        }
      }
    };

    connectChat();

    return () => {
      active = false;
    };
  }, [address, channelUrl, isLoggedIn, isOpen, sessionToken]);

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="fixed bottom-[44px] left-[44px] z-50 flex flex-col items-start gap-3">
      {isOpen && (
        <div className="w-[340px] max-w-[90vw] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_24px_60px_-40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">고객 상담</p>
              <p className="text-xs text-slate-500">orangexManager</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
            >
              닫기
            </button>
          </div>
          <div className="h-[420px] bg-white">
            {errorMessage ? (
              <div className="px-4 py-4 text-xs text-rose-500">{errorMessage}</div>
            ) : !sessionToken || !channelUrl ? (
              <div className="px-4 py-4 text-xs text-slate-500">
                {loading ? '채팅을 준비 중입니다.' : '채팅을 불러오는 중입니다.'}
              </div>
            ) : (
              <SendbirdProvider
                appId={SENDBIRD_APP_ID}
                userId={address}
                accessToken={sessionToken}
                theme="light"
              >
                <GroupChannel channelUrl={channelUrl} />
              </SendbirdProvider>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.6)] backdrop-blur transition hover:-translate-y-0.5"
        aria-expanded={isOpen}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        문의하기
      </button>
    </div>
  );
};

export default BuyerSupportChatWidgetGlobal;
