'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useActiveAccount } from 'thirdweb/react';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';
import GroupChannelList from '@sendbird/uikit-react/GroupChannelList';

const SENDBIRD_APP_ID = 'CCD67D05-55A6-4CA2-A6B1-187A5B62EC9D';
const OWNER_WALLET_STORAGE_KEY = 'sellerOwnerWalletAddress';
const OWNER_WALLET_EVENT = 'seller-owner-wallet-address';

const readOwnerWalletAddress = () => {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(OWNER_WALLET_STORAGE_KEY) || '';
};

type UserChannelItem = {
  unreadMessageCount?: number;
};

const SellerSendbirdWidgetGlobal = () => {
  const activeAccount = useActiveAccount();
  const address = activeAccount?.address;
  const [ownerWalletAddress, setOwnerWalletAddress] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [selectedChannelUrl, setSelectedChannelUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    const syncOwnerWalletAddress = () => {
      setOwnerWalletAddress(readOwnerWalletAddress());
    };

    syncOwnerWalletAddress();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === OWNER_WALLET_STORAGE_KEY) {
        syncOwnerWalletAddress();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(OWNER_WALLET_EVENT, syncOwnerWalletAddress);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(OWNER_WALLET_EVENT, syncOwnerWalletAddress);
    };
  }, [isMounted]);

  const canShow = Boolean(
    address &&
      ownerWalletAddress &&
      address === ownerWalletAddress
  );

  useEffect(() => {
    let isActive = true;

    const fetchSessionToken = async () => {
      if (!canShow) {
        if (isActive) {
          setSessionToken(null);
          setSelectedChannelUrl(null);
          setErrorMessage(null);
        }
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch('/api/sendbird/session-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: ownerWalletAddress,
            nickname: `${ownerWalletAddress.slice(0, 6)}...`,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(error?.error || '세션 토큰을 발급하지 못했습니다.');
        }

        const data = (await response.json()) as { sessionToken?: string };
        if (!data.sessionToken) {
          throw new Error('세션 토큰이 비어 있습니다.');
        }

        if (isActive) {
          setSessionToken(data.sessionToken);
        }
      } catch (error) {
        if (isActive) {
          const message =
            error instanceof Error ? error.message : '채팅을 불러오지 못했습니다.';
          setErrorMessage(message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    fetchSessionToken();

    return () => {
      isActive = false;
    };
  }, [canShow, ownerWalletAddress]);

  useEffect(() => {
    if (!canShow) {
      setIsOpen(false);
      setView('list');
    }
  }, [canShow]);

  useEffect(() => {
    let isActive = true;

    const fetchUnreadCount = async () => {
      if (!canShow || !ownerWalletAddress) {
        if (isActive) {
          setUnreadCount(0);
        }
        return;
      }

      try {
        const response = await fetch('/api/sendbird/user-channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: ownerWalletAddress, limit: 20 }),
        });

        if (!response.ok) {
          throw new Error('채팅 카운트를 불러오지 못했습니다.');
        }

        const data = (await response.json()) as { items?: UserChannelItem[] };
        const total = Array.isArray(data.items)
          ? data.items.reduce(
              (sum, item) => sum + (item?.unreadMessageCount ?? 0),
              0
            )
          : 0;

        if (isActive) {
          setUnreadCount(total);
        }
      } catch {
        if (isActive) {
          setUnreadCount(0);
        }
      }
    };

    fetchUnreadCount();
    const intervalId = window.setInterval(fetchUnreadCount, 15000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [canShow, ownerWalletAddress]);

  if (!isMounted || !canShow) {
    return null;
  }

  return createPortal(
    <div className="fixed left-6 top-1/2 z-[9999] flex -translate-y-1/2 items-center gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="seller-chat-list"
          aria-label={isOpen ? '채팅목록 닫기' : '채팅목록 열기'}
          className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 ${
            isOpen
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_18px_40px_-25px_rgba(16,185,129,0.7)]'
              : 'border-emerald-200/80 bg-emerald-50/95 text-emerald-900'
          }`}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              isOpen ? 'bg-white/20 text-white' : 'bg-emerald-600 text-white'
            }`}
          >
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
        </button>
        {unreadCount > 0 && (
          <span className="seller-chat-unread min-w-[30px] rounded-full border px-2.5 py-1 text-center text-xs font-extrabold tabular-nums">
            {unreadCount}
          </span>
        )}
      </div>

      {isOpen && (
        <div
          id="seller-chat-list"
          className="w-[340px] max-w-[calc(100vw-8rem)] md:w-[420px] md:max-w-[70vw] lg:w-[520px] lg:max-w-[50vw]"
        >
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-[0_20px_55px_-40px_rgba(15,23,42,0.6)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {view === 'chat' && (
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
                  >
                    목록
                  </button>
                )}
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">판매자 채팅</h4>
                  <p className="text-xs text-slate-500">Sendbird 대화목록</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLoading && <span className="text-xs text-slate-500">불러오는 중...</span>}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
                >
                  닫기
                </button>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {errorMessage}
              </div>
            ) : !sessionToken ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                채팅을 준비 중입니다.
              </div>
            ) : (
              <SendbirdProvider
                appId={SENDBIRD_APP_ID}
                userId={ownerWalletAddress}
                accessToken={sessionToken}
                theme="light"
              >
                {view === 'list' ? (
                  <div className="h-[360px] overflow-hidden rounded-xl border border-slate-200 bg-white md:h-[480px] lg:h-[560px]">
                    <GroupChannelList
                      onChannelSelect={(channel) => {
                        setSelectedChannelUrl(channel?.url ?? null);
                        setView('chat');
                      }}
                      onChannelCreated={(channel) => {
                        setSelectedChannelUrl(channel?.url ?? null);
                        setView('chat');
                      }}
                      selectedChannelUrl={selectedChannelUrl ?? undefined}
                      disableAutoSelect
                    />
                  </div>
                ) : (
                  <div className="h-[360px] overflow-hidden rounded-xl border border-slate-200 bg-white md:h-[480px] lg:h-[560px]">
                    {selectedChannelUrl ? (
                      <GroupChannel channelUrl={selectedChannelUrl} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        대화를 선택하세요.
                      </div>
                    )}
                  </div>
                )}
              </SendbirdProvider>
            )}
          </div>
        </div>
      )}
      <style jsx global>{`
        @keyframes sellerUnreadBlink {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.65);
          }
          50% {
            opacity: 0.25;
            transform: scale(1.12);
            box-shadow: 0 0 0 10px rgba(220, 38, 38, 0);
          }
        }

        .seller-chat-unread {
          background: #dc2626;
          border-color: #991b1b;
          color: #ffffff;
          animation: sellerUnreadBlink 0.85s ease-in-out infinite;
          text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
        }
      `}</style>
    </div>,
    document.body
  );
};

export default SellerSendbirdWidgetGlobal;
