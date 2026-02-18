'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchUsersByAgent,
  formatKrw,
  shortAddress,
  toDateTime,
  type AgentSummary,
  type AgentUserItem,
} from '../_shared';

export default function P2PAgentSellerManagementPage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [sellers, setSellers] = useState<AgentUserItem[]>([]);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setSellers([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, sellersResult] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchUsersByAgent(agentcode, {
          userType: 'seller',
          requireProfile: true,
          includeWalletless: true,
          limit: 1000,
          page: 1,
        }),
      ]);

      setAgent(agentData);
      setSellers(sellersResult.users);
    } catch (loadError) {
      setAgent(null);
      setSellers([]);
      setError(loadError instanceof Error ? loadError.message : '판매자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSellers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return sellers;
    }
    return sellers.filter((seller) => {
      return (
        seller.nickname.toLowerCase().includes(normalizedKeyword)
        || seller.storecode.toLowerCase().includes(normalizedKeyword)
        || seller.walletAddress.toLowerCase().includes(normalizedKeyword)
        || seller.sellerStatus.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [sellers, keyword]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">P2P Sellers</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">P2P 판매자 관리</h1>
        <p className="mt-1 text-sm text-slate-600">에이전트 소속 판매자 계정과 판매 상태를 조회합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 판매자 관리 페이지를 사용할 수 있습니다.
        </div>
      )}

      {agentcode && (
        <>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '조회 중...' : '새로고침'}
            </button>
          </div>

          <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">판매자 목록 ({filteredSellers.length.toLocaleString()}명)</p>
              <input
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="닉네임/가맹점/지갑/상태 검색"
                className="h-9 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500"
              />
            </div>
          </section>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              판매자 목록을 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
          )}

          {!loading && !error && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">판매자</th>
                    <th className="px-4 py-3">지갑주소</th>
                    <th className="px-4 py-3">가맹점</th>
                    <th className="px-4 py-3">판매 상태</th>
                    <th className="px-4 py-3 text-right">판매 환율</th>
                    <th className="px-4 py-3">등록일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSellers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        표시할 판매자가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredSellers.map((seller) => (
                      <tr key={seller.id || `${seller.storecode}-${seller.nickname}`} className="text-slate-700">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{seller.nickname || '-'}</p>
                          <p className="text-xs text-slate-500">role {seller.role || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{shortAddress(seller.walletAddress)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{seller.storecode || '-'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{seller.sellerStatus || '-'}</td>
                        <td className="px-4 py-3 text-right text-xs text-slate-600">
                          {seller.sellerUsdtToKrwRate > 0 ? formatKrw(seller.sellerUsdtToKrwRate) : '-'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{toDateTime(seller.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
