import { redirect } from 'next/navigation';

type CenterManagementPageProps = {
  params: {
    lang?: string;
  };
};

export default function CenterManagementPage({ params }: CenterManagementPageProps) {
  redirect(`/${params?.lang || 'ko'}/administration`);
}
