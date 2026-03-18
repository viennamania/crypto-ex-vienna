'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AutoConnect, useActiveAccount, useActiveWallet, useConnectedWallets } from 'thirdweb/react';

import { client } from '@/app/client';
import CenterLayoutShell from '@/components/CenterLayoutShell';
import {
  getCenterRegistrationHref,
  normalizeAddress,
  resolveCenterRouteAccess,
  shortWalletAddress,
} from '@/components/center/centerShellMenu';
import { useClientWallets } from '@/lib/useClientWallets';

type CenterSubpageAccessGateProps = {
  lang: string;
  center: string;
  children: ReactNode;
};

type CenterMemberInfo = {
  nickname?: string;
  role?: string;
  email?: string;
  mobile?: string;
  seller?: Record<string, unknown> | null;
  avatar?: string;
  walletAddress?: string;
};

type CenterStoreInfo = {
  storeName?: string;
  storeLogo?: string;
  adminWalletAddress?: string;
};

const WALLET_AUTH_OPTIONS = ['google', 'email'];

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export default function CenterSubpageAccessGate({
  lang,
  center,
  children,
}: CenterSubpageAccessGateProps) {
  const pathname = usePathname() || '';
  const { wallet } = useClientWallets({
    authOptions: WALLET_AUTH_OPTIONS,
    sponsorGas: true,
    forceSmartAccount: true,
  });
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const connectedWallets = useConnectedWallets();
  const walletAddress = useMemo(() => {
    const candidates = [
      String(activeAccount?.address || '').trim(),
      String(activeWallet?.getAccount?.()?.address || '').trim(),
      ...connectedWallets.map((item) => String(item?.getAccount?.()?.address || '').trim()),
    ];

    return candidates.find(Boolean) || '';
  }, [activeAccount?.address, activeWallet, connectedWallets]);

  const [loadingMember, setLoadingMember] = useState(false);
  const [checkedMember, setCheckedMember] = useState(false);
  const [memberInfo, setMemberInfo] = useState<CenterMemberInfo | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [loadingStore, setLoadingStore] = useState(false);
  const [storeInfo, setStoreInfo] = useState<CenterStoreInfo | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setLoadingMember(false);
      setCheckedMember(false);
      setMemberInfo(null);
      setMemberError(null);
      return;
    }

    const abortController = new AbortController();
    setLoadingMember(true);
    setCheckedMember(false);
    setMemberInfo(null);
    setMemberError(null);

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
          signal: abortController.signal,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String((payload as Record<string, unknown>)?.error || '회원 정보를 조회하지 못했습니다.'));
        }

        const result = isObjectRecord((payload as Record<string, unknown>)?.result)
          ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
          : null;

        setMemberInfo(
          result
            ? {
                nickname: String(result.nickname || '').trim(),
                role: String(result.role || '').trim(),
                email: String(result.email || '').trim(),
                mobile: String(result.mobile || '').trim(),
                seller: isObjectRecord(result.seller) ? result.seller : null,
                avatar: String(result.avatar || '').trim(),
                walletAddress: String(result.walletAddress || walletAddress).trim(),
              }
            : null,
        );
        setCheckedMember(true);
      } catch (error) {
        if (abortController.signal.aborted) return;
        setMemberInfo(null);
        setCheckedMember(true);
        setMemberError(error instanceof Error ? error.message : '회원 정보를 조회하지 못했습니다.');
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingMember(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [center, walletAddress]);

  useEffect(() => {
    const abortController = new AbortController();
    setLoadingStore(true);
    setStoreInfo(null);
    setStoreError(null);

    (async () => {
      try {
        const response = await fetch('/api/store/getOneStore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storecode: center,
          }),
          signal: abortController.signal,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String((payload as Record<string, unknown>)?.error || '센터 정보를 조회하지 못했습니다.'));
        }

        const result = isObjectRecord((payload as Record<string, unknown>)?.result)
          ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
          : {};

        setStoreInfo({
          storeName: String(result.storeName || center).trim(),
          storeLogo: String(result.storeLogo || '').trim(),
          adminWalletAddress: String(result.adminWalletAddress || '').trim(),
        });
      } catch (error) {
        if (abortController.signal.aborted) return;
        setStoreInfo({
          storeName: center,
          storeLogo: '',
          adminWalletAddress: '',
        });
        setStoreError(error instanceof Error ? error.message : '센터 정보를 조회하지 못했습니다.');
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingStore(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [center]);

  const registrationHref = getCenterRegistrationHref(lang, center);
  const routeAccess = resolveCenterRouteAccess(pathname, lang, center);
  const normalizedWalletAddress = normalizeAddress(walletAddress);
  const normalizedStoreAdminWalletAddress = normalizeAddress(storeInfo?.adminWalletAddress || '');
  const isStoreAdmin = Boolean(
    normalizedWalletAddress
      && normalizedStoreAdminWalletAddress
      && normalizedWalletAddress === normalizedStoreAdminWalletAddress,
  );
  const isPlatformAdmin = memberInfo?.role === 'admin';
  const hasSellerPermission = Boolean(memberInfo?.seller);
  const hasAccess =
    routeAccess.accessLevel === 'registration'
      ? Boolean(walletAddress)
      : routeAccess.accessLevel === 'member'
        ? Boolean(memberInfo)
        : routeAccess.accessLevel === 'seller'
          ? Boolean(memberInfo) && (hasSellerPermission || isPlatformAdmin || isStoreAdmin)
          : Boolean(memberInfo) && (isPlatformAdmin || isStoreAdmin);

  const roleLabel = memberInfo
    ? (isPlatformAdmin ? '플랫폼 관리자' : isStoreAdmin ? '센터 관리자' : hasSellerPermission ? '판매 회원' : '일반 회원')
    : walletAddress
      ? '회원 정보 확인 중'
      : '지갑 연결 필요';
  const isMemberCheckPending = Boolean(walletAddress)
    && routeAccess.accessLevel !== 'registration'
    && (!checkedMember || loadingMember);
  const isStoreCheckPending = routeAccess.accessLevel === 'center_admin'
    && (loadingStore || !storeInfo);

  return (
    <CenterLayoutShell
      lang={lang}
      center={center}
      storeName={storeInfo?.storeName || center}
      storeLogo={storeInfo?.storeLogo || ''}
      memberNickname={memberInfo?.nickname || ''}
      walletAddress={walletAddress}
      roleLabel={roleLabel}
      routeAccessLevel={routeAccess.accessLevel}
    >
      <AutoConnect client={client} wallets={[wallet]} />

      {!walletAddress ? (
        <section className="rounded-[28px] border border-rose-200 bg-[linear-gradient(160deg,#fff7f7_0%,#fff1f2_100%)] px-6 py-7 shadow-[0_28px_64px_-42px_rgba(225,29,72,0.35)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700">Access Blocked</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            자동 연결된 지갑이 없어 접근할 수 없습니다.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            이 센터 페이지는 `thirdweb AutoConnect`로 연결된 지갑만 확인합니다.
            자동 연결된 지갑이 없으면 페이지를 열 수 없습니다.
          </p>
        </section>
      ) : isMemberCheckPending || isStoreCheckPending ? (
        <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-7 shadow-[0_22px_48px_-36px_rgba(15,23,42,0.32)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Checking</p>
          <h1 className="mt-3 text-xl font-semibold text-slate-950">회원 정보와 접근 권한을 확인하고 있습니다.</h1>
          <p className="mt-3 text-sm text-slate-600">
            연결된 지갑: <span className="font-mono text-slate-900">{shortWalletAddress(walletAddress)}</span>
          </p>
        </section>
      ) : routeAccess.accessLevel !== 'registration' && checkedMember && !memberInfo ? (
        <section className="rounded-[30px] border border-amber-200 bg-[linear-gradient(160deg,#fffef4_0%,#fffbeb_100%)] px-6 py-7 shadow-[0_26px_56px_-38px_rgba(217,119,6,0.36)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">Member Required</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            연결된 지갑의 회원 정보가 없어 접근할 수 없습니다.
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            회원 등록을 완료한 뒤 다시 접근하세요.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={registrationHref}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              회원 등록 페이지로 이동
            </Link>
            <p className="text-xs text-slate-500">{memberError ? `조회 오류: ${memberError}` : `지갑 ${shortWalletAddress(walletAddress)}`}</p>
          </div>
        </section>
      ) : !hasAccess ? (
        <section className="rounded-[30px] border border-rose-200 bg-[linear-gradient(160deg,#fff5f7_0%,#fff1f2_100%)] px-6 py-7 shadow-[0_28px_62px_-42px_rgba(225,29,72,0.36)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700">Permission Denied</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            현재 계정에는 이 페이지 권한이 없습니다.
          </h1>
          <div className="mt-4 space-y-2 rounded-2xl border border-rose-200 bg-white/85 px-4 py-4 text-sm text-slate-700">
            <p>요구 권한: <span className="font-semibold text-slate-950">{routeAccess.label}</span></p>
            <p>현재 권한: <span className="font-semibold text-slate-950">{roleLabel}</span></p>
            <p>연결 지갑: <span className="font-mono text-slate-950">{shortWalletAddress(walletAddress)}</span></p>
            {storeInfo?.adminWalletAddress && (
              <p>센터 관리자 지갑: <span className="font-mono text-slate-950">{shortWalletAddress(storeInfo.adminWalletAddress)}</span></p>
            )}
            {storeError && <p className="text-xs text-rose-700">센터 조회 오류: {storeError}</p>}
          </div>
        </section>
      ) : (
        children
      )}
    </CenterLayoutShell>
  );
}
