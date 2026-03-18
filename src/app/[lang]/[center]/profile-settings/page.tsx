import CenterProfilesRegistrationPage from '../profiles/page';

export default function CenterProfileSettingsPage({
  params,
}: {
  params: {
    lang: string;
    center: string;
  };
}) {
  return <CenterProfilesRegistrationPage params={params} />;
}
