import React, { useEffect, useState } from 'react';
import { CalendarPlus, Film, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { ContentPlan, NavPage } from '../types';
import { StatusLabel } from '../components/StatusLabel';

const CATEGORIES = [
  'Heavy Rain Forest',
  'Rain on Tropical Leaves',
  'Rain on Window',
  'Rain on Roof',
  'Rain and Piano',
  'Black Screen Rain',
  'Thunderstorm and Rain',
  'Nature Rain Ambience',
];

interface ContentPlannerViewProps {
  onNavigate: (page: NavPage) => void;
}

export const ContentPlannerView: React.FC<ContentPlannerViewProps> = ({ onNavigate }) => {
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [viewMode, setViewMode] = useState<'harian' | 'mingguan' | 'bulanan'>('mingguan');
  const [category, setCategory] = useState('Rain and Piano');
  const [focusTheme, setFocusTheme] = useState('Malam hujan deras di jendela kayu dengan alunan piano lembut untuk tidur nyenyak');
  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState('21:00');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [insightNote, setInsightNote] = useState('');

  const loadPlans = async () => {
    const res = await fetch('/api/plans');
    if (res.ok) {
      const json = await res.json();
      setPlans(json.plans ?? []);
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError('');
    setInsightNote('');
    try {
      const res = await fetch('/api/plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, focusTheme, scheduledDate, scheduledTime }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal membuat rencana konten.');
      if (json.insights?.uniquenessNote) {
        setInsightNote(`${json.insights.uniquenessNote} Rekomendasi waktu US: ${json.insights.recommendedTimeEst}`);
      }
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat rencana konten.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/plans/${id}`, { method: 'DELETE' });
    await loadPlans();
  };

  const now = new Date();
  const filteredPlans = plans.filter((p) => {
    const d = new Date(p.scheduled_date);
    if (Number.isNaN(d.getTime())) return true;
    const diffDays = (d.getTime() - now.getTime()) / 86_400_000;
    if (viewMode === 'harian') return Math.abs(diffDays) <= 1.5;
    if (viewMode === 'mingguan') return diffDays >= -2 && diffDays <= 7;
    return diffDays >= -7 && diffDays <= 31;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
            AI Content Planner
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Perencanaan konten SEO bahasa Inggris untuk penonton Amerika tanpa pengulangan judul atau konsep.
          </p>
        </div>

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
      </div>

      {/* Form Generator Rencana Konten AI */}
      <form onSubmit={handleGeneratePlan} className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label htmlFor="plan-cat" className="block text-xs text-slate-400 mb-1.5">
              Kategori Konten
            </label>
            <select
              id="plan-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="plan-date" className="block text-xs text-slate-400 mb-1.5">
              Tanggal Target Upload
            </label>
            <input
              id="plan-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-mono text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="plan-time" className="block text-xs text-slate-400 mb-1.5">
              Jam Upload (UTC/EST)
            </label>
            <input
              id="plan-time"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-mono text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold transition-colors"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              <span>{generating ? 'Menyusun Rencana...' : 'Buat Rencana AI Unik'}</span>
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="plan-theme" className="block text-xs text-slate-400 mb-1.5">
            Arahan Tema / Suasana Video
          </label>
          <input
            id="plan-theme"
            type="text"
            value={focusTheme}
            onChange={(e) => setFocusTheme(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
          />
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">
          {error}
        </div>
      )}

      {insightNote && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-sm text-emerald-200">
          {insightNote}
        </div>
      )}

      {/* Daftar Rencana Konten */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
            Daftar Rencana Konten ({filteredPlans.length} dari {plans.length})
          </h3>
        </div>

        {filteredPlans.length === 0 ? (
          <div className="p-10 rounded-xl bg-[#0C1411] border border-emerald-950/80 text-center text-sm text-slate-400">
            Belum ada rencana konten pada rentang tampilan <strong className="text-slate-200">{viewMode}</strong>. Gunakan formulir di atas untuk membuat rencana baru.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredPlans.map((plan) => {
              const tags = JSON.parse(plan.tags_json || '[]') as string[];
              const hashtags = JSON.parse(plan.hashtags_json || '[]') as string[];
              return (
                <div key={plan.id} className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span className="font-mono tabular-nums">
                        {plan.scheduled_date} · {plan.scheduled_time} · {plan.target_duration_min} menit
                      </span>
                      <StatusLabel status={plan.status} />
                    </div>
                    <h4 className="font-display text-base font-semibold text-[#E6F1EC] mt-2">
                      {plan.english_title}
                    </h4>
                    <div className="text-xs text-emerald-400 mt-0.5">
                      {plan.category} — {plan.concept_title}
                    </div>
                    <p className="text-xs text-slate-300 mt-2.5 line-clamp-3 leading-relaxed">
                      {plan.description}
                    </p>
                    {plan.thumbnail_prompt && (
                      <div className="mt-2 text-xs text-slate-400">
                        Arahan Thumbnail: {plan.thumbnail_prompt}
                      </div>
                    )}
                    {(hashtags.length > 0 || tags.length > 0) && (
                      <div className="mt-2 text-[11px] text-slate-400 font-mono">
                        {hashtags.slice(0, 5).join(' ')} {tags.length > 0 ? `· ${tags.slice(0, 4).join(', ')}` : ''}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-emerald-950/60 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onNavigate('video_generator')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-medium text-emerald-300"
                      >
                        <Film className="h-3.5 w-3.5" />
                        <span>Produksi Video</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('thumbnail_studio')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121E19] hover:bg-emerald-950 border border-emerald-950/80 text-xs font-medium text-slate-200"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Buat Thumbnail</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDelete(plan.id)}
                      aria-label="Hapus rencana konten"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
