'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';
import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider';
import GroupChannel from '@sendbird/uikit-react/GroupChannel';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankModalSeller, setBankModalSeller] = useState<SellerUser | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusModalSeller, setStatusModalSeller] = useState<SellerUser | null>(null);
  const [statusForm, setStatusForm] = useState<'confirmed' | 'pending'>('pending');
  const bankOptions = [
    '국민은행',
    '카카오뱅크',
    '케이뱅크',
    '토스뱅크',
    '신한은행',
    '우리은행',
    '농협',
    '기업은행',
    '하나은행',
    '부산은행',
    '경남은행',
    '대구은행',
    '광주은행',
    '전북은행',
    '수협',
    '씨티은행',
    '우체국',
  ];
  const [bankForm, setBankForm] = useState({ bankName: '', accountNumber: '', accountHolder: '' });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [bankStatusForm, setBankStatusForm] = useState<'approved' | 'rejected' | 'pending' | 'none'>('none');
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatSeller, setChatSeller] = useState<SellerUser | null>(null);
  const [chatSessionToken, setChatSessionToken] = useState<string | null>(null);
  const [chatChannelUrl, setChatChannelUrl] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatEnsuringChannel, setChatEnsuringChannel] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatView, setChatView] = useState<'chat'>('chat');
  const currentStatus = statusModalSeller?.seller?.status === 'confirmed' ? 'confirmed' : 'pending';
  const isStatusUnchanged = statusModalSeller ? statusForm === currentStatus : true;

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
        body: JSON.stringify({
          agentcode,
          limit: pageSize,
          page,
          searchTerm: searchTerm.trim(),
        }),
      });
      if (!res.ok) throw new Error('판매자 목록을 불러오지 못했습니다.');
      const data = await res.json();
      setSellers(data?.items || []);
      setTotalCount(data?.totalCount ?? data?.result?.totalCount ?? data?.items?.length ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '판매자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const openBankModal = (seller: SellerUser) => {
    const bankInfo = seller?.seller?.bankInfo || {};
    setBankForm({
      bankName: bankInfo.bankName || '',
      accountNumber: bankInfo.accountNumber || '',
      accountHolder: bankInfo.accountHolder || '',
    });
    const status = bankInfo?.status === 'approved' || bankInfo?.status === 'rejected' || bankInfo?.status === 'pending'
      ? bankInfo.status
      : 'none';
    setBankStatusForm(status);
    setBankModalSeller(seller);
    setBankError(null);
    setBankModalOpen(true);
  };

  const isBankUnchanged = bankModalSeller
    ? (bankModalSeller.seller?.bankInfo?.bankName || '') === bankForm.bankName &&
      (bankModalSeller.seller?.bankInfo?.accountNumber || '') === bankForm.accountNumber &&
      (bankModalSeller.seller?.bankInfo?.accountHolder || '') === bankForm.accountHolder &&
      ((bankModalSeller.seller?.bankInfo?.status as string) || 'none') === bankStatusForm
    : true;

  const openStatusModal = (seller: SellerUser) => {
    const status = seller?.seller?.status === 'confirmed' ? 'confirmed' : 'pending';
    setStatusForm(status);
    setStatusModalSeller(seller);
    setStatusError(null);
    setStatusModalOpen(true);
  };

  const openChatModal = async (seller: SellerUser) => {
    setChatSeller(seller);
    setChatModalOpen(true);
    setChatChannelUrl(null);
    setChatError(null);
    setChatSessionToken(null);
    setChatView('chat');
    if (!walletAddress) {
      setChatError('지갑을 연결해야 채팅할 수 있습니다.');
      return;
    }

    try {
      setChatLoading(true);
      setChatEnsuringChannel(true);

      // 1) 서버에서 두 유저를 생성/보장하고 distinct 1:1 채널을 확보
      const channelRes = await fetch('/api/sendbird/group-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: walletAddress, sellerId: seller.walletAddress }),
      });
      if (!channelRes.ok) {
        const msg = (await channelRes.json().catch(() => null))?.error || '채팅 채널을 만들지 못했습니다.';
        throw new Error(msg);
      }
      const channelData = await channelRes.json();
      const channelUrl = channelData?.channelUrl;
      if (!channelUrl) {
        throw new Error('채널 URL이 응답에 없습니다.');
      }

      // 2) 내 세션 토큰 발급
      const tokenRes = await fetch('/api/sendbird/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: walletAddress,
          nickname: userProfile?.nickname || walletAddress,
        }),
      });
      if (!tokenRes.ok) {
        const msg = (await tokenRes.json().catch(() => null))?.error || '채팅 세션을 만들지 못했습니다.';
        throw new Error(msg);
      }
      const tokenData = await tokenRes.json();

      setChatChannelUrl(channelUrl);
      setChatSessionToken(tokenData.sessionToken);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : '채팅을 불러오지 못했습니다.');
    } finally {
      setChatLoading(false);
      setChatEnsuringChannel(false);
    }
  };

  const handleSaveBank = async () => {
    if (!bankModalSeller) return;
    const prev = bankModalSeller.seller?.bankInfo || {};
    if (
      (prev.bankName || '') === bankForm.bankName &&
      (prev.accountNumber || '') === bankForm.accountNumber &&
      (prev.accountHolder || '') === bankForm.accountHolder &&
      ((prev.status as string) || 'none') === bankStatusForm
    ) {
      setBankError('변경된 내용이 없습니다.');
      return;
    }
    setBankSaving(true);
    setBankError(null);
    try {
      const updatedSeller = {
        ...(bankModalSeller.seller || {}),
        bankInfo: {
          bankName: bankForm.bankName,
          accountNumber: bankForm.accountNumber,
          accountHolder: bankForm.accountHolder,
          status: bankStatusForm,
        },
        bankInfoHistory: [
          ...(Array.isArray(bankModalSeller.seller?.bankInfoHistory) ? bankModalSeller.seller.bankInfoHistory : []),
          {
            bankName: bankForm.bankName,
            accountNumber: bankForm.accountNumber,
            accountHolder: bankForm.accountHolder,
            status: bankStatusForm,
            updatedAt: new Date().toISOString(),
            updatedBy: walletAddress || 'self',
          },
        ],
        bankInfoStatusHistory: [
          ...(Array.isArray(bankModalSeller.seller?.bankInfoStatusHistory)
            ? bankModalSeller.seller.bankInfoStatusHistory
            : []),
          {
            status: bankStatusForm,
            updatedAt: new Date().toISOString(),
            updatedBy: walletAddress || 'self',
          },
        ],
      };

      const res = await fetch('/api/user/updateSellerInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: bankModalSeller.storecode || 'admin',
          walletAddress: bankModalSeller.walletAddress,
          seller: updatedSeller,
          bankName: bankForm.bankName,
          accountNumber: bankForm.accountNumber,
          accountHolder: bankForm.accountHolder,
        }),
      });
      if (!res.ok) {
        const msg = (await res.json())?.error || '은행 정보를 저장하지 못했습니다.';
        throw new Error(msg);
      }
      await fetchSellers();
      setBankModalOpen(false);
      setBankModalSeller(null);
    } catch (e) {
      setBankError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBankSaving(false);
    }
  };

  const handleSaveStatus = async () => {
    if (!statusModalSeller) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const current = statusModalSeller?.seller?.status === 'confirmed' ? 'confirmed' : 'pending';
      if (statusForm === current) {
        setStatusError('변경된 상태가 없습니다.');
        return;
      }
      const updatedSeller = {
        ...(statusModalSeller.seller || {}),
        status: statusForm,
        statusHistory: [
          ...(Array.isArray(statusModalSeller.seller?.statusHistory)
            ? statusModalSeller.seller.statusHistory
            : []),
          {
            status: statusForm,
            updatedAt: new Date().toISOString(),
            updatedBy: walletAddress || 'self',
          },
        ],
      };

      const res = await fetch('/api/user/updateSellerInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: statusModalSeller.storecode || 'admin',
          walletAddress: statusModalSeller.walletAddress,
          seller: updatedSeller,
          sellerStatus: statusForm,
        }),
      });
      if (!res.ok) {
        const msg = (await res.json())?.error || '상태를 저장하지 못했습니다.';
        throw new Error(msg);
      }
      await fetchSellers();
      setStatusModalOpen(false);
      setStatusModalSeller(null);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setStatusSaving(false);
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
  }, [agentcode, page, searchTerm]);

  const stats = useMemo(() => {
    const total = sellers.length;
    const confirmed = sellers.filter((s) => s?.seller?.status === 'confirmed').length;
    const pending = total - confirmed;
    return { total, confirmed, pending };
  }, [sellers]);

  return (
    <>
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm sm:min-w-[260px]">
            <Image src="/icon-search.png" alt="Search" width={16} height={16} className="h-4 w-4 opacity-70" />
            <input
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="닉네임, 지갑주소 등 검색"
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setPage(1);
                }}
                className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
              >
                Clear
              </button>
            )}
          </div>
          <span className="text-xs font-semibold text-slate-600">
            {sellers.length} / {totalCount || sellers.length} 명
          </span>
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
                      <th className="px-4 py-2 text-left">에스크로 지갑</th>
                      <th className="px-4 py-2 text-left">상태</th>
                      <th className="px-4 py-2 text-left">판매금액</th>
                      <th className="px-4 py-2 text-left">KYC</th>
                      <th className="px-4 py-2 text-left">은행</th>
                      <th className="px-4 py-2 text-right">채팅</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 text-center text-slate-500">
                          불러오는 중...
                        </td>
                      </tr>
                    ) : sellers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 text-center text-slate-500">
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
                              {seller?.seller?.escrowWalletAddress
                                ? `${seller.seller.escrowWalletAddress.slice(0, 6)}...${seller.seller.escrowWalletAddress.slice(-4)}`
                                : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                    status === 'confirmed'
                                      ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                      : 'border-amber-200/80 bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  {status === 'confirmed' ? '판매가능' : '대기'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openStatusModal(seller)}
                                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                                >
                                  상태 변경
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                                {seller?.seller?.usdtToKrwRate
                                  ? `${Number(seller.seller.usdtToKrwRate).toLocaleString()} KRW/USDT`
                                  : '-'}
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
                              <div className="flex flex-col gap-1">
                                <div className="flex flex-wrap items-center gap-2">
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
                                  {bankInfo?.bankName && (
                                    <span className="text-xs font-semibold text-slate-800">
                                      {bankInfo.bankName} · {bankInfo.accountHolder}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                  {bankInfo?.accountNumber && (
                                    <span className="text-[11px] font-mono text-slate-600">
                                      {bankInfo.accountNumber}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openBankModal(seller)}
                                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                                  >
                                    은행 정보 수정
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => openChatModal(seller)}
                                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
                                >
                                  채팅하기
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {!loading && sellers.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
                  <span>
                    {totalCount === 0
                      ? '0건'
                      : `${(page - 1) * pageSize + 1} - ${Math.min(page * pageSize, totalCount)} / ${totalCount}건`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || loading}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        page <= 1 || loading
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                      }`}
                    >
                      ← 이전
                    </button>
                    <span className="px-2 text-xs font-semibold text-slate-500">페이지 {page}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const maxPage = Math.max(1, Math.ceil((totalCount || sellers.length) / pageSize));
                        setPage((p) => Math.min(maxPage, p + 1));
                      }}
                      disabled={page >= Math.ceil((totalCount || sellers.length) / pageSize) || loading}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        page >= Math.ceil((totalCount || sellers.length) / pageSize) || loading
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:shadow'
                      }`}
                    >
                      다음 →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
    {bankModalOpen && bankModalSeller && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Bank Info</p>
              <h3 className="text-lg font-bold text-slate-900">은행 정보 수정</h3>
              <div className="mt-2 flex items-center gap-3">
                <div className="relative h-9 w-9 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  {bankModalSeller.avatar ? (
                    <Image
                      src={bankModalSeller.avatar}
                      alt={bankModalSeller.nickname || 'avatar'}
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                      {(bankModalSeller.nickname || bankModalSeller.walletAddress).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {bankModalSeller.nickname || '닉네임 없음'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">
                    {bankModalSeller.walletAddress.slice(0, 6)}...{bankModalSeller.walletAddress.slice(-4)}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setBankModalOpen(false);
                setBankModalSeller(null);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">은행명</label>
              <select
                value={bankForm.bankName}
                onChange={(e) => setBankForm((p) => ({ ...p, bankName: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none"
              >
                <option value="">은행을 선택하세요</option>
                {bankOptions.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">은행 목록에서 선택하세요.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600">은행 상태</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'none', label: '미제출', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
                  { key: 'pending', label: '심사중', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
                  { key: 'approved', label: '승인', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
                  { key: 'rejected', label: '거절', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setBankStatusForm(opt.key as any)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      bankStatusForm === opt.key
                        ? `${opt.tone} shadow-sm`
                        : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:shadow'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">상태에 따라 지급 가능 여부가 반영됩니다.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">계좌번호</label>
              <input
                value={bankForm.accountNumber}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\\D+/g, '');
                  setBankForm((p) => ({ ...p, accountNumber: digits }));
                }}
                onKeyDown={(e) => {
                  const allow = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'];
                  if (allow.includes(e.key)) return;
                  if (!/^[0-9]$/.test(e.key)) e.preventDefault();
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none"
                placeholder="계좌번호 입력"
                inputMode="numeric"
                pattern="\\d*"
              />
              <p className="text-[11px] text-slate-500">숫자만 입력됩니다.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">예금주</label>
              <input
                value={bankForm.accountHolder}
                onChange={(e) => setBankForm((p) => ({ ...p, accountHolder: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none"
                placeholder="예금주 입력"
              />
              <p className="text-[11px] text-slate-500">통장 예금주 성함을 입력하세요.</p>
            </div>
            {Array.isArray(bankModalSeller.seller?.bankInfoHistory) && bankModalSeller.seller.bankInfoHistory.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-600 mb-1">변경 이력</p>
                <div className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-slate-600">
                  {[...bankModalSeller.seller.bankInfoHistory].reverse().map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">
                          {item.bankName} · {item.accountHolder} · {item.status || '미제출'}
                        </p>
                        <p className="font-mono text-slate-500">{item.accountNumber}</p>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bankError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {bankError}
              </div>
            )}
            <button
              disabled={bankSaving || isBankUnchanged}
              onClick={handleSaveBank}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-70"
            >
              {bankSaving ? '저장 중...' : '저장'}
            </button>
            {isBankUnchanged && (
              <p className="text-[11px] text-amber-600">변경된 내용이 있어야 저장할 수 있습니다.</p>
            )}
          </div>
        </div>
      </div>
    )}
    {chatModalOpen && chatSeller && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Chat</p>
              <h3 className="text-lg font-bold text-slate-900">판매자와 채팅</h3>
              <div className="mt-2 flex items-center gap-3">
                <div className="relative h-9 w-9 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  {chatSeller.avatar ? (
                    <Image
                      src={chatSeller.avatar}
                      alt={chatSeller.nickname || 'avatar'}
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                      {(chatSeller.nickname || chatSeller.walletAddress).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {chatSeller.nickname || '닉네임 없음'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">
                    {chatSeller.walletAddress.slice(0, 6)}...{chatSeller.walletAddress.slice(-4)}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setChatModalOpen(false);
                setChatSeller(null);
                setChatSessionToken(null);
                setChatChannelUrl(null);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
          <div className="px-5 py-4">
            {chatError && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {chatError}
              </div>
            )}
            {!chatError && (chatLoading || chatEnsuringChannel || !chatSessionToken || !chatChannelUrl) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {chatLoading || !chatSessionToken
                  ? '채팅 세션을 준비 중입니다...'
                  : chatEnsuringChannel
                  ? '1:1 채널을 준비 중입니다...'
                  : '채널을 불러오는 중입니다...'}
              </div>
            )}
            {!chatError && chatSessionToken && chatChannelUrl && walletAddress && (
              <SendbirdProvider
                appId={process.env.NEXT_PUBLIC_SENDBIRD_APP_ID || ''}
                userId={walletAddress}
                accessToken={chatSessionToken}
                theme="light"
              >
                <div className="h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <GroupChannel channelUrl={chatChannelUrl} />
                </div>
              </SendbirdProvider>
            )}
          </div>
        </div>
      </div>
    )}
    {statusModalOpen && statusModalSeller && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
              <h3 className="text-lg font-bold text-slate-900">판매자 상태 변경</h3>
              <div className="mt-2 flex items-center gap-3">
                <div className="relative h-9 w-9 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  {statusModalSeller.avatar ? (
                    <Image
                      src={statusModalSeller.avatar}
                      alt={statusModalSeller.nickname || 'avatar'}
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600">
                      {(statusModalSeller.nickname || statusModalSeller.walletAddress).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {statusModalSeller.nickname || '닉네임 없음'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">
                    {statusModalSeller.walletAddress.slice(0, 6)}...{statusModalSeller.walletAddress.slice(-4)}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setStatusModalOpen(false);
                setStatusModalSeller(null);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
            <div className="space-y-3 px-5 py-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">상태</label>
                <div className="flex gap-2">
                  <button
                  type="button"
                  onClick={() => setStatusForm('confirmed')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    statusForm === 'confirmed'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  판매가능
                </button>
                <button
                  type="button"
                  onClick={() => setStatusForm('pending')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    statusForm === 'pending'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  대기
                </button>
              </div>
                  <p className="text-[11px] text-slate-500">상태를 변경하면 즉시 반영됩니다.</p>
                  {isStatusUnchanged && (
                    <p className="text-[11px] text-amber-600">현재 상태와 동일합니다. 다른 상태를 선택하세요.</p>
                  )}
              </div>
            {Array.isArray(statusModalSeller.seller?.statusHistory) &&
              statusModalSeller.seller.statusHistory.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-600 mb-1">상태 이력</p>
                  <div className="max-h-32 space-y-1 overflow-y-auto text-[11px] text-slate-600">
                    {[...statusModalSeller.seller.statusHistory].reverse().map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-white px-2 py-1">
                        <span className="font-semibold text-slate-800">
                          {item.status === 'confirmed' ? '판매가능' : '대기'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                {statusError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    {statusError}
                  </div>
                )}
            <button
              disabled={statusSaving || isStatusUnchanged}
              onClick={handleSaveStatus}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-70"
            >
              {statusSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
