import React, { useEffect, useState } from 'react';
import { Download, Loader2, Trash2, Upload } from 'lucide-react';
import { MediaAsset } from '../types';
import { formatBytes, formatDateTime, formatDuration } from '../utils/format';

const TYPE_FILTERS = [
  { id: '', label: 'Semua Aset' },
  { id: 'footage', label: 'Footage Video' },
  { id: 'rain_audio', label: 'Audio Hujan' },
  { id: 'piano_music', label: 'Musik Piano' },
  { id: 'thumbnail', label: 'Thumbnail' },
  { id: 'rendered_video', label: 'Hasil Render 3 Jam' },
];

export const MediaLibraryView: React.FC = () => {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [filterType, setFilterType] = useState('');
  const [uploadType, setUploadType] = useState<'footage' | 'rain_audio' | 'piano_music' | 'thumbnail'>('footage');
  const [uploadCategory, setUploadCategory] = useState('Heavy Rain Forest');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const loadMedia = async (type: string) => {
    const res = await fetch(type ? `/api/media?type=${encodeURIComponent(type)}` : '/api/media');
    if (res.ok) {
      const json = await res.json();
      setItems(json.items ?? []);
    }
  };

  useEffect(() => {
    void loadMedia(filterType);
  }, [filterType]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', uploadType);
      form.append('category', uploadCategory);
      form.append('name', file.name);
      const res = await fetch('/api/media/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal mengunggah media.');
      await loadMedia(filterType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal unggah media.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/media/${id}`, { method: 'DELETE' });
    await loadMedia(filterType);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
          Media Library
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Kelola footage berlisensi milik Anda, audio hujan, musik piano, thumbnail 16:9, dan hasil render MP4.
        </p>
      </div>

      {/* Upload Bar */}
      <div className="p-5 rounded-xl bg-[#0C1411] border border-emerald-950/80 flex flex-wrap items-center gap-4">
        <select
          value={uploadType}
          onChange={(e) => setUploadType(e.target.value as typeof uploadType)}
          className="px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
        >
          <option value="footage">Jenis: Footage Video</option>
          <option value="rain_audio">Jenis: Audio Hujan</option>
          <option value="piano_music">Jenis: Musik Piano</option>
          <option value="thumbnail">Jenis: Thumbnail</option>
        </select>

        <input
          type="text"
          value={uploadCategory}
          onChange={(e) => setUploadCategory(e.target.value)}
          placeholder="Kategori aset..."
          className="px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
        />

        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#04120B] text-xs font-semibold cursor-pointer transition-colors">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{uploading ? 'Mengunggah & Memeriksa...' : 'Upload File Media'}</span>
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
        </label>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">{error}</div>
      )}

      {/* Filter Segmented Control */}
      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterType(f.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              filterType === f.id
                ? 'bg-emerald-500 text-[#04120B]'
                : 'bg-[#0C1411] text-slate-300 hover:text-white border border-emerald-950/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid Aset Media */}
      {items.length === 0 ? (
        <div className="p-10 rounded-xl bg-[#0C1411] border border-emerald-950/80 text-center text-sm text-slate-400">
          Belum ada aset pada kategori ini.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl bg-[#0C1411] border border-emerald-950/80 overflow-hidden flex flex-col">
              <div className="aspect-video bg-[#060B09] border-b border-emerald-950/60 flex items-center justify-center overflow-hidden">
                {item.mime_type.startsWith('image/') ? (
                  <img
                    src={item.url_path}
                    alt={item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : item.mime_type.startsWith('video/') ? (
                  <video src={item.url_path} controls className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full px-5">
                    <div className="text-xs text-emerald-400 mb-2 text-center font-mono">Audio Track</div>
                    <audio src={item.url_path} controls className="w-full" />
                  </div>
                )}
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-[#E6F1EC] line-clamp-1">{item.name}</div>
                  <div className="text-xs text-slate-400 font-mono tabular-nums mt-1">
                    {item.type} · {item.width > 0 ? `${item.width}x${item.height} · ` : ''}
                    {item.duration_sec > 0 ? `${formatDuration(item.duration_sec)} · ` : ''}
                    {formatBytes(item.size_bytes)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {item.category} · {formatDateTime(item.created_at)}
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-950/60 flex items-center justify-between">
                  <a
                    href={item.url_path}
                    download={item.name}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Unduh</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    aria-label="Hapus aset media"
                    className="p-1.5 rounded text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
