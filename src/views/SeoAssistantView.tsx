import React, { useState } from 'react';
import { Check, Copy, Loader2, SearchCheck } from 'lucide-react';

interface SeoResult {
  titleAlternatives: string[];
  bestTitle: string;
  seoDescription: string;
  hashtags: string[];
  tags: string[];
  primaryKeyword: string;
  secondaryKeywords: string[];
  videoFilename: string;
  thumbnailRecommendation: string;
}

export const SeoAssistantView: React.FC = () => {
  const [concept, setConcept] = useState('3 hours of steady heavy rain falling on dense tropical forest leaves at dusk, no thunder, pure sleep ambience');
  const [category, setCategory] = useState('Heavy Rain Forest');
  const [durationMin, setDurationMin] = useState(180);
  const [loading, setLoading] = useState(false);
  const [seo, setSeo] = useState<SeoResult | null>(null);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [error, setError] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, category, durationMin }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyusun SEO.');
      setSeo(json.seo);
      setSelectedTitle(json.seo.bestTitle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memproses SEO.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#E6F1EC]">
          SEO Assistant Agent
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Menghasilkan 5 alternatif judul bahasa Inggris yang alami (tanpa klaim berlebihan), deskripsi SEO, tags, dan rekomendasi thumbnail.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="seo-concept" className="block text-xs text-slate-400 mb-1.5">
              Konsep atau Isi Video
            </label>
            <textarea
              id="seo-concept"
              rows={3}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
            />
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="seo-cat" className="block text-xs text-slate-400 mb-1.5">
                Kategori
              </label>
              <input
                id="seo-cat"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-sm text-[#E6F1EC]"
              />
            </div>
            <div>
              <label htmlFor="seo-dur" className="block text-xs text-slate-400 mb-1.5">
                Durasi (Menit)
              </label>
              <input
                id="seo-dur"
                type="number"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-mono text-[#E6F1EC]"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-[#04120B] text-xs font-semibold transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
            <span>{loading ? 'Menyusun Metadata SEO...' : 'Buat Paket SEO YouTube'}</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">{error}</div>
      )}

      {seo && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
            <h3 className="font-display text-base font-semibold text-[#E6F1EC]">
              5 Alternatif Judul (Pilih Judul Terbaik)
            </h3>
            <div className="space-y-2">
              {seo.titleAlternatives.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedTitle(t)}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex items-center justify-between gap-2 ${
                    selectedTitle === t
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200'
                      : 'bg-[#060B09] border-emerald-950/80 text-slate-300 hover:text-white'
                  }`}
                >
                  <span>{t}</span>
                  {selectedTitle === t && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
                </button>
              ))}
            </div>

            <div className="pt-2 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Judul Terpilih</span>
                <button
                  type="button"
                  onClick={() => copyText('title', selectedTitle)}
                  className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedKey === 'title' ? 'Disalin' : 'Salin'}</span>
                </button>
              </div>
              <div className="p-3 rounded-lg bg-[#060B09] border border-emerald-950 text-sm font-medium text-[#E6F1EC]">
                {selectedTitle}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-slate-400">Nama File Video Disarankan</div>
              <div className="p-2.5 rounded-lg bg-[#060B09] border border-emerald-950 font-mono text-emerald-300">
                {seo.videoFilename}
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="text-slate-400">Rekomendasi Thumbnail</div>
              <p className="text-slate-300 leading-relaxed">{seo.thumbnailRecommendation}</p>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-[#0C1411] border border-emerald-950/80 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[#E6F1EC]">Deskripsi SEO &amp; Tags</h3>
              <button
                type="button"
                onClick={() => copyText('desc', `${seo.seoDescription}\n\n${seo.hashtags.join(' ')}`)}
                className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copiedKey === 'desc' ? 'Disalin' : 'Salin Deskripsi'}</span>
              </button>
            </div>

            <textarea
              readOnly
              rows={8}
              value={`${seo.seoDescription}\n\n${seo.hashtags.join(' ')}`}
              className="w-full p-3.5 rounded-lg bg-[#060B09] border border-emerald-950 text-xs text-slate-200 leading-relaxed"
            />

            <div className="text-xs space-y-2">
              <div>
                <span className="text-slate-400">Keyword Utama: </span>
                <span className="text-emerald-300 font-medium">{seo.primaryKeyword}</span>
              </div>
              <div>
                <span className="text-slate-400">Keyword Pendukung: </span>
                <span className="text-slate-300">{seo.secondaryKeywords.join(' · ')}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-slate-400">YouTube Tags ({seo.tags.length})</span>
                <button
                  type="button"
                  onClick={() => copyText('tags', seo.tags.join(', '))}
                  className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedKey === 'tags' ? 'Disalin' : 'Salin Tags'}</span>
                </button>
              </div>
              <div className="p-3 rounded-lg bg-[#060B09] border border-emerald-950 font-mono text-[11px] text-slate-300">
                {seo.tags.join(', ')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
