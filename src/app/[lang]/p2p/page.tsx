import type { CSSProperties } from 'react';
import { Manrope, Playfair_Display } from 'next/font/google';

const displayFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

type PageProps = {
  params?: {
    lang?: string | string[];
  };
};

const NOTICE_COPY = {
  ko: {
    badge: '서비스 안내',
    title: 'P2P 서비스가 당분간 중지됩니다.',
    body:
      '내부 사정으로 당분간 서비스를 중지합니다. 다시 서비스를 시작하게 되면 고객 여러분에게 개별적으로 연락을 드리도록 하겠습니다. 감사합니다.',
    signature: '오렌지엑스 임직원 일동',
  },
  en: {
    badge: 'Service Notice',
    title: 'The P2P service is temporarily unavailable.',
    body:
      'Due to internal circumstances, the service will be suspended until further notice. Once the service resumes, we will contact each customer individually. Thank you.',
    signature: 'OrangeX Management and Staff',
  },
} as const;

const HEADER_COPY = {
  ko: {
    badge: '임시 안내',
    eyebrow: 'OrangeX P2P',
    title: '서비스 중지 안내',
    description: '현재 이 페이지는 임시 서비스 중지 안내 전용 화면으로 운영됩니다.',
    panelBadge: '현재 안내',
    rows: [
      { label: '상태', value: '임시 중지' },
      { label: '재개 안내', value: '서비스 재개 시 개별 연락' },
    ],
  },
  en: {
    badge: 'Temporary Notice',
    eyebrow: 'OrangeX P2P',
    title: 'Service Pause Notice',
    description: 'This page is currently being used as a temporary service suspension notice.',
    panelBadge: 'Current Notice',
    rows: [
      { label: 'Status', value: 'Temporarily Suspended' },
      { label: 'Restart Notice', value: 'Individual outreach on resume' },
    ],
  },
} as const;

function normalizeLang(langParam?: string | string[]) {
  if (Array.isArray(langParam)) {
    return langParam[0] || 'ko';
  }

  return langParam || 'ko';
}

export default function P2PServicePausedPage({ params }: PageProps) {
  const lang = normalizeLang(params?.lang);
  const primaryLocale = lang === 'en' ? 'en' : 'ko';
  const orderedLocales = primaryLocale === 'en' ? (['en', 'ko'] as const) : (['ko', 'en'] as const);
  const headerCopy = HEADER_COPY[primaryLocale];

  return (
    <div
      className={`${bodyFont.variable} ${displayFont.variable} relative min-h-screen overflow-hidden bg-[linear-gradient(160deg,#fff4ea_0%,#f7fbff_45%,#eefbf5_100%)] font-[var(--font-body)] text-slate-900`}
      style={
        {
          '--warm': '#f97316',
          '--cool': '#0ea5e9',
          '--mint': '#14b8a6',
          '--ink': '#0f172a',
        } as CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(20,184,166,0.12),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.85)_1px,transparent_1px)] [background-size:24px_24px]" />

      <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-5xl items-start px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-10 lg:items-center lg:px-8">
        <section className="w-full overflow-hidden rounded-[24px] border border-white/70 bg-white/85 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:rounded-[32px]">
          <div className="relative border-b border-slate-200/70 px-4 py-5 sm:px-10 sm:py-10">
            <div className="absolute -right-16 -top-20 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,var(--warm)_0%,transparent_72%)] opacity-20 blur-2xl sm:-right-20 sm:-top-24 sm:h-56 sm:w-56" />
            <div className="absolute -bottom-16 left-[-8%] h-36 w-36 rounded-full bg-[radial-gradient(circle_at_center,var(--cool)_0%,transparent_72%)] opacity-20 blur-2xl sm:-bottom-20 sm:h-52 sm:w-52" />

            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.24em]">
                  {headerCopy.badge}
                </span>
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-sm sm:tracking-[0.24em]">
                    {headerCopy.eyebrow}
                  </p>
                  <h1 className="font-[var(--font-display)] text-[2rem] leading-[1.05] text-[color:var(--ink)] sm:text-5xl">
                    {headerCopy.title}
                  </h1>
                  <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-lg sm:leading-7">
                    {headerCopy.description}
                  </p>
                </div>
              </div>

              <div className="grid w-full gap-3 rounded-[22px] border border-slate-200/80 bg-slate-950 px-4 py-4 text-sm text-white shadow-[0_20px_50px_-35px_rgba(15,23,42,0.8)] sm:max-w-md sm:px-5 lg:max-w-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60 sm:text-xs sm:tracking-[0.24em]">
                  {headerCopy.panelBadge}
                </span>
                <div className="space-y-3">
                  {headerCopy.rows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-start justify-between gap-4 border-t border-white/10 pt-3 first:border-t-0 first:pt-0"
                    >
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-white/55">
                        {row.label}
                      </span>
                      <span className="max-w-[12rem] text-right text-sm font-semibold leading-5 text-white tabular-nums">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:gap-5 sm:px-10 sm:py-8 lg:grid-cols-2">
            {orderedLocales.map((locale) => {
              const copy = NOTICE_COPY[locale];

              return (
                <article
                  key={locale}
                  className="relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-5 shadow-[0_24px_60px_-45px_rgba(15,23,42,0.35)] sm:rounded-[28px] sm:p-6"
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1.5 ${
                      locale === 'ko'
                        ? 'bg-[linear-gradient(90deg,#f97316,#fb923c)]'
                        : 'bg-[linear-gradient(90deg,#0ea5e9,#14b8a6)]'
                    }`}
                  />
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
                        {copy.badge}
                      </span>
                      <h2 className="text-[1.45rem] font-semibold leading-[1.2] text-slate-900 sm:text-[1.85rem]">
                        {copy.title}
                      </h2>
                    </div>

                    <p className="text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">{copy.body}</p>

                    <div className="rounded-[18px] bg-slate-100/85 px-4 py-3 text-xs font-semibold text-slate-700 sm:rounded-[22px] sm:py-4 sm:text-sm">
                      {copy.signature}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
