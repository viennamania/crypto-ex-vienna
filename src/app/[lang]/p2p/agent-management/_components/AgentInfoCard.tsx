'use client';

import { type ChangeEvent, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';

import { shortAddress, type AgentSummary } from '../_shared';

type AgentInfoCardProps = {
  agent: AgentSummary | null;
  fallbackAgentcode: string;
  editable?: boolean;
  onUpdated?: () => void | Promise<void>;
};

const MAX_LOGO_FILE_SIZE_BYTES = 20 * 1024 * 1024;

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as Record<string, unknown>)?.error || `${url} 요청에 실패했습니다.`));
  }
  return payload;
}

export default function AgentInfoCard({
  agent,
  fallbackAgentcode,
  editable = false,
  onUpdated,
}: AgentInfoCardProps) {
  const displayName = agent?.agentName || fallbackAgentcode || '-';
  const displayCode = agent?.agentcode || fallbackAgentcode || '-';
  const displayDescription = String(agent?.agentDescription || '').trim() || '등록된 설명이 없습니다.';
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openEditModal = () => {
    if (!agent) {
      toast.error('에이전트 정보를 먼저 불러와 주세요.');
      return;
    }
    setNameInput(String(agent.agentName || '').trim());
    setDescriptionInput(String(agent.agentDescription || '').trim());
    setLogoPreviewUrl(String(agent.agentLogo || '').trim());
    setSelectedLogoFile(null);
    setModalError(null);
    setEditOpen(true);
  };

  const closeEditModal = () => {
    if (saving) return;
    setEditOpen(false);
  };

  const handleSelectLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_LOGO_FILE_SIZE_BYTES) {
      toast.error('이미지 용량은 최대 20MB까지 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedLogoFile(file);
      setLogoPreviewUrl(String(reader.result || ''));
    };
    reader.onerror = () => {
      toast.error('이미지 미리보기를 불러오지 못했습니다.');
    };
    reader.readAsDataURL(file);
  };

  const saveAgentInfo = async () => {
    if (!agent) {
      setModalError('에이전트 정보를 확인할 수 없습니다.');
      return;
    }

    const normalizedAgentcode = String(displayCode || '').trim();
    if (!normalizedAgentcode || normalizedAgentcode === '-') {
      setModalError('유효한 에이전트 코드가 없습니다.');
      return;
    }

    const nextName = String(nameInput || '').trim();
    const nextDescription = String(descriptionInput || '').trim();
    const currentName = String(agent.agentName || '').trim();
    const currentDescription = String(agent.agentDescription || '').trim();
    const currentLogo = String(agent.agentLogo || '').trim();

    if (!nextName) {
      setModalError('에이전트 이름을 입력해 주세요.');
      return;
    }

    setSaving(true);
    setModalError(null);
    try {
      let nextLogo = currentLogo;
      if (selectedLogoFile) {
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'content-type': selectedLogoFile.type || 'application/octet-stream' },
          body: selectedLogoFile,
        });
        const uploadPayload = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) {
          throw new Error(String((uploadPayload as Record<string, unknown>)?.error || '로고 업로드에 실패했습니다.'));
        }

        const uploadedUrl = String(
          (uploadPayload as Record<string, unknown>)?.url
            || (uploadPayload as Record<string, unknown>)?.pathname
            || '',
        ).trim();
        if (!uploadedUrl) {
          throw new Error('업로드된 로고 URL을 확인할 수 없습니다.');
        }
        nextLogo = uploadedUrl;
      }

      let updated = false;
      if (nextName !== currentName) {
        await postJson('/api/agent/setAgentName', {
          agentcode: normalizedAgentcode,
          agentName: nextName,
        });
        updated = true;
      }

      if (nextDescription !== currentDescription) {
        await postJson('/api/agent/setAgentDescription', {
          agentcode: normalizedAgentcode,
          agentDescription: nextDescription,
        });
        updated = true;
      }

      if (nextLogo !== currentLogo) {
        await postJson('/api/agent/setAgentLogo', {
          agentcode: normalizedAgentcode,
          agentLogo: nextLogo,
        });
        updated = true;
      }

      if (!updated) {
        toast('변경된 내용이 없습니다.');
        setEditOpen(false);
        return;
      }

      toast.success('에이전트 정보를 저장했습니다.');
      setEditOpen(false);
      await onUpdated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : '에이전트 정보 저장에 실패했습니다.';
      setModalError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-cyan-200">
              {agent?.agentLogo ? (
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${encodeURI(agent.agentLogo)})` }}
                  aria-label={displayName}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-cyan-700">AG</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-slate-900">{displayName}</p>
              <p className="truncate text-xs text-slate-600">
                코드: {displayCode}
                {agent?.adminWalletAddress ? ` · 관리자: ${shortAddress(agent.adminWalletAddress)}` : ''}
              </p>
            </div>
          </div>
          {editable && agent && (
            <button
              type="button"
              onClick={openEditModal}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300 bg-white px-3 text-xs font-semibold text-cyan-700 transition hover:border-cyan-400 hover:text-cyan-800"
            >
              정보 수정
            </button>
          )}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          {displayDescription}
        </p>
      </section>

      {editOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_34px_70px_-40px_rgba(15,23,42,0.65)]"
            role="dialog"
            aria-modal="true"
            aria-label="에이전트 정보 수정"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">에이전트 정보 수정</h3>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={saving}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:opacity-50"
                aria-label="닫기"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <p className="mt-1 text-xs text-slate-500">코드: {displayCode}</p>

            <div className="mt-4 grid gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-600">로고 이미지</p>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {logoPreviewUrl ? (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${encodeURI(logoPreviewUrl)})` }}
                        aria-label={`${displayName} 로고 미리보기`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">LOGO</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      파일 선택
                    </button>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {selectedLogoFile ? selectedLogoFile.name : 'PNG/JPG/WebP, 최대 20MB'}
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSelectLogoFile}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="agent-name-input" className="mb-2 block text-xs font-semibold text-slate-600">
                  에이전트 이름
                </label>
                <input
                  id="agent-name-input"
                  type="text"
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  disabled={saving}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="에이전트 이름을 입력하세요"
                />
              </div>

              <div>
                <label htmlFor="agent-description-input" className="mb-2 block text-xs font-semibold text-slate-600">
                  에이전트 설명
                </label>
                <textarea
                  id="agent-description-input"
                  value={descriptionInput}
                  onChange={(event) => setDescriptionInput(event.target.value)}
                  disabled={saving}
                  rows={4}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder="에이전트 소개 문구를 입력하세요"
                />
              </div>
            </div>

            {modalError && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {modalError}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveAgentInfo}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-600 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
