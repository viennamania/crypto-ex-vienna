'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';

type BuyerStatus = 'pending' | 'confirmed' | 'rejected' | undefined;
type KycStatus = 'pending' | 'approved' | 'rejected' | 'none' | undefined;

export default function BuyerDetailPage() {
  const params = useParams<{ lang?: string; walletAddress?: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const storecode = searchParams.get('storecode') || 'admin';
  const walletAddressParam = Array.isArray(params?.walletAddress)
    ? params?.walletAddress?.[0]
    : params?.walletAddress;
  const walletAddress = walletAddressParam || '';

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState<'approve' | 'reject' | null>(null);
  const rejectionReasons = [
    '신분증 식별 불가',
    '정보 불일치',
    '사진 품질 불량',
    '타인 신분증 의심',
    '유효기간 만료',
    '얼굴/정보 가림',
    '서류 종류 불일치',
    '중복 제출',
    '기타',
  ];
  const [selectedRejectionReason, setSelectedRejectionReason] = useState('');
  const [customRejectionReason, setCustomRejectionReason] = useState('');

  const fetchUser = async () => {
    if (!walletAddress) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/user/getUser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storecode,
          walletAddress,
        }),
      });
      const data = await response.json();
      setUser(data?.result || null);
    } catch (error) {
      console.error('Failed to fetch user', error);
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, storecode]);

  useEffect(() => {
    if (user?.buyer?.kyc?.rejectionReason) {
      setSelectedRejectionReason(user.buyer.kyc.rejectionReason);
      if (!rejectionReasons.includes(user.buyer.kyc.rejectionReason)) {
        setSelectedRejectionReason('기타');
        setCustomRejectionReason(user.buyer.kyc.rejectionReason);
      }
    }
  }, [user]);

  const buyer = user?.buyer || {};
  const buyerStatus: BuyerStatus = buyer?.status;
  const kycStatus: KycStatus = buyer?.kyc?.status || (buyer?.kyc?.idImageUrl ? 'pending' : 'none');
  const kycImageUrl = buyer?.kyc?.idImageUrl;

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!walletAddress || !buyer) {
      return;
    }
    if (decision === 'rejected' && !selectedRejectionReason) {
      toast.error('거절 사유를 선택해 주세요.');
      return;
    }
    if (decision === 'rejected' && selectedRejectionReason === '기타' && !customRejectionReason.trim()) {
      toast.error('기타 사유를 입력해 주세요.');
      return;
    }
    setDecisionLoading(decision === 'approved' ? 'approve' : 'reject');
    try {
      const nextBuyerStatus = decision === 'approved' ? 'confirmed' : 'rejected';
      const finalRejectionReason =
        decision === 'rejected'
          ? selectedRejectionReason === '기타'
            ? customRejectionReason.trim()
            : selectedRejectionReason
          : '';
      const updatedBuyer = {
        ...buyer,
        status: nextBuyerStatus,
        kyc: {
          ...(buyer?.kyc || {}),
          status: decision,
          reviewedAt: new Date().toISOString(),
          rejectionReason: finalRejectionReason,
        },
      };

      await fetch('/api/user/updateBuyer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storecode: user?.storecode || storecode,
          walletAddress,
          buyerStatus: nextBuyerStatus,
          bankName: buyer?.bankInfo?.bankName || '',
          accountNumber: buyer?.bankInfo?.accountNumber || '',
          accountHolder: buyer?.bankInfo?.accountHolder || '',
          buyer: updatedBuyer,
        }),
      });

      toast.success(decision === 'approved' ? '승인 완료되었습니다.' : '거절 처리되었습니다.');
      await fetchUser();
    } catch (error) {
      console.error('Decision failed', error);
      toast.error('처리에 실패했습니다.');
    }
    setDecisionLoading(null);
  };

  return (
    <main className="p-4 min-h-[100vh] flex items-start justify-center container max-w-screen-md mx-auto bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      <div className="w-full">
        <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center justify-center rounded-full border border-slate-200/70 bg-white/90 p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Image src="/icon-back.png" alt="Back" width={20} height={20} className="rounded-full" />
          </button>
          <span className="font-semibold">구매자 상세</span>
        </div>

        {loading ? (
          <div className="w-full rounded-2xl border border-slate-200/70 bg-white/90 p-6 text-sm text-slate-500 shadow-sm">
            구매자 정보를 불러오는 중입니다...
          </div>
        ) : !user ? (
          <div className="w-full rounded-2xl border border-rose-200/80 bg-rose-50/80 p-6 text-sm text-rose-700 shadow-sm">
            구매자 정보를 찾을 수 없습니다.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Image
                      src={user?.avatar || '/icon-user.png'}
                      alt="Avatar"
                      width={44}
                      height={44}
                      className="h-11 w-11 rounded-full object-cover"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm text-slate-500">회원아이디</span>
                      <span className="text-lg font-semibold text-slate-900">{user?.nickname || '-'}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                      buyerStatus === 'confirmed'
                        ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                        : buyerStatus === 'rejected'
                        ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                        : 'border-amber-200/80 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {buyerStatus === 'confirmed'
                      ? '승인완료'
                      : buyerStatus === 'rejected'
                      ? '승인거절'
                      : '미승인'}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-xs text-slate-600">
                  <span>지갑주소: {walletAddress}</span>
                  <span>스토어코드: {user?.storecode || storecode}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Image src="/icon-kyc.png" alt="KYC" width={22} height={22} className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-900">신분증 심사</span>
                    <span className="text-xs text-slate-500">
                      신청 시간: {buyer?.kyc?.submittedAt ? new Date(buyer.kyc.submittedAt).toLocaleString() : '-'}
                    </span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                    kycStatus === 'approved'
                      ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                      : kycStatus === 'rejected'
                      ? 'border-rose-200/80 bg-rose-50 text-rose-700'
                      : kycStatus === 'pending'
                      ? 'border-amber-200/80 bg-amber-50 text-amber-700'
                      : 'border-slate-200/80 bg-slate-50 text-slate-600'
                  }`}
                >
                  {kycStatus === 'approved'
                    ? '승인완료'
                    : kycStatus === 'rejected'
                    ? '거절'
                    : kycStatus === 'pending'
                    ? '심사중'
                    : '미제출'}
                </span>
              </div>

              <div className="mt-4">
                {kycImageUrl ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={kycImageUrl} alt="KYC" className="h-72 w-full object-contain bg-slate-50" />
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-500">
                    업로드된 신분증 사진이 없습니다.
                  </div>
                )}
              </div>

              {kycImageUrl && (
                <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-700">거절 사유 선택</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rejectionReasons.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => {
                          setSelectedRejectionReason(reason);
                          if (reason !== '기타') {
                            setCustomRejectionReason('');
                          }
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
                          selectedRejectionReason === reason
                            ? 'border-rose-300 bg-rose-50 text-rose-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  {selectedRejectionReason === '기타' && (
                    <div className="mt-3">
                      <textarea
                        value={customRejectionReason}
                        onChange={(event) => setCustomRejectionReason(event.target.value)}
                        placeholder="기타 거절 사유를 입력해 주세요."
                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
                        rows={3}
                      />
                    </div>
                  )}
                  {buyer?.kyc?.rejectionReason && (
                    <p className="mt-2 text-xs text-slate-500">
                      현재 사유: {buyer.kyc.rejectionReason}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleDecision('approved')}
                  disabled={decisionLoading !== null || !kycImageUrl}
                  className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                    decisionLoading || !kycImageUrl
                      ? 'bg-emerald-100 text-emerald-300'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {decisionLoading === 'approve' ? '승인 처리중...' : '승인하기'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDecision('rejected')}
                  disabled={
                    decisionLoading !== null ||
                    !kycImageUrl ||
                    !selectedRejectionReason ||
                    (selectedRejectionReason === '기타' && !customRejectionReason.trim())
                  }
                  className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                    decisionLoading ||
                    !kycImageUrl ||
                    !selectedRejectionReason ||
                    (selectedRejectionReason === '기타' && !customRejectionReason.trim())
                      ? 'bg-rose-100 text-rose-300'
                      : 'bg-rose-600 text-white hover:bg-rose-500'
                  }`}
                >
                  {decisionLoading === 'reject' ? '거절 처리중...' : '거절하기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
