import type { ReactNode } from 'react';
import AdministrationLayoutShell from '@/components/AdministrationLayoutShell';

export default function AdministrationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { lang?: string | string[] };
}) {
  const langParam = Array.isArray(params?.lang) ? params.lang[0] : params?.lang;
  const lang = langParam || 'ko';

  return (
    <AdministrationLayoutShell lang={lang}>
      {children}
    </AdministrationLayoutShell>
  );
}
