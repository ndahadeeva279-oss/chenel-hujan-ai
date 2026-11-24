import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AgentActivity } from '../types';
import { formatDateTime } from '../utils/format';
import { StatusLabel } from '../components/StatusLabel';

export const AgentActivityView: React.FC = () => {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [agentFilter, setAgentFilter] = useState('');

  const loadActivities = async () => {
    const res = await fetch('/api/activities');
    if (res.ok) {
      const json = await res.json();
      setActivities(json.activities ?? []);
    }
  };

  useEffect(() => {
    void loadActivities();
  }, []);

  const agents = Array.from(new Set(activities.map((a) => a.agent_name)));
  const visible = agentFilter ? activities.filter((a) => a.agent_name === agentFilter) : activities;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
            AI Agent Activity
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Catatan kronologis setiap pekerjaan agen riset, perencana konten, generator video FFmpeg, thumbnail studio, dan upload.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadActivities()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0C1411] hover:bg-[#121E19] border border-emerald-950/80 text-xs font-medium text-slate-300"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Muat Ulang</span>
        </button>
      </div>

      {agents.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setAgentFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              agentFilter === ''
                ? 'bg-emerald-500 text-[#04120B]'
                : 'bg-[#0C1411] text-slate-300 border border-emerald-950/80'
            }`}
          >
            Semua Agent
          </button>
          {agents.map((ag) => (
            <button
              key={ag}
              type="button"
              onClick={() => setAgentFilter(ag)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                agentFilter === ag
                  ? 'bg-emerald-500 text-[#04120B]'
                  : 'bg-[#0C1411] text-slate-300 border border-emerald-950/80'
              }`}
            >
              {ag}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-[#0C1411] border border-emerald-950/80 overflow-hidden">
        {visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Belum ada riwayat aktivitas agent.
          </div>
        ) : (
          <div className="divide-y divide-emerald-950/60">
            {visible.map((act) => (
              <div key={act.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-emerald-400">{act.agent_name}</span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-slate-400">{act.action_type}</span>
                  </div>
                  <div className="text-sm text-slate-200 mt-1">{act.summary}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <StatusLabel status={act.status} />
                  <span className="font-mono tabular-nums text-xs text-slate-500">
                    {formatDateTime(act.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
