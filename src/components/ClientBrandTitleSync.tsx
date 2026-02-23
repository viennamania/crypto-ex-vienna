'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ClientBrandTitleSyncProps = {
  enabled?: boolean;
  pendingCount?: number;
  fallbackTitle?: string;
};

const DEFAULT_FALLBACK_TITLE = 'OTC Service';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export default function ClientBrandTitleSync({
  enabled = true,
  pendingCount = 0,
  fallbackTitle = DEFAULT_FALLBACK_TITLE,
}: ClientBrandTitleSyncProps) {
  const [brandTitle, setBrandTitle] = useState(fallbackTitle);
  const originalDocumentTitleRef = useRef('');

  const loadBrandTitle = useCallback(async () => {
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
      const nextTitle = String(clientInfo.name || '').trim() || fallbackTitle;
      setBrandTitle(nextTitle);
    } catch (error) {
      console.error('failed to load client brand title', error);
      setBrandTitle(fallbackTitle);
    }
  }, [fallbackTitle]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let isMounted = true;

    const run = async () => {
      if (!isMounted) return;
      await loadBrandTitle();
    };

    const handleClientSettingsUpdated = () => {
      void run();
    };

    void run();
    window.addEventListener('client-settings-updated', handleClientSettingsUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('client-settings-updated', handleClientSettingsUpdated);
    };
  }, [enabled, loadBrandTitle]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    if (!originalDocumentTitleRef.current) {
      originalDocumentTitleRef.current = document.title;
    }

    return () => {
      if (originalDocumentTitleRef.current) {
        document.title = originalDocumentTitleRef.current;
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const normalizedBrandTitle = String(brandTitle || '').trim() || fallbackTitle;
    const normalizedPendingCount = Number(pendingCount || 0);
    document.title = normalizedPendingCount > 0
      ? `[미처리 ${normalizedPendingCount}건] ${normalizedBrandTitle}`
      : normalizedBrandTitle;
  }, [brandTitle, enabled, fallbackTitle, pendingCount]);

  return null;
}
