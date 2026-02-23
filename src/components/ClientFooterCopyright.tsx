'use client';

import { useCallback, useEffect, useState } from 'react';

type ClientFooterCopyrightProps = {
  className?: string;
  fallback?: string;
};

const DEFAULT_COPYRIGHT = 'Copyright © Platform. All Rights Reserved';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export default function ClientFooterCopyright({
  className,
  fallback = DEFAULT_COPYRIGHT,
}: ClientFooterCopyrightProps) {
  const [copyrightText, setCopyrightText] = useState(fallback);

  const loadCopyright = useCallback(async () => {
    try {
      const response = await fetch('/api/client/getClientInfo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as Record<string, unknown>)?.error || 'failed to load client footer copyright'));
      }

      const source = isRecord(payload) ? payload : {};
      const result = isRecord(source.result) ? source.result : {};
      const clientInfo = isRecord(result.clientInfo) ? result.clientInfo : {};
      const nextCopyright = String(clientInfo.copyright || '').trim() || fallback;
      setCopyrightText(nextCopyright);
    } catch (error) {
      console.error('failed to load client footer copyright', error);
      setCopyrightText(fallback);
    }
  }, [fallback]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      if (!isMounted) {
        return;
      }
      await loadCopyright();
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
  }, [loadCopyright]);

  return <p className={className}>{copyrightText}</p>;
}
