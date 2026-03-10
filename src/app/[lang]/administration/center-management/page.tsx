'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useActiveAccount } from 'thirdweb/react';
import { shortenAddress } from 'thirdweb/utils';
import { toast } from 'react-hot-toast';

import { useClientWallets } from '@/lib/useClientWallets';

const formatNowLabel = (value: Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'full',
    timeStyle: 'medium',
  }).format(value);

const getGreetingByHour = (hour: number) => {
  if (hour < 6) return '늦은 시간까지';
  if (hour < 12) return '좋은 아침입니다';
  if (hour < 18) return '좋은 오후입니다';
  if (hour < 22) return '안녕하세요';
  return '늦은 시간입니다';
};

export default function CenterManagementPage() {
  const params = useParams<{ lang?: string }>();
  const activeAccount = useActiveAccount();
  const { chain } = useClientWallets({ authOptions: ['google', 'email'] });
  const [now, setNow] = useState(() => new Date());

  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';
  const walletAddress = String(activeAccount?.address || '').trim();
  const shortWalletAddress = walletAddress ? shortenAddress(walletAddress) : '연결 대기중';

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const greetingLabel = getGreetingByHour(now.getHours());
  const nowLabel = formatNowLabel(now);
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

  const dashboardCards = [
    {
      eyebrow: 'Access',
      title: '관리자 세션',
      value: 'Connected',
      description: '관리자 전용 게이트 통과 후 표시되는 운영 세션입니다.',
      accentClass: 'from-emerald-500/18 to-emerald-200/40 text-emerald-700',
    },
    {
      eyebrow: 'Wallet',
      title: '주 지갑 식별',
      value: shortWalletAddress,
      description: '지갑 연결 상태와 주요 운영 계정을 한눈에 확인합니다.',
      accentClass: 'from-cyan-500/18 to-cyan-200/40 text-cyan-700',
    },
    {
      eyebrow: 'Network',
      title: '운영 체인',
      value: networkLabel,
      description: '현재 클라이언트 설정 기준 네트워크를 사용합니다.',
      accentClass: 'from-indigo-500/18 to-indigo-200/40 text-indigo-700',
    },
    {
      eyebrow: 'Mode',
      title: '운영 모드',
      value: 'Finance Center',
      description: '센터 운영, 지갑 관리, 결제 관리를 빠르게 이동할 수 있습니다.',
      accentClass: 'from-amber-500/18 to-amber-200/40 text-amber-700',
    },
  ];

  const quickLinks = [
    {
      href: `/${lang}/administration/wallet-management`,
      label: '내 지갑 관리',
      description: '잔액, 전송, 즐겨찾기 지갑을 바로 관리합니다.',
    },
    {
      href: `/${lang}/administration/payment-management`,
      label: '가맹점 결제 관리',
      description: '결제 처리 현황과 미완료 건을 추적합니다.',
    },
    {
      href: `/${lang}/administration/support-settings`,
      label: '지원 센터 설정',
      description: '상담 프로필과 운영 지원 정보를 정비합니다.',
    },
  ];

  const briefingItems = [
    '연결된 지갑 주소를 기준으로 관리자 세션이 유지됩니다.',
    '민감한 작업은 공통 관리자 게이트에서 자동 서명 로직을 사용합니다.',
    '운영 메뉴는 좌측 사이드바 또는 아래 퀵 액션에서 즉시 이동할 수 있습니다.',
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(135deg,#e0f2fe_0%,#f8fafc_32%,#ffffff_60%,#e2e8f0_100%)] shadow-[0_30px_90px_-60px_rgba(15,23,42,0.55)]">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.45fr_0.95fr] lg:px-8 lg:py-8">
          <div className="relative">
            <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-cyan-300/35 blur-3xl" />
            <div className="absolute bottom-6 right-10 h-28 w-28 rounded-full bg-amber-200/45 blur-3xl" />
            <div className="relative">
              <p className="inline-flex items-center rounded-full border border-slate-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700">
                Finance Center Control Room
              </p>
              <p className="mt-4 text-sm font-medium text-slate-500">{nowLabel}</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
                금융 센터 관리자 대시보드
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                {greetingLabel}, {shortWalletAddress} 관리자님. 연결된 지갑을 기준으로 운영 세션이 활성화되어 있으며,
                센터 핵심 메뉴와 상태를 한 번에 확인할 수 있습니다.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyWallet}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  지갑주소 복사
                </button>
                <div className="inline-flex h-11 items-center rounded-2xl border border-white/70 bg-white/80 px-4 text-sm font-semibold text-slate-700">
                  Welcome back to center operations
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(160deg,#020617_0%,#0f172a_52%,#1e293b_100%)] p-5 text-white shadow-[0_24px_70px_-45px_rgba(2,6,23,0.85)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">Connected Wallet</p>
            <p className="mt-4 text-2xl font-black tracking-tight">운영 지갑 주소</p>
            <p className="mt-4 break-all rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm leading-6 text-slate-100">
              {walletAddress || '연결 대기중'}
            </p>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Welcome Message</p>
                <p className="mt-2 text-sm leading-6 text-slate-100">
                  관리자 인증이 완료된 지갑입니다. 운영 메뉴 진입 및 주요 금융 센터 작업을 이어서 진행할 수 있습니다.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Role</p>
                  <p className="mt-2 text-sm font-semibold text-white">Center Admin</p>
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
        {dashboardCards.map((card) => (
          <article
            key={card.title}
            className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.45)]"
          >
            <div className={`inline-flex rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${card.accentClass}`}>
              {card.eyebrow}
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-500">{card.title}</p>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{card.value}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{card.description}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_70px_-52px_rgba(15,23,42,0.45)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Quick Action</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">운영 메뉴 바로가기</h2>
            </div>
            <p className="text-sm text-slate-500">좌측 메뉴 없이도 핵심 페이지로 이동할 수 있습니다.</p>
          </div>
          <div className="mt-5 grid gap-4">
            {quickLinks.map((item) => (
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Operator Briefing</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">오늘의 운영 체크포인트</h2>
          <div className="mt-5 space-y-3">
            {briefingItems.map((item, index) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_18px_40px_-38px_rgba(15,23,42,0.45)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Point {index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-[24px] border border-cyan-200 bg-cyan-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Session Summary</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-700">
              <p>
                현재 지갑: <span className="font-semibold text-slate-950">{shortWalletAddress}</span>
              </p>
              <p>
                접속 시간: <span className="font-semibold text-slate-950">{nowLabel}</span>
              </p>
              <p>
                운영 상태: <span className="font-semibold text-slate-950">Ready for center management</span>
              </p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
