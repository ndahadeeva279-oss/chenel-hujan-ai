import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { formatDateTime, formatDuration, formatNumber } from '../utils/format';

interface CompetitorVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number | null;
  durationSec: number;
  viewsPerDay: number;
  thumbnailUrl: string;
}

interface CompetitorReport {
  uploadFrequencySummary: string;
  dominantDurationPattern: string;
  titlePatterns: string[];
  topKeywords: string[];
  thumbnailPatternObservation: string;
  worthStudying: string[];
  unexploredOpportunities: string[];
  originalIdeas: Array<{ titleEnglish: string; angle: string; differentiation: string }>;
  uploadStrategyRecommendation: string;
}

export const CompetitorAnalyzerView: React.FC = () => {
  const [channelInput, setChannelInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    source: string;
    observedAt: string;
    disclaimer: string;
    channel: {
      id: string;
      title: string;
      description: string;
      thumbnailUrl: string;
      subscriberCount: number;
      viewCount: number;
      videoCount: number;
    };
    recentVideos: CompetitorVideo[];
    topVideos: CompetitorVideo[];
    aiReport: CompetitorReport;
  } | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/competitors/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal menganalisis kompetitor.');
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan analisis.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
          Competitor Analyzer Agent
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Analisis metadata publik channel kompetitor untuk menemukan celah konten orisinal tanpa mengunduh atau menyalin video.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
        <label htmlFor="comp-input" className="block text-xs font-medium text-slate-300">
          URL Channel, @Handle, atau Channel ID Kompetitor
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="comp-input"
            type="text"
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            placeholder="Contoh: https://www.youtube.com/@RainSoundsChannel atau UC..."
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>{loading ? 'Menganalisis Channel...' : 'Analisis Kompetitor'}</span>
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Sistem hanya membaca metadata publik via YouTube Data API v3 untuk riset strategi.
        </p>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Header Info Channel Kompetitor */}
          <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {data.channel.thumbnailUrl && (
                <img
                  src={data.channel.thumbnailUrl}
                  alt={data.channel.title}
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-full object-cover border border-emerald-800/60 shrink-0"
                />
              )}
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold text-[#E6F1EC] truncate">
                  {data.channel.title}
                </h3>
                <div className="text-xs text-slate-400 font-mono tabular-nums mt-1">
                  {formatNumber(data.channel.subscriberCount)} subscriber · {formatNumber(data.channel.viewCount)} total views ·{' '}
                  {formatNumber(data.channel.videoCount)} video
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              Diambil: {formatDateTime(data.observedAt)}
            </div>
          </div>

          {/* Laporan Strategi AI */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Pola Konten &amp; Strategi Upload Kompetitor
              </h3>
              <div className="space-y-3 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400 block">Frekuensi Upload</span>
                  <span>{data.aiReport.uploadFrequencySummary}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Pola Durasi Dominan</span>
                  <span>{data.aiReport.dominantDurationPattern}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Pola Visual Thumbnail</span>
                  <span>{data.aiReport.thumbnailPatternObservation}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Pola Judul yang Sering Digunakan</span>
                  <ul className="list-disc list-inside space-y-1">
                    {data.aiReport.titlePatterns.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-slate-400 block">Kata Kunci Dominan</span>
                  <span>{data.aiReport.topKeywords.join(' · ')}</span>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Peluang &amp; Rekomendasi Diferensiasi Orisinal
              </h3>
              <div className="space-y-3 text-xs text-slate-300">
                <div>
                  <span className="text-emerald-400 font-medium block mb-1">Hal Menarik untuk Dipelajari</span>
                  <ul className="list-disc list-inside space-y-1">
                    {data.aiReport.worthStudying.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-emerald-400 font-medium block mb-1">Peluang yang Belum Banyak Dieksplorasi</span>
                  <ul className="list-disc list-inside space-y-1">
                    {data.aiReport.unexploredOpportunities.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-emerald-400 font-medium block mb-1">Rekomendasi Strategi Upload</span>
                  <p className="leading-relaxed">{data.aiReport.uploadStrategyRecommendation}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Ide Orisinal */}
          <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
            <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
              Rekomendasi Ide Berbeda &amp; Orisinal
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.aiReport.originalIdeas.map((idea, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-[#060B09] border border-emerald-950/70">
                  <div className="font-medium text-sm text-[#E6F1EC]">{idea.titleEnglish}</div>
                  <div className="text-xs text-emerald-400 mt-1.5">Sudut pandang: {idea.angle}</div>
                  <div className="text-xs text-slate-400 mt-1">Diferensiasi: {idea.differentiation}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabel Video Views Tertinggi vs Terbaru */}
          <div className="rounded-xl bg-[#0C1411] border border-emerald-950/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-emerald-950/70">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Video Kompetitor dengan Views Tertinggi
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-emerald-950/70 text-[11px] text-slate-400">
                    <th className="py-3 px-4 font-medium">Judul Video</th>
                    <th className="py-3 px-4 font-medium">Tanggal Upload</th>
                    <th className="py-3 px-4 font-medium text-right">Durasi</th>
                    <th className="py-3 px-4 font-medium text-right">Views</th>
                    <th className="py-3 px-4 font-medium text-right">Estimasi Views/Hari</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-950/60 text-xs">
                  {data.topVideos.slice(0, 12).map((v) => (
                    <tr key={v.videoId} className="hover:bg-[#121E19]/60">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={v.thumbnailUrl}
                            alt={v.title}
                            referrerPolicy="no-referrer"
                            className="h-10 w-18 rounded object-cover border border-emerald-950 shrink-0"
                          />
                          <span className="font-medium text-slate-200 line-clamp-2">{v.title}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {formatDateTime(v.publishedAt)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
                        {formatDuration(v.durationSec)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right font-medium text-[#E6F1EC]">
                        {formatNumber(v.viewCount)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right text-emerald-300">
                        {formatNumber(v.viewsPerDay)} / hari
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
