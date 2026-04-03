import WalletTokenStudio from '@/components/wallet-management/WalletTokenStudio';

export default function WalletTokenStudioPage({
  params,
}: {
  params: { lang: string };
}) {
  return <WalletTokenStudio lang={params.lang || 'ko'} />;
}
