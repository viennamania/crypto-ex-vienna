'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { AutoConnect, useActiveAccount } from 'thirdweb/react';

import { ConnectButton } from '@/components/OrangeXConnectButton';
import { useClientWallets } from '@/lib/useClientWallets';
import { client } from '@/app/client';

type EscrowWalletItem = {
  id: string;
  agentcode: string;
  label: string;
  walletAddress: string;
  createdByWalletAddress: string;
  createdAt: string;
  engineWalletId?: string;
};

const shortAddress = (value?: string | null) => {
  const source = String(value || '').trim();
  if (!source) return '-';
  if (source.length <= 12) return source;
  return `${source.slice(0, 6)}...${source.slice(-4)}`;
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function AgentEscrowWalletManagementPage() {
  const params = useParams<{ lang?: string }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const searchParams = useSearchParams();
  const agentcodeParam = searchParams?.get('agentcode') || null;

  const { wallet } = useClientWallets();
  const activeAccount = useActiveAccount();
  const walletAddress = activeAccount?.address ?? '';
  const isConnected = Boolean(walletAddress);

  const [agentcode, setAgentcode] = useState<string | null>(agentcodeParam || null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [agentLogo, setAgentLogo] = useState<string | null>(null);
  const [agentAdminWalletAddress, setAgentAdminWalletAddress] = useState<string | null>(null);
  const [userNickname, setUserNickname] = useState<string | null>(null);

  const [walletItems, setWalletItems] = useState<EscrowWalletItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [createLabel, setCreateLabel] = useState('');
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedWalletAddress, setCopiedWalletAddress] = useState<string | null>(null);

  const normalizedConnectedWallet = walletAddress.trim().toLowerCase();
  const normalizedAdminWallet = (agentAdminWalletAddress || '').trim().toLowerCase();
  const hasAdminWallet = Boolean(normalizedAdminWallet);
  const isAgentAdmin = Boolean(normalizedConnectedWallet && hasAdminWallet && normalizedConnectedWallet === normalizedAdminWallet);

  const fetchAgentDetail = async (targetAgentcode: string) => {
    const response = await fetch('/api/agent/getOneAgent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentcode: targetAgentcode }),
    });
    if (!response.ok) return;
    const data = await response.json();
    const agent = data?.result;
    if (agent?.agentName) setAgentName(agent.agentName);
    if (agent?.agentLogo) setAgentLogo(agent.agentLogo);
    if (agent?.adminWalletAddress) {
      setAgentAdminWalletAddress(String(agent.adminWalletAddress));
    } else {
      setAgentAdminWalletAddress(null);
    }
  };

  const fetchUserContext = async () => {
    if (!walletAddress) return;
    try {
      const userResponse = await fetch('/api/user/getUserByWalletAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storecode: 'admin', walletAddress }),
      });
      if (!userResponse.ok) {
        return;
      }
      const userData = await userResponse.json();
      const user = userData?.result;
      if (user?.nickname) {
        setUserNickname(user.nickname);
      }

      let nextAgentcode =
        agentcodeParam ||
        user?.agentcode ||
        user?.user?.agentcode ||
        user?.seller?.agentcode ||
        null;

      if (!nextAgentcode) {
        const agentResponse = await fetch(
          `/api/agents?adminWalletAddress=${encodeURIComponent(walletAddress)}&limit=1`
        );
        if (agentResponse.ok) {
          const agentData = await agentResponse.json();
          const agent = Array.isArray(agentData?.items) ? agentData.items[0] : null;
          if (agent?.agentcode) {
            nextAgentcode = String(agent.agentcode);
            if (agent?.agentName) setAgentName(agent.agentName);
            if (agent?.agentLogo) setAgentLogo(agent.agentLogo);
            if (agent?.adminWalletAddress) {
              setAgentAdminWalletAddress(String(agent.adminWalletAddress));
            }
          }
        }
      }

      if (nextAgentcode) {
        setAgentcode(nextAgentcode);
        await fetchAgentDetail(nextAgentcode);
      }
    } catch (error) {
      // ignore user context errors on UI
    }
  };

  const fetchWalletList = async (targetAgentcode: string) => {
    if (!walletAddress) return;
    setLoadingList(true);
    setListError(null);
    try {
      const response = await fetch(
        `/api/agent/escrow-wallets?agentcode=${encodeURIComponent(targetAgentcode)}&requesterWalletAddress=${encodeURIComponent(walletAddress)}&limit=200`
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || '에스크로 지갑 목록을 불러오지 못했습니다.');
      }
      const items = Array.isArray(data?.result?.items) ? data.result.items : [];
      setWalletItems(items);
      const agent = data?.result?.agent;
      if (agent?.agentName) setAgentName(agent.agentName);
      if (agent?.agentLogo) setAgentLogo(agent.agentLogo);
      if (agent?.adminWalletAddress) {
        setAgentAdminWalletAddress(String(agent.adminWalletAddress));
      } else {
        setAgentAdminWalletAddress(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '에스크로 지갑 목록을 불러오지 못했습니다.';
      setListError(message);
      setWalletItems([]);
    } finally {
      setLoadingList(false);
    }
  };

  const handleCreateWallet = async () => {
    if (!agentcode || !walletAddress || creatingWallet) return;
    setCreateError(null);
    setCreatingWallet(true);
    try {
      const response = await fetch('/api/agent/escrow-wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentcode,
          requesterWalletAddress: walletAddress,
          label: createLabel.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || '에스크로 지갑 생성에 실패했습니다.');
      }

      const createdItem = data?.result?.item as EscrowWalletItem | undefined;
      if (createdItem) {
        setWalletItems((prev) => {
          const exists = prev.some(
            (item) => item.walletAddress.toLowerCase() === createdItem.walletAddress.toLowerCase()
          );
          if (exists) return prev;
          return [createdItem, ...prev];
        });
      }
      setCreateLabel('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '에스크로 지갑 생성에 실패했습니다.';
      setCreateError(message);
    } finally {
      setCreatingWallet(false);
    }
  };

  const handleCopyWalletAddress = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedWalletAddress(value);
      setTimeout(() => {
        setCopiedWalletAddress((current) => (current === value ? null : current));
      }, 1600);
    } catch {
      // ignore clipboard error
    }
  };

  useEffect(() => {
    if (agentcodeParam) {
      setAgentcode(agentcodeParam);
      fetchAgentDetail(agentcodeParam);
    }
  }, [agentcodeParam]);

  useEffect(() => {
    fetchUserContext();
  }, [walletAddress, agentcodeParam]);

  useEffect(() => {
    if (!agentcode || !walletAddress) return;
    fetchWalletList(agentcode);
  }, [agentcode, walletAddress]);

  const stats = useMemo(() => {
    return {
      total: walletItems.length,
      latestCreatedAt: walletItems[0]?.createdAt || null,
    };
  }, [walletItems]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <AutoConnect client={client} wallets={[wallet]} />

      <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/${lang}/p2p/seller-management${agentcode ? `?agentcode=${encodeURIComponent(agentcode)}` : ''}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
          >
            ← 소속 판매자 관리
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">에스크로 지갑관리</h1>
          {agentcode && (
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 shadow-sm">
              <div className="relative h-8 w-8 overflow-hidden rounded-full border border-emerald-200 bg-white">
                {agentLogo ? (
                  <Image src={agentLogo} alt={agentName || 'agent'} fill sizes="32px" className="object-cover" />
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
          <span className="ml-auto rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
            연결 상태: {isConnected ? '연결됨' : '미연결'}
          </span>
        </div>

        {!isConnected && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>지갑을 연결하면 에스크로 지갑을 관리할 수 있습니다.</span>
            <ConnectButton
              client={client}
              wallets={[wallet]}
              theme="light"
              locale="ko_KR"
              connectButton={{
                label: '지갑 연결하기',
                className:
                  'inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow hover:text-amber-800 hover:bg-amber-50',
              }}
            />
          </div>
        )}

        {isConnected && !agentcode && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            관리할 에이전트 코드가 없습니다. `agentcode` 파라미터를 확인해주세요.
          </div>
        )}

        {isConnected && agentcode && (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 shadow-sm ${
              hasAdminWallet
                ? isAgentAdmin
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-rose-200 bg-rose-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  hasAdminWallet
                    ? isAgentAdmin
                      ? 'bg-emerald-600 text-white'
                      : 'bg-rose-600 text-white'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {hasAdminWallet ? (isAgentAdmin ? '✓' : '!') : '?'}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-extrabold ${
                    hasAdminWallet
                      ? isAgentAdmin
                        ? 'text-emerald-900'
                        : 'text-rose-800'
                      : 'text-amber-800'
                  }`}
                >
                  {hasAdminWallet
                    ? isAgentAdmin
                      ? '현재 지갑은 이 에이전트의 관리자 지갑입니다.'
                      : '현재 지갑은 이 에이전트의 관리자 지갑이 아닙니다.'
                    : '이 에이전트의 관리자 지갑이 등록되지 않았습니다.'}
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  관리자 지갑: <span className="font-mono font-semibold">{shortAddress(agentAdminWalletAddress)}</span>
                </p>
                <p className="text-xs text-slate-700">
                  내 지갑: <span className="font-mono font-semibold">{shortAddress(walletAddress)}</span>
                </p>
                {userNickname && (
                  <p className="text-xs text-slate-700">
                    로그인 닉네임: <span className="font-semibold">{userNickname}</span>
                  </p>
                )}
              </div>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-[11px] font-extrabold tracking-[0.08em] ${
                  hasAdminWallet
                    ? isAgentAdmin
                      ? 'bg-emerald-700 text-white'
                      : 'bg-rose-600 text-white'
                    : 'bg-amber-600 text-white'
                }`}
              >
                {hasAdminWallet ? (isAgentAdmin ? 'ADMIN VERIFIED' : 'NOT ADMIN') : 'ADMIN WALLET MISSING'}
              </span>
            </div>
          </div>
        )}

        {isConnected && agentcode && isAgentAdmin && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">등록된 에스크로 지갑</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{stats.total} 개</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">최근 생성 시각</p>
                <p className="mt-2 text-base font-bold text-slate-900">{formatDateTime(stats.latestCreatedAt || undefined)}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-4 py-4 shadow-[0_20px_50px_-40px_rgba(5,150,105,0.85)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
                    지갑 라벨
                  </label>
                  <input
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    placeholder="예) 에스크로지갑-1"
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                </div>
                <button
                  type="button"
                  disabled={creatingWallet}
                  onClick={handleCreateWallet}
                  className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold text-white transition ${
                    creatingWallet
                      ? 'cursor-not-allowed bg-emerald-300'
                      : 'bg-emerald-600 hover:-translate-y-0.5 hover:bg-emerald-700'
                  }`}
                >
                  {creatingWallet ? '생성 중...' : '새 에스크로 지갑 생성'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (agentcode) fetchWalletList(agentcode);
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow"
                >
                  목록 새로고침
                </button>
              </div>
              {createError && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {createError}
                </p>
              )}
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">에스크로 지갑 목록</p>
                <span className="text-xs font-semibold text-slate-500">{walletItems.length} 개</span>
              </div>

              {listError && (
                <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {listError}
                </div>
              )}

              <div className="max-h-[65vh] overflow-y-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left">라벨</th>
                      <th className="px-4 py-2 text-left">지갑주소</th>
                      <th className="px-4 py-2 text-left">생성자</th>
                      <th className="px-4 py-2 text-left">생성일시</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {loadingList ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-5 text-center text-slate-500">
                          목록을 불러오는 중...
                        </td>
                      </tr>
                    ) : walletItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-5 text-center text-slate-500">
                          생성된 에스크로 지갑이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      walletItems.map((item) => (
                        <tr key={item.id || item.walletAddress} className="border-b border-slate-100">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{item.label || '-'}</div>
                            {item.engineWalletId && (
                              <div className="text-[11px] font-mono text-slate-500">{item.engineWalletId}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-700">{shortAddress(item.walletAddress)}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyWalletAddress(item.walletAddress)}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-300"
                              >
                                {copiedWalletAddress === item.walletAddress ? '복사됨' : '복사'}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600">
                            {shortAddress(item.createdByWalletAddress)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDateTime(item.createdAt)}</td>
                        </tr>
                      ))
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
