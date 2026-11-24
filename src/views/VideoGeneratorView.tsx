import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Film, Loader2, Play, RotateCcw, Server, UploadCloud } from 'lucide-react';
import { MediaAsset, NavPage, RenderJob } from '../types';
import { formatDateTime, formatDuration } from '../utils/format';
import { StatusLabel } from '../components/StatusLabel';

const CONTENT_TYPES = [
  'Heavy Rain Forest',
  'Rain on Tropical Leaves',
  'Rain on Window',
  'Rain on Roof',
  'Rain and Piano',
  'Black Screen Rain',
  'Thunderstorm and Rain',
  'Nature Rain Ambience',
];

interface VideoGeneratorViewProps {
  onNavigate: (page: NavPage) => void;
}

export const VideoGeneratorView: React.FC<VideoGeneratorViewProps> = ({ onNavigate }) => {
  const [contentType, setContentType] = useState('Heavy Rain Forest');
  const [durationMode, setDurationMode] = useState<'full_3h' | 'preview_30s'>('full_3h');
  const [workerMode, setWorkerMode] = useState<'local_ffmpeg' | 'external_vps'>('local_ffmpeg');
  const [externalConnected, setExternalConnected] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState('21:00');
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [selectedFootageId, setSelectedFootageId] = useState('');
  const [selectedRainId, setSelectedRainId] = useState('');
  const [selectedPianoId, setSelectedPianoId] = useState('');
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAll = async () => {
    const [medRes, jobRes, setRes] = await Promise.all([
      fetch('/api/media'),
      fetch('/api/render-jobs'),
      fetch('/api/settings'),
    ]);
    if (medRes.ok) {
      const m = await medRes.json();
      const items = (m.items ?? []) as MediaAsset[];
      setMedia(items);
      if (!selectedFootageId) {
        const firstFoot = items.find((i) => i.type === 'footage');
        if (firstFoot) setSelectedFootageId(firstFoot.id);
      }
      if (!selectedRainId) {
        const firstRain = items.find((i) => i.type === 'rain_audio');
        if (firstRain) setSelectedRainId(firstRain.id);
      }
      if (!selectedPianoId) {
        const firstPiano = items.find((i) => i.type === 'piano_music');
        if (firstPiano) setSelectedPianoId(firstPiano.id);
      }
    }
    if (jobRes.ok) {
      const j = await jobRes.json();
      setJobs(j.jobs ?? []);
    }
    if (setRes.ok) {
      const s = await setRes.json();
      setExternalConnected(Boolean(s.settings?.external_worker_connected));
    }
  };

  useEffect(() => {
    void loadAll();
    const timer = setInterval(() => {
      void fetch('/api/render-jobs')
        .then((r) => r.json())
        .then((j) => setJobs(j.jobs ?? []))
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const handleAutoProduce = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/video-generator/auto-produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType,
          footageAssetIds: contentType === 'Black Screen Rain' ? [] : selectedFootageId ? [selectedFootageId] : [],
          rainAudioAssetId: selectedRainId,
          pianoAssetId: contentType === 'Rain and Piano' ? selectedPianoId : null,
          durationMode,
          scheduledDate,
          scheduledTime,
          workerMode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memulai produksi video otomatis.');
      setNotice(
        `Pipeline otomatis dijalankan: "${json.plan?.english_title}". Hasil akan masuk ke Upload Manager dalam status MENUNGGU PERSETUJUAN.`
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan pipeline.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    await fetch(`/api/render-jobs/${jobId}/retry`, { method: 'POST' });
    await loadAll();
  };

  const footageList = media.filter((m) => m.type === 'footage' || m.type === 'thumbnail');
  const rainList = media.filter((m) => m.type === 'rain_audio');
  const pianoList = media.filter((m) => m.type === 'piano_music');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
            AI Video Generator (Default 3 Jam · 180 Menit)
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Otomasi konsep, pemilihan aset Media Library, mixing audio anti-clipping, dan rendering FFmpeg 1920x1080 30 FPS.
          </p>
        </div>

        <div className="text-xs text-slate-300 font-mono">
          Output: MP4 · H.264 · 1920x1080 · 30 FPS · AAC
        </div>
      </div>

      {/* Konfigurasi Produksi Otomatis */}
      <form onSubmit={handleAutoProduce} className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-2">
            Pilihan Konsep Konten
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CONTENT_TYPES.map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => setContentType(ct)}
                className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                  contentType === ct
                    ? 'bg-emerald-500 text-[#04120B]'
                    : 'bg-[#121E19] text-slate-300 hover:text-white border border-emerald-950/80'
                }`}
              >
                {ct}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="vg-footage" className="block text-xs text-slate-400 mb-1.5">
              Footage Visual (Media Library)
            </label>
            <select
              id="vg-footage"
              disabled={contentType === 'Black Screen Rain'}
              value={selectedFootageId}
              onChange={(e) => setSelectedFootageId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC] disabled:opacity-50"
            >
              {contentType === 'Black Screen Rain' ? (
                <option value="">Layar Hitam Murni (1920x1080 Black Screen)</option>
              ) : (
                footageList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label htmlFor="vg-rain" className="block text-xs text-slate-400 mb-1.5">
              Audio Hujan (Media Library)
            </label>
            <select
              id="vg-rain"
              value={selectedRainId}
              onChange={(e) => setSelectedRainId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            >
              {rainList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="vg-piano" className="block text-xs text-slate-400 mb-1.5">
              Musik Piano (Opsional / Rain &amp; Piano)
            </label>
            <select
              id="vg-piano"
              value={selectedPianoId}
              onChange={(e) => setSelectedPianoId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            >
              <option value="">Tanpa Piano</option>
              {pianoList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="vg-duration" className="block text-xs text-slate-400 mb-1.5">
              Target Durasi Render
            </label>
            <select
              id="vg-duration"
              value={durationMode}
              onChange={(e) => setDurationMode(e.target.value as 'full_3h' | 'preview_30s')}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            >
              <option value="full_3h">3 Jam Penuh (180 Menit · Default)</option>
              <option value="preview_30s">Uji Render Cepat (30 Detik)</option>
            </select>
          </div>

          <div>
            <label htmlFor="vg-worker" className="block text-xs text-slate-400 mb-1.5">
              Mesin Rendering FFmpeg
            </label>
            <select
              id="vg-worker"
              value={workerMode}
              onChange={(e) => setWorkerMode(e.target.value as 'local_ffmpeg' | 'external_vps')}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            >
              <option value="local_ffmpeg">Worker FFmpeg Lokal (Aktif)</option>
              <option value="external_vps">
                VPS Eksternal ({externalConnected ? 'Terhubung' : 'BELUM TERHUBUNG'})
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="vg-date" className="block text-xs text-slate-400 mb-1.5">
              Target Tanggal Publikasi
            </label>
            <input
              id="vg-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-mono text-[#E6F1EC]"
            />
          </div>

          <div>
            <label htmlFor="vg-time" className="block text-xs text-slate-400 mb-1.5">
              Jam Publikasi (UTC)
            </label>
            <input
              id="vg-time"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-mono text-[#E6F1EC]"
            />
          </div>
        </div>

        {workerMode === 'external_vps' && !externalConnected && (
          <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Status Worker VPS Eksternal: <strong>BELUM TERHUBUNG</strong>. Konfigurasikan URL &amp; Token API di menu Settings atau gunakan Worker FFmpeg Lokal.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="underline whitespace-nowrap text-amber-100"
            >
              Buka Settings
            </button>
          </div>
        )}

        <div className="pt-2 border-t border-emerald-950/60 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Server className="h-4 w-4 text-emerald-400" />
            <span>Semua hasil render otomatis diperiksa via FFprobe dan menunggu persetujuan Anda sebelum upload.</span>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span>{submitting ? 'Menyiapkan Pipeline...' : 'Jalankan Produksi Otomatis'}</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-sm text-emerald-200 flex items-center justify-between gap-4">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => onNavigate('upload_manager')}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-[#04120B] text-xs font-semibold whitespace-nowrap"
          >
            Buka Upload Manager
          </button>
        </div>
      )}

      {/* Antrean Rendering FFmpeg */}
      <div className="rounded-xl bg-[#0C1411] border border-emerald-950/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-emerald-950/70 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
            Antrean &amp; Status Rendering FFmpeg ({jobs.length})
          </h3>
          <span className="text-xs text-slate-400">Pembaruan real-time</span>
        </div>

        {jobs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            <Film className="h-7 w-7 text-slate-600 mx-auto mb-2" />
            Belum ada pekerjaan render. Mulai produksi pertama Anda di atas.
          </div>
        ) : (
          <div className="divide-y divide-emerald-950/60">
            {jobs.map((job) => (
              <div key={job.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium text-sm text-[#E6F1EC] truncate">{job.title}</h4>
                      <StatusLabel status={job.status} />
                    </div>
                    <div className="text-xs text-slate-400 font-mono tabular-nums mt-1">
                      {job.preset} · Target: {formatDuration(job.target_duration_sec)} · Aktual:{' '}
                      {job.actual_duration_sec ? formatDuration(job.actual_duration_sec) : '—'} · Worker: {job.worker_mode} ·{' '}
                      {formatDateTime(job.created_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {job.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => void handleRetry(job.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121E19] hover:bg-emerald-950 border border-emerald-800/60 text-xs font-medium text-slate-200"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Coba Ulang</span>
                      </button>
                    )}
                    {job.status === 'completed' && job.output_url && (
                      <>
                        <a
                          href={job.output_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121E19] hover:bg-emerald-950 border border-emerald-800/60 text-xs font-medium text-emerald-300"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Lihat MP4</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => onNavigate('upload_manager')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#04120B] text-xs font-semibold"
                        >
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>Tinjau Upload</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-emerald-950 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        job.status === 'failed' ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="font-mono tabular-nums text-xs text-slate-300 w-10 text-right">
                    {job.progress}%
                  </span>
                </div>

                {job.error_log && (
                  <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-xs font-mono text-rose-300 whitespace-pre-wrap">
                    {job.error_log}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
