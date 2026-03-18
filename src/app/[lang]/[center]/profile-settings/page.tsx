import { redirect } from 'next/navigation';

export default function CenterProfileSettingsRedirect({
  params,
}: {
  params: {
    lang: string;
    center: string;
  };
}) {
  redirect(`/${params.lang}/${params.center}/profiles`);
}
