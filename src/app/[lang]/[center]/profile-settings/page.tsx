'use client';

import { useRouter } from 'next/navigation';

import CenterProfilesRegistrationPage from '../profiles/page';

export default function CenterProfileSettingsPage({
  params,
}: {
  params: {
    lang: string;
    center: string;
  };
}) {
  const router = useRouter();
  const defaultBackHref = `/${params.lang}/${params.center}`;
  const backLabel = params.lang === 'ko' ? '돌아가기' : 'Back';

  return (
    <div className="mx-auto w-full max-w-[840px] space-y-4">
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            router.back();
            return;
          }

          router.push(defaultBackHref);
        }}
        className="inline-flex h-11 items-center rounded-2xl border border-slate-300 bg-white/90 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white"
      >
        {backLabel}
      </button>

      <CenterProfilesRegistrationPage params={params} />
    </div>
  );
}
