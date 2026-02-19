'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AgentInfoCard from '../_components/AgentInfoCard';
import {
  fetchAgentSummary,
  fetchWalletUsdtPaymentStatsByAgent,
  formatKrw,
  formatUsdt,
  toDateTime,
  type AgentPaymentStatsPoint,
  type AgentPaymentStatsResult,
  type AgentSummary,
} from '../_shared';

type MetricKey = 'count' | 'usdtAmount' | 'krwAmount';

type MetricChartProps = {
  points: AgentPaymentStatsPoint[];
  metricKey: MetricKey;
  color: string;
};

const formatInteger = (value: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value || 0));

const formatUsdtCompact = (value: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));

const getMetricValue = (point: AgentPaymentStatsPoint, metricKey: MetricKey) => {
  if (metricKey === 'count') return Number(point.count || 0);
  if (metricKey === 'usdtAmount') return Number(point.usdtAmount || 0);
  return Number(point.krwAmount || 0);
};

const MetricChart = ({ points, metricKey, color }: MetricChartProps) => {
  const chartWidth = 640;
  const chartHeight = 156;
  const paddingLeft = 12;
  const paddingRight = 12;
  const paddingTop = 14;
  const paddingBottom = 28;

  const values = points.map((point) => getMetricValue(point, metricKey));
  const maxValue = Math.max(...values, 1);
  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const step = innerWidth / Math.max(points.length, 1);
  const barWidth = Math.max(4, Math.min(18, step * 0.58));
  const labelStride = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-40 w-full" role="img" aria-label="결제 통계 차트">
      <line
        x1={paddingLeft}
        y1={chartHeight - paddingBottom}
        x2={chartWidth - paddingRight}
        y2={chartHeight - paddingBottom}
        stroke="#e2e8f0"
        strokeWidth="1"
      />
      {points.map((point, index) => {
        const value = getMetricValue(point, metricKey);
        const ratio = value <= 0 ? 0 : value / maxValue;
        const height = Math.round(innerHeight * ratio);
        const x = paddingLeft + index * step + (step - barWidth) / 2;
        const y = chartHeight - paddingBottom - height;

        return (
          <g key={`${point.bucket}-${metricKey}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(height, value > 0 ? 2 : 0)}
              rx="2"
              fill={color}
              opacity={value > 0 ? 0.92 : 0.22}
            />
            {(index % labelStride === 0 || index === points.length - 1) && (
              <text
                x={x + barWidth / 2}
                y={chartHeight - 10}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
              >
                {point.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const StatsSection = ({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: AgentPaymentStatsPoint[];
}) => {
  const sectionSummary = useMemo(() => {
    return points.reduce(
      (acc, point) => {
        acc.count += Number(point.count || 0);
        acc.usdt += Number(point.usdtAmount || 0);
        acc.krw += Number(point.krwAmount || 0);
        return acc;
      },
      { count: 0, usdt: 0, krw: 0 },
    );
  }, [points]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <p className="text-[10px] text-slate-500">건수</p>
            <p className="text-xs font-extrabold text-slate-900">{formatInteger(sectionSummary.count)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <p className="text-[10px] text-slate-500">USDT</p>
            <p className="text-xs font-extrabold text-slate-900">{formatUsdtCompact(sectionSummary.usdt)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
            <p className="text-[10px] text-slate-500">KRW</p>
            <p className="text-xs font-extrabold text-slate-900">{formatInteger(sectionSummary.krw)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[11px] font-semibold text-slate-600">건수</p>
          <MetricChart points={points} metricKey="count" color="#0284c7" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[11px] font-semibold text-slate-600">USDT</p>
          <MetricChart points={points} metricKey="usdtAmount" color="#0891b2" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[11px] font-semibold text-slate-600">KRW</p>
          <MetricChart points={points} metricKey="krwAmount" color="#0f766e" />
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">구간</th>
              <th className="px-3 py-2 text-right">건수</th>
              <th className="px-3 py-2 text-right">USDT</th>
              <th className="px-3 py-2 text-right">KRW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {points.map((point) => (
              <tr key={`${title}-${point.bucket}`}>
                <td className="px-3 py-2">{point.label}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatInteger(point.count)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatUsdtCompact(point.usdtAmount)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatInteger(point.krwAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const EMPTY_STATS: AgentPaymentStatsResult = {
  generatedAt: '',
  totals: {
    count: 0,
    usdtAmount: 0,
    krwAmount: 0,
  },
  hourly: {
    hours: 0,
    points: [],
  },
  daily: {
    days: 0,
    points: [],
  },
  monthly: {
    months: 0,
    points: [],
  },
};

export default function P2PAgentPaymentStatsPage() {
  const searchParams = useSearchParams();
  const agentcode = String(searchParams?.get('agentcode') || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [stats, setStats] = useState<AgentPaymentStatsResult>(EMPTY_STATS);

  const loadData = useCallback(async () => {
    if (!agentcode) {
      setAgent(null);
      setStats(EMPTY_STATS);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [agentData, statsData] = await Promise.all([
        fetchAgentSummary(agentcode),
        fetchWalletUsdtPaymentStatsByAgent(agentcode, {
          hourlyHours: 24,
          dailyDays: 14,
          monthlyMonths: 12,
        }),
      ]);

      setAgent(agentData);
      setStats(statsData);
    } catch (loadError) {
      setAgent(null);
      setStats(EMPTY_STATS);
      setError(loadError instanceof Error ? loadError.message : '결제 통계를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [agentcode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Payment Stats</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">결제 통계</h1>
        <p className="mt-1 text-sm text-slate-600">시간대별, 일별, 월별 결제 데이터를 그래프로 확인합니다.</p>
      </div>

      {!agentcode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          URL에 `?agentcode=...` 파라미터를 추가해야 결제 통계 페이지를 사용할 수 있습니다.
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

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">전체 결제 건수</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatInteger(stats.totals.count)}건</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">전체 결제 USDT</p>
              <p className="mt-1 text-2xl font-bold text-cyan-700">{formatUsdt(stats.totals.usdtAmount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">전체 결제 KRW</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{formatKrw(stats.totals.krwAmount)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">마지막 생성 시각: {toDateTime(stats.generatedAt)}</p>
          </section>

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              결제 통계를 불러오는 중입니다...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
          )}

          {!loading && !error && (
            <div className="space-y-4">
              <StatsSection
                title="시간대별 통계"
                subtitle={`최근 ${formatInteger(stats.hourly.hours)}시간`}
                points={stats.hourly.points}
              />
              <StatsSection
                title="일별 통계"
                subtitle={`최근 ${formatInteger(stats.daily.days)}일`}
                points={stats.daily.points}
              />
              <StatsSection
                title="월별 통계"
                subtitle={`최근 ${formatInteger(stats.monthly.months)}개월`}
                points={stats.monthly.points}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
