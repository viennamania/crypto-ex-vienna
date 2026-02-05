'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { AutoConnect, useActiveAccount, useActiveWallet } from 'thirdweb/react';

import { useClientWallets } from '@/lib/useClientWallets';
import { client } from '@/app/client';

import { ConnectButton } from '@/components/OrangeXConnectButton';

const USER_STORECODE = 'admin';
const DEFAULT_AVATAR = '/profile-default.png';
const MAX_AVATAR_MB = 5;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const formatAddress = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

export default function BuyerSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ lang?: string }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const address =
    activeAccount?.address ?? activeWallet?.getAccount?.()?.address ?? '';
  const { wallets } = useClientWallets();

  const [loading, setLoading] = useState(false);
  const [nickname, setNickname] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');

  const shortAddress = useMemo(() => formatAddress(address), [address]);
  const displayAvatar = avatarUrl || DEFAULT_AVATAR;
  const navItems = [
    {
      key: 'home',
      label: '구매 홈',
      href: `/${lang}/p2p-buyer`,
      active: pathname === `/${lang}/p2p-buyer`,
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-4.5a.5.5 0 0 1-.5-.5V14a2 2 0 0 0-4 0v5.5a.5.5 0 0 1-.5.5H5a1 1 0 0 1-1-1Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      key: 'seller-search',
      label: '판매자 찾기',
      href: `/${lang}/p2p-buyer/seller-search`,
      active: pathname?.includes('/p2p-buyer/seller-search'),
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="5" />
          <path d="m15.5 15.5 3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      key: 'settings',
      label: '구매자 설정',
      href: `/${lang}/p2p-buyer/buyer-settings`,
      active: pathname?.includes('/p2p-buyer/buyer-settings'),
      icon: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  useEffect(() => {
    let active = true;
    if (!address) {
      setNickname('');
      setNicknameInput('');
      setAvatarUrl('');
      setErrorMessage(null);
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: USER_STORECODE,
            walletAddress: address,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || '회원 정보를 불러오지 못했습니다.');
        }
        if (active) {
          const nextNickname = data?.result?.nickname || '';
          setNickname(nextNickname);
          setNicknameInput(nextNickname);
          setAvatarUrl(data?.result?.avatar || '');
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : '회원 정보를 불러오지 못했습니다.',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    return () => {
      active = false;
    };
  }, [address]);

  const syncSendbirdProfile = async (nextNickname: string, nextAvatar?: string) => {
    if (!address || !nextNickname) {
      return;
    }
    try {
      await fetch('/api/sendbird/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: address,
          nickname: nextNickname,
          ...(nextAvatar ? { profileUrl: nextAvatar } : {}),
        }),
      });
    } catch {
      // ignore sendbird sync errors
    }
  };

  const fetchHistory = async (opts?: { reset?: boolean; page?: number }) => {
    if (!address) return;
    const page = opts?.page ?? historyPage;
    const reset = opts?.reset ?? false;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch('/api/order/getAllBuyOrders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          storecode: USER_STORECODE,
          searchMyOrders: true,
          limit: 10,
          page,
          searchBuyer: historyQuery || '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '구매내역을 불러오지 못했습니다.');
      }
      const payload = data?.result;
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.buyOrders)
        ? payload.buyOrders
        : [];
      const total =
        typeof payload?.totalCount === 'number'
          ? payload.totalCount
          : rows.length;
      setHistoryItems(reset ? rows : [...historyItems, ...rows]);
      setHistoryHasMore(rows.length > 0 && (reset ? 10 : historyItems.length + rows.length) < total);
      setHistoryPage(page);
    } catch (err: any) {
      setHistoryError(err?.message || '구매내역을 불러오지 못했습니다.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSave = async () => {
    if (!address) {
      return;
    }
    if (!nicknameInput.trim()) {
      setErrorMessage('회원 아이디를 입력해 주세요.');
      return;
    }
    if (!/^[a-z0-9]+$/.test(nicknameInput.trim())) {
      setErrorMessage('회원 아이디는 영문 소문자와 숫자만 사용할 수 있습니다.');
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/user/setUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: USER_STORECODE,
          walletAddress: address,
          nickname: nicknameInput.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '회원 정보를 저장하지 못했습니다.');
      }
      setNickname(nicknameInput.trim());
      await syncSendbirdProfile(nicknameInput.trim(), avatarUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '회원 정보를 저장하지 못했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (historyOpen) {
      fetchHistory({ reset: true, page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, historyQuery]);

  const handleAvatarUpload = async (file: File) => {
    if (!address || avatarUploading) {
      return;
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setErrorMessage('PNG, JPG, WEBP 형식만 업로드할 수 있습니다.');
      return;
    }
    if (file.size / 1024 / 1024 > MAX_AVATAR_MB) {
      setErrorMessage(`파일 용량은 ${MAX_AVATAR_MB}MB 이하만 가능합니다.`);
      return;
    }
    setAvatarUploading(true);
    setErrorMessage(null);
    try {
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(errorText || '이미지 업로드 실패');
      }
      const { url } = (await uploadResponse.json()) as { url: string };
      const updateResponse = await fetch('/api/user/updateAvatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: USER_STORECODE,
          walletAddress: address,
          avatar: url,
        }),
      });
      const updateData = await updateResponse.json().catch(() => ({}));
      if (!updateResponse.ok || !updateData?.result) {
        throw new Error(updateData?.error || '아바타 저장에 실패했습니다.');
      }
      setAvatarUrl(url);
      await syncSendbirdProfile(nicknameInput.trim() || nickname, url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '아바타 업로드에 실패했습니다.',
      );
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-black sm:bg-[radial-gradient(120%_120%_at_50%_0%,#ffffff_0%,#f0f0f3_45%,#dadce1_100%)]">
      <AutoConnect client={client} wallets={wallets} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-0 pt-6 pb-0 sm:px-5 sm:py-10">
        <main className="flex flex-1 flex-col overflow-hidden bg-white sm:rounded-[32px] sm:border sm:border-black/10 sm:shadow-[0_34px_90px_-50px_rgba(15,15,18,0.45)] sm:ring-1 sm:ring-black/10">
          <div className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
            <header className="flex flex-col gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">회원정보</h1>
              <p className="text-sm text-black/60">
                계정 정보를 관리하고 상담 프로필을 최신 상태로 유지하세요.
              </p>
            </header>

            <section className="rounded-3xl border border-black/10 bg-[#0f0f12] p-5 text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayAvatar}
                      alt="회원 프로필"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                      Wallet
                    </p>
                    <p className="text-sm font-semibold text-white">
                      {shortAddress || '미연결'}
                    </p>
                  </div>
                </div>
                <label className="cursor-pointer rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/80">
                  {avatarUploading ? '업로드 중...' : '아바타 변경'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        handleAvatarUpload(file);
                      }
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-black/10 bg-[#0f0f12] p-5 text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                Member ID
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <input
                  value={nicknameInput}
                  onChange={(event) =>
                    setNicknameInput(event.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))
                  }
                  placeholder="회원 아이디"
                  inputMode="text"
                  pattern="[a-z0-9]*"
                  className="w-full rounded-2xl border border-white/10 bg-[#141416] px-4 py-4 text-2xl font-extrabold text-white outline-none placeholder:text-white/40"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    saving ||
                    !address ||
                    nicknameInput.trim() === '' ||
                    nicknameInput.trim() === nickname.trim()
                  }
                  className="inline-flex items-center justify-center rounded-2xl bg-[#ff7a1a] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_-18px_rgba(249,115,22,0.9)] disabled:cursor-not-allowed disabled:bg-orange-200"
                >
                  {saving ? '저장 중...' : '저장하기'}
                </button>
              </div>
              <p className="mt-3 text-xs text-white/60">
                {loading
                  ? '회원 정보를 불러오는 중입니다.'
                  : nickname
                    ? `현재 아이디: ${nickname}`
                    : '아이디가 아직 없습니다.'}
              </p>
            </section>

            <section className="mt-3">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black shadow-sm transition hover:border-black/20 hover:text-black/90 sm:bg-[#0f0f12] sm:text-white sm:border-white/15 sm:hover:text-white/95 sm:hover:bg-[#16161a]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="whitespace-nowrap">구매내역 보기</span>
              </button>
            </section>

            {!address && (
              <section className="rounded-3xl border border-black/10 bg-[#0f0f12] p-5 text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  Web3 Login
                </p>
                <div className="mt-3">
                  <ConnectButton
                    client={client}
                    wallets={wallets}
                    theme="light"
                    connectButton={{
                      label: '웹3 로그인',
                      style: {
                        background: '#ff7a1a',
                        color: '#ffffff',
                        border: '1px solid rgba(255,177,116,0.7)',
                        boxShadow: '0 14px 32px -18px rgba(249,115,22,0.9)',
                        width: '100%',
                        height: '48px',
                        borderRadius: '16px',
                        fontWeight: 600,
                        fontSize: '15px',
                      },
                    }}
                    connectModal={{
                      size: 'wide',
                      showThirdwebBranding: false,
                    }}
                    locale="ko_KR"
                  />
                </div>
              </section>
            )}

            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
                {errorMessage}
              </div>
            )}
          </div>
          <div className="mt-auto px-0 sm:px-5">
            <footer className="mx-0 rounded-none bg-[#1f1f1f] px-0 py-6 pb-0 text-center text-xs text-[#9aa3b2] sm:-mx-5 sm:rounded-b-[32px] sm:px-5 sm:pb-10">
              <div className="px-5 sm:px-0">
              <div className="flex flex-col items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight text-[#ff8a1f]">
                  Orange X™
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[#b6beca]">
                  <Link href={`/${lang}/p2p-buyer/terms-of-service`} className="px-2 hover:text-white">
                    이용약관
                  </Link>
                  <span className="text-[#566072]">|</span>
                  <Link href={`/${lang}/p2p-buyer/privacy-policy`} className="px-2 hover:text-white">
                    개인정보처리방침
                  </Link>
                  <span className="text-[#566072]">|</span>
                  <Link href={`/${lang}/p2p-buyer/refund-policy`} className="px-2 hover:text-white">
                    환불 분쟁 정책
                  </Link>
                </div>
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-[#8a93a6]">
                리스크 고지: 가상자산 결제에는 가격 변동 및 네트워크 지연 등 위험이
                수반될 수 있습니다. 결제 전에 수수료·환율·정산 조건을 확인해 주세요.
              </p>

              <div className="mt-4 space-y-1 text-[11px] text-[#b6beca]">
                <p>이메일: help@orangex.center</p>
                <p>주소: 14F, Corner St. Paul &amp; Tombs of the Kings, 8046 Pafos, Cyprus</p>
              </div>

              <p className="mt-4 text-[11px] text-[#6c7688]">
                Copyright © OrangeX All Rights Reserved
              </p>
              </div>
            </footer>
          </div>
        </main>
      </div>

      <div
        aria-hidden
        className="pointer-events-none fixed bottom-[68px] left-0 right-0 z-30 h-10 bg-gradient-to-t from-[#2f2f2f] via-[#2f2f2fd8] to-transparent sm:bottom-[76px]"
      />
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-[#0f172a] to-[#0b1220] px-3 pb-3 pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.25)] sm:px-6 sm:pb-4 sm:pt-3">
        <div className="mx-auto flex w-full max-w-lg items-stretch justify-center gap-3 sm:max-w-xl md:max-w-2xl">
          {navItems.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex flex-1 min-w-[110px] items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition-all duration-200 shadow-md ${
                tab.active
                  ? 'bg-white text-[#0f172a] shadow-[0_16px_34px_-18px_rgba(255,255,255,0.55)]'
                  : 'bg-white/10 text-white/85 ring-1 ring-white/15 hover:bg-white/15 hover:text-white'
              }`}
            >
              {tab.icon}
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Purchase history side panel */}
      <div
        className={`fixed inset-0 z-50 ${historyOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-300 ${
            historyOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setHistoryOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-full max-w-md transform bg-white shadow-2xl transition-transform duration-300 ${
            historyOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="relative border-b border-slate-200 px-4 pt-5 pb-3">
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="absolute top-5 left-4 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              닫기
            </button>
            <div className="flex flex-col gap-0.5 pl-16 pr-4">
              <span className="text-sm font-semibold text-slate-800">
                구매내역
              </span>
              <span className="text-[11px] text-slate-500">최신순</span>
            </div>
          </div>
          <div className="h-[calc(100%-56px)] overflow-y-auto px-4 py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="판매자/주문 검색"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <button
                type="button"
                onClick={() => fetchHistory({ reset: true, page: 1 })}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 whitespace-nowrap"
              >
                검색
              </button>
            </div>

            {historyLoading && (
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                구매내역을 불러오는 중...
              </div>
            )}
            {historyError && !historyLoading && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm">
                {historyError}
              </div>
            )}
            {!historyLoading && !historyError && historyItems.length === 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-sm">
                구매내역이 없습니다.
              </div>
            )}

            {!historyLoading &&
              historyItems.map((item, idx) => {
                const createdAt = item?.createdAt
                  ? new Date(item.createdAt).toLocaleString()
                  : '';
                const status = item?.status || '-';
                const sellerName =
                  item?.seller?.nickname ||
                  item?.seller?.bankInfo?.accountHolder ||
                  item?.seller?.walletAddress ||
                  '-';
                const amount = item?.usdtAmount ?? item?.escrowWallet?.balance ?? 0;
                return (
                  <div
                    key={`${item?._id || idx}`}
                    className="rounded-xl border border-slate-100 bg-white px-3 py-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-slate-800">
                          {sellerName}
                        </span>
                        <span className="text-[11px] text-slate-500">{createdAt}</span>
                      </div>
                      <span className="text-lg font-semibold text-emerald-700">
                        {amount?.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}{' '}
                        USDT
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                        {status}
                      </span>
                      {item?._id && (
                        <span className="text-right font-mono text-[10px] text-slate-400">
                          #{item._id}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

            {historyHasMore && (
              <button
                type="button"
                onClick={() => fetchHistory({ page: historyPage + 1 })}
                disabled={historyLoading}
                className="mt-2 inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
              >
                {historyLoading ? '불러오는 중...' : '더 보기'}
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
