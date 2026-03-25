'use client';

import React, { forwardRef } from 'react';

type StoreMemberLinkCardProps = {
  storeLabel?: string;
  loading?: boolean;
  memberIdValue: string;
  memberPasswordValue: string;
  onMemberIdChange: (value: string) => void;
  onMemberPasswordChange: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  helperText?: string;
  submitLabel?: string;
};

const DEFAULT_TITLE = '가맹점 회원 연동';
const DEFAULT_DESCRIPTION = '지갑과 가맹점 회원정보가 아직 연동되지 않았습니다. 회원 아이디와 비밀번호를 입력해 먼저 연동해 주세요.';
const DEFAULT_HELPER_TEXT = '회원 아이디와 비밀번호를 모를 경우 가맹점에 문의하세요.';
const DEFAULT_SUBMIT_LABEL = '회원정보 연동하기';

const StoreMemberLinkCard = forwardRef<HTMLDivElement, StoreMemberLinkCardProps>(function StoreMemberLinkCard(
  {
    storeLabel = '',
    loading = false,
    memberIdValue,
    memberPasswordValue,
    onMemberIdChange,
    onMemberPasswordChange,
    onSubmit,
    submitting = false,
    error = null,
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    helperText = DEFAULT_HELPER_TEXT,
    submitLabel = DEFAULT_SUBMIT_LABEL,
  },
  ref,
) {
  const normalizedStoreLabel = String(storeLabel || '').trim();
  const normalizedError = String(error || '').trim();

  return (
    <section
      ref={ref}
      className="mb-5 rounded-[26px] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#fffbeb_100%)] px-4 py-3 text-sm shadow-[0_18px_45px_-30px_rgba(245,158,11,0.45)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-amber-800">{title}</p>
        {normalizedStoreLabel && (
          <span className="inline-flex h-7 items-center rounded-full border border-amber-200 bg-white px-2.5 text-[11px] font-semibold text-amber-700">
            {normalizedStoreLabel}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex h-5 w-5 items-center justify-center">
              <span className="absolute h-5 w-5 rounded-full border-2 border-cyan-300/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-600 animate-ping" />
            </span>
            <p className="text-sm font-semibold text-cyan-800">내 지갑 기준 가맹점 회원정보를 확인 중입니다...</p>
          </div>
          <div className="mt-2 flex items-center gap-1.5 pl-7">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce" />
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:240ms]" />
            <span className="text-[11px] font-semibold text-cyan-700">검색 중...</span>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 font-semibold text-amber-800">{description}</p>
          <p className="mt-1 text-xs font-semibold text-amber-800">{helperText}</p>
          {normalizedError && (
            <p className="mt-2 text-xs font-semibold text-rose-600">{normalizedError}</p>
          )}

          <div className="mt-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <input
                value={memberIdValue}
                onChange={(event) => onMemberIdChange(event.target.value)}
                placeholder="회원 아이디"
                maxLength={24}
                disabled={submitting}
                className="h-12 w-full rounded-2xl border-2 border-amber-300 bg-white px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-amber-500 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
              <input
                type="password"
                value={memberPasswordValue}
                onChange={(event) => onMemberPasswordChange(event.target.value)}
                placeholder="비밀번호"
                autoComplete="current-password"
                maxLength={64}
                disabled={submitting}
                className="h-12 w-full rounded-2xl border-2 border-amber-300 bg-white px-4 text-base font-semibold text-slate-800 outline-none transition focus:border-amber-500 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? '인증 처리 중...' : submitLabel}
            </button>
          </div>
        </>
      )}
    </section>
  );
});

export default StoreMemberLinkCard;
