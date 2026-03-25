import { listPaymentCompletedWebhookLogs } from '@/lib/paymentCompletedWebhookLog';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const toSingleValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();

const toPositiveLimit = (value: string, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 200);
};

const formatDateTime = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('ko-KR');
};

const shortText = (value: string, maxLength: number) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const shortHash = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  if (normalized.length <= 16) return normalized;
  return `${normalized.slice(0, 10)}...${normalized.slice(-6)}`;
};

const formatKrw = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value) || 0)}원`;

const formatUsdt = (value: number) =>
  `${new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(Number(value) || 0)} USDT`;

type PaymentAdminPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function ShopPaymentAdminPage({ searchParams }: PaymentAdminPageProps) {
  const storecode = toSingleValue(searchParams?.storecode);
  const limit = toPositiveLimit(toSingleValue(searchParams?.limit), 50);
  const logs = await listPaymentCompletedWebhookLogs({ storecode, limit });
  const uniqueStoreCount = new Set(logs.map((item) => item.storecode).filter(Boolean)).size;
  const latestReceivedAt = logs[0]?.receivedAt || '';
  const parseErrorCount = logs.filter((item) => item.parseError).length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7_0%,#fff7ed_24%,#f8fafc_55%,#e2e8f0_100%)] px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/85 shadow-[0_28px_90px_-46px_rgba(15,23,42,0.42)] backdrop-blur">
          <div className="bg-[linear-gradient(135deg,#111827_0%,#1f2937_48%,#7c2d12_100%)] px-6 py-7 text-white sm:px-8">
            <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
              Payment Completed Webhook Admin
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">결제완료 통보 내역</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
              `/api/webhook/payment/completed`로 들어온 결제완료 통보를 MongoDB에 저장하고, 최근 수신 내역을 이 페이지에서 확인합니다.
            </p>
          </div>

          <div className="grid gap-4 px-6 py-5 sm:grid-cols-3 sm:px-8">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">표시중인 로그</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{logs.length}</p>
              <p className="mt-1 text-xs text-slate-500">최대 {limit}건 조회</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">수신 가맹점 수</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{uniqueStoreCount}</p>
              <p className="mt-1 text-xs text-slate-500">{storecode ? `${storecode} 필터 적용중` : '전체 가맹점 기준'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">파싱 경고</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{parseErrorCount}</p>
              <p className="mt-1 text-xs text-slate-500">{latestReceivedAt ? `최근 수신 ${formatDateTime(latestReceivedAt)}` : '수신 내역 없음'}</p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/75 bg-white/85 p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6">
          <form className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_140px_auto] sm:items-end">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">가맹점 코드 필터</span>
              <input
                type="text"
                name="storecode"
                defaultValue={storecode}
                placeholder="예: r1mmtgzp"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">조회 건수</span>
              <select
                name="limit"
                defaultValue={String(limit)}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-amber-500"
              >
                {[20, 50, 100, 200].map((value) => (
                  <option key={value} value={value}>
                    {value}건
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                조회
              </button>
              <a
                href="/shop/payment-admin"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                초기화
              </a>
            </div>
          </form>
        </section>

        {logs.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center shadow-[0_18px_50px_-38px_rgba(15,23,42,0.3)]">
            <p className="text-lg font-semibold text-slate-900">저장된 결제완료 통보 내역이 없습니다.</p>
            <p className="mt-2 text-sm text-slate-500">결제관리에서 `결제처리완료`가 호출되면 이 페이지에 기록이 표시됩니다.</p>
          </section>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <section
                key={log.id}
                className="rounded-[28px] border border-white/75 bg-white/90 p-5 shadow-[0_22px_70px_-42px_rgba(15,23,42,0.32)] backdrop-blur sm:p-6"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 items-center rounded-full bg-slate-900 px-2.5 text-[11px] font-semibold text-white">
                        {log.event || 'payment.completed'}
                      </span>
                      <span className="inline-flex h-7 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-700">
                        {log.storecode || '-'}
                      </span>
                      <span
                        className={`inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold ${
                          log.parseError
                            ? 'border border-rose-200 bg-rose-50 text-rose-700'
                            : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {log.parseError ? '파싱 경고' : '정상 저장'}
                      </span>
                    </div>
                    <h2 className="mt-3 break-all text-xl font-black tracking-tight text-slate-900">
                      결제번호 {log.paymentId || '-'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      상품번호 {log.productId || '-'} · 수신 {formatDateTime(log.receivedAt)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">결제 상태</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{log.status || '-'}</p>
                    <p className="mt-1 text-xs text-slate-500">{log.storeName || 'Store Name 없음'}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">KRW / USDT</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{formatKrw(log.krwAmount)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{formatUsdt(log.usdtAmount)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">회원 정보</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{log.memberNickname || '-'}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{log.memberDepositName || '입금자명 없음'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">처리자</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{log.actorNickname || '-'}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{log.actorRole || '-'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">트랜잭션</p>
                    <p className="mt-1 break-all text-sm font-bold text-slate-900">{shortHash(log.transactionHash)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">IP {log.sourceIp || '-'}</p>
                  </div>
                </div>

                <details className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
                    상세 정보 보기
                  </summary>
                  <div className="border-t border-slate-200 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Webhook Meta</p>
                        <div className="mt-2 space-y-1.5 text-sm text-slate-700">
                          <p>요청 방식: {log.requestMethod || '-'}</p>
                          <p>요청 URL: {shortText(log.requestUrl, 140)}</p>
                          <p>발생 시각: {formatDateTime(log.occurredAt)}</p>
                          <p>내부 결제 ID: {log.paymentObjectId || '-'}</p>
                          <p>사용자 에이전트: {shortText(log.userAgent, 120)}</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Headers</p>
                        <pre className="mt-2 overflow-x-auto text-[11px] leading-6 text-slate-700">
                          {JSON.stringify(log.headers, null, 2)}
                        </pre>
                      </div>
                    </div>

                    {log.parseError && (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                        파싱 경고: {log.parseError}
                      </div>
                    )}

                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Payload</p>
                      <pre className="mt-2 overflow-x-auto text-[11px] leading-6 text-slate-100">
                        {log.payload ? JSON.stringify(log.payload, null, 2) : log.rawBody || '{}'}
                      </pre>
                    </div>
                  </div>
                </details>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
