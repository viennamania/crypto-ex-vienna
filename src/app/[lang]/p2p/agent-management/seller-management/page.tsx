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

const toTimestamp = (value: string) => {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSellerStatus = (value: string) => String(value || '').trim().toLowerCase();

const isActiveSellerStatus = (value: string) => {
  const normalized = normalizeSellerStatus(value);
  return normalized === 'confirmed' || normalized === 'active' || normalized === 'enabled' || normalized === 'approved';
};

const resolveSellerStatusLabel = (value: string) => {
  const normalized = normalizeSellerStatus(value);
  if (normalized === 'confirmed' || normalized === 'active' || normalized === 'enabled' || normalized === 'approved') {
    return '활성';
  }
  if (normalized === 'pending' || normalized === 'request') {
    return '대기';
  }
  if (normalized === 'rejected' || normalized === 'disabled' || normalized === 'inactive' || normalized === 'blocked') {
    return '비활성';
  }
  return String(value || '').trim() || '미정';
};

const resolveSellerStatusBadgeClass = (value: string) => {
  const normalized = normalizeSellerStatus(value);
  if (normalized === 'confirmed' || normalized === 'active' || normalized === 'enabled' || normalized === 'approved') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized === 'pending' || normalized === 'request') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (normalized === 'rejected' || normalized === 'disabled' || normalized === 'inactive' || normalized === 'blocked') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-slate-200 bg-slate-100 text-slate-600';
};
const PAGE_SIZE = 20;

export default function P2PAgentSellerManagementPage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
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
    void loadData();
  }, [loadData]);

  const sortedSellers = useMemo(() => {
    return [...sellers].sort((a, b) => {
      const timeDiff = toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ko');
    });
  }, [sellers]);

  const filteredSellers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return sortedSellers;
    }
    return sortedSellers.filter((seller) => {
      return (
        seller.nickname.toLowerCase().includes(normalizedKeyword)
        || seller.walletAddress.toLowerCase().includes(normalizedKeyword)
        || seller.sellerStatus.toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [keyword, sortedSellers]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredSellers.length / PAGE_SIZE)),
    [filteredSellers.length],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedSellers = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredSellers.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredSellers]);

  const visiblePageNumbers = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const adjustedStart = Math.max(1, end - windowSize + 1);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [currentPage, totalPages]);

  const isPreviousDisabled = currentPage <= 1 || loading;
  const isNextDisabled = currentPage >= totalPages || loading;

  const sellerMetrics = useMemo(() => {
    const total = sellers.length;
    const activeCount = sellers.filter((item) => isActiveSellerStatus(item.sellerStatus)).length;
    const inactiveCount = Math.max(0, total - activeCount);
    const verifiedCount = sellers.filter((item) => item.verified === true).length;
    const walletConnectedCount = sellers.filter((item) => String(item.walletAddress || '').trim().length > 0).length;
    const rateSellers = sellers.filter((item) => Number(item.sellerUsdtToKrwRate || 0) > 0);
    const averageRate =
      rateSellers.length > 0
        ? rateSellers.reduce((acc, item) => acc + Number(item.sellerUsdtToKrwRate || 0), 0) / rateSellers.length
        : 0;

    return {
      total,
      activeCount,
      inactiveCount,
      verifiedCount,
      walletConnectedCount,
      averageRate,
    };
  }, [sellers]);

  const statusSummary = useMemo(() => {
    const map = new Map<string, number>();
    sellers.forEach((seller) => {
      const label = resolveSellerStatusLabel(seller.sellerStatus);
      map.set(label, (map.get(label) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [sellers]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Seller Management</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">판매자 관리</h1>
        <p className="mt-1 text-sm text-slate-600">agentcode 기준 판매자 계정 현황을 대시보드로 조회합니다.</p>
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
              onClick={() => {
                void loadData();
              }}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '조회 중...' : '새로고침'}
            </button>
          </div>

          <AgentInfoCard agent={agent} fallbackAgentcode={agentcode} />

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">총 판매자</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{sellerMetrics.total.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700">활성 판매자</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">{sellerMetrics.activeCount.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3">
              <p className="text-xs font-semibold text-rose-700">비활성 판매자</p>
              <p className="mt-1 text-2xl font-bold text-rose-800">{sellerMetrics.inactiveCount.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-3">
              <p className="text-xs font-semibold text-cyan-700">인증 완료</p>
              <p className="mt-1 text-2xl font-bold text-cyan-800">{sellerMetrics.verifiedCount.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3">
              <p className="text-xs font-semibold text-indigo-700">지갑 연결</p>
              <p className="mt-1 text-2xl font-bold text-indigo-800">{sellerMetrics.walletConnectedCount.toLocaleString()}명</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">평균 판매 환율</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {sellerMetrics.averageRate > 0 ? formatKrw(sellerMetrics.averageRate) : '-'}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">판매 상태 요약</p>
              <p className="text-xs text-slate-500">총 {sellers.length.toLocaleString()}명 기준</p>
            </div>

            {statusSummary.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">집계할 판매 상태 데이터가 없습니다.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {statusSummary.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    <span>{item.label}</span>
                    <span className="text-slate-500">{item.count.toLocaleString()}명</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">판매자 목록 ({filteredSellers.length.toLocaleString()}명)</p>
              <input
                type="text"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="닉네임/지갑/상태 검색"
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
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">판매자</th>
                    <th className="px-4 py-3">지갑주소</th>
                    <th className="px-4 py-3">판매 상태</th>
                    <th className="px-4 py-3">인증</th>
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
                    paginatedSellers.map((seller) => (
                      <tr key={seller.id || `${seller.storecode}-${seller.walletAddress}-${seller.nickname}`} className="text-slate-700">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {seller.avatar ? (
                              <span
                                className="h-9 w-9 rounded-full border border-slate-200 bg-cover bg-center bg-no-repeat"
                                style={{ backgroundImage: `url(${encodeURI(seller.avatar)})` }}
                              />
                            ) : (
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                                {(seller.nickname || 'S').slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{seller.nickname || '-'}</p>
                              <p className="truncate text-xs text-slate-500">role {seller.role || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{shortAddress(seller.walletAddress)}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${resolveSellerStatusBadgeClass(seller.sellerStatus)}`}>
                            {resolveSellerStatusLabel(seller.sellerStatus)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            seller.verified
                              ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                              : 'border-slate-200 bg-slate-100 text-slate-500'
                          }`}
                          >
                            {seller.verified ? '인증완료' : '미인증'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700">
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

          {!loading && !error && filteredSellers.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  페이지 {currentPage} / {totalPages} · 총 {filteredSellers.length.toLocaleString()}명
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={isPreviousDisabled}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    이전
                  </button>

                  {visiblePageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      disabled={loading}
                      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition ${
                        pageNumber === currentPage
                          ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={isNextDisabled}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    다음
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
