import Link from 'next/link';

import { buildCenterManagementMenuItems } from '@/components/administration/centerManagementMenu';

type CenterManagementPageProps = {
  params: {
    lang?: string;
  };
};

export default function CenterManagementPage({ params }: CenterManagementPageProps) {
  const lang = params?.lang || 'ko';
  const menuItems = buildCenterManagementMenuItems(lang);

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200/80 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_48%,#e2e8f0_100%)] px-6 py-8 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.55)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Center Management</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          센터 관리 메뉴
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          좌측 메뉴와 동일한 항목만 제공합니다. 원하는 관리 페이지를 선택하면 해당 화면으로 바로 이동합니다.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-[28px] border border-slate-200/80 bg-white px-6 py-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_28px_70px_-46px_rgba(15,23,42,0.48)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{item.hint}</p>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950">{item.label}</h2>
                <p className="mt-2 text-sm text-slate-500">{item.href}</p>
              </div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition group-hover:border-slate-300 group-hover:bg-slate-100">
                →
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
