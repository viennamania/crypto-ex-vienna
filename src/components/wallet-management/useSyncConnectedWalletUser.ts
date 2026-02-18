'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

const SYNC_CACHE_MS = 5 * 60 * 1000;

const isWalletAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

export function useSyncConnectedWalletUser(walletAddress?: string) {
  const searchParams = useSearchParams();
  const inFlightRef = useRef<Set<string>>(new Set());
  const normalizedWalletAddress = useMemo(
    () => String(walletAddress || '').trim(),
    [walletAddress],
  );
  const normalizedStorecode = useMemo(
    () => String(searchParams?.get('storecode') || '').trim(),
    [searchParams],
  );

  useEffect(() => {
    if (!isWalletAddress(normalizedWalletAddress)) {
      return;
    }

    const syncKey = `${normalizedWalletAddress.toLowerCase()}::${normalizedStorecode || '*'}`;
    if (inFlightRef.current.has(syncKey)) {
      return;
    }

    const cacheKey = `thirdweb-user-sync:${syncKey}`;
    const cachedAtRaw = typeof window !== 'undefined' ? window.sessionStorage.getItem(cacheKey) : null;
    const cachedAt = Number(cachedAtRaw || 0);
    if (Number.isFinite(cachedAt) && cachedAt > 0 && Date.now() - cachedAt < SYNC_CACHE_MS) {
      return;
    }

    const abortController = new AbortController();
    inFlightRef.current.add(syncKey);

    (async () => {
      try {
        const response = await fetch('/api/user/syncThirdwebUser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortController.signal,
          body: JSON.stringify({
            walletAddress: normalizedWalletAddress,
            ...(normalizedStorecode ? { storecode: normalizedStorecode } : {}),
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(String(data?.error || 'Failed to sync thirdweb user profile'));
        }

        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(cacheKey, String(Date.now()));
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.warn('Failed to sync connected wallet user profile', error);
      } finally {
        inFlightRef.current.delete(syncKey);
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [normalizedWalletAddress, normalizedStorecode]);
}
