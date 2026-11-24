import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Film, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { AgentActivity, NavPage, RenderJob, UploadJob, YouTubeChannelInfo } from '../types';
import { formatDateTime, formatDuration, formatNumber } from '../utils/format';
import { StatusLabel } from '../components/StatusLabel';

interface AutopilotStatus {
  enabled: boolean;
  runningNow: boolean;
  intervalMinutes: number;
  durationMode: 'full_3h' | 'preview_30s';
  generateThumbnail: boolean;
  categories: string[];
  lastRunAt: string;
  nextRunAt: string;
  totalCycles: number;
  lastError: string;
}

interface DashboardData {
  counts: {
    totalVideos: number;
    waitingApproval: number;
    scheduled: number;
    uploaded: number;
  };
  channelConnected: boolean;
  channel: YouTubeChannelInfo | null;
  activeJobs: RenderJob[];
  recentActivities: AgentActivity[];
  pendingApprovals: UploadJob[];
}

interface AnalyticsSummary {
  connected: boolean;
  revenueAvailable?: boolean;
  summary?: {
    views: number;
    watchHours: number;
    averageViewDurationSec: number;
    subscribersGained: number;
    subscribersLost: number;
    estimatedRevenue: number | null;
  };
  dailySeries?: Array<{ day: string; views: number; estimatedMinutesWatched: number }>;
}

interface DashboardViewProps {
  onNavigate: (page: NavPage) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotStatus | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(720);
  const [durationMode, setDurationMode] = useState<'full_3h' | 'preview_30s'>('full_3h');
  const [autoThumb, setAutoThumb] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMessage, setAutoMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dashRes, anaRes, autoRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/analytics?days=28'),
        fetch('/api/autopilot/status'),
      ]);
      if (dashRes.ok) {
        setData(await dashRes.json());
      }
      if (anaRes.ok) {
        setAnalytics(await anaRes.json());
      }
      if (autoRes.ok) {
        const aJson = await autoRes.json();
        if (aJson.autopilot) {
          setAutopilot(aJson.autopilot);
          setIntervalMinutes(aJson.autopilot.intervalMinutes);
          setDurationMode(aJson.autopilot.durationMode);
          setAutoThumb(aJson.autopilot.generateThumbnail);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => {
      void loadData();
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleAutopilot = async () => {
    setAutoBusy(true);
    setAutoMessage('');
    try {
      const endpoint = autopilot?.enabled ? '/api/autopilot/stop' : '/api/autopilot/start';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intervalMinutes,
          durationMode,
          generateThumbnail: autoThumb,
        }),
      });
      const json = await res.json();
      if (json.autopilot) setAutopilot(json.autopilot);
      setAutoMessage(
        json.autopilot?.enabled
          ? 'Autopilot berkelanjutan aktif! Agen akan memproduksi video secara berkala tanpa batas waktu hingga Anda hentikan.'
          : 'Autopilot telah dihentikan.'
      );
      await loadData();
    } finally {
      setAutoBusy(false);
    }
  };

  const handleRunOnceNow = async () => {
    setAutoBusy(true);
    setAutoMessage('');
    try {
      const res = await fetch('/api/autopilot/run-once', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menjalankan siklus Autopilot.');
      if (json.autopilot) setAutopilot(json.autopilot);
      setAutoMessage('1 siklus produksi otomatis berhasil dijalankan! Video sedang dirender dan menunggu persetujuan Anda di Upload Manager.');
      await loadData();
    } catch (err) {
      setAutoMessage(err instanceof Error ? err.message : 'Gagal menjalankan siklus.');
    } finally {
      setAutoBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-[#0C1411] border border-emerald-950/70 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const counts = data?.counts ?? { totalVideos: 0, waitingApproval: 0, scheduled: 0, uploaded: 0 };
  const daily = analytics?.dailySeries ?? [];
  const maxViews = Math.max(1, ...daily.map((d) => Number(d.views || 0)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
            Ringkasan Studio Produksi &amp; Channel
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Mode otomasi penuh dengan gerbang persetujuan manual sebelum publikasi ke YouTube.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0C1411] hover:bg-[#121E19] border border-emerald-950/80 text-xs font-medium text-slate-300 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* 8 Statistik Utama: 4 Produksi + 4 Performa Channel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="text-xs text-slate-400">Total Video Dibuat</div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-[#E6F1EC]">
            {formatNumber(counts.totalVideos)}
          </div>
          <div className="mt-2 text-xs text-slate-500">Tersimpan di Media Library</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="text-xs text-slate-400">Menunggu Persetujuan</div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-amber-300">
            {formatNumber(counts.waitingApproval)}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('upload_manager')}
            className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
          >
            <span>Tinjau &amp; Setujui</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="text-xs text-slate-400">Video Terjadwal</div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-emerald-300">
            {formatNumber(counts.scheduled)}
          </div>
          <div className="mt-2 text-xs text-slate-500">Siap tayang sesuai jadwal</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="text-xs text-slate-400">Berhasil Diunggah</div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-emerald-400">
            {formatNumber(counts.uploaded)}
          </div>
          <div className="mt-2 text-xs text-slate-500">Terpublikasi via YouTube API</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="text-xs text-slate-400">Total Views Channel</div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-[#E6F1EC]">
            {data?.channel ? formatNumber(data.channel.viewCount) : 'Belum terhubung'}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {data?.channel ? data.channel.title : 'Hubungkan OAuth 2.0 di Upload Manager'}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="text-xs text-slate-400">Total Watch Hours (28 Hari)</div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-[#E6F1EC]">
            {analytics?.connected && analytics.summary
              ? `${formatNumber(analytics.summary.watchHours)} jam`
              : 'Belum terhubung'}
          </div>
          <div className="mt-2 text-xs text-slate-500">Sumber: YouTube Analytics API</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="text-xs text-slate-400">Subscriber Channel</div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-[#E6F1EC]">
            {data?.channel ? formatNumber(data.channel.subscriberCount) : 'Belum terhubung'}
          </div>
          <div className="mt-2 text-xs text-slate-500">Data aktual channel YouTube</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="text-xs text-slate-400">Estimated Revenue (28 Hari)</div>
          <div className="mt-2 font-mono tabular-nums text-2xl font-semibold text-[#E6F1EC]">
            {analytics?.connected && analytics.revenueAvailable && analytics.summary?.estimatedRevenue !== null
              ? `$${Number(analytics.summary?.estimatedRevenue ?? 0).toFixed(2)}`
              : 'Tidak tersedia'}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {analytics?.connected
              ? analytics.revenueAvailable
                ? 'Scope monetisasi aktif'
                : 'Memerlukan scope yt-analytics-monetary'
              : 'Hubungkan YouTube OAuth'}
          </div>
        </div>
      </div>

      {/* Kontrol Autopilot Berkelanjutan Tanpa Batas Waktu */}
      <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Autopilot Produksi Berkelanjutan (Tanpa Batas Waktu)
              </h3>
              <span
                className={`text-xs font-medium ${
                  autopilot?.enabled ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {autopilot?.enabled ? 'AKTIF · Berjalan terus hingga dihentikan' : 'DIHENTIKAN'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Menjalankan rotasi ide, pembuatan SEO, thumbnail, dan render FFmpeg berulang secara otomatis. Publikasi ke YouTube tetap menunggu Anda klik SETUJUI DAN JADWALKAN.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={autoBusy || autopilot?.runningNow}
              onClick={() => void handleRunOnceNow()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#121E19] hover:bg-emerald-950 disabled:opacity-60 border border-emerald-800/60 text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              {autopilot?.runningNow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              <span>Jalankan 1 Siklus Sekarang</span>
            </button>

            <button
              type="button"
              disabled={autoBusy}
              onClick={() => void handleToggleAutopilot()}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                autopilot?.enabled
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-[#04120B]'
              }`}
            >
              {autopilot?.enabled ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{autopilot?.enabled ? 'HENTIKAN AUTOPILOT' : 'MULAI AUTOPILOT'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-emerald-950/60 text-xs">
          <div>
            <label htmlFor="ap-interval" className="block text-slate-400 mb-1">
              Interval Siklus Produksi
            </label>
            <select
              id="ap-interval"
              value={intervalMinutes}
              onChange={(e) => {
                const mins = Number(e.target.value);
                setIntervalMinutes(mins);
                void fetch('/api/autopilot/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ intervalMinutes: mins }),
                });
              }}
              className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
            >
              <option value={30}>Setiap 30 Menit (Uji Berkelanjutan)</option>
              <option value={360}>Setiap 6 Jam</option>
              <option value={720}>Setiap 12 Jam (2 Video/Hari)</option>
              <option value={1440}>Setiap 24 Jam (1 Video/Hari)</option>
            </select>
          </div>

          <div>
            <label htmlFor="ap-dur" className="block text-slate-400 mb-1">
              Target Durasi Render
            </label>
            <select
              id="ap-dur"
              value={durationMode}
              onChange={(e) => {
                const m = e.target.value as 'full_3h' | 'preview_30s';
                setDurationMode(m);
                void fetch('/api/autopilot/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ durationMode: m }),
                });
              }}
              className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
            >
              <option value="full_3h">3 Jam Penuh (180 Menit)</option>
              <option value="preview_30s">Preview Uji Cepat (30 Detik)</option>
            </select>
          </div>

          <div className="flex flex-col justify-between">
            <span className="text-slate-400">Statistik Siklus</span>
            <div className="font-mono tabular-nums text-slate-200 py-2">
              Total Selesai: {formatNumber(autopilot?.totalCycles ?? 0)} siklus
            </div>
          </div>

          <div className="flex flex-col justify-between">
            <span className="text-slate-400">Jadwal Siklus Berikutnya</span>
            <div className="font-mono tabular-nums text-emerald-300 py-2">
              {autopilot?.enabled && autopilot.nextRunAt ? formatDateTime(autopilot.nextRunAt) : 'Menunggu diaktifkan'}
            </div>
          </div>
        </div>

        {autoMessage && (
          <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200">
            {autoMessage}
          </div>
        )}
        {autopilot?.lastError && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200">
            Error Siklus Terakhir: {autopilot.lastError}
          </div>
        )}
      </div>

      {/* Grafik Performa Channel & Pekerjaan AI Agent */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Grafik Performa Channel (28 Hari Terakhir)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Metrik views harian aktual dari YouTube Analytics API v2
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('channel_analytics')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
            >
              Detail Analitik
            </button>
          </div>

          {analytics?.connected && daily.length > 0 ? (
            <div className="space-y-3">
              <div className="h-52 flex items-end gap-1.5 pt-4 border-b border-emerald-950/70 pb-2">
                {daily.map((row) => {
                  const pct = Math.max(4, Math.round((Number(row.views || 0) / maxViews) * 100));
                  return (
                    <div key={row.day} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                      <div
                        style={{ height: `${pct}%` }}
                        className="w-full rounded-t bg-emerald-500/75 group-hover:bg-emerald-400 transition-colors"
                        title={`${row.day}: ${formatNumber(Number(row.views))} views`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
                <span>{daily[0]?.day}</span>
                <span>{daily[daily.length - 1]?.day}</span>
              </div>
            </div>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center text-center border border-dashed border-emerald-950 rounded-lg p-6">
              <p className="text-sm text-slate-300 font-medium">
                Data grafik belum tersedia karena akun YouTube belum dihubungkan.
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                Aplikasi tidak menampilkan grafik palsu. Hubungkan akun YouTube via OAuth 2.0 untuk memuat views harian, watch hours, dan data penonton aktual.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('upload_manager')}
                className="mt-4 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#04120B] text-xs font-semibold transition-colors"
              >
                Hubungkan Channel YouTube
              </button>
            </div>
          )}
        </div>

        {/* Pekerjaan AI Agent Berlangsung */}
        <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
              Pekerjaan Render Berlangsung
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('video_generator')}
              className="text-xs text-emerald-400 hover:text-emerald-300"
            >
              Antrean
            </button>
          </div>

          {data?.activeJobs && data.activeJobs.length > 0 ? (
            <div className="space-y-4">
              {data.activeJobs.map((job) => (
                <div key={job.id} className="pb-3 border-b border-emerald-950/60 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{job.title}</span>
                    <span className="font-mono tabular-nums text-xs text-emerald-400 shrink-0">
                      {job.progress}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-emerald-950 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{job.preset} · {formatDuration(job.target_duration_sec)}</span>
                    <StatusLabel status={job.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <Film className="h-7 w-7 text-slate-600 mb-2" />
              <p className="text-sm text-slate-300">Tidak ada proses render aktif</p>
              <p className="text-xs text-slate-500 mt-1">
                Mulai produksi video 3 jam melalui AI Video Generator.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Persetujuan Tertunda + Riwayat Aktivitas Terbaru */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Menunggu Persetujuan Anda
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                AI tidak akan mempublikasikan sebelum Anda klik SETUJUI DAN JADWALKAN.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('upload_manager')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
            >
              Buka Upload Manager
            </button>
          </div>

          {data?.pendingApprovals && data.pendingApprovals.length > 0 ? (
            <div className="divide-y divide-emerald-950/70">
              {data.pendingApprovals.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{item.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                      Jadwal: {item.scheduled_publish_at ? formatDateTime(item.scheduled_publish_at) : 'Belum ditentukan'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('upload_manager')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-medium text-emerald-300 whitespace-nowrap shrink-0"
                  >
                    Tinjau
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">
              <CheckCircle2 className="h-6 w-6 text-emerald-500/60 mx-auto mb-2" />
              Semua antrean persetujuan saat ini bersih.
            </div>
          )}
        </div>

        <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
              Riwayat Aktivitas Terbaru
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('agent_activity')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 whitespace-nowrap"
            >
              Lihat Semua
            </button>
          </div>

          {data?.recentActivities && data.recentActivities.length > 0 ? (
            <div className="divide-y divide-emerald-950/70">
              {data.recentActivities.slice(0, 6).map((act) => (
                <div key={act.id} className="py-2.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-emerald-400 font-medium">{act.agent_name}</div>
                    <div className="text-sm text-slate-200 mt-0.5">{act.summary}</div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                      {formatDateTime(act.created_at)}
                    </div>
                  </div>
                  <StatusLabel status={act.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">
              Belum ada aktivitas AI Agent tercatat. Mulai riset tren atau buat rencana konten.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
