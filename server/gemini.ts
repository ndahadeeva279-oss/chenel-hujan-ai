import { GoogleGenAI, Type } from '@google/genai';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum tersedia di environment server. Silakan periksa panel Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseGeminiError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403')) {
    return new Error('Akses Gemini API ditolak atau API key belum valid. Silakan periksa API key di panel Settings > Secrets.');
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return new Error('Kuota Gemini API terlampaui (429). Jika menggunakan model gambar/berbayar, pastikan API key billing aktif di panel Settings > Secrets.');
  }
  return new Error(`Gemini API gagal: ${msg}`);
}

export async function generateTrendResearchIdeas(params: {
  category: string;
  keyword: string;
  country: string;
  language: string;
  videos: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    publishedAt: string;
    viewCount: number;
    likeCount: number | null;
    durationSec: number;
    viewsPerDay: number;
  }>;
}) {
  try {
    const ai = getClient();
    const prompt = `Anda adalah AI Trend Research Agent untuk channel YouTube Rain Sounds & Piano.
Kategori fokus: ${params.category}
Kata kunci riset: ${params.keyword}
Target negara riset: ${params.country}, bahasa: ${params.language}

Berikut adalah DATA AKTUAL dari YouTube Data API (jangan mengarang angka views atau metrik CTR/retention/RPM karena tidak tersedia secara publik):
${JSON.stringify(params.videos.slice(0, 25), null, 2)}

Tugas Anda:
1. Kelompokkan temuan berdasarkan pola tren dan jenis konten (misalnya durasi populer, suasana visual, kombinasi suara hujan & piano, black screen).
2. Buat tepat 20 ide video baru yang orisinal dalam Bahasa Inggris untuk target penonton Amerika/Global (beserta penjelasan Bahasa Indonesia di kolom reasonToTest).
3. Untuk setiap ide, jelaskan alasan mengapa ide tersebut layak diuji berdasarkan data aktual di atas.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Berikan analisis riset konten YouTube yang objektif dan berbasis data aktual yang diberikan. Bedakan antara data aktual, estimasi views/hari, dan rekomendasi AI. Jangan pernah menjanjikan video pasti viral atau jutaan views.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            trendClusters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  clusterName: { type: Type.STRING },
                  contentType: { type: Type.STRING },
                  observationSummary: { type: Type.STRING },
                  recommendedDurationMin: { type: Type.INTEGER },
                },
                required: ['clusterName', 'contentType', 'observationSummary', 'recommendedDurationMin'],
              },
            },
            ideas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  titleEnglish: { type: Type.STRING },
                  category: { type: Type.STRING },
                  visualConcept: { type: Type.STRING },
                  audioMix: { type: Type.STRING },
                  targetDurationMin: { type: Type.INTEGER },
                  reasonToTest: { type: Type.STRING },
                },
                required: ['titleEnglish', 'category', 'visualConcept', 'audioMix', 'targetDurationMin', 'reasonToTest'],
              },
            },
          },
          required: ['trendClusters', 'ideas'],
        },
      },
    });

    const raw = (response.text ?? '{}').trim();
    return JSON.parse(raw);
  } catch (err) {
    throw parseGeminiError(err);
  }
}

export async function analyzeCompetitorWithAI(params: {
  channel: {
    id: string;
    title: string;
    subscriberCount: number;
    viewCount: number;
    videoCount: number;
  };
  videos: Array<{
    videoId: string;
    title: string;
    publishedAt: string;
    viewCount: number;
    likeCount: number | null;
    durationSec: number;
    viewsPerDay: number;
    tags?: string[];
  }>;
}) {
  try {
    const ai = getClient();
    const prompt = `Anda adalah Competitor Analyzer Agent untuk channel YouTube Rain & Piano.
Analisis data publik channel kompetitor berikut (HANYA data publik YouTube Data API; jangan menebak CTR, retention, RPM, atau pendapatan karena tidak tersedia):

Info Channel:
${JSON.stringify(params.channel, null, 2)}

Daftar Video Terbaru & Populer:
${JSON.stringify(params.videos.slice(0, 30), null, 2)}

Berikan laporan strategis dalam Bahasa Indonesia yang mencakup:
1. Pola judul yang sering digunakan, tema & kategori konten, pola durasi, perkiraan frekuensi upload, dan kata kunci yang dominan.
2. Konten yang paling menarik untuk dipelajari.
3. Peluang konten yang belum banyak dieksplorasi oleh kompetitor tersebut.
4. Rekomendasi ide berbeda dan orisinal (dilarang menyalin atau meniru persis).
5. Rekomendasi strategi upload (jadwal, durasi, variasi visual).`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Analisis data publik kompetitor secara etis dan objektif. Jangan menyalin judul atau konsep secara identik; fokus pada diferensiasi orisinal.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            uploadFrequencySummary: { type: Type.STRING },
            dominantDurationPattern: { type: Type.STRING },
            titlePatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
            topKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            thumbnailPatternObservation: { type: Type.STRING },
            worthStudying: { type: Type.ARRAY, items: { type: Type.STRING } },
            unexploredOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
            originalIdeas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  titleEnglish: { type: Type.STRING },
                  angle: { type: Type.STRING },
                  differentiation: { type: Type.STRING },
                },
                required: ['titleEnglish', 'angle', 'differentiation'],
              },
            },
            uploadStrategyRecommendation: { type: Type.STRING },
          },
          required: [
            'uploadFrequencySummary',
            'dominantDurationPattern',
            'titlePatterns',
            'topKeywords',
            'thumbnailPatternObservation',
            'worthStudying',
            'unexploredOpportunities',
            'originalIdeas',
            'uploadStrategyRecommendation',
          ],
        },
      },
    });

    return JSON.parse((response.text ?? '{}').trim());
  } catch (err) {
    throw parseGeminiError(err);
  }
}

export async function askChannelAnalyticsAI(question: string, analyticsData: Record<string, unknown>) {
  try {
    const ai = getClient();
    const prompt = `Pertanyaan pemilik channel: "${question}"

Data aktual dari YouTube Analytics API:
${JSON.stringify(analyticsData, null, 2)}

Jawab pertanyaan dalam Bahasa Indonesia secara akurat berdasarkan data aktual di atas. Jika ada metrik yang tidak tersedia di data API (misalnya revenue atau data video tertentu belum ada), katakan dengan jujur bahwa metrik tersebut belum tersedia dari API.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Anda adalah AI Channel Analyst untuk channel Rain & Piano. Gunakan hanya data aktual dari payload YouTube Analytics API. Jangan membuat data palsu.',
      },
    });

    return response.text ?? 'Tidak ada jawaban yang dihasilkan.';
  } catch (err) {
    throw parseGeminiError(err);
  }
}

export async function generateContentPlanAI(params: {
  category: string;
  focusTheme: string;
  scheduledDate: string;
  scheduledTime: string;
  existingTitles: string[];
  channelInsights?: string;
}) {
  try {
    const ai = getClient();
    const prompt = `Buat 1 rencana konten YouTube Rain & Piano baru untuk target penonton Amerika Serikat (Bahasa Inggris alami).
Kategori: ${params.category}
Tema fokus: ${params.focusTheme}
Tanggal target: ${params.scheduledDate} jam ${params.scheduledTime}
Insight channel (jika ada): ${params.channelInsights || 'Belum ada data analitik khusus; gunakan praktik terbaik audiens tidur & relaksasi US (malam waktu US EST/PST).'}

PENTING — Hindari judul dan konsep yang terlalu mirip dengan video yang sudah direncanakan/dibuat sebelumnya:
${params.existingTitles.length > 0 ? params.existingTitles.map((t) => `- ${t}`).join('\n') : '(Belum ada video sebelumnya)'}

Hasilkan judul Bahasa Inggris yang natural (tidak clickbait berlebihan), deskripsi YouTube SEO yang tenang & informatif, tags, hashtag, rekomendasi thumbnail visual, dan rekomendasi jam upload.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Buat konsep konten YouTube Rain & Piano berdurasi 3 jam yang unik dan berbeda dari daftar judul sebelumnya. Semua judul/deskripsi/tags output untuk YouTube dalam Bahasa Inggris alami, sedangkan penjelasan strategi dalam Bahasa Indonesia.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            conceptTitleId: { type: Type.STRING },
            englishTitle: { type: Type.STRING },
            description: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            category: { type: Type.STRING },
            thumbnailRecommendation: { type: Type.STRING },
            recommendedTimeEst: { type: Type.STRING },
            uniquenessNote: { type: Type.STRING },
          },
          required: [
            'conceptTitleId',
            'englishTitle',
            'description',
            'tags',
            'hashtags',
            'category',
            'thumbnailRecommendation',
            'recommendedTimeEst',
            'uniquenessNote',
          ],
        },
      },
    });

    return JSON.parse((response.text ?? '{}').trim());
  } catch (err) {
    throw parseGeminiError(err);
  }
}

export async function generateSeoPackageAI(concept: string, category: string, durationMin: number) {
  try {
    const ai = getClient();
    const prompt = `Anda adalah YouTube SEO Assistant untuk channel Rain & Piano (target audiens Amerika / Global English).
Konsep video: ${concept}
Kategori: ${category}
Durasi: ${durationMin} menit

Aturan ketat:
- Judul harus alami, deskriptif, dan sesuai isi video.
- DILARANG menjanjikan hasil seperti "viral", "millions of views", atau klaim medis berlebihan.
- Hasilkan 5 alternatif judul Bahasa Inggris, pilih 1 judul terbaik, deskripsi SEO lengkap dengan timestamp placeholder 3 jam, hashtag, tags, keyword utama, keyword pendukung, nama file video (.mp4 slug rapi), dan rekomendasi thumbnail.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            titleAlternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
            bestTitle: { type: Type.STRING },
            seoDescription: { type: Type.STRING },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            primaryKeyword: { type: Type.STRING },
            secondaryKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            videoFilename: { type: Type.STRING },
            thumbnailRecommendation: { type: Type.STRING },
          },
          required: [
            'titleAlternatives',
            'bestTitle',
            'seoDescription',
            'hashtags',
            'tags',
            'primaryKeyword',
            'secondaryKeywords',
            'videoFilename',
            'thumbnailRecommendation',
          ],
        },
      },
    });

    return JSON.parse((response.text ?? '{}').trim());
  } catch (err) {
    throw parseGeminiError(err);
  }
}

export async function generateThumbnailWithGemini(params: {
  concept: string;
  sceneType: string;
  moodNotes: string;
  includeTextOverlay?: string;
}): Promise<{ base64: string; mimeType: string; promptUsed: string }> {
  try {
    const ai = getClient();
    const textInstruction = params.includeTextOverlay?.trim()
      ? `Include crisp, minimalist, accurately spelled typography reading "${params.includeTextOverlay.trim()}" in clean sans-serif lettering with strong contrast, zero typos.`
      : 'Do not include any text, letters, watermarks, or logos on the image.';

    const promptUsed = `Photorealistic 16:9 YouTube thumbnail artwork for a relaxing rain ambience video.
Scene: ${params.sceneType}.
Concept: ${params.concept}.
Visual details & lighting: ${params.moodNotes || 'Deep atmospheric night/twilight lighting, crisp raindrops, visible clear focal subject, rich dark emerald and charcoal tones, high contrast depth'}.
Composition: Centered/rule-of-thirds clear focal subject readable even at small thumbnail sizes. ${textInstruction}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [{ text: promptUsed }],
      },
      config: {
        imageConfig: {
          aspectRatio: '16:9',
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType ?? 'image/png',
          promptUsed,
        };
      }
    }

    throw new Error('Model gambar tidak mengembalikan data gambar.');
  } catch (err) {
    throw parseGeminiError(err);
  }
}

export async function editThumbnailWithGemini(params: {
  imageBase64: string;
  mimeType: string;
  instruction: string;
}): Promise<{ base64: string; mimeType: string }> {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: params.imageBase64,
              mimeType: params.mimeType,
            },
          },
          {
            text: `Edit this 16:9 YouTube rain ambience thumbnail carefully according to this instruction while keeping high photorealism and clear visual composition: ${params.instruction}`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: '16:9',
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType ?? 'image/png',
        };
      }
    }

    throw new Error('Model gambar tidak mengembalikan hasil edit.');
  } catch (err) {
    throw parseGeminiError(err);
  }
}
