import React, { useEffect, useState } from 'react';
import { Check, Copy, Save, Server } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [workerMode, setWorkerMode] = useState<'local_ffmpeg' | 'external_vps'>('local_ffmpeg');
  const [externalWorkerUrl, setExternalWorkerUrl] = useState('');
  const [externalWorkerToken, setExternalWorkerToken] = useState('');
  const [externalConnected, setExternalConnected] = useState(false);
  const [hasWorkerToken, setHasWorkerToken] = useState(false);
  const [defaultDurationMin, setDefaultDurationMin] = useState('180');
  const [targetRegion, setTargetRegion] = useState('US');
  const [diagnostics, setDiagnostics] = useState<{
    geminiConfigured: boolean;
    youtubeApiKeyConfigured: boolean;
    googleOAuthConfigured: boolean;
    appBaseUrl: string;
    youtubeRedirectUri: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadSettings = async () => {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const json = await res.json();
      setWorkerMode(json.settings.worker_mode || 'local_ffmpeg');
      setExternalWorkerUrl(json.settings.external_worker_url || '');
      setExternalConnected(Boolean(json.settings.external_worker_connected));
      setHasWorkerToken(Boolean(json.settings.has_worker_token));
      setDefaultDurationMin(json.settings.default_duration_min || '180');
      setTargetRegion(json.settings.target_audience_region || 'US');
      setDiagnostics(json.diagnostics);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_mode: workerMode,
          external_worker_url: externalWorkerUrl,
          external_worker_token: externalWorkerToken,
          default_duration_min: defaultDurationMin,
          target_audience_region: targetRegion,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan pengaturan.');
      setExternalWorkerToken('');
      setNotice('Pengaturan studio dan worker berhasil disimpan.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const copyRedirectUri = () => {
    if (!diagnostics?.youtubeRedirectUri) return;
    void navigator.clipboard.writeText(diagnostics.youtubeRedirectUri);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 1500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
          Settings &amp; Integrasi Infrastruktur
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Konfigurasi worker rendering FFmpeg (lokal atau VPS eksternal), parameter default produksi 3 jam, dan kesiapan API server.
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

      {/* Status Kesiapan Integrasi Server */}
      <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
        <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
          Status Koneksi Layanan Backend
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-[#060B09] border border-emerald-950/80 flex items-center justify-between">
            <span className="text-slate-300">Gemini AI Server SDK</span>
            <span className={diagnostics?.geminiConfigured ? 'text-emerald-400 font-medium' : 'text-amber-300'}>
              {diagnostics?.geminiConfigured ? 'Tersedia di Server' : 'Belum Dikonfigurasi'}
            </span>
          </div>
          <div className="p-3.5 rounded-lg bg-[#060B09] border border-emerald-950/80 flex items-center justify-between">
            <span className="text-slate-300">YouTube Data API Key</span>
            <span className={diagnostics?.youtubeApiKeyConfigured ? 'text-emerald-400 font-medium' : 'text-amber-300'}>
              {diagnostics?.youtubeApiKeyConfigured ? 'Tersedia di Secrets' : 'Belum Diset (Pakai OAuth / Secrets)'}
            </span>
          </div>
          <div className="p-3.5 rounded-lg bg-[#060B09] border border-emerald-950/80 flex items-center justify-between">
            <span className="text-slate-300">Google OAuth 2.0 Client</span>
            <span className={diagnostics?.googleOAuthConfigured ? 'text-emerald-400 font-medium' : 'text-amber-300'}>
              {diagnostics?.googleOAuthConfigured ? 'Tersedia di Secrets' : 'Belum Diset di Secrets'}
            </span>
          </div>
          <div className="p-3.5 rounded-lg bg-[#060B09] border border-emerald-950/80 flex items-center justify-between">
            <span className="text-slate-300">Worker VPS FFmpeg Eksternal</span>
            <span className={externalConnected ? 'text-emerald-400 font-medium' : 'text-amber-300 font-medium'}>
              {externalConnected ? 'TERKONFIGURASI' : 'BELUM TERHUBUNG'}
            </span>
          </div>
        </div>

        {diagnostics?.youtubeRedirectUri && (
          <div className="pt-2 space-y-1.5">
            <div className="text-xs text-slate-400">
              Authorized Redirect URI untuk Google Cloud Console (YouTube OAuth 2.0):
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-xs font-mono text-emerald-300 overflow-x-auto">
                {diagnostics.youtubeRedirectUri}
              </code>
              <button
                type="button"
                onClick={copyRedirectUri}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#121E19] hover:bg-emerald-950 border border-emerald-800/60 text-xs text-slate-200 shrink-0"
              >
                {copiedUri ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedUri ? 'Disalin' : 'Salin URI'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form Pengaturan Worker & Default Produksi */}
      <form onSubmit={handleSave} className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-5">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-emerald-400" />
          <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
            Konfigurasi Worker FFmpeg &amp; Produksi
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-wmode" className="block text-xs text-slate-400 mb-1.5">
              Mode Worker Default
            </label>
            <select
              id="set-wmode"
              value={workerMode}
              onChange={(e) => setWorkerMode(e.target.value as 'local_ffmpeg' | 'external_vps')}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            >
              <option value="local_ffmpeg">Worker FFmpeg Lokal (Server Kontainer)</option>
              <option value="external_vps">Server Rendering VPS Eksternal</option>
            </select>
          </div>

          <div>
            <label htmlFor="set-dur" className="block text-xs text-slate-400 mb-1.5">
              Durasi Video Default (Menit)
            </label>
            <input
              id="set-dur"
              type="number"
              min={1}
              max={600}
              value={defaultDurationMin}
              onChange={(e) => setDefaultDurationMin(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-mono text-[#E6F1EC]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-emerald-950/60">
          <div>
            <label htmlFor="set-vps-url" className="block text-xs text-slate-400 mb-1.5">
              URL Endpoint VPS Render Eksternal (HTTPS)
            </label>
            <input
              id="set-vps-url"
              type="url"
              value={externalWorkerUrl}
              onChange={(e) => setExternalWorkerUrl(e.target.value)}
              placeholder="https://render-worker.domainanda.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            />
          </div>

          <div>
            <label htmlFor="set-vps-token" className="block text-xs text-slate-400 mb-1.5">
              Bearer Token Keamanan VPS {hasWorkerToken ? '(Token tersimpan — isi untuk mengganti)' : ''}
            </label>
            <input
              id="set-vps-token"
              type="password"
              value={externalWorkerToken}
              onChange={(e) => setExternalWorkerToken(e.target.value)}
              placeholder={hasWorkerToken ? '••••••••••••' : 'Masukkan token otorisasi worker...'}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400">
            Kebijakan Publikasi: <strong className="text-emerald-300">FULL AUTOMATION WITH HUMAN APPROVAL</strong> (Terkunci Aktif)
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold transition-colors"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
