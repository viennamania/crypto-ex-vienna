'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

const USER_STORECODE = 'admin';
const DEFAULT_AVATAR = '/profile-default.png';

type SellerResult = {
  id?: string | number;
  nickname?: string;
  avatar?: string;
  walletAddress?: string;
  currentUsdtBalance?: number;
  seller?: {
    bankInfo?: {
      bankName?: string;
      accountNumber?: string;
      accountHolder?: string;
    };
    usdtToKrwRate?: number;
  };
};

const formatAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

const formatNumber = (value: number | undefined, digits = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
};

const maskAccountNumber = (accountNumber?: string) => {
  if (!accountNumber) {
    return '-';
  }
  const digits = accountNumber.replace(/\s+/g, '');
  if (digits.length <= 4) {
    return digits.replace(/./g, '*');
  }
  const visible = digits.slice(-4);
  const masked = '*'.repeat(Math.max(0, digits.length - 4));
  return `${masked}${visible}`;
};

export default function SellerSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ lang?: string }>();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SellerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resultCountLabel = useMemo(() => {
    if (!searched) {
      return '';
    }
    return `${results.length}건`;
  }, [results.length, searched]);

  const executeSearch = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setErrorMessage('판매자 예금주 이름을 입력해 주세요.');
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSearched(true);
    try {
      const response = await fetch('/api/user/searchSellersByBankAccountHolder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode: USER_STORECODE,
          accountHolder: trimmed,
          limit: 20,
          page: 1,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || '판매자 조회에 실패했습니다.');
      }
      setResults((data?.result?.users as SellerResult[]) || []);
    } catch (error) {
      setResults([]);
      setErrorMessage(
        error instanceof Error ? error.message : '판매자 조회에 실패했습니다.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    await executeSearch(query);
  };

  useEffect(() => {
    const initialQuery = searchParams?.get('query');
    if (initialQuery) {
      setQuery(initialQuery);
      executeSearch(initialQuery);
    }
  }, [searchParams]);

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(120%_120%_at_50%_0%,#ffffff_0%,#f0f0f3_45%,#dadce1_100%)] text-black">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-10">
        <main className="flex flex-1 flex-col overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-[0_34px_90px_-50px_rgba(15,15,18,0.45)] ring-1 ring-black/10">
          <div className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
            <header className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold tracking-tight">판매자 찾기</h1>
                <button
                  type="button"
                  onClick={() => router.push(`/${lang}/p2p-buyer`)}
                  className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-black/60"
                >
                  뒤로
                </button>
              </div>
              <p className="text-sm text-black/60">
                판매자 은행계좌의 예금주 이름으로 판매자를 조회합니다.
              </p>
            </header>

            <section className="rounded-3xl border border-black/10 bg-white/90 p-5 text-black shadow-[0_18px_40px_-24px_rgba(0,0,0,0.25)]">
              <p className="text-xs uppercase tracking-[0.2em] text-black/70">
                Search
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  placeholder="예금주 이름을 입력하세요"
                  className="w-full flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-base font-semibold text-black placeholder:text-black/50 focus:border-black/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  className="w-full rounded-full bg-[#ff7a1a] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-16px_rgba(249,115,22,0.9)] sm:w-auto"
                >
                  조회
                </button>
              </div>
              <p className="mt-2 text-xs text-black/80">
                정확한 예금주 이름을 입력할수록 검색 정확도가 높아집니다.
              </p>
              {errorMessage && (
                <p className="mt-2 text-xs text-rose-500">{errorMessage}</p>
              )}
            </section>

            <section className="rounded-3xl border border-black/10 bg-white/90 p-5 text-black shadow-[0_18px_40px_-24px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-black/70">
                Results
              </p>
              {searched && (
                <span className="text-xs text-black/80">{resultCountLabel}</span>
              )}
            </div>
            {loading && (
              <p className="mt-3 text-xs text-black/80">검색 중입니다...</p>
            )}
            {!loading && searched && results.length === 0 && (
              <p className="mt-3 text-xs text-black/80">
                검색 결과가 없습니다.
              </p>
            )}
              <div className="mt-3 grid gap-3">
                {results.map((seller, index) => {
                  const bankInfo = seller?.seller?.bankInfo || {};
                  const usdtRate = seller?.seller?.usdtToKrwRate;
                  const escrowBalance = seller?.currentUsdtBalance;
                  const usdtRateLabel =
                    typeof usdtRate === 'number'
                      ? `${formatNumber(usdtRate, 0)} KRW`
                      : '-';
                  const escrowBalanceLabel =
                    typeof escrowBalance === 'number'
                      ? `${formatNumber(escrowBalance, 6)} USDT`
                      : '-';
                  const displayName =
                    seller?.nickname || formatAddress(seller?.walletAddress) || '판매자';
                  return (
                    <div
                      key={`${seller?.walletAddress || 'seller'}-${index}`}
                      className="rounded-3xl border border-black/10 bg-white/95 px-4 py-4 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.35)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 overflow-hidden rounded-full border border-black/10 bg-[#f2f2f3] shadow-[0_8px_18px_-12px_rgba(0,0,0,0.35)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={seller?.avatar || DEFAULT_AVATAR}
                            alt={displayName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                          <div>
                            <span className="inline-flex items-center rounded-full bg-black/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-black/50">
                              Seller
                            </span>
                            <p className="mt-1 text-base font-semibold text-black">{displayName}</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-black/10 bg-black/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-black/60">
                          Verified
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm text-black/80">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-black/10 bg-white px-3 py-2 shadow-[0_10px_24px_-18px_rgba(0,0,0,0.2)]">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-black/50">
                              은행
                            </p>
                            <p className="mt-1 text-sm font-semibold text-black">
                              {bankInfo.bankName || '-'}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-black/10 bg-white px-3 py-2 shadow-[0_10px_24px_-18px_rgba(0,0,0,0.2)]">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-black/50">
                              계좌번호
                            </p>
                            <p className="mt-1 text-sm font-semibold text-black">
                              {maskAccountNumber(bankInfo.accountNumber)}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-black/10 bg-white px-3 py-2 shadow-[0_10px_24px_-18px_rgba(0,0,0,0.2)]">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-black/50">
                              예금주
                            </p>
                            <p className="mt-1 text-sm font-semibold text-black">
                              {bankInfo.accountHolder || '-'}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-black/10 bg-white px-3 py-2 shadow-[0_10px_24px_-18px_rgba(0,0,0,0.2)]">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-black/50">
                              에스크로 수량
                            </p>
                            <p className="mt-1 text-sm font-semibold text-black">
                              {escrowBalanceLabel}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-orange-200 bg-orange-50/80 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-orange-600">
                            USDT 판매금액
                          </p>
                          <p className="mt-1 text-sm font-semibold text-orange-900">
                            {usdtRateLabel}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          <div className="mt-auto px-5">
            <footer className="-mx-5 rounded-b-[32px] bg-[#1f1f1f] px-5 py-6 pb-8 text-center text-xs text-[#9aa3b2]">
              <div className="flex flex-col items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight text-[#ff8a1f]">
                  Orange X™
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[#b6beca]">
                  <Link href={`/${lang}/p2p-buyer/terms-of-service`} className="px-2 hover:text-white">
                    이용약관
                  </Link>
                  <span className="text-[#566072]">|</span>
                  <Link href={`/${lang}/p2p-buyer/privacy-policy`} className="px-2 hover:text-white">
                    개인정보처리방침
                  </Link>
                  <span className="text-[#566072]">|</span>
                  <Link href={`/${lang}/p2p-buyer/refund-policy`} className="px-2 hover:text-white">
                    환불 분쟁 정책
                  </Link>
                </div>
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-[#8a93a6]">
                리스크 고지: 가상자산 결제에는 가격 변동 및 네트워크 지연 등 위험이
                수반될 수 있습니다. 결제 전에 수수료·환율·정산 조건을 확인해 주세요.
              </p>

              <div className="mt-4 space-y-1 text-[11px] text-[#b6beca]">
                <p>이메일: help@orangex.center</p>
                <p>주소: 14F, Corner St. Paul &amp; Tombs of the Kings, 8046 Pafos, Cyprus</p>
              </div>

              <p className="mt-4 text-[11px] text-[#6c7688]">
                Copyright © OrangeX All Rights Reserved
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
