import React, { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, ShieldCheck, Trash2, Unlink, UploadCloud, XCircle } from 'lucide-react';
import { MediaAsset, UploadJob, YouTubeChannelInfo } from '../types';
import { formatDateTime, formatNumber } from '../utils/format';
import { StatusLabel } from '../components/StatusLabel';

export const UploadManagerView: React.FC = () => {
  const [oauthStatus, setOauthStatus] = useState<{
    connected: boolean;
    oauthConfigured: boolean;
    redirectUri: string;
    channel: YouTubeChannelInfo | null;
  } | null>(null);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [videos, setVideos] = useState<MediaAsset[]>([]);
  const [thumbnails, setThumbnails] = useState<MediaAsset[]>([]);
  const [editingJob, setEditingJob] = useState<Record<string, { title: string; description: string; tags: string; categoryId: string; scheduledPublishAt: string; videoAssetId: string; thumbnailAssetId: string }>>({});

  // Manual queue creation form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTags, setNewTags] = useState('rain sounds, heavy rain, sleep sounds, deep sleep, 3 hours rain');
  const [newVideoId, setNewVideoId] = useState('');
  const [newThumbId, setNewThumbId] = useState('');
  const [newSched, setNewSched] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));

  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAll = async () => {
    const [oaRes, upRes, vidRes, thRes] = await Promise.all([
      fetch('/api/oauth/youtube/status'),
      fetch('/api/uploads'),
      fetch('/api/media?type=rendered_video'),
      fetch('/api/media?type=thumbnail'),
    ]);
    if (oaRes.ok) setOauthStatus(await oaRes.json());
    if (upRes.ok) {
      const u = await upRes.json();
      const list = (u.uploads ?? []) as UploadJob[];
      setUploads(list);
      setEditingJob((prev) => {
        const next = { ...prev };
        for (const item of list) {
          if (!next[item.id]) {
            const tagsArr = JSON.parse(item.tags_json || '[]') as string[];
            next[item.id] = {
              title: item.title,
              description: item.description,
              tags: tagsArr.join(', '),
              categoryId: item.category_id || '10',
              scheduledPublishAt: item.scheduled_publish_at ? item.scheduled_publish_at.slice(0, 16) : '',
              videoAssetId: item.video_asset_id || item.rendered_asset_id || '',
              thumbnailAssetId: item.thumbnail_asset_id || '',
            };
          }
        }
        return next;
      });
    }
    if (vidRes.ok) {
      const v = await vidRes.json();
      setVideos(v.items ?? []);
    }
    if (thRes.ok) {
      const t = await thRes.json();
      setThumbnails(t.items ?? []);
    }
  };

  useEffect(() => {
    void loadAll();
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'YOUTUBE_OAUTH_SUCCESS') {
        setNotice('Akun YouTube berhasil terhubung via OAuth 2.0.');
        void loadAll();
      } else if (e.data?.type === 'YOUTUBE_OAUTH_ERROR') {
        setError(e.data.message || 'Autentikasi YouTube gagal.');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const handleConnect = async () => {
    setError('');
    try {
      const res = await fetch('/api/oauth/youtube/url');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memuat URL OAuth YouTube.');
      window.open(json.url, 'youtube_oauth', 'width=620,height=720');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghubungkan akun YouTube.');
    }
  };

  const handleDisconnect = async () => {
    await fetch('/api/oauth/youtube/disconnect', { method: 'POST' });
    setNotice('Koneksi akun YouTube diputuskan.');
    await loadAll();
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setError('');
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle.trim(),
        description: newDesc.trim(),
        tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
        categoryId: '10',
        videoAssetId: newVideoId || null,
        thumbnailAssetId: newThumbId || null,
        scheduledPublishAt: newSched ? new Date(newSched).toISOString() : null,
      }),
    });
    if (res.ok) {
      setNewTitle('');
      setNewDesc('');
      setNotice('Video ditambahkan ke antrean persetujuan Upload Manager.');
      await loadAll();
    }
  };

  const handleApproveAndSchedule = async (id: string) => {
    const draft = editingJob[id];
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/uploads/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft?.title,
          description: draft?.description,
          tags: (draft?.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
          categoryId: draft?.categoryId || '10',
          scheduledPublishAt: draft?.scheduledPublishAt ? new Date(draft.scheduledPublishAt).toISOString() : null,
          videoAssetId: draft?.videoAssetId || null,
          thumbnailAssetId: draft?.thumbnailAssetId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal mengunggah video ke YouTube.');
      setNotice(`Disetujui dan dikirim ke YouTube! ID Video: ${json.upload?.youtube_video_id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyetujui & mengunggah video.');
      await loadAll();
    } finally {
      setBusyId('');
    }
  };

  const handleReject = async (id: string) => {
    await fetch(`/api/uploads/${id}/reject`, { method: 'POST' });
    await loadAll();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/uploads/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
          Upload Manager &amp; Persetujuan Publikasi
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Mode FULL AUTOMATION WITH HUMAN APPROVAL: video tidak akan diunggah atau dijadwalkan sebelum Anda menekan tombol SETUJUI DAN JADWALKAN.
        </p>
      </div>

      {/* Koneksi Channel YouTube OAuth 2.0 */}
      <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {oauthStatus?.connected && oauthStatus.channel ? (
          <div className="flex items-center gap-4">
            {oauthStatus.channel.thumbnail && (
              <img
                src={oauthStatus.channel.thumbnail}
                alt={oauthStatus.channel.title}
                referrerPolicy="no-referrer"
                className="h-12 w-12 rounded-full object-cover border border-emerald-700/60"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-semibold text-[#E6F1EC]">
                  {oauthStatus.channel.title}
                </span>
                <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Terhubung (OAuth 2.0)
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                {formatNumber(oauthStatus.channel.subscriberCount)} subscriber · {formatNumber(oauthStatus.channel.viewCount)} views ·{' '}
                {formatNumber(oauthStatus.channel.videoCount)} video
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="font-display text-base font-semibold text-[#E6F1EC]">
              Akun YouTube Belum Terhubung
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Redirect URI OAuth: <code className="font-mono text-emerald-300">{oauthStatus?.redirectUri || '...'}</code>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 shrink-0">
          {oauthStatus?.connected ? (
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#121E19] hover:bg-rose-950/40 border border-emerald-950 text-xs font-medium text-slate-300 hover:text-rose-200"
            >
              <Unlink className="h-4 w-4" />
              <span>Putuskan Koneksi</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleConnect()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#04120B] text-xs font-semibold"
            >
              <Link2 className="h-4 w-4" />
              <span>Hubungkan Akun YouTube</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {/* Tambah Manual ke Antrean Persetujuan */}
      <form onSubmit={handleCreateQueue} className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
        <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
          Siapkan Antrean Upload Baru
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Judul video YouTube (Bahasa Inggris)..."
            className="px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
          />
          <input
            type="datetime-local"
            value={newSched}
            onChange={(e) => setNewSched(e.target.value)}
            className="px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-mono text-[#E6F1EC]"
          />
          <select
            value={newVideoId}
            onChange={(e) => setNewVideoId(e.target.value)}
            className="px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
          >
            <option value="">Pilih file video MP4 hasil render...</option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            value={newThumbId}
            onChange={(e) => setNewThumbId(e.target.value)}
            className="px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
          >
            <option value="">Pilih thumbnail 16:9 dari Media Library...</option>
            {thumbnails.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          rows={2}
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="Deskripsi video..."
          className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
        />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <input
            type="text"
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="Tags dipisahkan koma..."
            className="flex-1 min-w-[240px] px-3.5 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC]"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#121E19] hover:bg-emerald-500/20 border border-emerald-700/60 text-xs font-medium text-emerald-300"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Tambah ke Antrean Persetujuan</span>
          </button>
        </div>
      </form>

      {/* Daftar Antrean Upload */}
      <div className="space-y-4">
        <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
          Daftar Antrean Upload &amp; Persetujuan ({uploads.length})
        </h3>

        {uploads.length === 0 ? (
          <div className="p-10 rounded-xl bg-[#0C1411] border border-emerald-950/80 text-center text-sm text-slate-400">
            Belum ada video di antrean Upload Manager.
          </div>
        ) : (
          uploads.map((item) => {
            const draft = editingJob[item.id];
            const isWaiting = item.approval_status === 'waiting_approval';
            const thumbPreview = thumbnails.find((t) => t.id === (draft?.thumbnailAssetId || item.thumbnail_asset_id));

            return (
              <div key={item.id} className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <StatusLabel status={item.approval_status} />
                    {item.render_status && (
                      <span className="text-xs text-slate-400 font-mono">
                        · Render FFmpeg: {item.render_status} ({item.render_progress ?? 0}%)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    Dibuat: {formatDateTime(item.created_at)}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-4 space-y-3">
                    <div className="aspect-video rounded-lg bg-[#060B09] border border-emerald-950 overflow-hidden flex items-center justify-center">
                      {thumbPreview ? (
                        <img
                          src={thumbPreview.url_path}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">Belum ada thumbnail</span>
                      )}
                    </div>

                    <select
                      disabled={!isWaiting}
                      value={draft?.thumbnailAssetId || ''}
                      onChange={(e) =>
                        setEditingJob((p) => ({
                          ...p,
                          [item.id]: { ...p[item.id], thumbnailAssetId: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC] disabled:opacity-60"
                    >
                      <option value="">Pilih Thumbnail...</option>
                      {thumbnails.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>

                    <select
                      disabled={!isWaiting}
                      value={draft?.videoAssetId || ''}
                      onChange={(e) =>
                        setEditingJob((p) => ({
                          ...p,
                          [item.id]: { ...p[item.id], videoAssetId: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-[#E6F1EC] disabled:opacity-60"
                    >
                      <option value="">
                        {item.rendered_asset_id ? 'Otomatis dari hasil render FFmpeg' : 'Pilih Video MP4...'}
                      </option>
                      {videos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-8 space-y-3">
                    <input
                      type="text"
                      disabled={!isWaiting}
                      value={draft?.title ?? item.title}
                      onChange={(e) =>
                        setEditingJob((p) => ({ ...p, [item.id]: { ...p[item.id], title: e.target.value } }))
                      }
                      className="w-full px-3.5 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-medium text-[#E6F1EC] disabled:opacity-70"
                    />
                    <textarea
                      rows={3}
                      disabled={!isWaiting}
                      value={draft?.description ?? item.description}
                      onChange={(e) =>
                        setEditingJob((p) => ({ ...p, [item.id]: { ...p[item.id], description: e.target.value } }))
                      }
                      className="w-full px-3.5 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-slate-200 disabled:opacity-70"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        disabled={!isWaiting}
                        value={draft?.tags ?? ''}
                        onChange={(e) =>
                          setEditingJob((p) => ({ ...p, [item.id]: { ...p[item.id], tags: e.target.value } }))
                        }
                        placeholder="Tags..."
                        className="px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-slate-200 disabled:opacity-70"
                      />
                      <select
                        disabled={!isWaiting}
                        value={draft?.categoryId ?? '10'}
                        onChange={(e) =>
                          setEditingJob((p) => ({ ...p, [item.id]: { ...p[item.id], categoryId: e.target.value } }))
                        }
                        className="px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-slate-200 disabled:opacity-70"
                      >
                        <option value="10">Kategori: Music (10)</option>
                        <option value="24">Kategori: Entertainment (24)</option>
                        <option value="22">Kategori: People &amp; Blogs (22)</option>
                        <option value="15">Kategori: Pets &amp; Animals / Nature (15)</option>
                      </select>
                      <input
                        type="datetime-local"
                        disabled={!isWaiting}
                        value={draft?.scheduledPublishAt ?? ''}
                        onChange={(e) =>
                          setEditingJob((p) => ({
                            ...p,
                            [item.id]: { ...p[item.id], scheduledPublishAt: e.target.value },
                          }))
                        }
                        className="px-3 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-xs font-mono text-slate-200 disabled:opacity-70"
                      />
                    </div>

                    {item.error_message && (
                      <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200">
                        {item.error_message}
                      </div>
                    )}

                    {item.youtube_url && (
                      <div className="text-xs text-emerald-300">
                        Link YouTube:{' '}
                        <a href={item.youtube_url} target="_blank" rel="noreferrer" className="underline">
                          {item.youtube_url}
                        </a>
                      </div>
                    )}

                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {isWaiting && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === item.id}
                              onClick={() => void handleApproveAndSchedule(item.id)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-bold tracking-wide transition-colors"
                            >
                              {busyId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-4 w-4" />
                              )}
                              <span>SETUJUI DAN JADWALKAN</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleReject(item.id)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#121E19] hover:bg-rose-950/50 border border-emerald-950 text-xs font-medium text-slate-300 hover:text-rose-200"
                            >
                              <XCircle className="h-4 w-4" />
                              <span>Tolak</span>
                            </button>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        aria-label="Hapus item upload"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
