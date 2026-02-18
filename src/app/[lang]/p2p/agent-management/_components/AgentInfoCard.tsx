'use client';

import { shortAddress, type AgentSummary } from '../_shared';

type AgentInfoCardProps = {
  agent: AgentSummary | null;
  fallbackAgentcode: string;
};

export default function AgentInfoCard({ agent, fallbackAgentcode }: AgentInfoCardProps) {
  const displayName = agent?.agentName || fallbackAgentcode || '-';
  const displayCode = agent?.agentcode || fallbackAgentcode || '-';

  return (
    <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-4">
      <div className="flex items-center gap-3">
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
    </section>
  );
}
