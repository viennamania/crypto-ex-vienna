import Link from 'next/link';

import CenterProfilesRegistrationPage from '../profiles/page';

export default function CenterProfileSettingsPage({
  params,
  searchParams,
}: {
  params: {
    lang: string;
    center: string;
  };
  searchParams?: {
    returnTo?: string;
  };
}) {
  const defaultBackHref = `/${params.lang}/${params.center}`;
  const requestedBackHref = String(searchParams?.returnTo || '').trim();
  const backHref =
    requestedBackHref === defaultBackHref || requestedBackHref.startsWith(`${defaultBackHref}/`)
      ? requestedBackHref
      : defaultBackHref;
  const backLabel = params.lang === 'ko' ? '돌아가기' : 'Back';

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex h-11 items-center rounded-2xl border border-slate-300 bg-white/90 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white"
      >
        {backLabel}
      </Link>

      <CenterProfilesRegistrationPage params={params} />
    </div>
  );
}
