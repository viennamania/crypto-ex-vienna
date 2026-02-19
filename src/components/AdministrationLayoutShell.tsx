'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import AdministrationSidebar from '@/components/AdministrationSidebar';
import AdminSupportChatWidget from '@/components/AdminSupportChatWidget';

type AdministrationLayoutShellProps = {
  lang: string;
  children: ReactNode;
};

type PendingOrderProcessingItem = {
  id: string;
  tradeId: string;
  storecode: string;
  storeName: string;
  storeLogo: string;
  memberNickname: string;
  usdtAmount: number;
  krwAmount: number;
  createdAt: string;
  confirmedAt: string;
  orderProcessing: string;
  orderProcessingUpdatedAt: string;
};

type PendingOrderProcessingSummary = {
  pendingCount: number;
  oldestPendingAt: string;
  recentPayments: PendingOrderProcessingItem[];
};

type PendingAlertCardItem = PendingOrderProcessingItem & {
  cardKey: string;
  cardState: 'entering' | 'stable' | 'exiting';
};

const ORDER_PROCESSING_ALERT_POLLING_MS = 15000;
const ORDER_PROCESSING_ALERT_SOUND_INTERVAL_MS = 30000;
const ORDER_PROCESSING_ALERT_SOUND_ENABLED_KEY = 'administration-order-processing-alert-sound-enabled';
const ORDER_PROCESSING_ALERT_SOUND_SRC = '/notification.mp3';
const ORDER_PROCESSING_ALERT_SOUND_FALLBACK_SRC = '/notification.wav';
const ORDER_PROCESSING_CARD_ENTER_MS = 1700;
const ORDER_PROCESSING_CARD_EXIT_MS = 420;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const formatNumber = (value: number) =>
  new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number(value || 0));
const formatUsdtAmount = (value: number) =>
  new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(Number(value || 0));
const toDateTimeLabel = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('ko-KR');
};
const toTimeAgoLabel = (value: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  const time = parsed.getTime();
  if (Number.isNaN(time)) return '-';

  const diffMs = Date.now() - time;
  if (diffMs <= 0) return '방금 전';

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}주 전`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;

  const years = Math.floor(days / 365);
  return `${years}년 전`;
};
const resolvePendingCardKey = (payment: PendingOrderProcessingItem) =>
  String(payment.id || payment.tradeId || `${payment.storecode}-${payment.memberNickname}-${payment.createdAt || payment.confirmedAt}`);

export default function AdministrationLayoutShell({ lang, children }: AdministrationLayoutShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [pendingSummary, setPendingSummary] = useState<PendingOrderProcessingSummary>({
    pendingCount: 0,
    oldestPendingAt: '',
    recentPayments: [],
  });
  const [pendingAlertError, setPendingAlertError] = useState<string | null>(null);
  const [pendingAlertLastCheckedAt, setPendingAlertLastCheckedAt] = useState('');
  const [pendingAlertSoundEnabled, setPendingAlertSoundEnabled] = useState(true);
  const [pendingAlertCards, setPendingAlertCards] = useState<PendingAlertCardItem[]>([]);
  const pendingAlertAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAlertAudioUnlockedRef = useRef(false);
  const lastAlertSoundAtRef = useRef(0);
  const previousPendingCountRef = useRef(0);
  const pendingCardTimerIdsRef = useRef<number[]>([]);
  const showPinnedPendingAlert = pendingSummary.pendingCount > 0 || pendingAlertCards.length > 0;
  const buyOrderManagementHref = `/${lang}/administration/buyorder-management`;

  const getPendingAlertAudio = useCallback(() => {
    if (typeof window === 'undefined') return null;

    if (!pendingAlertAudioRef.current) {
      const audio = new Audio(ORDER_PROCESSING_ALERT_SOUND_SRC);
      audio.preload = 'auto';
      audio.volume = 1;
      pendingAlertAudioRef.current = audio;
    }

    return pendingAlertAudioRef.current;
  }, []);

  const playPendingAlertTone = useCallback(async () => {
    const audio = getPendingAlertAudio();
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;

    try {
      await audio.play();
    } catch (error) {
      // fallback to wav when mp3 playback fails in some browsers.
      if (!audio.src.endsWith(ORDER_PROCESSING_ALERT_SOUND_FALLBACK_SRC)) {
        audio.src = ORDER_PROCESSING_ALERT_SOUND_FALLBACK_SRC;
        audio.load();
        audio.currentTime = 0;
        await audio.play();
        return;
      }

      throw error;
    }
  }, [getPendingAlertAudio]);

  const loadPendingOrderProcessingSummary = useCallback(async () => {
    try {
      const response = await fetch('/api/payment/getWalletUsdtPendingOrderProcessingSummaryAll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 4,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '주문처리 미완료 건수를 조회하지 못했습니다.'));
      }

      const result = isRecord((payload as Record<string, unknown>)?.result)
        ? ((payload as Record<string, unknown>).result as Record<string, unknown>)
        : {};

      const rawPayments = Array.isArray(result.recentPayments) ? result.recentPayments : [];
      setPendingSummary({
        pendingCount: Number(result.pendingCount || 0),
        oldestPendingAt: String(result.oldestPendingAt || ''),
        recentPayments: rawPayments.map((item) => {
          const source = isRecord(item) ? item : {};
          return {
            id: String(source.id || ''),
            tradeId: String(source.tradeId || ''),
            storecode: String(source.storecode || ''),
            storeName: String(source.storeName || ''),
            storeLogo: String(source.storeLogo || ''),
            memberNickname: String(source.memberNickname || ''),
            usdtAmount: Number(source.usdtAmount || 0),
            krwAmount: Number(source.krwAmount || 0),
            createdAt: String(source.createdAt || ''),
            confirmedAt: String(source.confirmedAt || ''),
            orderProcessing: String(source.orderProcessing || ''),
            orderProcessingUpdatedAt: String(source.orderProcessingUpdatedAt || ''),
          };
        }),
      });
      setPendingAlertError(null);
      setPendingAlertLastCheckedAt(new Date().toISOString());
    } catch (error) {
      setPendingAlertError(error instanceof Error ? error.message : '미완료 주문처리 현황 조회 중 오류가 발생했습니다.');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = window.localStorage.getItem(ORDER_PROCESSING_ALERT_SOUND_ENABLED_KEY);
      setPendingAlertSoundEnabled(saved === null ? true : saved === 'true');
    } catch (error) {
      console.warn('failed to load pending alert sound option', error);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    let loading = false;

    const run = async () => {
      if (loading || !isActive) return;
      loading = true;
      await loadPendingOrderProcessingSummary();
      loading = false;
    };

    run();
    const intervalId = window.setInterval(run, ORDER_PROCESSING_ALERT_POLLING_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [loadPendingOrderProcessingSummary]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setPendingAlertCards((previousCards) => {
      const incomingPayments = pendingSummary.recentPayments;
      const incomingByKey = new Map<string, PendingOrderProcessingItem>();
      incomingPayments.forEach((payment) => {
        incomingByKey.set(resolvePendingCardKey(payment), payment);
      });

      const previousByKey = new Map(previousCards.map((card) => [card.cardKey, card]));
      const nextCards: PendingAlertCardItem[] = [];

      incomingPayments.forEach((payment) => {
        const cardKey = resolvePendingCardKey(payment);
        const previousCard = previousByKey.get(cardKey);

        if (previousCard) {
          nextCards.push({
            ...previousCard,
            ...payment,
            cardKey,
            cardState: previousCard.cardState === 'exiting' ? 'stable' : previousCard.cardState,
          });
          return;
        }

        nextCards.push({
          ...payment,
          cardKey,
          cardState: 'entering',
        });

        const settleTimerId = window.setTimeout(() => {
          setPendingAlertCards((cards) =>
            cards.map((card) =>
              card.cardKey === cardKey && card.cardState === 'entering'
                ? { ...card, cardState: 'stable' }
                : card,
            ),
          );
        }, ORDER_PROCESSING_CARD_ENTER_MS);
        pendingCardTimerIdsRef.current.push(settleTimerId);
      });

      previousCards.forEach((card) => {
        if (incomingByKey.has(card.cardKey)) return;

        if (card.cardState === 'exiting') {
          nextCards.push(card);
          return;
        }

        nextCards.push({
          ...card,
          cardState: 'exiting',
        });

        const removeTimerId = window.setTimeout(() => {
          setPendingAlertCards((cards) => cards.filter((entry) => entry.cardKey !== card.cardKey));
        }, ORDER_PROCESSING_CARD_EXIT_MS);
        pendingCardTimerIdsRef.current.push(removeTimerId);
      });

      return nextCards;
    });
  }, [pendingSummary.recentPayments]);

  useEffect(() => {
    const pendingCount = Number(pendingSummary.pendingCount || 0);
    const previousCount = previousPendingCountRef.current;
    const countIncreased = pendingCount > previousCount;

    if (pendingAlertSoundEnabled && pendingCount > 0) {
      const now = Date.now();
      const shouldPlayByInterval = now - lastAlertSoundAtRef.current > ORDER_PROCESSING_ALERT_SOUND_INTERVAL_MS;
      if (countIncreased || shouldPlayByInterval) {
        void playPendingAlertTone().catch(() => undefined);
        lastAlertSoundAtRef.current = now;
      }
    }

    previousPendingCountRef.current = pendingCount;
  }, [pendingAlertSoundEnabled, pendingSummary.pendingCount, playPendingAlertTone]);

  useEffect(() => {
    const audio = getPendingAlertAudio();
    audio?.load();

    const unlockAudio = () => {
      if (pendingAlertAudioUnlockedRef.current) return;

      const pendingCount = Number(pendingSummary.pendingCount || 0);
      if (!pendingAlertSoundEnabled || pendingCount <= 0) return;

      pendingAlertAudioUnlockedRef.current = true;
      void playPendingAlertTone()
        .then(() => {
          lastAlertSoundAtRef.current = Date.now();
        })
        .catch(() => {
          pendingAlertAudioUnlockedRef.current = false;
        });
    };

    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [getPendingAlertAudio, pendingAlertSoundEnabled, pendingSummary.pendingCount, playPendingAlertTone]);

  useEffect(() => {
    return () => {
      if (!pendingAlertAudioRef.current) return;
      pendingAlertAudioRef.current.pause();
      pendingAlertAudioRef.current.currentTime = 0;
      pendingAlertAudioRef.current = null;
      pendingAlertAudioUnlockedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      pendingCardTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
      pendingCardTimerIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const originalTitle = document.title;
    const pendingCount = Number(pendingSummary.pendingCount || 0);
    if (pendingCount > 0) {
      document.title = `[미처리 ${pendingCount}건] ${originalTitle}`;
    }

    return () => {
      document.title = originalTitle;
    };
  }, [pendingSummary.pendingCount]);

  const togglePendingAlertSound = async () => {
    const nextValue = !pendingAlertSoundEnabled;
    setPendingAlertSoundEnabled(nextValue);

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(ORDER_PROCESSING_ALERT_SOUND_ENABLED_KEY, String(nextValue));
      } catch (error) {
        console.warn('failed to store pending alert sound option', error);
      }
    }

    if (nextValue && Number(pendingSummary.pendingCount || 0) > 0) {
      try {
        await playPendingAlertTone();
        lastAlertSoundAtRef.current = Date.now();
      } catch (error) {
        console.warn('failed to play pending alert tone', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-800">
      <AdministrationSidebar
        lang={lang}
        isOpen={isSidebarOpen}
        onOpenChange={setIsSidebarOpen}
      />
      {showPinnedPendingAlert && (
        <div className={`pointer-events-none fixed inset-x-0 top-12 z-[70] px-3 ${isSidebarOpen ? 'lg:pl-[280px]' : 'lg:pl-0'} lg:top-3`}>
          <div className="mx-auto max-w-7xl">
            <section className="pointer-events-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700">Order Processing Alert</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900 sm:text-[15px]">
                    주문처리 미완료 {formatNumber(pendingSummary.pendingCount)}건
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    oldest {toTimeAgoLabel(pendingSummary.oldestPendingAt)} · checked {toDateTimeLabel(pendingAlertLastCheckedAt)}
                  </p>
                  {pendingAlertError && <p className="mt-0.5 text-[11px] text-rose-700">조회 오류: {pendingAlertError}</p>}
                </div>

                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={togglePendingAlertSound}
                    className={`inline-flex h-7 items-center justify-center rounded-lg border px-2 text-[10px] font-semibold transition ${
                      pendingAlertSoundEnabled
                        ? 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {pendingAlertSoundEnabled ? '알림음 끄기' : '알림음 켜기'}
                  </button>
                  <Link
                    href={buyOrderManagementHref}
                    className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    구매주문 대시보드
                  </Link>
                </div>
              </div>

              {pendingAlertCards.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {pendingAlertCards.map((payment) => {
                    const motionClass =
                      payment.cardState === 'exiting'
                        ? 'opacity-0 -translate-y-1 scale-[0.98]'
                        : 'opacity-100 translate-y-0 scale-100';

                    return (
                      <article
                        key={payment.cardKey}
                        className={`min-w-[160px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 transition-all duration-500 ease-out ${motionClass} ${
                          payment.cardState === 'entering' ? 'pending-order-flash' : ''
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                            {payment.storeLogo ? (
                              <span
                                className="h-full w-full bg-cover bg-center"
                                style={{ backgroundImage: `url(${encodeURI(payment.storeLogo)})` }}
                                aria-label={payment.storeName || payment.storecode || 'store logo'}
                              />
                            ) : (
                              (payment.storeName || payment.storecode || 'S').slice(0, 1)
                            )}
                          </span>
                          <p className="truncate text-[11px] font-semibold text-slate-700">
                            {payment.storeName || payment.storecode || '-'}
                          </p>
                        </div>

                        <div className="flex items-end justify-between gap-2">
                          <p className="truncate text-[13px] font-extrabold leading-tight text-slate-900">
                            {payment.memberNickname || '-'}
                          </p>
                          <p className="shrink-0 text-[12px] font-extrabold leading-tight text-rose-700">
                            {toTimeAgoLabel(payment.confirmedAt || payment.createdAt)}
                          </p>
                        </div>

                        <div className="mt-1 flex justify-end gap-1">
                          <div className="w-[72px] rounded-md border border-slate-200 bg-white px-1.5 py-1">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.02em] text-slate-500">USDT</p>
                            <p className="text-right text-[12px] font-extrabold leading-tight text-slate-900">
                              {formatUsdtAmount(payment.usdtAmount)}
                            </p>
                          </div>
                          <div className="w-[72px] rounded-md border border-slate-200 bg-white px-1.5 py-1">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.02em] text-slate-500">KRW</p>
                            <p className="text-right text-[12px] font-extrabold leading-tight text-slate-900">
                              {formatNumber(payment.krwAmount)}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
      <div
        className={`min-h-screen transition-[padding] duration-300 ease-out ${
          isSidebarOpen ? 'lg:pl-[280px]' : 'lg:pl-0'
        }`}
      >
        <div className={showPinnedPendingAlert ? 'pt-44 lg:pt-32' : ''}>
          {children}
        </div>
      </div>
      <AdminSupportChatWidget />
      <style jsx global>{`
        @keyframes pendingOrderFlash {
          0%,
          100% {
            background-color: rgb(248 250 252);
            box-shadow: 0 0 0 0 rgba(225, 29, 72, 0);
          }
          30% {
            background-color: rgb(255 241 242);
            box-shadow: 0 0 0 1px rgba(225, 29, 72, 0.35);
          }
          60% {
            background-color: rgb(248 250 252);
            box-shadow: 0 0 0 0 rgba(225, 29, 72, 0);
          }
        }

        .pending-order-flash {
          animation: pendingOrderFlash 0.85s ease-in-out 2;
        }
      `}</style>
    </div>
  );
}
