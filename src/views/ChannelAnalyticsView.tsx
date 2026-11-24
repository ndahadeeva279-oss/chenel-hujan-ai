import React, { useEffect, useState } from 'react';
import { Link2, Loader2, MessageSquare, Send } from 'lucide-react';
import { formatDuration, formatNumber } from '../utils/format';

interface AnalyticsResponse {
  connected: boolean;
  message?: string;
  days?: number;
  startDate?: string;
  endDate?: string;
  revenueAvailable?: boolean;
  channel?: {
    id: string;
    title: string;
    thumbnail: string;
    subscriberCount: number;
    viewCount: number;
    videoCount: number;
  };
  summary?: {
    views: number;
    watchHours: number;
    averageViewDurationSec: number;
    subscribersGained: number;
    subscribersLost: number;
    estimatedRevenue: number | null;
  };
  dailySeries?: Array<{ day: string; views: number; estimatedMinutesWatched: number }>;
  countries?: Array<{ country: string; views: number; watchHours: number }>;
  topVideos?: Array<{
    videoId: string;
    title: string;
    views: number;
    watchHours: number;
    averageViewDurationSec: number;
    subscribersGained: number;
  }>;
}

const PRESET_QUESTIONS = [
  'Video mana yang paling bagus?',
  'Tema apa yang paling banyak menghasilkan views?',
  'Apakah penonton lebih menyukai hujan deras atau hujan ringan?',
  'Bagaimana performa video 3 jam?',
  'Negara mana yang paling banyak menonton?',
  'Apa rekomendasi konten berikutnya?',
];

export const ChannelAnalyticsView: React.FC = () => {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeMonetary, setIncludeMonetary] = useState(false);
  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');

  const loadAnalytics = async (period: 7 | 28 | 90) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/analytics?days=${period}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memuat analitik channel.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kesalahan memuat YouTube Analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics(days);
  }, [days]);

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'YOUTUBE_OAUTH_SUCCESS') {
        void loadAnalytics(days);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [days]);

  const handleConnectYouTube = async () => {
    setError('');
    try {
      const res = await fetch(`/api/oauth/youtube/url?monetary=${includeMonetary ? '1' : '0'}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal membuat URL OAuth YouTube.');
      window.open(json.url, 'youtube_oauth', 'width=620,height=720');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka OAuth YouTube.');
    }
  };

  const handleAskAI = async (q: string) => {
    if (!q.trim()) return;
    setQuestion(q);
    setAsking(true);
    setAiAnswer('');
    try {
      const res = await fetch('/api/analytics/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, days }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI Analyst gagal menjawab.');
      setAiAnswer(json.answer);
    } catch (err) {
      setAiAnswer(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
            Channel Analytics Agent
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Integrasi YouTube Analytics API v2 (OAuth 2.0) untuk metrik performa nyata dan AI Analyst.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0C1411] border border-emerald-950/80">
          {([7, 28, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                days === d ? 'bg-emerald-500 text-[#04120B]' : 'text-slate-300 hover:text-white'
              }`}
            >
              {d} Hari
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 rounded-xl bg-[#0C1411] border border-emerald-950/80 flex items-center justify-center gap-3 text-sm text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
          <span>Memuat data YouTube Analytics API...</span>
        </div>
      ) : !data?.connected ? (
        <div className="p-8 rounded-xl bg-[#0C1411] border border-emerald-950/80 text-center space-y-4">
          <h3 className="font-display text-lg font-semibold text-[#E6F1EC]">
            Channel YouTube Belum Terhubung
          </h3>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            {data?.message ||
              'Hubungkan akun YouTube Anda melalui OAuth 2.0 untuk memuat Views, Watch Time, Average View Duration, Negara Penonton, dan performa video aktual.'}
          </p>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeMonetary}
              onChange={(e) => setIncludeMonetary(e.target.checked)}
              className="rounded border-emerald-800 bg-[#060B09] text-emerald-500"
            />
            <span>Sertakan izin scope Estimated Revenue (khusus channel tergabung YPP)</span>
          </label>
          <div>
            <button
              type="button"
              onClick={() => void handleConnectYouTube()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#04120B] text-xs font-semibold transition-colors"
            >
              <Link2 className="h-4 w-4" />
              <span>Hubungkan Akun YouTube (OAuth 2.0)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Metrik Utama */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="p-4 rounded-xl bg-[#0C1411] border border-emerald-950/80">
              <div className="text-xs text-slate-400">Views ({days}h)</div>
              <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-[#E6F1EC]">
                {formatNumber(data.summary?.views)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#0C1411] border border-emerald-950/80">
              <div className="text-xs text-slate-400">Watch Time</div>
              <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-[#E6F1EC]">
                {formatNumber(data.summary?.watchHours)} jam
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#0C1411] border border-emerald-950/80">
              <div className="text-xs text-slate-400">Avg View Duration</div>
              <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-[#E6F1EC]">
                {formatDuration(data.summary?.averageViewDurationSec)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#0C1411] border border-emerald-950/80">
              <div className="text-xs text-slate-400">Subscriber Bertambah</div>
              <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-emerald-400">
                +{formatNumber(data.summary?.subscribersGained)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#0C1411] border border-emerald-950/80">
              <div className="text-xs text-slate-400">Subscriber Berkurang</div>
              <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-slate-300">
                -{formatNumber(data.summary?.subscribersLost)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#0C1411] border border-emerald-950/80">
              <div className="text-xs text-slate-400">Estimated Revenue</div>
              <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-[#E6F1EC]">
                {data.revenueAvailable && data.summary?.estimatedRevenue !== null
                  ? `$${Number(data.summary?.estimatedRevenue).toFixed(2)}`
                  : 'Tidak tersedia'}
              </div>
            </div>
          </div>

          {/* Negara Penonton & Video Teratas */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC] mb-4">
                Negara Penonton Teratas
              </h3>
              {data.countries && data.countries.length > 0 ? (
                <div className="divide-y divide-emerald-950/60 text-xs">
                  {data.countries.map((c) => (
                    <div key={c.country} className="py-2.5 flex items-center justify-between">
                      <span className="font-medium text-slate-200">{c.country}</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {formatNumber(c.views)} views · {formatNumber(c.watchHours)} jam
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Data negara belum tersedia untuk rentang ini.</p>
              )}
            </div>

            <div className="xl:col-span-2 p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC] mb-4">
                Performa Video Individual ({days} Hari)
              </h3>
              {data.topVideos && data.topVideos.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-emerald-950/70 text-slate-400">
                        <th className="py-2.5 pr-4 font-medium">Judul Video</th>
                        <th className="py-2.5 px-3 font-medium text-right">Views</th>
                        <th className="py-2.5 px-3 font-medium text-right">Watch Hours</th>
                        <th className="py-2.5 px-3 font-medium text-right">Avg Durasi</th>
                        <th className="py-2.5 pl-3 font-medium text-right">Sub+</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-950/60">
                      {data.topVideos.map((v) => (
                        <tr key={v.videoId}>
                          <td className="py-2.5 pr-4 text-slate-200 max-w-xs truncate">{v.title}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                            {formatNumber(v.views)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                            {formatNumber(v.watchHours)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                            {formatDuration(v.averageViewDurationSec)}
                          </td>
                          <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-emerald-400">
                            +{formatNumber(v.subscribersGained)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Belum ada data performa video individual.</p>
              )}
            </div>
          </div>

          {/* AI Channel Analyst */}
          <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-400" />
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                AI Channel Analyst (Berbasis Data API Aktual)
              </h3>
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESET_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void handleAskAI(q)}
                  className="px-3 py-1.5 rounded-lg bg-[#121E19] hover:bg-emerald-500/20 border border-emerald-950/80 text-xs text-slate-200 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Tanyakan apa saja tentang performa channel Anda..."
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                disabled={asking}
                onClick={() => void handleAskAI(question)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold whitespace-nowrap"
              >
                {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Tanya AI</span>
              </button>
            </div>

            {aiAnswer && (
              <div className="p-4 rounded-lg bg-[#060B09] border border-emerald-950/70 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {aiAnswer}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
