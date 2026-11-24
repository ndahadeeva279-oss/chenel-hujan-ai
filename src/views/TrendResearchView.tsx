import React, { useState } from 'react';
import { CalendarPlus, ExternalLink, Loader2, Search } from 'lucide-react';
import { formatDateTime, formatDuration, formatNumber } from '../utils/format';

const RAIN_CATEGORIES = [
  'Heavy Rain Sounds',
  'Rain on Forest',
  'Rain on Leaves',
  'Rain on Roof',
  'Rain on Window',
  'Tropical Rainforest',
  'Thunderstorm',
  'Black Screen Rain',
  'Rain and Piano',
  'Rain for Deep Sleep',
  'Relaxing Nature Sounds',
  'Rain for Studying',
  'Rain for Meditation',
];

interface TrendVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number | null;
  durationSec: number;
  viewsPerDay: number;
  observedGrowthDelta: number | null;
  observedGrowthHours: number | null;
  thumbnailUrl: string;
  youtubeUrl: string;
}

interface TrendIdea {
  titleEnglish: string;
  category: string;
  visualConcept: string;
  audioMix: string;
  targetDurationMin: number;
  reasonToTest: string;
}

interface TrendCluster {
  clusterName: string;
  contentType: string;
  observationSummary: string;
  recommendedDurationMin: number;
}

export const TrendResearchView: React.FC = () => {
  const [category, setCategory] = useState(RAIN_CATEGORIES[0]);
  const [keyword, setKeyword] = useState('Heavy Rain Sounds for Deep Sleep 3 Hours');
  const [country, setCountry] = useState('US');
  const [language, setLanguage] = useState('en');
  const [publishedAfterDays, setPublishedAfterDays] = useState('90');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<{
    source: string;
    observedAt: string;
    videos: TrendVideo[];
    aiAnalysis: { trendClusters?: TrendCluster[]; ideas?: TrendIdea[] } | null;
    disclaimer: string;
  } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/trends/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          keyword,
          country,
          language,
          publishedAfterDays: Number(publishedAfterDays),
          generateIdeas: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Gagal mencari tren YouTube.');
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat riset tren.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendToPlanner = async (idea: TrendIdea) => {
    setNotice('');
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const res = await fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conceptTitle: idea.visualConcept,
        englishTitle: idea.titleEnglish,
        description: `${idea.visualConcept}\nAudio mix: ${idea.audioMix}`,
        category: idea.category || category,
        targetDurationMin: idea.targetDurationMin || 180,
        scheduledDate: tomorrow,
        scheduledTime: '21:00',
      }),
    });
    if (res.ok) {
      setNotice(`Ide "${idea.titleEnglish}" berhasil disimpan ke Content Planner.`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
          AI Trend Research Agent
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Riset video Rain &amp; Piano populer langsung dari YouTube Data API v3 dan sintesis 20 ide konten teruji.
        </p>
      </div>

      {/* Filter Kategori & Pencarian */}
      <form onSubmit={handleSearch} className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-2">
            Kategori Konten Hujan
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RAIN_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat);
                  setKeyword(`${cat} for Deep Sleep 3 Hours`);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  category === cat
                    ? 'bg-emerald-500 text-[#04120B]'
                    : 'bg-[#121E19] text-slate-300 hover:text-white border border-emerald-950/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2">
            <label htmlFor="trend-kw" className="block text-xs text-slate-400 mb-1.5">
              Kata Kunci Pencarian
            </label>
            <input
              id="trend-kw"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Contoh: heavy rain on window for sleeping"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="trend-country" className="block text-xs text-slate-400 mb-1.5">
              Negara Target
            </label>
            <select
              id="trend-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
            >
              <option value="US">Amerika Serikat (US)</option>
              <option value="GB">Inggris (GB)</option>
              <option value="CA">Kanada (CA)</option>
              <option value="AU">Australia (AU)</option>
              <option value="ID">Indonesia (ID)</option>
              <option value="">Global</option>
            </select>
          </div>

          <div>
            <label htmlFor="trend-lang" className="block text-xs text-slate-400 mb-1.5">
              Bahasa
            </label>
            <select
              id="trend-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
            >
              <option value="en">Inggris (en)</option>
              <option value="id">Indonesia (id)</option>
              <option value="">Semua Bahasa</option>
            </select>
          </div>

          <div>
            <label htmlFor="trend-period" className="block text-xs text-slate-400 mb-1.5">
              Periode Publikasi
            </label>
            <select
              id="trend-period"
              value={publishedAfterDays}
              onChange={(e) => setPublishedAfterDays(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] focus:outline-none focus:border-emerald-500"
            >
              <option value="7">7 Hari Terakhir</option>
              <option value="30">30 Hari Terakhir</option>
              <option value="90">90 Hari Terakhir</option>
              <option value="365">1 Tahun Terakhir</option>
              <option value="0">Semua Waktu</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-emerald-950/60">
          <p className="text-xs text-slate-400 max-w-2xl">
            Catatan kejujuran data: CTR, retention, RPM, dan pendapatan kompetitor tidak tersedia di YouTube Data API publik sehingga tidak ditampilkan.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>{loading ? 'Mengambil Data & Menganalisis...' : 'Cari Tren & Buat 20 Ide'}</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#0C1411] border border-emerald-950/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
            <div>
              Sumber: <strong className="text-emerald-300">{result.source}</strong> · Waktu Pengambilan:{' '}
              <span className="font-mono tabular-nums">{formatDateTime(result.observedAt)}</span>
            </div>
            <div className="text-slate-400">{result.disclaimer}</div>
          </div>

          {/* Data Aktual Video YouTube */}
          <div className="rounded-xl bg-[#0C1411] border border-emerald-950/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-emerald-950/70 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Data Aktual Video Populer ({result.videos.length} Video)
              </h3>
              <span className="text-xs text-slate-400">
                Data Aktual API · Estimasi Views/Hari
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-emerald-950/70 text-[11px] text-slate-400">
                    <th className="py-3 px-4 font-medium">Video &amp; Channel</th>
                    <th className="py-3 px-4 font-medium">Tanggal Upload</th>
                    <th className="py-3 px-4 font-medium text-right">Durasi</th>
                    <th className="py-3 px-4 font-medium text-right">Views (Aktual)</th>
                    <th className="py-3 px-4 font-medium text-right">Likes (Aktual)</th>
                    <th className="py-3 px-4 font-medium text-right">Estimasi Views/Hari</th>
                    <th className="py-3 px-4 font-medium text-right">Pertumbuhan Teramati</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-950/60 text-xs">
                  {result.videos.map((v) => (
                    <tr key={v.videoId} className="hover:bg-[#121E19]/70 transition-colors">
                      <td className="py-3 px-4 max-w-md">
                        <div className="flex items-center gap-3">
                          <img
                            src={v.thumbnailUrl}
                            alt={v.title}
                            referrerPolicy="no-referrer"
                            className="h-12 w-20 rounded object-cover border border-emerald-950 shrink-0 bg-[#060B09]"
                          />
                          <div className="min-w-0">
                            <a
                              href={v.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-slate-200 hover:text-emerald-300 line-clamp-2 inline-flex items-center gap-1"
                            >
                              <span>{v.title}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                            <div className="text-slate-400 mt-0.5 truncate">{v.channelTitle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {formatDateTime(v.publishedAt)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
                        {formatDuration(v.durationSec)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right font-medium text-[#E6F1EC]">
                        {formatNumber(v.viewCount)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
                        {v.likeCount !== null ? formatNumber(v.likeCount) : 'Disembunyikan'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right text-emerald-300">
                        {formatNumber(v.viewsPerDay)} / hari
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-300">
                        {v.observedGrowthDelta !== null
                          ? `+${formatNumber(v.observedGrowthDelta)} (${v.observedGrowthHours}j)`
                          : 'Pengamatan awal'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Kelompok Tren AI */}
          {result.aiAnalysis?.trendClusters && result.aiAnalysis.trendClusters.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Pengelompokan Tren Konten (Rekomendasi AI)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {result.aiAnalysis.trendClusters.map((c, idx) => (
                  <div key={idx} className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
                    <div className="text-xs text-emerald-400 font-medium">
                      {c.contentType} · {c.recommendedDurationMin} menit
                    </div>
                    <div className="font-display text-sm font-semibold text-[#E6F1EC] mt-1">
                      {c.clusterName}
                    </div>
                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">{c.observationSummary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 20 Ide Video Baru */}
          {result.aiAnalysis?.ideas && result.aiAnalysis.ideas.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                {result.aiAnalysis.ideas.length} Ide Video Baru Layak Diuji (Rekomendasi AI)
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {result.aiAnalysis.ideas.map((idea, idx) => (
                  <div key={idx} className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span>
                          {String(idx + 1).padStart(2, '0')}. {idea.category} · {idea.targetDurationMin} menit
                        </span>
                      </div>
                      <h4 className="font-display text-sm font-semibold text-[#E6F1EC] mt-1.5">
                        {idea.titleEnglish}
                      </h4>
                      <div className="mt-2 text-xs text-slate-300 space-y-1">
                        <div>Visual: {idea.visualConcept}</div>
                        <div>Audio: {idea.audioMix}</div>
                        <div className="text-emerald-300/90 pt-1">Alasan layak diuji: {idea.reasonToTest}</div>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-emerald-950/60 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSendToPlanner(idea)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121E19] hover:bg-emerald-500/20 border border-emerald-800/60 text-xs font-medium text-emerald-300 transition-colors"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        <span>Simpan ke Content Planner</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
