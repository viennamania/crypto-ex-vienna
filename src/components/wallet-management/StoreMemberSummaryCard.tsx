'use client';

type StoreMemberSummaryCardProps = {
  memberId: string;
  memberName?: string;
  storeLabel?: string;
};

export default function StoreMemberSummaryCard({
  memberId,
  memberName = '',
  storeLabel = '',
}: StoreMemberSummaryCardProps) {
  const normalizedMemberId = String(memberId || '').trim();
  const normalizedMemberName = String(memberName || '').trim();
  const normalizedStoreLabel = String(storeLabel || '').trim();

  if (!normalizedMemberId) {
    return null;
  }

  return (
    <section className="mb-5 rounded-[26px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm shadow-[0_18px_45px_-30px_rgba(16,185,129,0.42)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-emerald-800">연동된 가맹점 회원 정보</p>
        {normalizedStoreLabel && (
          <span className="inline-flex h-7 items-center rounded-full border border-emerald-200 bg-white px-2.5 text-[11px] font-semibold text-emerald-700">
            {normalizedStoreLabel}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-white/80 px-3 py-3">
          <p className="text-[11px] font-semibold text-emerald-700">회원 아이디</p>
          <p className="mt-1 break-all text-2xl font-extrabold leading-tight text-emerald-900">
            {normalizedMemberId}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white/80 px-3 py-3">
          <p className="text-[11px] font-semibold text-emerald-700">이름</p>
          <p className="mt-1 break-all text-lg font-bold leading-tight text-emerald-900">
            {normalizedMemberName || '-'}
          </p>
        </div>
      </div>
    </section>
  );
}
