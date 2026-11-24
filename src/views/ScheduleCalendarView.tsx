import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ContentPlan, UploadJob } from '../types';
import { StatusLabel } from '../components/StatusLabel';

export const ScheduleCalendarView: React.FC = () => {
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [viewMode, setViewMode] = useState<'harian' | 'mingguan' | 'bulanan'>('bulanan');
  const [cursorDate, setCursorDate] = useState(new Date());

  useEffect(() => {
    void Promise.all([fetch('/api/plans'), fetch('/api/uploads')]).then(async ([pRes, uRes]) => {
      if (pRes.ok) {
        const p = await pRes.json();
        setPlans(p.plans ?? []);
      }
      if (uRes.ok) {
        const u = await uRes.json();
        setUploads(u.uploads ?? []);
      }
    });
  }, []);

  const shiftMonth = (delta: number) => {
    const next = new Date(cursorDate);
    if (viewMode === 'bulanan') next.setMonth(next.getMonth() + delta);
    else if (viewMode === 'mingguan') next.setDate(next.getDate() + delta * 7);
    else next.setDate(next.getDate() + delta);
    setCursorDate(next);
  };

  const eventsByDate = new Map<string, Array<{ title: string; time: string; status: string; kind: string }>>();
  for (const p of plans) {
    const list = eventsByDate.get(p.scheduled_date) ?? [];
    list.push({ title: p.english_title, time: p.scheduled_time, status: p.status, kind: 'Rencana' });
    eventsByDate.set(p.scheduled_date, list);
  }
  for (const u of uploads) {
    if (!u.scheduled_publish_at) continue;
    const dateKey = u.scheduled_publish_at.slice(0, 10);
    const timePart = u.scheduled_publish_at.slice(11, 16) || '20:00';
    const list = eventsByDate.get(dateKey) ?? [];
    list.push({ title: u.title, time: timePart, status: u.approval_status, kind: 'Upload' });
    eventsByDate.set(dateKey, list);
  }

  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOffset = (firstDayOfMonth.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthCells: Array<Date | null> = [];
  for (let i = 0; i < startDayOffset; i++) monthCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) monthCells.push(new Date(year, month, d));

  const weekStart = new Date(cursorDate);
  weekStart.setDate(cursorDate.getDate() - ((cursorDate.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const formatYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
            Schedule Calendar
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Jadwal harian, mingguan, dan bulanan untuk rencana konten dan publikasi YouTube.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0C1411] border border-emerald-950/80">
            {(['harian', 'mingguan', 'bulanan'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                  viewMode === m ? 'bg-emerald-500 text-[#04120B]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Periode sebelumnya"
              className="p-2 rounded-lg bg-[#0C1411] border border-emerald-950/80 text-slate-300 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-mono text-slate-200 min-w-[130px] text-center">
              {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(cursorDate)}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Periode berikutnya"
              className="p-2 rounded-lg bg-[#0C1411] border border-emerald-950/80 text-slate-300 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'bulanan' && (
        <div className="rounded-xl bg-[#0C1411] border border-emerald-950/80 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-emerald-950/70 text-[11px] font-medium text-slate-400">
            {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
              <div key={d} className="py-2.5 px-3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-emerald-950/50">
            {monthCells.map((d, idx) => {
              if (!d) return <div key={idx} className="min-h-28 bg-[#060B09]/40" />;
              const ymd = formatYmd(d);
              const items = eventsByDate.get(ymd) ?? [];
              return (
                <div key={ymd} className="min-h-28 p-2.5 space-y-1.5">
                  <div className="font-mono tabular-nums text-xs text-slate-400">{d.getDate()}</div>
                  {items.map((ev, i) => (
                    <div
                      key={i}
                      className="p-1.5 rounded bg-[#121E19] border border-emerald-950 text-[11px] text-slate-200"
                    >
                      <div className="font-mono text-[10px] text-emerald-400">
                        {ev.time} · {ev.kind}
                      </div>
                      <div className="truncate">{ev.title}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'mingguan' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((d) => {
            const ymd = formatYmd(d);
            const items = eventsByDate.get(ymd) ?? [];
            return (
              <div key={ymd} className="p-4 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-3 min-h-48">
                <div className="text-xs font-medium text-slate-300 border-b border-emerald-950/60 pb-2">
                  {new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: '2-digit', month: 'short' }).format(d)}
                </div>
                {items.length === 0 ? (
                  <div className="text-xs text-slate-500">Kosong</div>
                ) : (
                  items.map((ev, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-[#060B09] border border-emerald-950 space-y-1 text-xs">
                      <div className="font-mono text-emerald-400">{ev.time}</div>
                      <div className="text-slate-200 font-medium">{ev.title}</div>
                      <StatusLabel status={ev.status} />
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'harian' && (
        <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
          <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
            Jadwal Tanggal {formatYmd(cursorDate)}
          </h3>
          {(eventsByDate.get(formatYmd(cursorDate)) ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">Tidak ada jadwal konten atau upload pada tanggal ini.</p>
          ) : (
            <div className="divide-y divide-emerald-950/70">
              {(eventsByDate.get(formatYmd(cursorDate)) ?? []).map((ev, i) => (
                <div key={i} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-emerald-400">
                      {ev.time} · {ev.kind}
                    </div>
                    <div className="text-sm font-medium text-[#E6F1EC] mt-0.5">{ev.title}</div>
                  </div>
                  <StatusLabel status={ev.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
