import type { ReactNode } from 'react';

import CenterSubpageAccessGate from '@/components/CenterSubpageAccessGate';

export default function CenterLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { lang?: string | string[]; center?: string | string[] };
}) {
  const langParam = Array.isArray(params?.lang) ? params.lang[0] : params?.lang;
  const centerParam = Array.isArray(params?.center) ? params.center[0] : params?.center;
  const lang = langParam || 'ko';
  const center = centerParam || '';

  return (
    <CenterSubpageAccessGate lang={lang} center={center}>
      {children}
    </CenterSubpageAccessGate>
  );
}
