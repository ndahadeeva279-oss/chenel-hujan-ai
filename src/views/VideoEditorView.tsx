import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Play, Save, Upload } from 'lucide-react';
import { EditingPreset, MediaAsset, NavPage } from '../types';
import { formatDuration } from '../utils/format';

interface VideoEditorViewProps {
  onNavigate: (page: NavPage) => void;
}

export const VideoEditorView: React.FC<VideoEditorViewProps> = ({ onNavigate }) => {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [presets, setPresets] = useState<EditingPreset[]>([]);
  const [title, setTitle] = useState('Custom Heavy Rain 3 Hours Mix');
  const [selectedPresetName, setSelectedPresetName] = useState('Heavy Rain 3 Hours');
  const [clipOrder, setClipOrder] = useState<string[]>([]);
  const [rainAudioId, setRainAudioId] = useState('');
  const [pianoAudioId, setPianoAudioId] = useState('');
  const [rainVolume, setRainVolume] = useState(0.85);
  const [pianoVolume, setPianoVolume] = useState(0.35);
  const [durationSec, setDurationSec] = useState(10800);
  const [trimStartSec, setTrimStartSec] = useState(0);
  const [fadeInSec, setFadeInSec] = useState(3);
  const [fadeOutSec, setFadeOutSec] = useState(5);
  const [loopVideo, setLoopVideo] = useState(true);
  const [blackScreen, setBlackScreen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    const [mRes, pRes] = await Promise.all([fetch('/api/media'), fetch('/api/presets')]);
    if (mRes.ok) {
      const m = await mRes.json();
      const items = (m.items ?? []) as MediaAsset[];
      setMedia(items);
      if (clipOrder.length === 0) {
        const f = items.find((i) => i.type === 'footage');
        if (f) setClipOrder([f.id]);
      }
      if (!rainAudioId) {
        const r = items.find((i) => i.type === 'rain_audio');
        if (r) setRainAudioId(r.id);
      }
      if (!pianoAudioId) {
        const p = items.find((i) => i.type === 'piano_music');
        if (p) setPianoAudioId(p.id);
      }
    }
    if (pRes.ok) {
      const p = await pRes.json();
      setPresets(p.presets ?? []);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const applyPreset = (preset: EditingPreset) => {
    setSelectedPresetName(preset.name);
    setDurationSec(preset.target_duration_sec);
    setRainVolume(preset.rain_volume);
    setPianoVolume(preset.piano_volume);
    setFadeInSec(preset.fade_in_sec);
    setFadeOutSec(preset.fade_out_sec);
    setBlackScreen(Boolean(preset.black_screen));
    setMessage(`Preset "${preset.name}" diterapkan.`);
  };

  const handleUploadAsset = async (file: File, type: 'footage' | 'rain_audio' | 'piano_music') => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      form.append('name', file.name);
      const res = await fetch('/api/media/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal mengunggah file.');
      await loadData();
      if (type === 'footage') setClipOrder((prev) => [...prev, json.item.id]);
      if (type === 'rain_audio') setRainAudioId(json.item.id);
      if (type === 'piano_music') setPianoAudioId(json.item.id);
      setMessage(`File "${file.name}" berhasil diunggah dan siap diedit.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal unggah file.');
    } finally {
      setUploading(false);
    }
  };

  const moveClip = (idx: number, dir: -1 | 1) => {
    const next = [...clipOrder];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setClipOrder(next);
  };

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newPresetName.trim(),
        category: selectedPresetName,
        targetDurationSec: durationSec,
        rainVolume,
        pianoVolume,
        fadeInSec,
        fadeOutSec,
        loopCrossfadeSec: 2,
        blackScreen,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setPresets(json.presets ?? []);
      setNewPresetName('');
      setMessage(`Preset baru "${newPresetName.trim()}" disimpan.`);
    }
  };

  const handleStartRender = async () => {
    setRendering(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/render-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          preset: selectedPresetName,
          config: {
            footageAssetIds: blackScreen ? [] : clipOrder,
            rainAudioAssetId: rainAudioId,
            pianoAssetId: pianoVolume > 0 ? pianoAudioId : null,
            blackScreen,
            rainVolume,
            pianoVolume,
            fadeInSec,
            fadeOutSec,
            trimStartSec,
            targetDurationSec: durationSec,
            loopVideo,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memulai render FFmpeg.');
      setMessage(`Job render FFmpeg "${title}" dimulai! Pantau progres di AI Video Generator.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulai render.');
    } finally {
      setRendering(false);
    }
  };

  const footageAssets = media.filter((m) => m.type === 'footage' || m.type === 'thumbnail');
  const rainAssets = media.filter((m) => m.type === 'rain_audio');
  const pianoAssets = media.filter((m) => m.type === 'piano_music');
  const previewVideo = media.find((m) => m.id === clipOrder[0]);
  const previewRain = media.find((m) => m.id === rainAudioId);
  const previewPiano = media.find((m) => m.id === pianoAudioId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
            Video Editor FFmpeg
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Unggah media, atur urutan klip, potong durasi, campur volume hujan &amp; piano, serta eksekusi render FFmpeg.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('video_generator')}
          className="px-3.5 py-2 rounded-lg bg-[#0C1411] hover:bg-[#121E19] border border-emerald-950/80 text-xs font-medium text-emerald-300"
        >
          Lihat Antrean Render
        </button>
      </div>

      {/* Preset Editing */}
      <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-3">
        <div className="text-xs font-medium text-slate-300">Preset Editing Cepat</div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                selectedPresetName === p.name
                  ? 'bg-emerald-500 text-[#04120B]'
                  : 'bg-[#121E19] text-slate-300 hover:text-white border border-emerald-950/80'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">{error}</div>
      )}
      {message && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-sm text-emerald-200">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Panel Kiri: Upload & Urutan Klip + Kontrol Audio */}
        <div className="xl:col-span-2 space-y-6">
          {/* Upload Cepat */}
          <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              { label: 'Upload Footage Video', type: 'footage', accept: 'video/*,image/*' },
              { label: 'Upload Audio Hujan', type: 'rain_audio', accept: 'audio/*' },
              { label: 'Upload Musik Piano', type: 'piano_music', accept: 'audio/*' },
            ] as const).map((up) => (
              <label
                key={up.type}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#060B09] hover:bg-[#121E19] border border-dashed border-emerald-800/70 text-xs font-medium text-slate-200 cursor-pointer transition-colors"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> : <Upload className="h-4 w-4 text-emerald-400" />}
                <span>{up.label}</span>
                <input
                  type="file"
                  accept={up.accept}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadAsset(f, up.type);
                  }}
                />
              </label>
            ))}
          </div>

          {/* Urutan Footage & Potong */}
          <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Timeline &amp; Urutan Footage
              </h3>
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blackScreen}
                  onChange={(e) => setBlackScreen(e.target.checked)}
                  className="rounded border-emerald-800 bg-[#060B09] text-emerald-500"
                />
                <span>Mode Black Screen (Layar Hitam)</span>
              </label>
            </div>

            {!blackScreen && (
              <>
                <div className="flex gap-3">
                  <select
                    aria-label="Tambah footage ke timeline"
                    onChange={(e) => {
                      if (e.target.value) setClipOrder((prev) => [...prev, e.target.value]);
                    }}
                    value=""
                    className="flex-1 px-3.5 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
                  >
                    <option value="">+ Tambah klip footage dari Media Library...</option>
                    {footageAssets.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({formatDuration(f.duration_sec)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {clipOrder.map((id, idx) => {
                    const asset = media.find((m) => m.id === id);
                    return (
                      <div
                        key={`${id}-${idx}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950/80 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-emerald-400 mr-2">#{idx + 1}</span>
                          <span className="text-slate-200 truncate">{asset?.name ?? id}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveClip(idx, -1)}
                            aria-label="Geser naik"
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveClip(idx, 1)}
                            aria-label="Geser turun"
                            className="p-1 text-slate-400 hover:text-white"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setClipOrder((prev) => prev.filter((_, i) => i !== idx))}
                            className="px-2 py-1 text-rose-400 hover:text-rose-300"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Parameter Mixing Audio & Durasi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-emerald-950/60">
              <div>
                <label htmlFor="ed-rain-src" className="block text-xs text-slate-400 mb-1.5">
                  Sumber Audio Hujan
                </label>
                <select
                  id="ed-rain-src"
                  value={rainAudioId}
                  onChange={(e) => setRainAudioId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
                >
                  {rainAssets.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Volume Hujan</span>
                  <span className="font-mono tabular-nums text-emerald-300">{Math.round(rainVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={rainVolume}
                  onChange={(e) => setRainVolume(Number(e.target.value))}
                  className="w-full accent-emerald-500 mt-1"
                />
              </div>

              <div>
                <label htmlFor="ed-piano-src" className="block text-xs text-slate-400 mb-1.5">
                  Sumber Musik Piano
                </label>
                <select
                  id="ed-piano-src"
                  value={pianoAudioId}
                  onChange={(e) => setPianoAudioId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
                >
                  <option value="">Tidak digunakan</option>
                  {pianoAssets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Volume Piano</span>
                  <span className="font-mono tabular-nums text-emerald-300">{Math.round(pianoVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={pianoVolume}
                  onChange={(e) => setPianoVolume(Number(e.target.value))}
                  className="w-full accent-emerald-500 mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Durasi Target</label>
                <select
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs font-mono text-[#E6F1EC]"
                >
                  <option value={10800}>3 Jam (10.800s)</option>
                  <option value={3600}>1 Jam (3.600s)</option>
                  <option value={60}>Preview 1 Menit</option>
                  <option value={20}>Uji Cepat 20 Detik</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Potong Awal (Detik)</label>
                <input
                  type="number"
                  min={0}
                  value={trimStartSec}
                  onChange={(e) => setTrimStartSec(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs font-mono text-[#E6F1EC]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fade In (Detik)</label>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={fadeInSec}
                  onChange={(e) => setFadeInSec(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs font-mono text-[#E6F1EC]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Fade Out (Detik)</label>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={fadeOutSec}
                  onChange={(e) => setFadeOutSec(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs font-mono text-[#E6F1EC]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-emerald-950/60">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={loopVideo}
                  onChange={(e) => setLoopVideo(e.target.checked)}
                  className="rounded border-emerald-800 bg-[#060B09] text-emerald-500"
                />
                <span>Aktifkan Seamless Looping ke Target Durasi</span>
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Nama preset baru..."
                  className="px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
                />
                <button
                  type="button"
                  onClick={() => void handleSavePreset()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#121E19] hover:bg-emerald-950 border border-emerald-800/60 text-xs font-medium text-slate-200"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Simpan Preset</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Panel Kanan: Preview Media & Eksekusi Render */}
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
            <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
              Preview &amp; Eksekusi Render
            </h3>

            <div className="aspect-video rounded-lg bg-black border border-emerald-950 overflow-hidden flex items-center justify-center">
              {blackScreen ? (
                <div className="text-xs text-slate-500 font-mono">1920x1080 · BLACK SCREEN MODE</div>
              ) : previewVideo ? (
                previewVideo.mime_type.startsWith('image/') ? (
                  <img
                    src={previewVideo.url_path}
                    alt={previewVideo.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={previewVideo.url_path}
                    controls
                    loop
                    muted
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <span className="text-xs text-slate-500">Pilih footage untuk preview</span>
              )}
            </div>

            {previewRain && (
              <div className="space-y-1">
                <div className="text-xs text-slate-400 truncate">Audio Hujan: {previewRain.name}</div>
                <audio src={previewRain.url_path} controls className="w-full h-8" />
              </div>
            )}

            {previewPiano && pianoVolume > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-slate-400 truncate">Musik Piano: {previewPiano.name}</div>
                <audio src={previewPiano.url_path} controls className="w-full h-8" />
              </div>
            )}

            <div>
              <label htmlFor="ed-title" className="block text-xs text-slate-400 mb-1">
                Nama Output Project
              </label>
              <input
                id="ed-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
              />
            </div>

            <button
              type="button"
              disabled={rendering}
              onClick={() => void handleStartRender()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold transition-colors"
            >
              {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span>{rendering ? 'Mengirim ke FFmpeg...' : 'Render via FFmpeg Backend'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
