import React, { useEffect, useState } from 'react';
import { Check, Download, Image as ImageIcon, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { MediaAsset } from '../types';
import { downloadPng1280x720 } from '../utils/format';

const SCENE_TYPES = [
  'Hutan Hujan Malam (Heavy Rain Forest)',
  'Jendela & Piano Hangat (Rain and Piano)',
  'Hujan Deras di Daun Tropis (Tropical Leaves)',
  'Atap Kabin Kayu & Badai Petir (Cabin Roof Storm)',
  'Black Screen Minimalis dengan Tetesan Halus',
  'Hujan di Jendela Kaca Kota Malam Hari',
];

export const ThumbnailStudioView: React.FC = () => {
  const [concept, setConcept] = useState('Heavy rain pouring over an ancient misty emerald forest at twilight for deep sleep');
  const [sceneType, setSceneType] = useState(SCENE_TYPES[0]);
  const [moodNotes, setMoodNotes] = useState('Cinematic depth, visible crisp raindrops, dark emerald and obsidian shadows, clear central focal point');
  const [textOverlay, setTextOverlay] = useState('');
  const [thumbnails, setThumbnails] = useState<MediaAsset[]>([]);
  const [selectedThumb, setSelectedThumb] = useState<MediaAsset | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadThumbnails = async () => {
    const res = await fetch('/api/media?type=thumbnail');
    if (res.ok) {
      const json = await res.json();
      const list = (json.items ?? []) as MediaAsset[];
      setThumbnails(list);
      if (!selectedThumb && list.length > 0) {
        setSelectedThumb(list[0]);
      }
    }
  };

  useEffect(() => {
    void loadThumbnails();
  }, []);

  const handleGenerate = async () => {
    if (!concept.trim()) return;
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/thumbnails/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept,
          sceneType,
          moodNotes,
          includeTextOverlay: textOverlay,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal membuat thumbnail dengan Gemini.');
      setSelectedThumb(json.asset);
      setNotice('Thumbnail 16:9 baru berhasil dibuat dan otomatis disimpan ke Media Library.');
      await loadThumbnails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat thumbnail.');
    } finally {
      setGenerating(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedThumb || !editInstruction.trim()) return;
    setEditing(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/thumbnails/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: selectedThumb.id,
          instruction: editInstruction,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal mengedit thumbnail.');
      setSelectedThumb(json.asset);
      setEditInstruction('');
      setNotice('Thumbnail berhasil diedit dan versi baru disimpan ke Media Library.');
      await loadThumbnails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengedit thumbnail.');
    } finally {
      setEditing(false);
    }
  };

  const handleDownloadPng = async () => {
    if (!selectedThumb) return;
    try {
      await downloadPng1280x720(selectedThumb.url_path, `thumbnail_1280x720_${selectedThumb.id.slice(-6)}.png`);
      setNotice('Thumbnail berhasil diunduh dalam format PNG 1280x720.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh PNG.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
          AI Thumbnail Studio (16:9 · 1280x720)
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Hasilkan variasi visual hujan realistis menggunakan Gemini Image Generation dan simpan otomatis ke Media Library.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Kontrol Generator */}
        <div className="xl:col-span-5 p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
          <div>
            <label htmlFor="th-scene" className="block text-xs text-slate-400 mb-1.5">
              Suasana / Lingkungan
            </label>
            <select
              id="th-scene"
              value={sceneType}
              onChange={(e) => setSceneType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            >
              {SCENE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="th-concept" className="block text-xs text-slate-400 mb-1.5">
              Konsep Visual Video
            </label>
            <textarea
              id="th-concept"
              rows={3}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            />
          </div>

          <div>
            <label htmlFor="th-mood" className="block text-xs text-slate-400 mb-1.5">
              Detail Pencahayaan &amp; Komposisi
            </label>
            <input
              id="th-mood"
              type="text"
              value={moodNotes}
              onChange={(e) => setMoodNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            />
          </div>

          <div>
            <label htmlFor="th-text" className="block text-xs text-slate-400 mb-1.5">
              Teks Singkat Opsional (Kosongkan agar murni fotografi)
            </label>
            <input
              id="th-text"
              type="text"
              value={textOverlay}
              onChange={(e) => setTextOverlay(e.target.value)}
              placeholder="Contoh: 3 HOURS DEEP SLEEP"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerate()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold transition-colors"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              <span>{generating ? 'Membuat Thumbnail...' : 'Generate Thumbnail'}</span>
            </button>

            <button
              type="button"
              disabled={generating}
              onClick={() => void handleGenerate()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#121E19] hover:bg-emerald-950 border border-emerald-800/60 text-xs font-medium text-slate-200"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Regenerate</span>
            </button>
          </div>
        </div>

        {/* Preview 1280x720 & Edit */}
        <div className="xl:col-span-7 p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
                Preview Thumbnail (Target 1280x720)
              </h3>
              <div className="text-xs text-slate-400 mt-0.5">
                {selectedThumb ? `${selectedThumb.name} · 16:9` : 'Pilih atau buat thumbnail baru'}
              </div>
            </div>

            {selectedThumb && (
              <button
                type="button"
                onClick={() => void handleDownloadPng()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300"
              >
                <Download className="h-4 w-4" />
                <span>Download PNG</span>
              </button>
            )}
          </div>

          <div className="aspect-video w-full rounded-xl bg-[#060B09] border border-emerald-950 overflow-hidden flex items-center justify-center">
            {selectedThumb ? (
              <img
                src={selectedThumb.url_path}
                alt={selectedThumb.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-slate-500">Belum ada thumbnail dipilih</span>
            )}
          </div>

          {selectedThumb && (
            <div className="flex gap-3 pt-2">
              <input
                type="text"
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                placeholder="Instruksi Edit Thumbnail (contoh: tambahkan kabut lebih tebal dan cahaya lampu hangat di jendela)..."
                className="flex-1 px-3.5 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
              />
              <button
                type="button"
                disabled={editing || !editInstruction.trim()}
                onClick={() => void handleEdit()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#121E19] hover:bg-emerald-500/20 disabled:opacity-50 border border-emerald-800/60 text-xs font-medium text-emerald-300 whitespace-nowrap"
              >
                {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                <span>Edit Thumbnail</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Galeri Thumbnail Tersimpan */}
      <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
        <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
          Koleksi Thumbnail di Media Library ({thumbnails.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {thumbnails.map((th) => {
            const active = selectedThumb?.id === th.id;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => setSelectedThumb(th)}
                className={`text-left rounded-xl overflow-hidden border transition-colors bg-[#060B09] ${
                  active ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-emerald-950/80 hover:border-emerald-800'
                }`}
              >
                <div className="aspect-video relative bg-black">
                  <img
                    src={th.url_path}
                    alt={th.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">{th.name}</div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">{th.category}</div>
                  </div>
                  {active && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
