'use client';

import { type ChangeEvent, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useActiveAccount } from 'thirdweb/react';
import { getUserPhoneNumber } from 'thirdweb/wallets/in-app';

import { client } from '../../../client';

type RegistrationPageProps = {
  params: {
    lang: string;
    center: string;
  };
};

type RegistrationCopy = {
  badge: string;
  title: string;
  description: string;
  statusRegistered: string;
  statusPending: string;
  walletLabel: string;
  walletMissing: string;
  avatarLabel: string;
  avatarHint: string;
  avatarButton: string;
  avatarChanged: string;
  nicknameLabel: string;
  nicknamePlaceholder: string;
  nicknameHint: string;
  nicknameRuleLength: string;
  nicknameRuleFormat: string;
  saveCreate: string;
  saveUpdate: string;
  saving: string;
  saved: string;
  registered: string;
  profileLoadError: string;
  nicknameRequired: string;
  nicknameLengthError: string;
  nicknameFormatError: string;
  nicknameCreateError: string;
  nicknameUpdateError: string;
  avatarUploadError: string;
  avatarUpdateError: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
};

type RegisteredProfile = {
  id?: string | number;
  nickname?: string;
  avatar?: string;
};

const DEFAULT_AVATAR = '/profile-default.png';
const MAX_AVATAR_FILE_BYTES = 10 * 1024 * 1024;
const NICKNAME_PATTERN = /^[a-z0-9]+$/;

const COPY: Record<'ko' | 'en', RegistrationCopy> = {
  ko: {
    badge: '회원 등록',
    title: '회원 아이디와 프로필 이미지만 등록하세요',
    description:
      '이 페이지는 가맹점 회원 등록에 필요한 최소 항목만 남긴 화면입니다. 회원 아이디를 정하고 프로필 이미지를 올린 뒤 저장하면 등록이 완료됩니다.',
    statusRegistered: '등록 완료',
    statusPending: '등록 대기',
    walletLabel: '연결 지갑',
    walletMissing: '지갑 정보 없음',
    avatarLabel: '프로필 이미지',
    avatarHint: 'PNG, JPG, WEBP 이미지 파일만 업로드해 주세요. 최대 10MB까지 지원합니다.',
    avatarButton: '이미지 선택',
    avatarChanged: '새 이미지가 선택되었습니다.',
    nicknameLabel: '회원 아이디',
    nicknamePlaceholder: '5-10자의 영문 소문자/숫자',
    nicknameHint: '회원 등록에 사용할 아이디입니다.',
    nicknameRuleLength: '5자 이상 10자 이하',
    nicknameRuleFormat: '영문 소문자와 숫자만 사용',
    saveCreate: '회원 등록 완료',
    saveUpdate: '변경사항 저장',
    saving: '저장 중...',
    saved: '회원 정보가 저장되었습니다.',
    registered: '회원 등록이 완료되었습니다.',
    profileLoadError: '기존 회원 정보를 불러오지 못했습니다. 새로 등록을 시도할 수 있습니다.',
    nicknameRequired: '회원 아이디를 입력해 주세요.',
    nicknameLengthError: '회원 아이디는 5자 이상 10자 이하로 입력해 주세요.',
    nicknameFormatError: '회원 아이디는 영문 소문자와 숫자만 사용할 수 있습니다.',
    nicknameCreateError: '회원 등록에 실패했습니다. 이미 사용 중인 아이디일 수 있습니다.',
    nicknameUpdateError: '회원 아이디 저장에 실패했습니다.',
    avatarUploadError: '프로필 이미지 업로드에 실패했습니다.',
    avatarUpdateError: '프로필 이미지 저장에 실패했습니다.',
    emptyStateTitle: '등록된 회원 정보가 없습니다',
    emptyStateDescription: '회원 아이디와 프로필 이미지를 입력하고 저장하면 바로 등록됩니다.',
  },
  en: {
    badge: 'Member Registration',
    title: 'Register only your member ID and profile image',
    description:
      'This page keeps only the essentials for center member registration. Set your member ID, upload a profile image, and save to complete registration.',
    statusRegistered: 'Registered',
    statusPending: 'Pending',
    walletLabel: 'Connected Wallet',
    walletMissing: 'No wallet detected',
    avatarLabel: 'Profile Image',
    avatarHint: 'Upload PNG, JPG, or WEBP images only. Maximum size is 10MB.',
    avatarButton: 'Choose Image',
    avatarChanged: 'A new image is ready to upload.',
    nicknameLabel: 'Member ID',
    nicknamePlaceholder: '5-10 lowercase letters or numbers',
    nicknameHint: 'This ID will be used as your member account name.',
    nicknameRuleLength: 'Between 5 and 10 characters',
    nicknameRuleFormat: 'Lowercase letters and numbers only',
    saveCreate: 'Complete Registration',
    saveUpdate: 'Save Changes',
    saving: 'Saving...',
    saved: 'Member profile saved.',
    registered: 'Member registration completed.',
    profileLoadError: 'Could not load the existing member profile. You can still try to register again.',
    nicknameRequired: 'Please enter a member ID.',
    nicknameLengthError: 'Member ID must be between 5 and 10 characters.',
    nicknameFormatError: 'Member ID can only contain lowercase letters and numbers.',
    nicknameCreateError: 'Failed to register the member ID. It may already be in use.',
    nicknameUpdateError: 'Failed to save the member ID.',
    avatarUploadError: 'Failed to upload the profile image.',
    avatarUpdateError: 'Failed to save the profile image.',
    emptyStateTitle: 'No registered member profile yet',
    emptyStateDescription: 'Enter your member ID and profile image, then save to finish registration.',
  },
};

const toTrimmedString = (value: unknown) => String(value ?? '').trim();

const shortenWalletAddress = (value: string) => {
  const normalized = toTrimmedString(value);
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

export default function CenterProfilesRegistrationPage({ params }: RegistrationPageProps) {
  const locale = params.lang === 'ko' ? 'ko' : 'en';
  const copy = COPY[locale];
  const center = toTrimmedString(params.center);
  const activeAccount = useActiveAccount();
  const walletAddress = toTrimmedString(activeAccount?.address);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberExists, setMemberExists] = useState(false);
  const [nickname, setNickname] = useState('');
  const [originalNickname, setOriginalNickname] = useState('');
  const [currentAvatar, setCurrentAvatar] = useState(DEFAULT_AVATAR);
  const [previewAvatar, setPreviewAvatar] = useState(DEFAULT_AVATAR);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [profileLoadMessage, setProfileLoadMessage] = useState('');

  useEffect(() => {
    if (!walletAddress || !center) {
      setLoadingProfile(false);
      setMemberExists(false);
      setNickname('');
      setOriginalNickname('');
      setCurrentAvatar(DEFAULT_AVATAR);
      setPreviewAvatar(DEFAULT_AVATAR);
      setSelectedAvatarFile(null);
      setProfileLoadMessage('');
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);
    setProfileLoadMessage('');

    (async () => {
      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storecode: center,
            walletAddress,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String((payload as Record<string, unknown>)?.error || copy.profileLoadError));
        }

        if (cancelled) return;

        const result =
          payload && typeof payload === 'object' && payload !== null && typeof payload.result === 'object' && payload.result !== null
            ? (payload.result as RegisteredProfile)
            : null;

        if (result) {
          const nextNickname = toTrimmedString(result.nickname);
          const nextAvatar = toTrimmedString(result.avatar) || DEFAULT_AVATAR;
          setMemberExists(true);
          setNickname(nextNickname);
          setOriginalNickname(nextNickname);
          setCurrentAvatar(nextAvatar);
          setPreviewAvatar(nextAvatar);
        } else {
          setMemberExists(false);
          setNickname('');
          setOriginalNickname('');
          setCurrentAvatar(DEFAULT_AVATAR);
          setPreviewAvatar(DEFAULT_AVATAR);
        }

        setSelectedAvatarFile(null);
      } catch (error) {
        if (cancelled) return;
        setMemberExists(false);
        setNickname('');
        setOriginalNickname('');
        setCurrentAvatar(DEFAULT_AVATAR);
        setPreviewAvatar(DEFAULT_AVATAR);
        setSelectedAvatarFile(null);
        setProfileLoadMessage(error instanceof Error ? error.message : copy.profileLoadError);
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [center, copy.profileLoadError, walletAddress]);

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(copy.avatarUploadError);
      return;
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      toast.error(copy.avatarHint);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : DEFAULT_AVATAR;
      setPreviewAvatar(result);
      setSelectedAvatarFile(file);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const nextNickname = toTrimmedString(nickname).toLowerCase();

    if (!walletAddress || !center || saving) return;
    if (!nextNickname) {
      toast.error(copy.nicknameRequired);
      return;
    }
    if (nextNickname.length < 5 || nextNickname.length > 10) {
      toast.error(copy.nicknameLengthError);
      return;
    }
    if (!NICKNAME_PATTERN.test(nextNickname)) {
      toast.error(copy.nicknameFormatError);
      return;
    }

    setSaving(true);

    try {
      let mobile = '';
      try {
        mobile = toTrimmedString(await getUserPhoneNumber({ client }));
      } catch (error) {
        console.warn('Failed to read thirdweb phone number for center registration', error);
      }

      const profileResponse = await fetch(memberExists ? '/api/user/updateUser' : '/api/user/setUserVerified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storecode: center,
          walletAddress,
          nickname: nextNickname,
          ...(mobile ? { mobile } : {}),
        }),
      });

      const profilePayload = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok || !profilePayload?.result) {
        throw new Error(memberExists ? copy.nicknameUpdateError : copy.nicknameCreateError);
      }

      let nextAvatar = currentAvatar;
      if (selectedAvatarFile) {
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'content-type': selectedAvatarFile.type || 'application/octet-stream',
          },
          body: selectedAvatarFile,
        });

        if (!uploadResponse.ok) {
          throw new Error(copy.avatarUploadError);
        }

        const uploadPayload = await uploadResponse.json().catch(() => ({}));
        const uploadedUrl = toTrimmedString((uploadPayload as Record<string, unknown>)?.url);
        if (!uploadedUrl) {
          throw new Error(copy.avatarUploadError);
        }

        const avatarResponse = await fetch('/api/user/updateAvatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storecode: center,
            walletAddress,
            avatar: uploadedUrl,
          }),
        });

        const avatarPayload = await avatarResponse.json().catch(() => ({}));
        if (!avatarResponse.ok || !avatarPayload?.result) {
          throw new Error(copy.avatarUpdateError);
        }

        nextAvatar = uploadedUrl;
      }

      setMemberExists(true);
      setNickname(nextNickname);
      setOriginalNickname(nextNickname);
      setCurrentAvatar(nextAvatar);
      setPreviewAvatar(nextAvatar);
      setSelectedAvatarFile(null);
      setProfileLoadMessage('');

      toast.success(memberExists ? copy.saved : copy.registered);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.nicknameUpdateError);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = !memberExists || nickname !== originalNickname || Boolean(selectedAvatarFile);

  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_40px_120px_-48px_rgba(15,23,42,0.35)]">
      <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#67e8f9_0%,#0ea5e9_38%,#0f172a_100%)] px-6 py-7 sm:px-8">
        <div className="absolute -left-10 top-6 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-cyan-200/20 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-50">
              {copy.badge}
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/90">
              {copy.description}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                {copy.walletLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {walletAddress ? shortenWalletAddress(walletAddress) : copy.walletMissing}
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                Status
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {memberExists ? copy.statusRegistered : copy.statusPending}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(280px,360px)_1fr] lg:px-8 lg:py-8">
        <aside className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#f1f5f9_100%)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
            {copy.avatarLabel}
          </p>

          <div className="mt-4 flex flex-col items-center text-center">
            <div className="relative flex h-44 w-44 items-center justify-center rounded-[32px] bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#bae6fd_45%,#e2e8f0_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div
                className="h-full w-full rounded-[28px] border border-white/80 bg-slate-200 bg-cover bg-center shadow-[0_20px_45px_-28px_rgba(15,23,42,0.45)]"
                style={{ backgroundImage: `url("${previewAvatar || DEFAULT_AVATAR}")` }}
                aria-label={copy.avatarLabel}
              />
            </div>

            <label className="mt-4 inline-flex h-11 cursor-pointer items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-700">
              {copy.avatarButton}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={handleAvatarChange}
              />
            </label>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              {copy.avatarHint}
            </p>

            {selectedAvatarFile && (
              <p className="mt-3 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {copy.avatarChanged}
              </p>
            )}
          </div>
        </aside>

        <div className="space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.18)] sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              {copy.nicknameLabel}
            </p>

            <div className="mt-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-900">
                  {copy.nicknameHint}
                </span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10);
                    setNickname(nextValue);
                  }}
                  placeholder={copy.nicknamePlaceholder}
                  maxLength={10}
                  disabled={loadingProfile || saving}
                  className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-semibold tracking-[0.04em] text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                />
              </label>

              <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-semibold text-slate-900">{copy.nicknameRuleLength}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-semibold text-slate-900">{copy.nicknameRuleFormat}</p>
                </div>
              </div>

              {profileLoadMessage && (
                <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  {profileLoadMessage}
                </p>
              )}

              {!loadingProfile && !memberExists && !profileLoadMessage && (
                <p className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
                  {copy.emptyStateTitle}
                  <span className="mt-1 block text-sm font-normal text-sky-700">
                    {copy.emptyStateDescription}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-900 bg-[linear-gradient(145deg,#0f172a_0%,#111827_52%,#1e293b_100%)] p-5 text-white shadow-[0_28px_64px_-34px_rgba(15,23,42,0.8)] sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/85">
                  Ready
                </p>
                <p className="mt-2 text-xl font-bold tracking-tight text-white">
                  {memberExists ? copy.saveUpdate : copy.saveCreate}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={loadingProfile || saving || !walletAddress || !hasChanges}
                className="inline-flex h-12 min-w-[180px] items-center justify-center rounded-2xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                {saving ? copy.saving : memberExists ? copy.saveUpdate : copy.saveCreate}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
