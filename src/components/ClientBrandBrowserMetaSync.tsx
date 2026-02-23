'use client';

import { useCallback, useEffect } from 'react';

const DEFAULT_BRAND_TITLE = 'OTC Service';
const DEFAULT_FAVICON = '/favicon.ico';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeFaviconHref = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_FAVICON;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return DEFAULT_FAVICON;
};

const upsertIconLink = (rel: string, href: string) => {
  if (typeof document === 'undefined') return;
  const head = document.head;
  if (!head) return;

  const selector = `link[rel="${rel}"]`;
  let link = head.querySelector(selector) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', rel);
    head.appendChild(link);
  }
  link.setAttribute('href', href);
};

const syncFavicon = (href: string) => {
  upsertIconLink('icon', href);
  upsertIconLink('shortcut icon', href);
  upsertIconLink('apple-touch-icon', href);
};

export default function ClientBrandBrowserMetaSync() {
  const loadBranding = useCallback(async () => {
    try {
      const response = await fetch('/api/client/getClientInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || '센터 브랜딩 정보를 조회하지 못했습니다.'));
      }

      const source = isRecord(payload) ? payload : {};
      const result = isRecord(source.result) ? source.result : {};
      const clientInfo = isRecord(result.clientInfo) ? result.clientInfo : {};

      const nextTitle = String(clientInfo.name || '').trim() || DEFAULT_BRAND_TITLE;
      const nextFavicon = normalizeFaviconHref(clientInfo.logo);

      if (typeof document !== 'undefined') {
        document.title = nextTitle;
      }
      syncFavicon(nextFavicon);
    } catch (error) {
      console.error('failed to load browser branding', error);
      if (typeof document !== 'undefined') {
        document.title = DEFAULT_BRAND_TITLE;
      }
      syncFavicon(DEFAULT_FAVICON);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!mounted) return;
      await loadBranding();
    };

    const handleClientSettingsUpdated = () => {
      void run();
    };

    void run();
    window.addEventListener('client-settings-updated', handleClientSettingsUpdated);

    return () => {
      mounted = false;
      window.removeEventListener('client-settings-updated', handleClientSettingsUpdated);
    };
  }, [loadBranding]);

  return null;
}
