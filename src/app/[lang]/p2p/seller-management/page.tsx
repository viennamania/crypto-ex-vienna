'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';

import { useClientWallets } from '@/lib/useClientWallets';
import { client } from '@/app/client';

type SellerUser = {
  walletAddress: string;
  nickname?: string;
  avatar?: string;
  seller?: any;
  agentcode?: string;
  storecode?: string;
};

export default function SellerManagementByAgentPage() {
  const params = useParams<{ lang?: string }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const { wallet, wallets } = useClientWallets();
  const activeAccount = useActiveAccount();
  const walletAddress = activeAccount?.address ?? '';

  const [loading, setLoading] = useState(false);
  const [agentcode, setAgentcode] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [agentLogo, setAgentLogo] = useState<string | null>(null);
  const [agentDescription, setAgentDescription] = useState<string | null>(null);
  const [sellers, setSellers] = useState<SellerUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ nickname?: string; avatar?: string } | null>(null);

  const isConnected = Boolean(walletAddress);

  const fetchUser = async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch('/api/user/getUserByWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storecode: 'admin', walletAddress }),
      });
      if (!res.ok) throw new Error('유저 정보를 불러오지 못했습니다.');
      const data = await res.json();
      const code =
        data?.result?.agentcode ||
        data?.result?.user?.agentcode ||
        data?.result?.seller?.agentcode ||
        null;
      const nickname =
        data?.result?.nickname ||
        data?.result?.user?.nickname ||
        data?.result?.seller?.nickname ||
        undefined;
      const avatar =
        data?.result?.avatar ||
        data?.result?.user?.avatar ||
        data?.result?.seller?.avatar ||
        undefined;
      setAgentcode(code);
      setAgentName(data?.result?.agentName || null);
      setAgentLogo(data?.result?.agentLogo || null);
      setUserProfile({ nickname, avatar });
    } catch (e) {
      setError(e instanceof Error ? e.message : '유저 정보를 불러오지 못했습니다.');
    }
  };

  const fetchSellers = async () => {
    if (!agentcode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user/getSellersByAgentcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentcode, limit: 200 }),
      });
      if (!res.ok) throw new Error('판매자 목록을 불러오지 못했습니다.');
      const data = await res.json();
      setSellers(data?.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '판매자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentDetail = async () => {
    if (!agentcode) return;
    try {
      const res = await fetch('/api/agent/getOneAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentcode }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const agent = data?.result;
      setAgentName(agent?.agentName || agentName);
      setAgentLogo(agent?.agentLogo || agentLogo);
      setAgentDescription(agent?.agentDescription || null);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchUser();
  }, [walletAddress]);

  useEffect(() => {
    fetchSellers();
    fetchAgentDetail();
  }, [agentcode]);

  const stats = useMemo(() => {
    const total = sellers.length;
    const confirmed = sellers.filter((s) => s?.seller?.status === 'confirmed').length;
    const pending = total - confirmed;
    return { total, confirmed, pending };
  }, [sellers]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <AutoConnect client={client} wallets={[wallet]} />
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/${lang}/p2p`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
          >
            ← P2P 홈
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">소속 판매자 관리</h1>
          {agentcode && (
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 shadow-sm">
              <div className="relative h-8 w-8 overflow-hidden rounded-full border border-emerald-200 bg-white">
                {agentLogo ? (
                  <Image
                    src={agentLogo}
                    alt={agentName || 'agent'}
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-emerald-700">
                    {agentName?.slice(0, 2)?.toUpperCase() || 'AG'}
                  </span>
                )}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-semibold text-emerald-800">
                  {agentName || '에이전트'}
                </span>
                <span className="text-[11px] font-mono text-emerald-700">{agentcode}</span>
              </div>
            </div>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-600">
            {isConnected && (
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-100">
                  {userProfile?.avatar ? (
                    <Image
                      src={userProfile.avatar}
                      alt={userProfile.nickname || 'me'}
                      fill
                      sizes="32px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-slate-700">
                      {(userProfile?.nickname || walletAddress || 'NA').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] font-semibold text-slate-800">
                    {userProfile?.nickname || '아이디 없음'}
                  </span>
                  <span className="text-[11px] font-mono text-slate-600">
                    {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '주소 없음'}
                  </span>
                </div>
              </div>
            )}
            <span className="rounded-full bg-white px-3 py-1 font-semibold shadow-sm">
              연결 상태: {isConnected ? '연결됨' : '미연결'}
            </span>
          </div>
        </div>
        {agentDescription && (
          <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
            {agentDescription}
          </div>
        )}

        {!isConnected && (
          <div className="mt-6 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            지갑을 연결하면 소속 판매자를 조회할 수 있습니다.
          </div>
        )}

        {isConnected && !agentcode && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            에이전트 권한이 없습니다. 관리자에게 문의하세요.
          </div>
        )}

        {isConnected && agentcode && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">총 소속 판매자</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{stats.total} 명</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-emerald-600">승인됨</p>
                <p className="mt-2 text-2xl font-bold text-emerald-800">{stats.confirmed} 명</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-amber-600">대기</p>
                <p className="mt-2 text-2xl font-bold text-amber-800">{stats.pending} 명</p>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {error}
              </div>
            )}

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">판매자 목록</p>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">프로필</th>
                      <th className="px-4 py-2 text-left">지갑주소</th>
                      <th className="px-4 py-2 text-left">상태</th>
                      <th className="px-4 py-2 text-left">KYC</th>
                      <th className="px-4 py-2 text-left">은행</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-center text-slate-500">
                          불러오는 중...
                        </td>
                      </tr>
                    ) : sellers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-center text-slate-500">
                          소속 판매자가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      sellers.map((seller) => {
                        const status = seller?.seller?.status || 'pending';
                        const kycStatus =
                          seller?.seller?.kyc?.status ||
                          (seller?.seller?.kyc?.idImageUrl ? 'pending' : 'none');
                        const bankInfo = seller?.seller?.bankInfo;
                        const bankLabel =
                          bankInfo?.status === 'approved'
                            ? '승인'
                            : bankInfo?.status === 'rejected'
                            ? '거절'
                            : bankInfo?.status === 'pending'
                            ? '심사중'
                            : '미제출';
                        return (
                          <tr key={seller.walletAddress} className="border-b border-slate-100 hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="relative h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                                  {seller.avatar ? (
                                    <Image
                                      src={seller.avatar}
                                      alt={seller.nickname || 'avatar'}
                                      fill
                                      sizes="40px"
                                      className="object-cover"
                                    />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                                      {(seller.nickname || seller.walletAddress).slice(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate">
                                    {seller.nickname || '닉네임 없음'}
                                  </p>
                                  <p className="text-[11px] font-mono text-slate-500 truncate">
                                    {seller.walletAddress.slice(0, 6)}...{seller.walletAddress.slice(-4)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-slate-700">
                              {seller.walletAddress}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                  status === 'confirmed'
                                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-200/80 bg-amber-50 text-amber-700'
                                }`}
                              >
                                {status === 'confirmed' ? '판매가능' : '대기'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                  kycStatus === 'approved'
                                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                    : kycStatus === 'rejected'
                                    ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                                    : kycStatus === 'pending'
                                    ? 'border-amber-200/80 bg-amber-50 text-amber-700'
                                    : 'border-slate-200/80 bg-slate-50 text-slate-600'
                                }`}
                              >
                                {kycStatus === 'approved'
                                  ? 'KYC 승인'
                                  : kycStatus === 'rejected'
                                  ? 'KYC 거절'
                                  : kycStatus === 'pending'
                                  ? 'KYC 심사중'
                                  : '미제출'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                  bankInfo?.status === 'approved'
                                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                    : bankInfo?.status === 'rejected'
                                    ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                                    : bankInfo?.status === 'pending'
                                    ? 'border-amber-200/80 bg-amber-50 text-amber-700'
                                    : 'border-slate-200/80 bg-slate-50 text-slate-600'
                                }`}
                              >
                                {bankLabel}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
