'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { resolveStoreBrandColor, rgbaFromHex } from '@/lib/storeBranding';

type StoreNotificationSettings = {
  storecode: string;
  storeName: string;
  storeLogo: string;
  backgroundColor: string;
  paymentCompletedCallbackUrl: string;
};

const DEFAULT_STORE: StoreNotificationSettings = {
  storecode: '',
  storeName: '',
  storeLogo: '',
  backgroundColor: '',
  paymentCompletedCallbackUrl: '',
};

const toText = (value: unknown) => String(value ?? '').trim();

const normalizeHttpUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

const toStoreInitial = (storeName: string, storecode: string) => {
  const source = toText(storeName) || toText(storecode) || 'S';
  return source.slice(0, 1).toUpperCase();
};

export default function StorePaymentCompleteNotificationPage() {
  const params = useParams<{ lang: string }>();
  const lang = Array.isArray(params?.lang) ? params.lang[0] : params?.lang || 'ko';
  const searchParams = useSearchParams();
  const storecode = toText(searchParams?.get('storecode'));
  const storeQuery = useMemo(() => (storecode ? `?storecode=${encodeURIComponent(storecode)}` : ''), [storecode]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [store, setStore] = useState<StoreNotificationSettings>(DEFAULT_STORE);
  const [callbackUrl, setCallbackUrl] = useState('');

  const resolvedBrandColor = useMemo(
    () => resolveStoreBrandColor(storecode || 'payment-complete-notification', store.backgroundColor),
    [store.backgroundColor, storecode],
  );
  const heroBackground = useMemo(
    () => `radial-gradient(circle at top left, ${rgbaFromHex(resolvedBrandColor, 0.4)} 0%, ${rgbaFromHex(resolvedBrandColor, 0.18)} 30%, #08111f 100%)`,
    [resolvedBrandColor],
  );

  const loadStore = useCallback(async () => {
    if (!storecode) {
      setStore(DEFAULT_STORE);
      setCallbackUrl('');
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/store/getOneStore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storecode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.result) {
        throw new Error(String(payload?.error || '가맹점 정보를 불러오지 못했습니다.'));
      }

      const result = payload.result as Record<string, unknown>;
      const nextStore = {
        storecode: toText(result.storecode) || storecode,
        storeName: toText(result.storeName) || storecode,
        storeLogo: toText(result.storeLogo),
        backgroundColor: toText(result.backgroundColor),
        paymentCompletedCallbackUrl: toText(result.paymentCompletedCallbackUrl),
      };

      setStore(nextStore);
      setCallbackUrl(nextStore.paymentCompletedCallbackUrl);
    } catch (loadError) {
      setStore(DEFAULT_STORE);
      setCallbackUrl('');
      setError(loadError instanceof Error ? loadError.message : '가맹점 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [storecode]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  const normalizedCurrentUrl = toText(store.paymentCompletedCallbackUrl);
  const normalizedNextUrl = toText(callbackUrl);
  const isDirty = normalizedCurrentUrl !== normalizedNextUrl;
  const isValidUrl = !normalizedNextUrl || Boolean(normalizeHttpUrl(normalizedNextUrl));

  const samplePayload = useMemo(
    () => ({
      event: 'payment.completed',
      version: 1,
      occurredAt: '2026-03-17T10:15:30.000Z',
      store: {
        storecode: store.storecode || storecode || 'r1mmtgzp',
        storeName: store.storeName || 'Store Name',
      },
      payment: {
        id: '67d1b8b1281f4f0012345678',
        paymentId: '48219374',
        productId: 'P-240317-001',
        product_id: 'P-240317-001',
        status: 'COMPLETED',
        usdtAmount: 125.5,
        krwAmount: 185000,
        exchangeRate: 1474.1,
        transactionHash: '0x1234abcd5678ef901234abcd5678ef901234abcd5678ef901234abcd5678ef90',
        fromWalletAddress: '0x1111111111111111111111111111111111111111',
        toWalletAddress: '0x2222222222222222222222222222222222222222',
        createdAt: '2026-03-17T10:03:10.000Z',
        confirmedAt: '2026-03-17T10:04:22.000Z',
        orderProcessingUpdatedAt: '2026-03-17T10:15:30.000Z',
        orderProcessingMemo: '원화 충전 완료 처리했습니다.',
      },
      member: {
        nickname: 'member77',
        depositName: 'Genie Kim',
      },
      actor: {
        walletAddress: '0x3333333333333333333333333333333333333333',
        nickname: 'store-admin',
        role: 'store-admin',
        ipAddress: '203.0.113.10',
      },
    }),
    [store.storeName, store.storecode, storecode],
  );

  const callbackHeaders = useMemo(
    () => [
      {
        name: 'Content-Type',
        value: 'application/json',
        description: 'JSON body로 전달됩니다.',
      },
      {
        name: 'x-gobyte-event',
        value: 'payment.completed',
        description: '이 callback이 결제완료 이벤트임을 나타냅니다.',
      },
      {
        name: 'x-gobyte-storecode',
        value: store.storecode || storecode || 'r1mmtgzp',
        description: '어느 가맹점 결제인지 식별할 수 있습니다.',
      },
    ],
    [store.storecode, storecode],
  );

  const callbackGuideSteps = useMemo(
    () => [
      '외부 서버에서 POST JSON endpoint를 하나 만들고 공개 HTTPS URL을 준비합니다.',
      '요청 body의 `payment.id` 또는 `payment.paymentId`를 기준으로 중복 수신을 방지하고, `payment.product_id`로 내부 상품과 매핑하면 됩니다.',
      '정상 처리 후에는 HTTP 200~299 응답을 반환합니다. 2xx가 아니면 실패로 기록됩니다.',
      'callback 실패가 있어도 내부 결제완료 처리는 유지되므로, 실패 로그를 별도로 모니터링하는 것이 좋습니다.',
    ],
    [],
  );

  const callbackRequestExample = useMemo(() => {
    const targetUrl = normalizeHttpUrl(normalizedCurrentUrl) || 'https://your-service.example.com/payment/completed';

    return [
      `curl -X POST '${targetUrl}' \\`,
      `  -H 'Content-Type: application/json' \\`,
      `  -H 'x-gobyte-event: payment.completed' \\`,
      `  -H 'x-gobyte-storecode: ${store.storecode || storecode || 'r1mmtgzp'}' \\`,
      `  --data '${JSON.stringify(samplePayload)}'`,
    ].join('\n');
  }, [normalizedCurrentUrl, samplePayload, store.storecode, storecode]);

  const handleSave = useCallback(async () => {
    if (!storecode || saving) return;

    const normalizedUrl = normalizeHttpUrl(normalizedNextUrl);
    if (normalizedNextUrl && !normalizedUrl) {
      setError('http 또는 https 절대 URL 형식으로 입력해 주세요.');
      setSuccessMessage('');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/store/updateStorePaymentCompletedCallbackUrl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storecode,
          paymentCompletedCallbackUrl: normalizedUrl,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.result !== true) {
        throw new Error(String(payload?.error || '결제완료 통보 URL 저장에 실패했습니다.'));
      }

      setStore((prev) => ({
        ...prev,
        storecode: prev.storecode || storecode,
        paymentCompletedCallbackUrl: normalizedUrl,
      }));
      setCallbackUrl(normalizedUrl);
      setSuccessMessage(
        normalizedUrl
          ? '결제완료 통보 URL을 저장했습니다.'
          : '결제완료 통보 URL을 삭제했습니다.',
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '결제완료 통보 URL 저장에 실패했습니다.');
      setSuccessMessage('');
    } finally {
      setSaving(false);
    }
  }, [normalizedNextUrl, saving, storecode]);

  const storeTitle = store.storeName || storecode || '가맹점';
  const storeLogoStyle = store.storeLogo
    ? { backgroundImage: `url("${encodeURI(store.storeLogo)}")` }
    : undefined;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-white/65 bg-white shadow-[0_32px_90px_-48px_rgba(15,23,42,0.45)]">
        <div className="relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7" style={{ backgroundImage: heroBackground }}>
          <div className="absolute -left-10 top-6 h-36 w-36 rounded-full blur-3xl" style={{ backgroundColor: rgbaFromHex(resolvedBrandColor, 0.22) }} />
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: rgbaFromHex(resolvedBrandColor, 0.16) }} />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] border border-white/16 bg-white/10 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur">
                {store.storeLogo ? (
                  <div
                    className="h-full w-full rounded-[22px] border border-white/70 bg-white bg-cover bg-center"
                    style={storeLogoStyle}
                    aria-label={storeTitle}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-white/20 bg-white/10 text-2xl font-black text-white">
                    {toStoreInitial(store.storeName, storecode)}
                  </div>
                )}
              </div>

              <div className="min-w-0 max-w-3xl">
                <span className="inline-flex items-center rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-50">
                  Payment Complete Notification
                </span>
                <div className="mt-4 rounded-[28px] border border-white/12 bg-white/8 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/85">Store</p>
                  <h1 className="mt-2 truncate text-3xl font-black tracking-tight text-white sm:text-4xl">
                    {storeTitle}
                  </h1>
                  <p className="mt-2 text-sm font-semibold text-cyan-100/85">
                    {storecode ? `storecode=${storecode}` : 'storecode 파라미터가 필요합니다.'}
                  </p>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-100/88">
                    결제관리에서 `결제처리완료`로 상태가 바뀌는 순간, 이 페이지에 등록한 URL로 POST callback을 보내며
                    결제정보에는 `product_id`도 함께 포함됩니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
              <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Current URL</p>
                <p className="mt-1 break-all text-sm font-semibold text-white">
                  {normalizedCurrentUrl || '미등록'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">Trigger</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  결제처리완료 API 호출 시
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!storecode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
          URL에 `?storecode=...` 파라미터가 필요합니다.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_48px_-36px_rgba(15,23,42,0.18)] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: resolvedBrandColor }}>
                Callback URL
              </p>
              <p className="mt-2 text-sm text-slate-600">
                등록한 URL로 `Content-Type: application/json` POST 요청을 보냅니다. 비워서 저장하면 callback이 비활성화됩니다.
              </p>
            </div>
            <Link
              href={`/${lang}/p2p/store-management/payment-management${storeQuery}`}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
            >
              결제관리로 이동
            </Link>
          </div>

          <div className="mt-5 rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-4 sm:p-5">
            <label className="block">
              <span className="text-sm font-semibold text-slate-900">결제완료 통보 URL</span>
              <input
                type="url"
                value={callbackUrl}
                onChange={(event) => setCallbackUrl(event.target.value)}
                placeholder="https://your-service.example.com/payment/completed"
                disabled={!storecode || loading || saving}
                className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Validation</p>
                <p className={`mt-1 text-sm font-semibold ${isValidUrl ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isValidUrl ? 'http/https URL 형식 확인됨' : '유효한 절대 URL이 아닙니다.'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Method</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">POST JSON</p>
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </p>
            )}

            {successMessage && (
              <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {successMessage}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!storecode || loading || saving || !isDirty || !isValidUrl}
                className={`inline-flex h-12 min-w-[180px] items-center justify-center rounded-2xl px-5 text-sm font-semibold transition ${
                  !storecode || loading || saving || !isDirty || !isValidUrl
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                    : 'text-slate-950'
                }`}
                style={
                  !storecode || loading || saving || !isDirty || !isValidUrl
                    ? undefined
                    : { backgroundColor: resolvedBrandColor }
                }
              >
                {saving ? '저장 중...' : 'URL 저장'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCallbackUrl(normalizedCurrentUrl);
                  setError('');
                  setSuccessMessage('');
                }}
                disabled={loading || saving || !isDirty}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                입력값 되돌리기
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)] sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: resolvedBrandColor }}>
              Callback Payload
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              아래 JSON이 결제처리완료 시점에 body로 전달됩니다. 헤더에는 `x-gobyte-event: payment.completed`와
              `x-gobyte-storecode`가 추가되며, `payment.productId`와 `payment.product_id`로 상품번호도 함께 전달됩니다.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-[11px] leading-6 text-slate-100">
              {JSON.stringify(samplePayload, null, 2)}
            </pre>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)] sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: resolvedBrandColor }}>
              Dispatch Rule
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>1. 결제관리 페이지에서 `결제처리완료` 버튼을 눌러 `COMPLETED`로 전환될 때만 호출됩니다.</p>
              <p>2. 동일 결제가 이미 `COMPLETED` 상태면 중복 호출하지 않습니다.</p>
              <p>3. 외부 URL 응답 실패가 있어도 가맹점 내부 결제처리완료 저장은 유지됩니다.</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.16)] sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: resolvedBrandColor }}>
            Callback Spec
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            외부 서버는 아래 규격으로 callback을 받으면 됩니다. 응답은 `HTTP 2xx`를 반환해야 성공으로 처리됩니다.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Method</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">POST</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Content-Type</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">application/json</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Timeout</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">5초</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Success</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">HTTP 200-299</p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200">
            <div className="grid grid-cols-[minmax(0,0.34fr)_minmax(0,0.28fr)_minmax(0,0.38fr)] bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span>Header</span>
              <span>Value</span>
              <span>Description</span>
            </div>
            {callbackHeaders.map((header) => (
              <div
                key={header.name}
                className="grid grid-cols-[minmax(0,0.34fr)_minmax(0,0.28fr)_minmax(0,0.38fr)] gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-700"
              >
                <span className="break-all font-semibold text-slate-900">{header.name}</span>
                <span className="break-all font-mono text-[12px]">{header.value}</span>
                <span className="leading-6">{header.description}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.16)] sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: resolvedBrandColor }}>
              Integration Guide
            </p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              {callbackGuideSteps.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-slate-950"
                    style={{ backgroundColor: rgbaFromHex(resolvedBrandColor, 0.92) }}
                  >
                    {index + 1}
                  </span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.16)] sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: resolvedBrandColor }}>
              Sample Request
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              아래 `curl` 예시 그대로 테스트하면 외부 서버에서 실제 수신 포맷을 먼저 검증할 수 있습니다.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 text-[11px] leading-6 text-slate-100">
              {callbackRequestExample}
            </pre>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
              외부 endpoint는 간단히 `200 OK` 또는 {'`{"result":true}`'} 같은 2xx 응답만 주면 됩니다.
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
