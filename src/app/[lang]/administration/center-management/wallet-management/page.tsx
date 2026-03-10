'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useActiveAccount } from 'thirdweb/react';
import { shortenAddress } from 'thirdweb/utils';
import { toast } from 'react-hot-toast';

import { useClientWallets } from '@/lib/useClientWallets';

export default function CenterManagementWalletManagementPage() {
  const params = useParams<{ lang?: string }>();
  const activeAccount = useActiveAccount();
  const { chain } = useClientWallets({ authOptions: ['google', 'email'] });

  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';
  const walletAddress = String(activeAccount?.address || '').trim();
  const shortWalletAddress = walletAddress ? shortenAddress(walletAddress) : '연결 대기중';
  const networkLabel = String(chain || 'polygon').toUpperCase();

  const handleCopyWallet = async () => {
    if (!walletAddress || !navigator.clipboard?.writeText) {
      toast.error('복사할 지갑 주소가 없습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(walletAddress);
      toast.success('지갑 주소를 복사했습니다.');
    } catch (error) {
      console.error('failed to copy center management wallet address', error);
      toast.error('지갑 주소 복사에 실패했습니다.');
    }
  };

  const walletCards = [
    {
      label: '운영 지갑',
      value: shortWalletAddress,
      description: '현재 관리자 세션에서 사용 중인 기본 지갑입니다.',
      tone: 'from-cyan-500/18 to-cyan-200/40 text-cyan-700',
    },
    {
      label: '네트워크',
      value: networkLabel,
      description: '클라이언트 설정에 연결된 운영 체인입니다.',
      tone: 'from-indigo-500/18 to-indigo-200/40 text-indigo-700',
    },
    {
      label: '접근 방식',
      value: 'AutoConnect',
      description: '세션 복구는 자동 연결만 허용하며 수동 연결 버튼은 숨깁니다.',
      tone: 'from-emerald-500/18 to-emerald-200/40 text-emerald-700',
    },
    {
      label: '보안 상태',
      value: 'Protected',
      description: '지갑 연결이 없으면 이 하위 페이지는 열리지 않습니다.',
      tone: 'from-amber-500/18 to-amber-200/40 text-amber-700',
    },
  ];

  const actionLinks = [
    {
      href: `/${lang}/administration/center-management`,
      label: '센터 관리 홈',
      description: '센터 운영 대시보드로 돌아갑니다.',
    },
    {
      href: `/${lang}/administration/wallet-management`,
      label: '전체 관리자 지갑 페이지',
      description: '기존 관리자 지갑 관리 화면으로 이동합니다.',
    },
  ];

  const checklistItems = [
    '현재 지갑 주소가 관리자 운영 계정과 일치하는지 확인합니다.',
    '자동 연결이 복구되지 않으면 접근 제한 화면이 먼저 표시됩니다.',
    '민감한 작업 전에는 주소를 복사해 외부 승인 절차와 교차 검증합니다.',
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fafc_38%,#ffffff_68%,#e2e8f0_100%)] shadow-[0_30px_90px_-60px_rgba(15,23,42,0.55)]">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.3fr_0.95fr] lg:px-8 lg:py-8">
          <div className="relative">
            <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-sky-300/30 blur-3xl" />
            <div className="relative">
              <p className="inline-flex items-center rounded-full border border-slate-300/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700">
                Center Wallet Management
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                센터 관리자 지갑 관리
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                AutoConnect로 복구된 관리자 지갑이 연결된 상태에서만 작동합니다. 연결이 끊기면 공통 게이트에서 즉시 접근이 차단됩니다.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyWallet}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  지갑주소 복사
                </button>
                <Link
                  href={`/${lang}/administration/center-management`}
                  className="inline-flex h-11 items-center rounded-2xl border border-slate-300 bg-white/90 px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white"
                >
                  센터 관리 홈으로
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(160deg,#020617_0%,#0f172a_52%,#1e293b_100%)] p-5 text-white shadow-[0_24px_70px_-45px_rgba(2,6,23,0.85)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">Connected Wallet</p>
            <p className="mt-4 text-2xl font-black tracking-tight">활성 운영 지갑</p>
            <p className="mt-4 break-all rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm leading-6 text-slate-100">
              {walletAddress || '연결 대기중'}
            </p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Wallet State</p>
                <p className="mt-2 text-sm font-semibold text-white">Connected and ready for center operations</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Address</p>
                  <p className="mt-2 text-sm font-semibold text-white">{shortWalletAddress}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Chain</p>
                  <p className="mt-2 text-sm font-semibold text-white">{networkLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {walletCards.map((card) => (
          <article
            key={card.label}
            className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]"
          >
            <div className={`inline-flex rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${card.tone}`}>
              {card.label}
            </div>
            <p className="mt-4 text-2xl font-black tracking-tight text-slate-950">{card.value}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{card.description}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_70px_-52px_rgba(15,23,42,0.45)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Quick Menu</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">지갑 관련 이동 메뉴</h2>
          <div className="mt-5 grid gap-4">
            {actionLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] px-5 py-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_20px_50px_-38px_rgba(15,23,42,0.45)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold tracking-tight text-slate-900">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition group-hover:border-slate-300 group-hover:text-slate-900">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_70px_-52px_rgba(15,23,42,0.45)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Access Policy</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">접근 및 운영 규칙</h2>
          <div className="mt-5 space-y-3">
            {checklistItems.map((item, index) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_18px_40px_-38px_rgba(15,23,42,0.45)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Rule {index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
