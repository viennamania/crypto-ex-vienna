'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { AutoConnect, ConnectButton, useActiveAccount, useActiveWallet } from 'thirdweb/react';

import { useClientWallets } from '@/lib/useClientWallets';
import { client } from '@/app/client';

const USER_STORECODE = 'admin';
const DEFAULT_AVATAR = '/profile-default.png';
const MAX_AVATAR_MB = 5;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const formatAddress = (address: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

export default function BuyerSettingsPage() {
  const router = useRouter();
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

  const shortAddress = useMemo(() => formatAddress(address), [address]);
  const displayAvatar = avatarUrl || DEFAULT_AVATAR;

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

  const handleSave = async () => {
    if (!address) {
      return;
    }
    if (!nicknameInput.trim()) {
      setErrorMessage('회원 아이디를 입력해 주세요.');
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
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_50%_0%,#ffffff_0%,#f0f0f3_45%,#dadce1_100%)] text-black">
      <AutoConnect client={client} wallets={wallets} />
      <div className="mx-auto w-full max-w-sm px-4 py-10">
        <main className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-[0_34px_90px_-50px_rgba(15,15,18,0.45)] ring-1 ring-black/10">
          <div className="flex flex-col gap-6 px-5 pt-8">
            <header className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-black/10 bg-white shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)]">
                  <Image
                    src="/logo-orangex.png"
                    alt="orangex"
                    width={24}
                    height={24}
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-black/50">
                    P2P Buyer
                  </p>
                  <p className="text-sm font-semibold tracking-tight">orangex</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight">회원정보</h1>
                <button
                  type="button"
                  onClick={() => router.push(`/${lang}/p2p-buyer`)}
                  className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-black/60"
                >
                  뒤로
                </button>
              </div>
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
                  onChange={(event) => setNicknameInput(event.target.value)}
                  placeholder="회원 아이디"
                  className="w-full rounded-2xl border border-white/10 bg-[#141416] px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/40"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !address}
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

            <footer className="-mx-5 mt-2 rounded-b-[32px] bg-[#1f1f1f] px-5 py-6 pb-10 text-center text-xs text-[#9aa3b2]">
              <div className="flex flex-col items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight text-[#ff8a1f]">
                  Orange X™
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[#b6beca]">
                  <span className="px-2">이용약관</span>
                  <span className="text-[#566072]">|</span>
                  <span className="px-2">개인정보처리방침</span>
                  <span className="text-[#566072]">|</span>
                  <span className="px-2">환불 분쟁 정책</span>
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
            </footer>

            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
                {errorMessage}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
