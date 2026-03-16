'use client';

import Link from 'next/link';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useActiveAccount, useActiveWallet, useConnectedWallets } from 'thirdweb/react';
import { getUserEmail, getUserPhoneNumber } from 'thirdweb/wallets/in-app';

import { client } from '@/app/client';
import { createWalletSignatureAuthPayload } from '@/lib/security/walletSignature';
import { resolveStoreBrandColor, rgbaFromHex } from '@/lib/storeBranding';

type MemberRegistrationCopy = {
  badge: string;
  title: string;
  description: string;
  helper: string;
  walletLabel: string;
  walletMissing: string;
  statusLabel: string;
  statusRegistered: string;
  statusPending: string;
  poolLabel: string;
  poolValue: string;
  storeLabel: string;
  storeMissing: string;
  storecodeRequired: string;
  profileLoadError: string;
  signatureError: string;
  avatarLabel: string;
  avatarHint: string;
  avatarButton: string;
  avatarChanged: string;
  nicknameLabel: string;
  nicknamePlaceholder: string;
  nicknameHint: string;
  nicknameRuleLength: string;
  nicknameRuleFormat: string;
  nicknameRequired: string;
  nicknameLengthError: string;
  nicknameFormatError: string;
  nicknameCreateError: string;
  nicknameUpdateError: string;
  avatarUploadError: string;
  avatarUpdateError: string;
  saveCreate: string;
  saveUpdate: string;
  saving: string;
  saved: string;
  registered: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  returnToManagement: string;
  scopeTitle: string;
  scopeDescription: string;
  scopeStore: string;
  scopeAdminPool: string;
  brandingLoadError: string;
};

type RegisteredProfile = {
  nickname?: string;
  avatar?: string;
};

type StoreBranding = {
  storeName: string;
  storeLogo: string;
  backgroundColor: string;
};

type SignMessageAccount = {
  address?: string;
  signMessage?: (options: {
    message: string;
    originalMessage?: string;
    chainId?: number;
  }) => Promise<string>;
};

const ADMIN_MEMBER_STORECODE = 'admin';
const DEFAULT_AVATAR = '/profile-default.png';
const MAX_AVATAR_FILE_BYTES = 10 * 1024 * 1024;
const NICKNAME_PATTERN = /^[a-z0-9]+$/;

const COPY: Record<'ko' | 'en', MemberRegistrationCopy> = {
  ko: {
    badge: 'Store Member Registration',
    title: '가맹점 회원 아이디 등록',
    description:
      '여기에서 등록한 회원 아이디와 프로필 이미지는 관리자 가맹점 관리의 "가맹점 관리자 지갑 변경" 회원 지갑 목록에 바로 반영됩니다.',
    helper: '가맹점 브랜딩은 유지하고, 저장 대상은 관리자 회원 풀(`storecode=admin`)로 고정됩니다.',
    walletLabel: '연결 지갑',
    walletMissing: '지갑 정보 없음',
    statusLabel: '등록 상태',
    statusRegistered: '등록 완료',
    statusPending: '등록 대기',
    poolLabel: '저장 대상',
    poolValue: 'admin 회원 지갑 목록',
    storeLabel: '가맹점',
    storeMissing: 'storecode 파라미터가 없습니다.',
    storecodeRequired: 'storecode 파라미터가 필요합니다.',
    profileLoadError: '기존 회원 정보를 불러오지 못했습니다. 새로 등록을 시도할 수 있습니다.',
    signatureError: '서명 가능한 지갑 계정을 찾을 수 없습니다.',
    avatarLabel: '프로필 이미지',
    avatarHint: 'PNG, JPG, WEBP 이미지만 업로드할 수 있으며 최대 10MB까지 지원합니다.',
    avatarButton: '이미지 선택',
    avatarChanged: '새 프로필 이미지가 선택되었습니다.',
    nicknameLabel: '회원 아이디',
    nicknamePlaceholder: '5-10자의 영문 소문자/숫자',
    nicknameHint: '관리자 페이지 회원 지갑 목록에서 보일 회원 아이디입니다.',
    nicknameRuleLength: '5자 이상 10자 이하',
    nicknameRuleFormat: '영문 소문자와 숫자만 사용',
    nicknameRequired: '회원 아이디를 입력해 주세요.',
    nicknameLengthError: '회원 아이디는 5자 이상 10자 이하로 입력해 주세요.',
    nicknameFormatError: '회원 아이디는 영문 소문자와 숫자만 사용할 수 있습니다.',
    nicknameCreateError: '회원 등록에 실패했습니다. 이미 사용 중인 아이디일 수 있습니다.',
    nicknameUpdateError: '회원 아이디 저장에 실패했습니다.',
    avatarUploadError: '프로필 이미지 업로드에 실패했습니다.',
    avatarUpdateError: '프로필 이미지 저장에 실패했습니다.',
    saveCreate: '회원 등록 완료',
    saveUpdate: '변경사항 저장',
    saving: '저장 중...',
    saved: '회원 정보가 저장되었습니다.',
    registered: '회원 등록이 완료되었습니다.',
    emptyStateTitle: '등록된 회원 정보가 없습니다',
    emptyStateDescription: '회원 아이디와 프로필 이미지를 입력하고 저장하면 관리자 회원 지갑 목록에 바로 추가됩니다.',
    returnToManagement: '가맹점 관리로 돌아가기',
    scopeTitle: 'Registration Scope',
    scopeDescription: '현재 가맹점 화면에서 등록하지만 실제 회원 데이터는 관리자 회원 풀에 저장됩니다.',
    scopeStore: '브랜딩 가맹점',
    scopeAdminPool: '저장 storecode',
    brandingLoadError: '가맹점 브랜딩 정보를 불러오지 못했습니다.',
  },
  en: {
    badge: 'Store Member Registration',
    title: 'Register a member ID for this store',
    description:
      'The member ID and profile image saved here are written into the same member wallet pool used by the admin store-management wallet change modal.',
    helper: 'The page keeps the selected store branding, but the saved member record is stored under `storecode=admin`.',
    walletLabel: 'Connected Wallet',
    walletMissing: 'No wallet detected',
    statusLabel: 'Status',
    statusRegistered: 'Registered',
    statusPending: 'Pending',
    poolLabel: 'Save Target',
    poolValue: 'admin member wallet list',
    storeLabel: 'Store',
    storeMissing: 'Missing storecode query parameter.',
    storecodeRequired: 'The storecode query parameter is required.',
    profileLoadError: 'Could not load the existing member profile. You can still try to register again.',
    signatureError: 'Could not find a signable wallet account.',
    avatarLabel: 'Profile Image',
    avatarHint: 'Upload PNG, JPG, or WEBP images only. Maximum size is 10MB.',
    avatarButton: 'Choose Image',
    avatarChanged: 'A new profile image is ready to upload.',
    nicknameLabel: 'Member ID',
    nicknamePlaceholder: '5-10 lowercase letters or numbers',
    nicknameHint: 'This member ID is what the admin wallet member list will display.',
    nicknameRuleLength: 'Between 5 and 10 characters',
    nicknameRuleFormat: 'Lowercase letters and numbers only',
    nicknameRequired: 'Please enter a member ID.',
    nicknameLengthError: 'Member ID must be between 5 and 10 characters.',
    nicknameFormatError: 'Member ID can only contain lowercase letters and numbers.',
    nicknameCreateError: 'Failed to register the member ID. It may already be in use.',
    nicknameUpdateError: 'Failed to save the member ID.',
    avatarUploadError: 'Failed to upload the profile image.',
    avatarUpdateError: 'Failed to save the profile image.',
    saveCreate: 'Complete Registration',
    saveUpdate: 'Save Changes',
    saving: 'Saving...',
    saved: 'Member profile saved.',
    registered: 'Member registration completed.',
    emptyStateTitle: 'No registered member profile yet',
    emptyStateDescription: 'Save a member ID and profile image here to make this wallet selectable in the admin wallet member list.',
    returnToManagement: 'Back to Store Management',
    scopeTitle: 'Registration Scope',
    scopeDescription: 'This page is opened from a store-branded route, but the actual member record is saved into the shared admin member pool.',
    scopeStore: 'Branding Store',
    scopeAdminPool: 'Saved storecode',
    brandingLoadError: 'Could not load the store branding data.',
  },
};

const toTrimmedString = (value: unknown) => String(value ?? '').trim();

const shortenWalletAddress = (value: string) => {
  const normalized = toTrimmedString(value);
  if (!normalized) return '-';
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const toStoreInitial = (storeName: string, storecode: string) => {
  const label = toTrimmedString(storeName) || toTrimmedString(storecode) || 'S';
  return label.slice(0, 1).toUpperCase();
};

export default function StoreMemberRegistrationPage() {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const locale = lang === 'ko' ? 'ko' : 'en';
  const copy = COPY[locale];
  const searchParams = useSearchParams();
  const storecode = toTrimmedString(searchParams?.get('storecode'));

  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const connectedWallets = useConnectedWallets();
  const walletAddress = toTrimmedString(activeAccount?.address);

  const [loadingStoreBranding, setLoadingStoreBranding] = useState(false);
  const [storeBrandingError, setStoreBrandingError] = useState('');
  const [storeBranding, setStoreBranding] = useState<StoreBranding>({
    storeName: '',
    storeLogo: '',
    backgroundColor: '',
  });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberExists, setMemberExists] = useState(false);
  const [nickname, setNickname] = useState('');
  const [originalNickname, setOriginalNickname] = useState('');
  const [currentAvatar, setCurrentAvatar] = useState(DEFAULT_AVATAR);
  const [previewAvatar, setPreviewAvatar] = useState(DEFAULT_AVATAR);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [profileLoadMessage, setProfileLoadMessage] = useState('');

  const signatureAccount = useMemo<SignMessageAccount | null>(() => {
    const candidates: Array<unknown> = [
      activeAccount,
      activeWallet?.getAccount?.(),
      activeWallet?.getAdminAccount?.(),
    ];

    for (const walletItem of connectedWallets) {
      candidates.push(walletItem?.getAccount?.());
      candidates.push(walletItem?.getAdminAccount?.());
    }

    for (const candidate of candidates) {
      const account = candidate as SignMessageAccount | null | undefined;
      if (account?.address && typeof account.signMessage === 'function') {
        return account;
      }
    }

    return null;
  }, [activeAccount, activeWallet, connectedWallets]);

  const storeQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (storecode) {
      query.set('storecode', storecode);
    }
    const queryString = query.toString();
    return queryString ? `?${queryString}` : '';
  }, [storecode]);

  const storeManagementHref = `/${lang}/p2p/store-management${storeQuery}`;
  const brandColor = useMemo(
    () => resolveStoreBrandColor(storecode || 'store-registration', storeBranding.backgroundColor),
    [storeBranding.backgroundColor, storecode],
  );
  const heroBackground = useMemo(
    () => `radial-gradient(circle at top left, ${rgbaFromHex(brandColor, 0.42)} 0%, ${rgbaFromHex(brandColor, 0.18)} 34%, #08111f 100%)`,
    [brandColor],
  );

  const buildSignedRequestBody = useCallback(
    async ({
      path,
      payload,
    }: {
      path: string;
      payload: Record<string, unknown>;
    }) => {
      if (!signatureAccount?.address || typeof signatureAccount.signMessage !== 'function') {
        throw new Error(copy.signatureError);
      }

      const auth = await createWalletSignatureAuthPayload({
        account: signatureAccount,
        storecode: ADMIN_MEMBER_STORECODE,
        path,
        method: 'POST',
      });

      return {
        ...payload,
        auth,
      };
    },
    [copy.signatureError, signatureAccount],
  );

  useEffect(() => {
    let mounted = true;

    Promise.all([
      getUserPhoneNumber({ client }).catch(() => ''),
      getUserEmail({ client }).catch(() => ''),
    ]).then(([resolvedPhone, resolvedEmail]) => {
      if (!mounted) return;
      setPhoneNumber(toTrimmedString(resolvedPhone));
      setEmail(toTrimmedString(resolvedEmail));
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!storecode) {
      setStoreBranding({
        storeName: '',
        storeLogo: '',
        backgroundColor: '',
      });
      setStoreBrandingError('');
      setLoadingStoreBranding(false);
      return;
    }

    const abortController = new AbortController();
    setLoadingStoreBranding(true);
    setStoreBrandingError('');

    (async () => {
      try {
        const response = await fetch('/api/store/getOneStore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storecode }),
          signal: abortController.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.result) {
          throw new Error(String(payload?.error || copy.brandingLoadError));
        }

        if (abortController.signal.aborted) return;

        setStoreBranding({
          storeName: toTrimmedString(payload.result.storeName),
          storeLogo: toTrimmedString(payload.result.storeLogo),
          backgroundColor: toTrimmedString(payload.result.backgroundColor),
        });
      } catch (error) {
        if (abortController.signal.aborted) return;
        setStoreBranding({
          storeName: '',
          storeLogo: '',
          backgroundColor: '',
        });
        setStoreBrandingError(error instanceof Error ? error.message : copy.brandingLoadError);
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingStoreBranding(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [copy.brandingLoadError, storecode]);

  useEffect(() => {
    if (!walletAddress || !storecode) {
      setLoadingProfile(false);
      setMemberExists(false);
      setNickname('');
      setOriginalNickname('');
      setCurrentAvatar(DEFAULT_AVATAR);
      setPreviewAvatar(DEFAULT_AVATAR);
      setSelectedAvatarFile(null);
      setProfileLoadMessage(storecode ? '' : copy.storecodeRequired);
      return;
    }

    let cancelled = false;
    setLoadingProfile(true);
    setProfileLoadMessage('');

    (async () => {
      try {
        const response = await fetch('/api/user/getUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: ADMIN_MEMBER_STORECODE,
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
  }, [copy.profileLoadError, copy.storecodeRequired, storecode, walletAddress]);

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

    if (!storecode) {
      toast.error(copy.storecodeRequired);
      return;
    }
    if (!walletAddress || saving) return;
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
      const path = memberExists ? '/api/user/updateUser' : '/api/user/setUserVerified';
      const profileBody = await buildSignedRequestBody({
        path,
        payload: {
          ...(memberExists ? {} : { lang }),
          storecode: ADMIN_MEMBER_STORECODE,
          walletAddress,
          nickname: nextNickname,
          ...(phoneNumber ? { mobile: phoneNumber } : {}),
          ...(email ? { email } : {}),
        },
      });

      const profileResponse = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileBody),
      });

      const profilePayload = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok || !profilePayload?.result) {
        throw new Error(String(profilePayload?.error || (memberExists ? copy.nicknameUpdateError : copy.nicknameCreateError)));
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storecode: ADMIN_MEMBER_STORECODE,
            walletAddress,
            avatar: uploadedUrl,
          }),
        });

        const avatarPayload = await avatarResponse.json().catch(() => ({}));
        if (!avatarResponse.ok || !avatarPayload?.result) {
          throw new Error(String(avatarPayload?.error || copy.avatarUpdateError));
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
  const storeName = storeBranding.storeName || storecode;
  const storeLogoStyle = storeBranding.storeLogo
    ? { backgroundImage: `url("${encodeURI(storeBranding.storeLogo)}")` }
    : undefined;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-white/65 bg-white shadow-[0_32px_90px_-48px_rgba(15,23,42,0.45)]">
        <div className="relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7" style={{ backgroundImage: heroBackground }}>
          <div className="absolute -left-10 top-6 h-36 w-36 rounded-full blur-3xl" style={{ backgroundColor: rgbaFromHex(brandColor, 0.2) }} />
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: rgbaFromHex(brandColor, 0.16) }} />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] border border-white/16 bg-white/10 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur">
                {storeBranding.storeLogo ? (
                  <div
                    className="h-full w-full rounded-[22px] border border-white/70 bg-white bg-cover bg-center"
                    style={storeLogoStyle}
                    aria-label={storeName || storecode || 'store logo'}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-white/20 bg-white/10 text-2xl font-black text-white">
                    {toStoreInitial(storeName, storecode)}
                  </div>
                )}
              </div>

              <div className="min-w-0 max-w-3xl">
                <span className="inline-flex items-center rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-50">
                  {copy.badge}
                </span>
                <div className="mt-4 rounded-[28px] border border-white/12 bg-white/8 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/85">
                    {loadingStoreBranding ? 'Loading Store' : copy.storeLabel}
                  </p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                    {storeName || copy.storeMissing}
                  </h1>
                  <p className="mt-2 text-sm font-semibold text-cyan-100/85">
                    {storecode ? `storecode=${storecode}` : copy.storeMissing}
                  </p>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-100/88">
                    {copy.description}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-cyan-100/80">
                    {copy.helper}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
              <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                  {copy.walletLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {walletAddress ? shortenWalletAddress(walletAddress) : copy.walletMissing}
                </p>
              </div>
              <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                  {copy.statusLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {memberExists ? copy.statusRegistered : copy.statusPending}
                </p>
              </div>
              <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                  {copy.storeLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {storecode || copy.storeMissing}
                </p>
              </div>
              <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                  {copy.poolLabel}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {copy.poolValue}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(300px,360px)_1fr]">
        <aside className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f9fbff_0%,#f1f5f9_100%)] p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)] sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: brandColor }}>
            {copy.avatarLabel}
          </p>

          <div className="mt-4 flex flex-col items-center text-center">
            <div
              className="relative flex h-44 w-44 items-center justify-center rounded-[32px] border border-white bg-white/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
              style={{ backgroundImage: `radial-gradient(circle at top, ${rgbaFromHex(brandColor, 0.24)} 0%, #e2e8f0 72%)` }}
            >
              <div
                className="h-full w-full rounded-[28px] border border-white/80 bg-slate-200 bg-cover bg-center shadow-[0_20px_45px_-28px_rgba(15,23,42,0.45)]"
                style={{ backgroundImage: `url("${previewAvatar || DEFAULT_AVATAR}")` }}
                aria-label={copy.avatarLabel}
              />
            </div>

            <label
              className="mt-4 inline-flex h-11 cursor-pointer items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:text-slate-950"
              style={{ boxShadow: `0 18px 34px -28px ${rgbaFromHex(brandColor, 0.55)}` }}
            >
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: brandColor }}>
                  {copy.nicknameLabel}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {copy.nicknameHint}
                </p>
              </div>
              <Link
                href={storeManagementHref}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
              >
                {copy.returnToManagement}
              </Link>
            </div>

            <div className="mt-5 rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: brandColor }}>
                {copy.scopeTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {copy.scopeDescription}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {copy.scopeStore}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {storecode || copy.storeMissing}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {copy.scopeAdminPool}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {ADMIN_MEMBER_STORECODE}
                  </p>
                </div>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-900">
                {copy.nicknameLabel}
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
                disabled={loadingProfile || saving || !storecode}
                className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-semibold tracking-[0.04em] text-slate-900 outline-none transition focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
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

            {storeBrandingError && (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                {storeBrandingError}
              </p>
            )}

            {profileLoadMessage && (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                {profileLoadMessage}
              </p>
            )}

            {!loadingProfile && !memberExists && !profileLoadMessage && (
              <p
                className="mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold"
                style={{ borderColor: rgbaFromHex(brandColor, 0.22), backgroundColor: rgbaFromHex(brandColor, 0.08), color: brandColor }}
              >
                {copy.emptyStateTitle}
                <span className="mt-1 block text-sm font-normal text-slate-700">
                  {copy.emptyStateDescription}
                </span>
              </p>
            )}
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
                disabled={loadingProfile || saving || !walletAddress || !storecode || !hasChanges}
                className={`inline-flex h-12 min-w-[210px] items-center justify-center rounded-2xl px-5 text-sm font-semibold transition ${
                  loadingProfile || saving || !walletAddress || !storecode || !hasChanges
                    ? 'cursor-not-allowed bg-slate-700 text-slate-300'
                    : 'text-slate-950'
                }`}
                style={
                  loadingProfile || saving || !walletAddress || !storecode || !hasChanges
                    ? undefined
                    : { backgroundColor: brandColor }
                }
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
