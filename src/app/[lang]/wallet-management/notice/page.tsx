'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Manrope, Playfair_Display } from 'next/font/google';

import WalletManagementBottomNav from '@/components/wallet-management/WalletManagementBottomNav';
import { rgbaFromHex, resolveStoreBrandColor } from '@/lib/storeBranding';

type NoticeItem = {
  id: string;
  title: string;
  summary?: string;
  content?: string[] | string;
  isPinned?: boolean;
  publishedAt?: string;
  createdAt?: string;
};

type StoreBrandInfo = {
  storeName: string;
  backgroundColor: string;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveNoticeSummary = (notice: NoticeItem): string => {
  if (notice.summary) {
    return notice.summary;
  }
  if (Array.isArray(notice.content)) {
    return notice.content.find((line) => String(line || '').trim()) || '';
  }
  if (typeof notice.content === 'string') {
    return notice.content.split('\n').find((line) => line.trim()) || '';
  }
  return '';
};

const resolveNoticeDateLabel = (notice: NoticeItem): string => {
  const dateSource = String(notice.publishedAt || notice.createdAt || '').trim();
  if (!dateSource) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateSource)) {
    return dateSource;
  }
  const parsedDate = new Date(dateSource);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateSource.slice(0, 10);
  }
  return parsedDate.toISOString().slice(0, 10);
};

const resolveNoticeContentLines = (notice: NoticeItem): string[] => {
  if (Array.isArray(notice.content)) {
    return notice.content.map((line) => String(line || '').trim()).filter(Boolean);
  }
  if (typeof notice.content === 'string') {
    return notice.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  const summary = resolveNoticeSummary(notice);
  return summary ? [summary] : [];
};

export default function WalletManagementNoticePage() {
  const params = useParams<{ lang?: string }>();
  const searchParams = useSearchParams();
  const langParam = params?.lang;
  const lang = Array.isArray(langParam) ? langParam[0] : langParam || 'ko';
  const storecode = String(searchParams?.get('storecode') || '').trim();
  const noticeIdFromQuery = String(searchParams?.get('noticeId') || '').trim();

  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedNoticeId, setSelectedNoticeId] = useState('');
  const [storeBrandInfo, setStoreBrandInfo] = useState<StoreBrandInfo | null>(null);

  const storeBrandColor = useMemo(
    () => resolveStoreBrandColor(storecode, storeBrandInfo?.backgroundColor),
    [storeBrandInfo?.backgroundColor, storecode],
  );
  const storeBrandSoftBackground = useMemo(
    () => rgbaFromHex(storeBrandColor, 0.1),
    [storeBrandColor],
  );
  const storeBrandLightBorder = useMemo(
    () => rgbaFromHex(storeBrandColor, 0.35),
    [storeBrandColor],
  );
  const backPath = useMemo(() => {
    const query = new URLSearchParams();
    if (storecode) {
      query.set('storecode', storecode);
    }
    const queryString = query.toString();
    return `/${lang}/wallet-management${queryString ? `?${queryString}` : ''}`;
  }, [lang, storecode]);

  const selectedNotice = useMemo(
    () => notices.find((item) => item.id === selectedNoticeId) || null,
    [notices, selectedNoticeId],
  );

  useEffect(() => {
    let mounted = true;
    const loadNotices = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetch('/api/notice/getActive?limit=100&sortBy=publishedAt&pinnedFirst=true');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(data?.error || '공지사항을 불러오지 못했습니다.'));
        }

        const source = Array.isArray(data?.result) ? data.result : [];
        const normalized = source
          .map((item: unknown): NoticeItem | null => {
            if (!isRecord(item)) {
              return null;
            }
            const id = String(item._id || item.id || '').trim();
            const title = String(item.title || '').trim();
            if (!id || !title) {
              return null;
            }
            return {
              id,
              title,
              summary: String(item.summary || '').trim(),
              content: Array.isArray(item.content)
                ? item.content.map((line: unknown) => String(line || ''))
                : typeof item.content === 'string'
                  ? item.content
                  : '',
              isPinned: item.isPinned === true,
              publishedAt: String(item.publishedAt || '').trim(),
              createdAt: String(item.createdAt || '').trim(),
            };
          })
          .filter((item: NoticeItem | null): item is NoticeItem => item !== null);

        if (mounted) {
          setNotices(normalized);
        }
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : '공지사항을 불러오지 못했습니다.';
          setErrorMessage(message);
          setNotices([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadNotices();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadStoreBrandInfo = async () => {
      if (!storecode) {
        setStoreBrandInfo(null);
        return;
      }

      try {
        const response = await fetch('/api/store/getOneStore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storecode }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(data?.error || '가맹점 정보를 불러오지 못했습니다.'));
        }
        const store = isRecord(data?.result) ? data.result : null;
        if (!mounted) {
          return;
        }
        if (!store) {
          setStoreBrandInfo(null);
          return;
        }
        setStoreBrandInfo({
          storeName: String(store.storeName || storecode).trim(),
          backgroundColor: String(store.backgroundColor || '').trim(),
        });
      } catch (error) {
        if (mounted) {
          setStoreBrandInfo(null);
        }
      }
    };

    loadStoreBrandInfo();

    return () => {
      mounted = false;
    };
  }, [storecode]);

  useEffect(() => {
    if (notices.length === 0) {
      setSelectedNoticeId('');
      return;
    }
    if (noticeIdFromQuery) {
      const matched = notices.find((item) => item.id === noticeIdFromQuery);
      if (matched) {
        setSelectedNoticeId(matched.id);
        return;
      }
    }
    setSelectedNoticeId((prev) => {
      if (prev && notices.some((item) => item.id === prev)) {
        return prev;
      }
      return notices[0].id;
    });
  }, [noticeIdFromQuery, notices]);

  return (
    <main
      className={`${displayFont.variable} ${bodyFont.variable} relative min-h-screen overflow-hidden bg-[radial-gradient(130%_130%_at_100%_0%,#cffafe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-900`}
      style={{ fontFamily: 'var(--font-body), "Avenir Next", "Segoe UI", sans-serif' }}
    >
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl"
        style={{ backgroundColor: rgbaFromHex(storeBrandColor, 0.32) }}
      />
      <div
        className="pointer-events-none absolute top-24 right-0 h-80 w-80 rounded-full blur-3xl"
        style={{ backgroundColor: rgbaFromHex(storeBrandColor, 0.2) }}
      />

      <div className="relative mx-auto w-full max-w-[430px] px-4 pb-28 pt-8">
        <header className="mb-5 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <p
              className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]"
              style={{
                borderColor: storeBrandLightBorder,
                color: storeBrandColor,
                backgroundColor: storeBrandSoftBackground,
              }}
            >
              Notice Center
            </p>
            <Link
              href={backPath}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              홈으로
            </Link>
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">공지사항</h1>
          <p className="mt-2 text-sm text-slate-600">
            {storecode
              ? `${storeBrandInfo?.storeName || storecode} 관련 공지와 서비스 업데이트를 확인하세요.`
              : '서비스 공지와 정책/업데이트 안내를 한곳에서 확인하세요.'}
          </p>
        </header>

        <section className="mb-5 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">공지사항 목록</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {notices.length}건
            </span>
          </div>

          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {loading && (
              <>
                <div className="h-[84px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80" />
                <div className="h-[84px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70" />
              </>
            )}

            {!loading && errorMessage && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-600">
                {errorMessage}
              </p>
            )}

            {!loading && !errorMessage && notices.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                등록된 공지사항이 없습니다.
              </p>
            )}

            {!loading &&
              !errorMessage &&
              notices.map((notice) => {
                const selected = notice.id === selectedNoticeId;
                const summary = resolveNoticeSummary(notice);
                const dateLabel = resolveNoticeDateLabel(notice);
                return (
                  <button
                    key={notice.id}
                    type="button"
                    onClick={() => setSelectedNoticeId(notice.id)}
                    className={`w-full rounded-2xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? 'border-cyan-300 bg-cyan-50 shadow-[0_12px_26px_-18px_rgba(6,182,212,0.65)]'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
                      <span>{dateLabel || '공지'}</span>
                      <span>{notice.isPinned ? '중요 공지' : '상세 보기'}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-900">{notice.title}</p>
                    {summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{summary}</p>
                    )}
                  </button>
                );
              })}
          </div>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.42)] backdrop-blur">
          <h2 className="text-lg font-semibold text-slate-900">상세보기</h2>
          {selectedNotice ? (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <span>{resolveNoticeDateLabel(selectedNotice) || '공지'}</span>
                {selectedNotice.isPinned && (
                  <span
                    className="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      borderColor: storeBrandLightBorder,
                      color: storeBrandColor,
                      backgroundColor: storeBrandSoftBackground,
                    }}
                  >
                    중요 공지
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedNotice.title}</h3>
              {resolveNoticeSummary(selectedNotice) && (
                <p className="mt-2 text-sm text-slate-600">{resolveNoticeSummary(selectedNotice)}</p>
              )}
              <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                {resolveNoticeContentLines(selectedNotice).length > 0 ? (
                  resolveNoticeContentLines(selectedNotice).map((line, index) => (
                    <p key={`${selectedNotice.id}-line-${index}`} className="text-sm leading-relaxed text-slate-700">
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">상세 내용이 없습니다.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              목록에서 공지사항을 선택하면 상세 내용을 확인할 수 있습니다.
            </p>
          )}
        </section>
      </div>

      <WalletManagementBottomNav lang={lang} active="home" />
    </main>
  );
}
