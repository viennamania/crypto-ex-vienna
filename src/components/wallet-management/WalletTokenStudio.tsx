'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Manrope, Playfair_Display } from 'next/font/google';
import { toast } from 'react-hot-toast';
import { getContract, sendAndConfirmTransaction } from 'thirdweb';
import { bsc } from 'thirdweb/chains';
import { getContractMetadata } from 'thirdweb/extensions/common';
import { getBalance, mintTo, transfer } from 'thirdweb/extensions/erc20';
import {
  AutoConnect,
  useActiveAccount,
  useActiveWallet,
  useActiveWalletChain,
  useConnectedWallets,
  useSwitchActiveWalletChain,
} from 'thirdweb/react';
import { deployERC20Contract } from 'thirdweb/deploys';
import { inAppWallet } from 'thirdweb/wallets';

import { client } from '@/app/client';
import WalletConnectPrompt from '@/components/wallet-management/WalletConnectPrompt';
import WalletManagementBottomNav from '@/components/wallet-management/WalletManagementBottomNav';
import { createWalletSignatureAuthPayload } from '@/lib/security/walletSignature';

type StoredWalletToken = {
  ownerWalletAddress: string;
  tokenAddress: string;
  chainId: number;
  chainSlug: string;
  tokenName: string;
  tokenSymbol: string;
  logoUrl?: string | null;
  initialSupply?: string | null;
  mintTxHash?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type WalletTokenCard = StoredWalletToken & {
  displayName: string;
  displaySymbol: string;
  displayLogoUrl: string;
  balanceDisplay: string;
  loadError?: string | null;
};

type TransferDraft = {
  to: string;
  amount: string;
};

type DeploySummary = {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  logoUrl: string;
  mintTxHash?: string;
};

type SignatureCapableAccount = {
  address?: string;
  signMessage?: (options: {
    message: string;
    originalMessage?: string;
    chainId?: number;
  }) => Promise<string>;
};

const displayFont = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const bodyFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const LOGO_MAX_MB = 5;
const DEFAULT_INITIAL_SUPPLY = '1000000';

const shortAddress = (value: string) => {
  if (!value || value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

const formatTokenBalance = (value: string) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
};

const sanitizeAmount = (value: string) =>
  value.replace(/,/g, '').replace(/[^\d.]/g, '').replace(/(\..*?)\./g, '$1');

const resolveDisplayLogoUrl = (primary?: unknown, fallback?: unknown) => {
  const primaryText = String(primary ?? '').trim();
  if (/^https?:\/\//i.test(primaryText)) {
    return primaryText;
  }

  const fallbackText = String(fallback ?? '').trim();
  if (/^https?:\/\//i.test(fallbackText)) {
    return fallbackText;
  }

  return '/logo-chain-bsc.png';
};

const buildUploadWallets = (smartAccountEnabled: boolean) => {
  const config: Parameters<typeof inAppWallet>[0] = {
    auth: {
      options: ['phone'],
      defaultSmsCountryCode: 'KR',
    },
  };

  if (process.env.NEXT_PUBLIC_SMART_ACCOUNT === 'yes' && smartAccountEnabled) {
    config.smartAccount = {
      sponsorGas: true,
      chain: bsc,
    };
  }

  return [inAppWallet(config)];
};

export default function WalletTokenStudio({ lang }: { lang: string }) {
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const activeWalletChain = useActiveWalletChain();
  const connectedWallets = useConnectedWallets();
  const switchActiveWalletChain = useSwitchActiveWalletChain();

  const [smartAccountEnabled, setSmartAccountEnabled] = useState(
    process.env.NEXT_PUBLIC_SMART_ACCOUNT === 'yes',
  );
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [initialSupply, setInitialSupply] = useState(DEFAULT_INITIAL_SUPPLY);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [deployingToken, setDeployingToken] = useState(false);
  const [switchingChain, setSwitchingChain] = useState(false);
  const [tokens, setTokens] = useState<WalletTokenCard[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokenLoadError, setTokenLoadError] = useState<string | null>(null);
  const [lastDeploySummary, setLastDeploySummary] = useState<DeploySummary | null>(null);
  const [transferDrafts, setTransferDrafts] = useState<Record<string, TransferDraft>>({});
  const [transferringTokenAddress, setTransferringTokenAddress] = useState('');

  const tokenWallets = useMemo(
    () => buildUploadWallets(smartAccountEnabled),
    [smartAccountEnabled],
  );

  const signatureAccount = useMemo(() => {
    const candidates: Array<unknown> = [
      activeWallet?.getAccount?.(),
      activeAccount,
      activeWallet?.getAdminAccount?.(),
    ];

    for (const wallet of connectedWallets) {
      candidates.push(wallet?.getAccount?.());
      candidates.push(wallet?.getAdminAccount?.());
    }

    for (const candidate of candidates) {
      const account = candidate as SignatureCapableAccount | null | undefined;
      if (account?.address && typeof account.signMessage === 'function') {
        return account;
      }
    }

    return null;
  }, [activeAccount, activeWallet, connectedWallets]);

  const onBscNetwork = activeWalletChain?.id === bsc.id;
  useEffect(() => {
    let cancelled = false;

    const loadSmartAccountSetting = async () => {
      try {
        const response = await fetch('/api/client/getClientInfo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) {
          return;
        }
        setSmartAccountEnabled(Boolean(payload?.result?.clientInfo?.smartAccountEnabled));
      } catch (error) {
        console.error('Failed to load client info for token studio', error);
      }
    };

    loadSmartAccountSetting();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl('');
      return;
    }

    const nextUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [logoFile]);

  const updateTransferDraft = useCallback(
    (tokenAddress: string, patch: Partial<TransferDraft>) => {
      setTransferDrafts((prev) => ({
        ...prev,
        [tokenAddress]: {
          to: patch.to ?? prev[tokenAddress]?.to ?? '',
          amount: patch.amount ?? prev[tokenAddress]?.amount ?? '',
        },
      }));
    },
    [],
  );

  const buildSignedBody = useCallback(
    async (
      path: string,
      payload: Record<string, unknown>,
      options?: { requireSignature?: boolean; storecode?: string },
    ) => {
      const requireSignature = options?.requireSignature === true;
      const resolvedStorecode = String(options?.storecode || 'admin').trim() || 'admin';
      if (!signatureAccount) {
        if (requireSignature) {
          throw new Error('서명 가능한 지갑을 찾지 못했습니다. 다시 연결해 주세요.');
        }
        return payload;
      }

      const auth = await createWalletSignatureAuthPayload({
        account: signatureAccount,
        storecode: resolvedStorecode,
        path,
        method: 'POST',
        chainId: bsc.id,
      });

      return {
        ...payload,
        storecode: resolvedStorecode,
        auth,
      };
    },
    [signatureAccount],
  );

  const ensureBscChain = useCallback(async () => {
    if (!activeAccount?.address) {
      throw new Error('지갑을 먼저 연결해 주세요.');
    }

    if (activeWalletChain?.id === bsc.id) {
      return;
    }

    setSwitchingChain(true);
    try {
      await switchActiveWalletChain(bsc);
    } finally {
      setSwitchingChain(false);
    }
  }, [activeAccount?.address, activeWalletChain?.id, switchActiveWalletChain]);

  const loadTokens = useCallback(async () => {
    if (!activeAccount?.address) {
      setTokens([]);
      setTokenLoadError(null);
      setLoadingTokens(false);
      return;
    }

    setLoadingTokens(true);
    setTokenLoadError(null);

    try {
      const requestBody = await buildSignedBody('/api/wallet/tokens/list', {
        ownerWalletAddress: activeAccount.address,
        chainId: bsc.id,
      });

      const response = await fetch('/api/wallet/tokens/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || '토큰 목록을 불러오지 못했습니다.'));
      }

      const records = Array.isArray(payload?.result) ? (payload.result as StoredWalletToken[]) : [];
      const nextTokens = await Promise.all(
        records.map(async (record) => {
          const contract = getContract({
            client,
            chain: bsc,
            address: record.tokenAddress,
          });

          try {
            const [metadata, balance] = await Promise.all([
              getContractMetadata({ contract }).catch(() => null),
              getBalance({ contract, address: activeAccount.address }),
            ]);

            return {
              ...record,
              displayName: String(metadata?.name || balance.name || record.tokenName || '').trim(),
              displaySymbol: String(balance.symbol || metadata?.symbol || record.tokenSymbol || '').trim(),
              displayLogoUrl: resolveDisplayLogoUrl(metadata?.image, record.logoUrl),
              balanceDisplay: formatTokenBalance(balance.displayValue),
              loadError: null,
            } satisfies WalletTokenCard;
          } catch (error) {
            return {
              ...record,
              displayName: record.tokenName,
              displaySymbol: record.tokenSymbol,
              displayLogoUrl: resolveDisplayLogoUrl('', record.logoUrl),
              balanceDisplay: '조회 실패',
              loadError: error instanceof Error ? error.message : '토큰 정보를 불러오지 못했습니다.',
            } satisfies WalletTokenCard;
          }
        }),
      );

      setTokens(nextTokens);
    } catch (error) {
      console.error('Failed to load wallet tokens', error);
      setTokens([]);
      setTokenLoadError(error instanceof Error ? error.message : '토큰 목록을 불러오지 못했습니다.');
    } finally {
      setLoadingTokens(false);
    }
  }, [activeAccount?.address, buildSignedBody]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const uploadLogoToBlob = useCallback(async (file: File) => {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || '토큰 로고 업로드에 실패했습니다.');
    }

    const payload = await response.json().catch(() => ({}));
    const uploadedUrl = String(payload?.url || '').trim();
    if (!uploadedUrl) {
      throw new Error('업로드된 로고 URL을 받지 못했습니다.');
    }

    return uploadedUrl;
  }, []);

  const handleLogoFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) {
      setLogoFile(null);
      return;
    }

    if (!nextFile.type.startsWith('image/')) {
      toast.error('PNG, JPG, WEBP 같은 이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    if (nextFile.size / 1024 / 1024 > LOGO_MAX_MB) {
      toast.error(`토큰 로고는 ${LOGO_MAX_MB}MB 이하만 업로드할 수 있습니다.`);
      return;
    }

    setLogoFile(nextFile);
  }, []);

  const handleDeployToken = useCallback(async () => {
    const normalizedTokenName = tokenName.trim();
    const normalizedTokenSymbol = tokenSymbol.trim().toUpperCase();
    const normalizedInitialSupply = sanitizeAmount(initialSupply.trim());

    if (!activeAccount?.address) {
      toast.error('지갑을 먼저 연결해 주세요.');
      return;
    }

    if (!normalizedTokenName) {
      toast.error('토큰명을 입력해 주세요.');
      return;
    }

    if (!normalizedTokenSymbol || !/^[A-Z0-9]{2,12}$/.test(normalizedTokenSymbol)) {
      toast.error('티커는 2~12자의 영문 대문자/숫자로 입력해 주세요.');
      return;
    }

    if (!logoFile) {
      toast.error('토큰 로고 이미지를 업로드해 주세요.');
      return;
    }

    if (!normalizedInitialSupply || !/^\d+(\.\d+)?$/.test(normalizedInitialSupply)) {
      toast.error('초기 발행량을 올바르게 입력해 주세요.');
      return;
    }

    setDeployingToken(true);
    let deployedTokenAddress = '';
    let uploadedLogoUrl = '';
    let mintTxHash = '';

    try {
      await ensureBscChain();
      uploadedLogoUrl = await uploadLogoToBlob(logoFile);

      deployedTokenAddress = await deployERC20Contract({
        chain: bsc,
        client,
        account: activeAccount as any,
        type: 'TokenERC20',
        params: {
          name: normalizedTokenName,
          symbol: normalizedTokenSymbol,
          description: `${normalizedTokenName} token deployed from Wallet Management on BSC.`,
          image: uploadedLogoUrl,
          external_link: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });

      const deployedContract = getContract({
        client,
        chain: bsc,
        address: deployedTokenAddress,
      });

      const mintReceipt = await sendAndConfirmTransaction({
        account: activeAccount as any,
        transaction: mintTo({
          contract: deployedContract,
          to: activeAccount.address,
          amount: normalizedInitialSupply,
        }),
      });

      mintTxHash = String(mintReceipt?.transactionHash || '').trim();

      const saveRequestBody = await buildSignedBody(
        '/api/wallet/tokens/save',
        {
          ownerWalletAddress: activeAccount.address,
          tokenAddress: deployedTokenAddress,
          chainId: bsc.id,
          chainSlug: 'bsc',
          tokenName: normalizedTokenName,
          tokenSymbol: normalizedTokenSymbol,
          logoUrl: uploadedLogoUrl,
          initialSupply: normalizedInitialSupply,
          mintTxHash,
        },
        { requireSignature: true },
      );

      const saveResponse = await fetch('/api/wallet/tokens/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveRequestBody),
      });

      const savePayload = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) {
        throw new Error(String(savePayload?.error || '발행한 토큰을 저장하지 못했습니다.'));
      }

      setLastDeploySummary({
        tokenAddress: deployedTokenAddress,
        tokenName: normalizedTokenName,
        tokenSymbol: normalizedTokenSymbol,
        logoUrl: uploadedLogoUrl,
        mintTxHash,
      });
      setTokenName('');
      setTokenSymbol('');
      setInitialSupply(DEFAULT_INITIAL_SUPPLY);
      setLogoFile(null);
      toast.success('BSC ERC20 토큰 발행이 완료되었습니다.');
      await loadTokens();
    } catch (error) {
      console.error('Failed to deploy BSC ERC20 token', error);

      if (deployedTokenAddress) {
        setLastDeploySummary({
          tokenAddress: deployedTokenAddress,
          tokenName: normalizedTokenName,
          tokenSymbol: normalizedTokenSymbol,
          logoUrl: uploadedLogoUrl || logoPreviewUrl || '',
          mintTxHash,
        });
      }

      toast.error(error instanceof Error ? error.message : '토큰 발행에 실패했습니다.');
    } finally {
      setDeployingToken(false);
    }
  }, [
    activeAccount,
    buildSignedBody,
    ensureBscChain,
    initialSupply,
    loadTokens,
    logoFile,
    logoPreviewUrl,
    tokenName,
    tokenSymbol,
    uploadLogoToBlob,
  ]);

  const handleTransferToken = useCallback(
    async (token: WalletTokenCard) => {
      const draft = transferDrafts[token.tokenAddress] || { to: '', amount: '' };
      const recipient = draft.to.trim();
      const amount = sanitizeAmount(draft.amount.trim());

      if (!activeAccount?.address) {
        toast.error('지갑을 먼저 연결해 주세요.');
        return;
      }

      if (!isWalletAddress(recipient)) {
        toast.error('전송받을 지갑 주소를 올바르게 입력해 주세요.');
        return;
      }

      if (!amount || !/^\d+(\.\d+)?$/.test(amount)) {
        toast.error('전송 수량을 올바르게 입력해 주세요.');
        return;
      }

      setTransferringTokenAddress(token.tokenAddress);
      try {
        await ensureBscChain();

        const contract = getContract({
          client,
          chain: bsc,
          address: token.tokenAddress,
        });

        const receipt = await sendAndConfirmTransaction({
          account: activeAccount as any,
          transaction: transfer({
            contract,
            to: recipient,
            amount,
          }),
        });

        updateTransferDraft(token.tokenAddress, { to: '', amount: '' });
        toast.success(
          `${token.displaySymbol} 전송이 완료되었습니다. ${String(receipt?.transactionHash || '').slice(0, 12)}...`,
        );
        await loadTokens();
      } catch (error) {
        console.error('Failed to transfer wallet token', error);
        toast.error(error instanceof Error ? error.message : '토큰 전송에 실패했습니다.');
      } finally {
        setTransferringTokenAddress('');
      }
    },
    [activeAccount, ensureBscChain, loadTokens, transferDrafts, updateTransferDraft],
  );

  return (
    <main
      className={`${displayFont.variable} ${bodyFont.variable} min-h-screen overflow-hidden bg-[radial-gradient(120%_120%_at_100%_0%,#dcfce7_0%,#eff6ff_48%,#f8fafc_100%)] text-slate-900`}
      style={{ fontFamily: 'var(--font-body), "Avenir Next", "Segoe UI", sans-serif' }}
    >
      <AutoConnect client={client} wallets={tokenWallets} />

      <div className="pointer-events-none absolute -top-24 right-[-4rem] h-80 w-80 rounded-full bg-emerald-200/55 blur-3xl" />
      <div className="pointer-events-none absolute left-[-5rem] top-32 h-72 w-72 rounded-full bg-cyan-200/50 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[430px] px-4 pb-28 pt-8">
        <div className="mb-6">
          <Link
            href={`/${lang}/wallet-management`}
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M11.5 4.5 6 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            지갑 관리 홈
          </Link>
          <p className="mt-4 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            BSC Token Studio
          </p>
          <h1
            className="mt-2 text-3xl font-semibold tracking-tight text-slate-900"
            style={{ fontFamily: '"SUIT Variable", "Pretendard", "Noto Sans KR", sans-serif' }}
          >
            내 지갑으로 ERC20 발행
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            토큰명, 티커, 로고만 입력하면 BSC에서 ERC20 토큰을 배포하고 초기 물량을 내 지갑으로 민팅합니다.
            아래 목록에서 바로 잔액을 보고 전송도 처리할 수 있습니다.
          </p>
        </div>

        {!activeAccount?.address ? (
          <div className="rounded-[28px] border border-white/80 bg-white/82 p-4 shadow-[0_24px_56px_-34px_rgba(15,23,42,0.55)] backdrop-blur">
            <WalletConnectPrompt
              wallets={tokenWallets}
              chain={bsc}
              lang={lang}
              centered
              title="BSC 토큰 스튜디오를 사용하려면 지갑을 연결하세요."
              description="휴대폰 기반 지갑으로 바로 연결하고, 연결된 지갑으로 토큰을 배포하고 전송할 수 있습니다."
            />
          </div>
        ) : (
          <>
            <section className="mb-5 rounded-[30px] border border-white/80 bg-white/85 p-5 shadow-[0_28px_62px_-34px_rgba(15,23,42,0.58)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Connected Wallet</p>
                  <p className="mt-2 break-all font-mono text-sm text-slate-800">{activeAccount.address}</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  {onBscNetwork ? 'BSC 연결됨' : `현재 ${activeWalletChain?.name || '다른 네트워크'}`}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Target Chain</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">Binance Smart Chain</p>
                  <p className="mt-1 text-xs text-slate-500">Chain ID 56</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Flow</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">Deploy + Mint</p>
                  <p className="mt-1 text-xs text-slate-500">배포 직후 내 지갑으로 초기 물량 민팅</p>
                </div>
              </div>

              {!onBscNetwork && (
                <button
                  type="button"
                  onClick={() => {
                    ensureBscChain()
                      .then(() => {
                        toast.success('BSC 네트워크로 전환했습니다.');
                      })
                      .catch((error) => {
                        toast.error(error instanceof Error ? error.message : 'BSC 전환에 실패했습니다.');
                      });
                  }}
                  disabled={switchingChain}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#14532d_0%,#15803d_100%)] text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {switchingChain ? 'BSC로 전환 중...' : 'BSC 네트워크로 전환'}
                </button>
              )}
            </section>

            <section className="mb-5 rounded-[30px] border border-white/80 bg-white/88 p-5 shadow-[0_28px_62px_-36px_rgba(15,23,42,0.62)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Deploy Form</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">새 ERC20 토큰 발행</h2>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 4v16M4 12h16" strokeLinecap="round" />
                  </svg>
                </span>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-1.5">
                  <span className="text-sm font-semibold text-slate-700">토큰명</span>
                  <input
                    value={tokenName}
                    onChange={(event) => setTokenName(event.target.value)}
                    placeholder="예: OrangeX Membership"
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">티커</span>
                    <input
                      value={tokenSymbol}
                      onChange={(event) => setTokenSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                      placeholder="예: ORX"
                      className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold uppercase text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-semibold text-slate-700">초기 발행량</span>
                    <input
                      value={initialSupply}
                      onChange={(event) => setInitialSupply(sanitizeAmount(event.target.value))}
                      inputMode="decimal"
                      placeholder={DEFAULT_INITIAL_SUPPLY}
                      className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                    />
                  </label>
                </div>

                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">토큰 로고</p>
                      <p className="mt-1 text-xs text-slate-500">PNG, JPG, WEBP 권장. 최대 {LOGO_MAX_MB}MB.</p>
                    </div>
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900">
                      파일 선택
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {logoPreviewUrl ? (
                        <img src={logoPreviewUrl} alt="Token logo preview" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">LOGO</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {logoFile?.name || '아직 선택한 로고가 없습니다.'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        발행 시 업로드 후 토큰 메타데이터와 함께 저장됩니다.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDeployToken}
                disabled={deployingToken || switchingChain}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#111827_0%,#047857_45%,#16a34a_100%)] text-sm font-semibold text-white shadow-[0_24px_48px_-26px_rgba(5,150,105,0.85)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deployingToken ? '토큰 발행 중...' : 'BSC ERC20 토큰 발행'}
              </button>
            </section>

            {lastDeploySummary && (
              <section className="mb-5 rounded-[28px] border border-emerald-200 bg-[linear-gradient(145deg,rgba(236,253,245,0.96)_0%,rgba(255,255,255,0.94)_100%)] p-4 shadow-[0_20px_44px_-30px_rgba(16,185,129,0.55)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-emerald-200 bg-white">
                    <img
                      src={lastDeploySummary.logoUrl || '/logo-chain-bsc.png'}
                      alt={lastDeploySummary.tokenName}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Last Deployment</p>
                    <p className="truncate text-base font-semibold text-slate-900">
                      {lastDeploySummary.tokenName} ({lastDeploySummary.tokenSymbol})
                    </p>
                  </div>
                </div>
                <p className="mt-3 break-all rounded-2xl border border-emerald-200 bg-white/80 px-3 py-2 font-mono text-xs text-slate-700">
                  {lastDeploySummary.tokenAddress}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    href={`https://bscscan.com/token/${lastDeploySummary.tokenAddress}?a=${activeAccount.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-emerald-200 bg-white text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    BscScan 보기
                  </a>
                  {lastDeploySummary.mintTxHash ? (
                    <a
                      href={`https://bscscan.com/tx/${lastDeploySummary.mintTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-emerald-600 text-xs font-semibold text-white transition hover:bg-emerald-500"
                    >
                      민팅 트랜잭션
                    </a>
                  ) : (
                    <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                      트랜잭션 확인 대기
                    </span>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-[30px] border border-white/80 bg-white/88 p-5 shadow-[0_28px_62px_-36px_rgba(15,23,42,0.62)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">My Tokens</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">내 지갑 토큰 보기 / 전송</h2>
                </div>
                <button
                  type="button"
                  onClick={() => loadTokens()}
                  disabled={loadingTokens}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingTokens ? '새로고침 중...' : '새로고침'}
                </button>
              </div>

              <p className="mt-2 text-sm text-slate-600">
                방금 발행한 토큰과 이전에 이 지갑으로 저장한 BSC 토큰을 확인하고 바로 전송할 수 있습니다.
              </p>

              {tokenLoadError && (
                <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                  {tokenLoadError}
                </p>
              )}

              <div className="mt-4 grid gap-3">
                {loadingTokens && tokens.length === 0 && (
                  <>
                    <div className="h-[178px] animate-pulse rounded-[26px] border border-slate-200 bg-slate-100/80" />
                    <div className="h-[178px] animate-pulse rounded-[26px] border border-slate-200 bg-slate-100/70" />
                  </>
                )}

                {!loadingTokens && tokens.length === 0 && !tokenLoadError && (
                  <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50/90 px-4 py-8 text-center">
                    <p className="text-base font-semibold text-slate-800">아직 저장된 토큰이 없습니다.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      위에서 ERC20 토큰을 발행하면 이 목록에 자동으로 추가됩니다.
                    </p>
                  </div>
                )}

                {tokens.map((token) => {
                  const transferDraft = transferDrafts[token.tokenAddress] || { to: '', amount: '' };
                  const isTransferring = transferringTokenAddress === token.tokenAddress;

                  return (
                    <article
                      key={token.tokenAddress}
                      className="rounded-[26px] border border-slate-200 bg-[linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.95)_100%)] p-4 shadow-[0_16px_38px_-30px_rgba(15,23,42,0.4)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          <img src={token.displayLogoUrl} alt={token.displayName} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-lg font-semibold text-slate-900">{token.displayName}</p>
                              <p className="mt-0.5 text-sm font-semibold text-emerald-700">{token.displaySymbol}</p>
                            </div>
                            <a
                              href={`https://bscscan.com/token/${token.tokenAddress}?a=${activeAccount.address}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                            >
                              BscScan
                            </a>
                          </div>
                          <p className="mt-2 break-all font-mono text-[11px] leading-5 text-slate-500">
                            {token.tokenAddress}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Balance</p>
                          <p className="mt-2 text-lg font-semibold text-slate-900">
                            {token.balanceDisplay} {token.displaySymbol}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Created</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {token.createdAt ? token.createdAt.slice(0, 10) : '-'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">BSC / {shortAddress(activeAccount.address)}</p>
                        </div>
                      </div>

                      {token.loadError && (
                        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                          {token.loadError}
                        </p>
                      )}

                      <div className="mt-4 grid gap-2">
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold text-slate-600">받는 지갑 주소</span>
                          <input
                            value={transferDraft.to}
                            onChange={(event) => updateTransferDraft(token.tokenAddress, { to: event.target.value })}
                            placeholder="0x..."
                            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold text-slate-600">전송 수량</span>
                          <input
                            value={transferDraft.amount}
                            onChange={(event) =>
                              updateTransferDraft(token.tokenAddress, {
                                amount: sanitizeAmount(event.target.value),
                              })
                            }
                            inputMode="decimal"
                            placeholder={`예: 10 ${token.displaySymbol}`}
                            className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleTransferToken(token)}
                          disabled={isTransferring || switchingChain}
                          className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isTransferring ? `${token.displaySymbol} 전송 중...` : `${token.displaySymbol} 전송`}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      <WalletManagementBottomNav lang={lang} active="token" />
    </main>
  );
}
