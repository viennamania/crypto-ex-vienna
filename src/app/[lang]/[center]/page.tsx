import { redirect } from 'next/navigation';

type PageProps = {
  params: {
    lang: string;
    center: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

const buildQueryString = (
  searchParams: PageProps['searchParams']
) => {
  if (!searchParams) {
    return '';
  }

  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        query.append(key, entry);
      }
      continue;
    }

    if (typeof value === 'string') {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
};

export default function CenterIndexPage({
  params,
  searchParams,
}: PageProps) {
  const queryString = buildQueryString(searchParams);

  redirect(`/${params.lang}/${params.center}/center${queryString}`);
}
