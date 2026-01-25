'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { AutoConnect, ConnectButton, useActiveAccount } from 'thirdweb/react';

import { useClientWallets } from '@/lib/useClientWallets';
import { client } from '@/app/client';

const PRICE_POLL_MS = 8000;
const BANNER_PLACEMENT = 'p2p-home';
const DEFAULT_BANNERS = [
  { id: 'default-1', title: 'orangex banner 1', image: '/ads/orangex-banner-01.svg' },
  { id: 'default-2', title: 'orangex banner 2', image: '/ads/orangex-banner-02.svg' },
  { id: 'default-3', title: 'orangex banner 3', image: '/ads/orangex-banner-03.svg' },
  { id: 'default-4', title: 'orangex banner 4', image: '/ads/orangex-banner-04.svg' },
  { id: 'default-5', title: 'orangex banner 5', image: '/ads/orangex-banner-05.svg' },
  { id: 'default-6', title: 'orangex banner 6', image: '/ads/orangex-banner-06.svg' },
];

type BannerAd = {
  id: string;
  title: string;
  image: string;
  link?: string;
};

const formatPrice = (value: number | null) => {
  if (value === null) {
    return '--';
  }
  return `${value.toLocaleString('ko-KR')} KRW`;
};

export default function P2PBuyerPage() {
  const activeAccount = useActiveAccount();
  const address = activeAccount?.address ?? '';
  const isLoggedIn = Boolean(address);
  const { wallets } = useClientWallets();

  const [price, setPrice] = useState<number | null>(null);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [bannerAds, setBannerAds] = useState<BannerAd[]>([]);
  const [bannerLoading, setBannerLoading] = useState(true);

  const priceUpdatedLabel = useMemo(() => {
    if (!priceUpdatedAt) {
      return '업데이트 대기 중';
    }
    const date = new Date(priceUpdatedAt);
    if (Number.isNaN(date.getTime())) {
      return '업데이트 대기 중';
    }
    return `업데이트 ${date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`;
  }, [priceUpdatedAt]);

  useEffect(() => {
    let isMounted = true;
    let intervalId: number | null = null;

    const fetchPrice = async () => {
      try {
        const response = await fetch('/api/market/upbit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          throw new Error('업비트 시세를 불러오지 못했습니다.');
        }
        const data = (await response.json()) as {
          result?: { trade_price?: number };
        };
        const tradePrice =
          typeof data?.result?.trade_price === 'number' ? data.result.trade_price : null;
        if (isMounted) {
          setPrice(tradePrice);
          setPriceUpdatedAt(new Date().toISOString());
          setPriceError(null);
        }
      } catch (error) {
        if (isMounted) {
          const message =
            error instanceof Error ? error.message : '시세를 불러오지 못했습니다.';
          setPriceError(message);
        }
      }
    };

    fetchPrice();
    intervalId = window.setInterval(fetchPrice, PRICE_POLL_MS);

    return () => {
      isMounted = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    const fetchBanner = async () => {
      try {
        const response = await fetch('/api/globalAd/getActive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placement: BANNER_PLACEMENT,
            limit: 5,
          }),
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const ads = Array.isArray(data?.result) ? data.result : [];
          const normalized = ads
            .map((ad: any, index: number) => {
            const image =
              ad?.image ||
              ad?.imageUrl ||
              ad?.banner ||
              ad?.bannerImage ||
              ad?.bannerUrl;
            const link =
              ad?.link ||
              ad?.linkUrl ||
              ad?.url ||
              ad?.redirectUrl ||
              ad?.targetUrl;

            if (!image) {
              return null;
            }

            return {
              id: String(ad?._id ?? ad?.id ?? index),
              title: ad?.title || ad?.name || '제휴 배너',
              image,
              link,
            } as BannerAd;
          })
          .filter(Boolean) as BannerAd[];

        if (active) {
          if (normalized.length > 0) {
            const merged = [...normalized];
            if (merged.length < 6) {
              DEFAULT_BANNERS.forEach((fallback) => {
                if (merged.length < 6) {
                  merged.push({ ...fallback, link: '' });
                }
              });
            }
            setBannerAds(merged.slice(0, 6));
          } else {
            setBannerAds(DEFAULT_BANNERS.map((banner) => ({ ...banner, link: '' })));
          }
        }
      } catch (error) {
        if (active) {
          setBannerAds(DEFAULT_BANNERS.map((banner) => ({ ...banner, link: '' })));
        }
      } finally {
        if (active) {
          setBannerLoading(false);
        }
      }
    };

    fetchBanner();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_120%_at_50%_0%,#ffffff_0%,#f0f0f3_45%,#dadce1_100%)] text-black">
      <AutoConnect client={client} wallets={wallets} />
      {!bannerLoading && bannerAds.length > 0 && (
        <div className="fixed left-6 top-1/2 hidden -translate-y-1/2 lg:flex">
        <div className="flex w-[220px] flex-col gap-3">
          {bannerAds.slice(0, 3).map((banner) => (
            <div
              key={`left-${banner.id}`}
              className="rounded-2xl border border-black/10 bg-white/90 p-2 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.35)] backdrop-blur"
            >
              {banner.link ? (
                <a href={banner.link} target="_blank" rel="noreferrer">
                  {banner.image.startsWith('http') ? (
                    <img
                      src={banner.image}
                      alt={banner.title}
                      className="h-auto w-full rounded-xl"
                    />
                  ) : (
                    <Image
                      src={banner.image}
                      alt={banner.title}
                      width={204}
                      height={120}
                      className="h-auto w-full rounded-xl"
                    />
                  )}
                </a>
              ) : banner.image.startsWith('http') ? (
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="h-auto w-full rounded-xl"
                />
              ) : (
                <Image
                  src={banner.image}
                  alt={banner.title}
                  width={204}
                  height={120}
                  className="h-auto w-full rounded-xl"
                />
              )}
            </div>
          ))}
        </div>
      </div>
      )}
      {!bannerLoading && bannerAds.length > 0 && (
        <div className="fixed right-6 top-1/2 hidden -translate-y-1/2 lg:flex">
        <div className="flex w-[220px] flex-col gap-3">
          {bannerAds.slice(3, 6).map((banner) => (
            <div
              key={`right-${banner.id}`}
              className="rounded-2xl border border-black/10 bg-white/90 p-2 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.35)] backdrop-blur"
            >
              {banner.link ? (
                <a href={banner.link} target="_blank" rel="noreferrer">
                  {banner.image.startsWith('http') ? (
                    <img
                      src={banner.image}
                      alt={banner.title}
                      className="h-auto w-full rounded-xl"
                    />
                  ) : (
                    <Image
                      src={banner.image}
                      alt={banner.title}
                      width={204}
                      height={120}
                      className="h-auto w-full rounded-xl"
                    />
                  )}
                </a>
              ) : banner.image.startsWith('http') ? (
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="h-auto w-full rounded-xl"
                />
              ) : (
                <Image
                  src={banner.image}
                  alt={banner.title}
                  width={204}
                  height={120}
                  className="h-auto w-full rounded-xl"
                />
              )}
            </div>
          ))}
        </div>
      </div>
      )}
      <div className="mx-auto w-full max-w-sm px-4 py-10">
        <main className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-[0_34px_90px_-50px_rgba(15,15,18,0.45)] ring-1 ring-black/10">
          <div className="flex flex-col gap-6 px-5 pt-8">
            <header className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-black/10 bg-white shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)]">
                  <Image
                    src="/logo-orangex.png"
                    alt="orangex"
                    width={24}
                    height={24}
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-black/50">
                    P2P Buyer
                  </p>
                  <p className="text-sm font-semibold tracking-tight">orangex</p>
                </div>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">구매자 전용</h1>
              <p className="text-sm text-black/60">
                테더(USDT) 구매를 빠르고 안전하게 진행하는 전용 화면입니다.
              </p>
            </header>

            <section className="rounded-3xl border border-black/10 bg-[#0f0f12] p-5 text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-3">
                <Image src="/logo-upbit.jpg" alt="Upbit" width={28} height={28} className="rounded-full" />
                <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                  업비트 USDT
                </p>
              </div>
              <div className="mt-3 text-3xl font-semibold">{formatPrice(price)}</div>
              <div className="mt-2 text-xs text-white/60">{priceUpdatedLabel}</div>
              {priceError && (
                <p className="mt-3 text-xs text-rose-300">{priceError}</p>
              )}
            </section>

            <section className="rounded-3xl border border-black/10 bg-[#0f0f12] p-5 text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                Web3 Login
              </p>
              <div className="mt-3">
                <ConnectButton
                  client={client}
                  wallets={wallets}
                  theme="light"
                  connectButton={{
                    label: isLoggedIn ? '지갑 연결됨' : '웹3 로그인',
                    style: {
                      background: '#ff7a1a',
                      color: '#ffffff',
                      border: '1px solid rgba(255,177,116,0.7)',
                      boxShadow: '0 14px 32px -18px rgba(249,115,22,0.9)',
                      width: '100%',
                      height: '48px',
                      borderRadius: '16px',
                      fontWeight: 600,
                      fontSize: '15px',
                    },
                  }}
                  connectModal={{
                    size: 'wide',
                    showThirdwebBranding: false,
                  }}
                  locale="ko_KR"
                />
              </div>
              <p className="mt-3 text-xs text-white/60">
                로그인 후 테더(USDT) 구매를 바로 진행할 수 있습니다.
              </p>
            </section>

            <footer className="-mx-5 mt-2 rounded-b-[32px] bg-[#1f1f1f] px-5 py-6 pb-8 text-center text-xs text-[#9aa3b2]">
              <div className="flex flex-col items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight text-[#ff8a1f]">
                  Orange X™
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-[#b6beca]">
                  <span className="px-2">이용약관</span>
                  <span className="text-[#566072]">|</span>
                  <span className="px-2">개인정보처리방침</span>
                  <span className="text-[#566072]">|</span>
                  <span className="px-2">환불 분쟁 정책</span>
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
