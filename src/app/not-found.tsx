'use client';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-center text-slate-700">
      <div className="space-y-3">
        <p className="text-2xl font-semibold">페이지를 찾을 수 없습니다.</p>
        <p className="text-sm text-slate-500">요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.</p>
      </div>
    </div>
  );
}
