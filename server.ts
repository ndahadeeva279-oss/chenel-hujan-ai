import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  ASSETS_IMAGES_DIR,
  db,
  getSetting,
  initDatabase,
  logAgentActivity,
  setSetting,
  STORAGE_DIR,
} from './server/db.ts';
import {
  analyzeCompetitorWithAI,
  askChannelAnalyticsAI,
  editThumbnailWithGemini,
  generateContentPlanAI,
  generateSeoPackageAI,
  generateThumbnailWithGemini,
  generateTrendResearchIdeas,
} from './server/gemini.ts';
import {
  buildYouTubeAuthUrl,
  exchangeYouTubeCode,
  fetchCompetitorChannelData,
  fetchYouTubeChannelAnalytics,
  getAppBaseUrl,
  getStoredOAuth,
  getYouTubeRedirectUri,
  searchYouTubeTrends,
  uploadVideoToYouTubeReal,
} from './server/youtube.ts';
import {
  ensureStudioSamples,
  isAllowedMediaPath,
  processRenderJob,
  runFfprobe,
  validateExternalWorkerUrl,
} from './server/ffmpegWorker.ts';
import {
  executeAutopilotCycle,
  getAutopilotStatus,
  initAutopilotScheduler,
  startAutopilot,
  stopAutopilot,
  updateAutopilotConfig,
} from './server/autopilot.ts';

initDatabase();
void ensureStudioSamples();
initAutopilotScheduler();

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '20mb' }));

// Serve generated & uploaded media files safely
app.use('/media', express.static(STORAGE_DIR));

// Multer storage confined to STORAGE_DIR
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, STORAGE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
    const base = path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 40);
    cb(null, `${base || 'media'}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB limit for footage/audio
});

// ========================
// OAuth Callback Routes
// ========================
const youtubeCallbackHandler = async (req: express.Request, res: express.Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const error = typeof req.query.error === 'string' ? req.query.error : '';

  if (error || !code) {
    return res.status(400).send(`
      <html>
        <body style="background:#060B09;color:#E6F1EC;font-family:sans-serif;padding:32px;">
          <h2>Autentikasi YouTube Dibatalkan</h2>
          <p>${error ? String(error).replace(/[<>&]/g, '') : 'Kode otorisasi tidak diterima.'}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'YOUTUBE_OAUTH_ERROR', message: 'Autentikasi dibatalkan' }, '*');
              setTimeout(() => window.close(), 1500);
            }
          </script>
        </body>
      </html>
    `);
  }

  try {
    await exchangeYouTubeCode(code, req);
    return res.send(`
      <html>
        <body style="background:#060B09;color:#E6F1EC;font-family:sans-serif;padding:32px;">
          <h2>Channel YouTube Berhasil Terhubung</h2>
          <p>Jendela ini akan tertutup otomatis.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'YOUTUBE_OAUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal menghubungkan channel YouTube.';
    return res.status(500).send(`
      <html>
        <body style="background:#060B09;color:#FCA5A5;font-family:sans-serif;padding:32px;">
          <h2>Gagal Menghubungkan YouTube</h2>
          <p>${msg.replace(/[<>&]/g, '')}</p>
        </body>
      </html>
    `);
  }
};

app.get(['/auth/youtube/callback', '/auth/youtube/callback/'], youtubeCallbackHandler);

// ========================
// Dashboard Overview
// ========================
app.get('/api/dashboard', (_req, res) => {
  const totalVideos = (
    db.prepare(`SELECT COUNT(*) as c FROM media_assets WHERE type = 'rendered_video'`).get() as { c: number }
  ).c;
  const waitingApproval = (
    db.prepare(`SELECT COUNT(*) as c FROM upload_jobs WHERE approval_status = 'waiting_approval'`).get() as {
      c: number;
    }
  ).c;
  const scheduled = (
    db.prepare(`SELECT COUNT(*) as c FROM upload_jobs WHERE approval_status = 'approved_scheduled'`).get() as {
      c: number;
    }
  ).c;
  const uploaded = (
    db.prepare(`SELECT COUNT(*) as c FROM upload_jobs WHERE approval_status = 'published'`).get() as { c: number }
  ).c;

  const activeJobs = db
    .prepare(`SELECT * FROM render_jobs WHERE status IN ('queued', 'processing') ORDER BY created_at DESC LIMIT 8`)
    .all();
  const recentActivities = db
    .prepare(`SELECT * FROM agent_activities ORDER BY created_at DESC LIMIT 12`)
    .all();
  const pendingApprovals = db
    .prepare(`SELECT * FROM upload_jobs WHERE approval_status = 'waiting_approval' ORDER BY created_at DESC LIMIT 5`)
    .all();

  const oauth = getStoredOAuth();

  res.json({
    counts: {
      totalVideos,
      waitingApproval,
      scheduled,
      uploaded,
    },
    channelConnected: Boolean(oauth),
    channel: oauth
      ? {
          id: oauth.channel_id,
          title: oauth.channel_title,
          thumbnail: oauth.channel_thumbnail,
          subscriberCount: oauth.subscriber_count,
          viewCount: oauth.view_count,
          videoCount: oauth.video_count,
        }
      : null,
    activeJobs,
    recentActivities,
    pendingApprovals,
  });
});

// ========================
// Media Library
// ========================
app.get('/api/media', (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const rows = type
    ? db.prepare('SELECT * FROM media_assets WHERE type = ? ORDER BY created_at DESC').all(type)
    : db.prepare('SELECT * FROM media_assets ORDER BY created_at DESC').all();
  res.json({ items: rows });
});

app.post('/api/media/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
    }
    const type = String(req.body.type || 'footage');
    const validTypes = ['footage', 'rain_audio', 'piano_music', 'thumbnail', 'rendered_video'];
    const assetType = validTypes.includes(type) ? type : 'footage';
    const category = String(req.body.category || 'General');
    const name = String(req.body.name || req.file.originalname);
    const filePath = req.file.path;

    let durationSec = 0;
    let width = 0;
    let height = 0;
    try {
      const probe = await runFfprobe(filePath);
      durationSec = probe.durationSec;
      width = probe.width;
      height = probe.height;
    } catch {
      // Non-A/V files or image fallback
    }

    const id = `med-${crypto.randomUUID()}`;
    const urlPath = `/media/${path.basename(filePath)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO media_assets
      (id, name, type, category, file_path, url_path, mime_type, duration_sec, width, height, size_bytes, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upload', ?)
    `).run(id, name, assetType, category, filePath, urlPath, req.file.mimetype, durationSec, width, height, req.file.size, now);

    logAgentActivity('Media Library', 'asset_uploaded', `Aset "${name}" (${assetType}) diunggah ke Media Library.`, 'completed');

    const created = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id);
    res.json({ item: created });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal mengunggah media.' });
  }
});

app.delete('/api/media/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id) as
    | { id: string; file_path: string; source: string; name: string }
    | undefined;
  if (!row) {
    return res.status(404).json({ error: 'Aset tidak ditemukan.' });
  }
  if (row.source !== 'studio_asset' && row.file_path.startsWith(STORAGE_DIR + path.sep) && fs.existsSync(row.file_path)) {
    fs.unlinkSync(row.file_path);
  }
  db.prepare('DELETE FROM media_assets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ========================
// Presets
// ========================
app.get('/api/presets', (_req, res) => {
  const presets = db.prepare('SELECT * FROM editing_presets ORDER BY name ASC').all();
  res.json({ presets });
});

app.post('/api/presets', (req, res) => {
  const { name, category, targetDurationSec, rainVolume, pianoVolume, fadeInSec, fadeOutSec, loopCrossfadeSec, blackScreen } =
    req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Nama preset dan kategori wajib diisi.' });
  }
  const id = `preset-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT INTO editing_presets
    (id, name, category, target_duration_sec, rain_volume, piano_volume, fade_in_sec, fade_out_sec, loop_crossfade_sec, black_screen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      category = excluded.category,
      target_duration_sec = excluded.target_duration_sec,
      rain_volume = excluded.rain_volume,
      piano_volume = excluded.piano_volume,
      fade_in_sec = excluded.fade_in_sec,
      fade_out_sec = excluded.fade_out_sec,
      loop_crossfade_sec = excluded.loop_crossfade_sec,
      black_screen = excluded.black_screen
  `).run(
    id,
    String(name),
    String(category),
    Number(targetDurationSec || 10800),
    Number(rainVolume ?? 0.85),
    Number(pianoVolume ?? 0.35),
    Number(fadeInSec ?? 3),
    Number(fadeOutSec ?? 5),
    Number(loopCrossfadeSec ?? 2),
    blackScreen ? 1 : 0
  );
  const presets = db.prepare('SELECT * FROM editing_presets ORDER BY name ASC').all();
  res.json({ presets });
});

// ========================
// Trend Research & Competitor Analyzer
// ========================
app.post('/api/trends/search', async (req, res) => {
  try {
    const { category, keyword, country, language, publishedAfterDays, generateIdeas } = req.body;
    const query = String(keyword || category || 'Heavy Rain Sounds for Sleeping').trim();

    const ytData = await searchYouTubeTrends({
      query,
      category: String(category || 'Heavy Rain Sounds'),
      regionCode: country ? String(country) : undefined,
      relevanceLanguage: language ? String(language) : undefined,
      publishedAfterDays: Number(publishedAfterDays || 0),
      maxResults: 20,
    });

    let aiAnalysis = null;
    if (generateIdeas !== false && ytData.videos.length > 0) {
      aiAnalysis = await generateTrendResearchIdeas({
        category: String(category || 'Heavy Rain Sounds'),
        keyword: query,
        country: String(country || 'US'),
        language: String(language || 'en'),
        videos: ytData.videos,
      });
    }

    logAgentActivity(
      'AI Trend Research Agent',
      'trend_research',
      `Mengambil ${ytData.videos.length} video YouTube untuk "${query}"${aiAnalysis ? ` dan menyusun ${aiAnalysis.ideas?.length || 0} ide konten` : ''}.`,
      'completed'
    );

    res.json({
      source: 'YouTube Data API v3 (Publik)',
      observedAt: ytData.observedAt,
      videos: ytData.videos,
      aiAnalysis,
      disclaimer:
        'Data views, likes, tanggal publikasi, dan durasi berasal langsung dari YouTube Data API v3. Views/hari adalah estimasi matematis (views / usia hari). CTR, retensi penonton, RPM, dan pendapatan kompetitor tidak tersedia secara publik.',
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengambil data tren YouTube.' });
  }
});

app.post('/api/competitors/analyze', async (req, res) => {
  try {
    const channelInput = String(req.body.channelInput || '').trim();
    if (!channelInput) {
      return res.status(400).json({ error: 'Masukkan URL channel, @handle, atau Channel ID kompetitor.' });
    }

    const compData = await fetchCompetitorChannelData(channelInput);
    const aiReport = await analyzeCompetitorWithAI({
      channel: compData.channel,
      videos: compData.topVideos,
    });

    logAgentActivity(
      'Competitor Analyzer Agent',
      'competitor_analysis',
      `Menganalisis data publik channel "${compData.channel.title}" (${compData.topVideos.length} video).`,
      'completed'
    );

    res.json({
      source: 'YouTube Data API v3 (Publik)',
      observedAt: compData.observedAt,
      channel: compData.channel,
      recentVideos: compData.recentVideos,
      topVideos: compData.topVideos,
      aiReport,
      disclaimer:
        'Analisis hanya menggunakan metadata publik untuk riset strategi. Tidak ada video yang diunduh atau disalin. Metrik privat (CTR, retention, RPM, revenue) tidak tersedia.',
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menganalisis channel kompetitor.' });
  }
});

// ========================
// Channel Analytics & AI Analyst
// ========================
app.get('/api/analytics', async (req, res) => {
  try {
    const rawDays = Number(req.query.days || 28);
    const days: 7 | 28 | 90 = rawDays === 7 ? 7 : rawDays === 90 ? 90 : 28;
    const data = await fetchYouTubeChannelAnalytics(days);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal mengambil YouTube Analytics.' });
  }
});

app.post('/api/analytics/ask', async (req, res) => {
  try {
    const question = String(req.body.question || '').trim();
    const rawDays = Number(req.body.days || 28);
    const days: 7 | 28 | 90 = rawDays === 7 ? 7 : rawDays === 90 ? 90 : 28;
    if (!question) {
      return res.status(400).json({ error: 'Pertanyaan wajib diisi.' });
    }
    const analytics = await fetchYouTubeChannelAnalytics(days);
    if (!analytics.connected) {
      return res.status(400).json({
        error: 'Channel YouTube belum terhubung via OAuth 2.0. Hubungkan channel terlebih dahulu agar AI Analyst dapat membaca data aktual.',
      });
    }
    const answer = await askChannelAnalyticsAI(question, analytics as Record<string, unknown>);
    logAgentActivity('Channel Analytics Agent', 'ai_analyst_query', `Menjawab analisis: "${question.slice(0, 60)}"`, 'completed');
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal memproses pertanyaan AI Analyst.' });
  }
});

// ========================
// AI Content Planner
// ========================
app.get('/api/plans', (_req, res) => {
  const plans = db.prepare('SELECT * FROM content_plans ORDER BY scheduled_date ASC, scheduled_time ASC').all();
  res.json({ plans });
});

app.post('/api/plans/generate', async (req, res) => {
  try {
    const { category, focusTheme, scheduledDate, scheduledTime } = req.body;
    const existingRows = db.prepare('SELECT english_title FROM content_plans').all() as Array<{ english_title: string }>;
    const existingTitles = existingRows.map((r) => r.english_title);

    const planAI = await generateContentPlanAI({
      category: String(category || 'Rain and Piano'),
      focusTheme: String(focusTheme || 'Deep sleep heavy rain with soft nocturnal piano'),
      scheduledDate: String(scheduledDate || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)),
      scheduledTime: String(scheduledTime || '21:00'),
      existingTitles,
    });

    const id = `plan-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO content_plans
      (id, concept_title, english_title, description, tags_json, hashtags_json, category, thumbnail_prompt, target_duration_min, scheduled_date, scheduled_time, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 180, ?, ?, 'draft', ?)
    `).run(
      id,
      planAI.conceptTitleId,
      planAI.englishTitle,
      planAI.description,
      JSON.stringify(planAI.tags || []),
      JSON.stringify(planAI.hashtags || []),
      planAI.category || String(category || 'Rain and Piano'),
      planAI.thumbnailRecommendation || '',
      String(scheduledDate || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)),
      String(scheduledTime || '21:00'),
      now
    );

    logAgentActivity(
      'AI Content Planner',
      'plan_created',
      `Menyusun rencana konten unik: "${planAI.englishTitle}" untuk jadwal ${scheduledDate}.`,
      'completed'
    );

    const created = db.prepare('SELECT * FROM content_plans WHERE id = ?').get(id);
    res.json({ plan: created, insights: planAI });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal membuat rencana konten.' });
  }
});

app.post('/api/plans', (req, res) => {
  const { conceptTitle, englishTitle, description, tags, hashtags, category, thumbnailPrompt, targetDurationMin, scheduledDate, scheduledTime } =
    req.body;
  if (!englishTitle || !scheduledDate) {
    return res.status(400).json({ error: 'Judul bahasa Inggris dan tanggal jadwal wajib diisi.' });
  }
  const id = `plan-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO content_plans
    (id, concept_title, english_title, description, tags_json, hashtags_json, category, thumbnail_prompt, target_duration_min, scheduled_date, scheduled_time, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(
    id,
    String(conceptTitle || englishTitle),
    String(englishTitle),
    String(description || ''),
    JSON.stringify(Array.isArray(tags) ? tags : []),
    JSON.stringify(Array.isArray(hashtags) ? hashtags : []),
    String(category || 'Heavy Rain Forest'),
    String(thumbnailPrompt || ''),
    Number(targetDurationMin || 180),
    String(scheduledDate),
    String(scheduledTime || '20:00'),
    now
  );
  res.json({ plan: db.prepare('SELECT * FROM content_plans WHERE id = ?').get(id) });
});

app.patch('/api/plans/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM content_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rencana konten tidak ditemukan.' });
  const { status, scheduledDate, scheduledTime, thumbnailAssetId, englishTitle, description } = req.body;
  db.prepare(`
    UPDATE content_plans SET
      status = COALESCE(?, status),
      scheduled_date = COALESCE(?, scheduled_date),
      scheduled_time = COALESCE(?, scheduled_time),
      thumbnail_asset_id = COALESCE(?, thumbnail_asset_id),
      english_title = COALESCE(?, english_title),
      description = COALESCE(?, description)
    WHERE id = ?
  `).run(status ?? null, scheduledDate ?? null, scheduledTime ?? null, thumbnailAssetId ?? null, englishTitle ?? null, description ?? null, req.params.id);
  res.json({ plan: db.prepare('SELECT * FROM content_plans WHERE id = ?').get(req.params.id) });
});

app.delete('/api/plans/:id', (req, res) => {
  db.prepare('DELETE FROM content_plans WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ========================
// AI Thumbnail Studio
// ========================
app.post('/api/thumbnails/generate', async (req, res) => {
  try {
    const { concept, sceneType, moodNotes, includeTextOverlay } = req.body;
    if (!concept) {
      return res.status(400).json({ error: 'Konsep thumbnail wajib diisi.' });
    }
    const result = await generateThumbnailWithGemini({
      concept: String(concept),
      sceneType: String(sceneType || 'Heavy Rain Forest'),
      moodNotes: String(moodNotes || ''),
      includeTextOverlay: typeof includeTextOverlay === 'string' ? includeTextOverlay : '',
    });

    const ext = result.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const filename = `thumb_ai_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`;
    const filePath = path.join(STORAGE_DIR, filename);
    const buffer = Buffer.from(result.base64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const id = `thumb-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO media_assets
      (id, name, type, category, file_path, url_path, mime_type, duration_sec, width, height, size_bytes, source, created_at)
      VALUES (?, ?, 'thumbnail', ?, ?, ?, ?, 0, 1280, 720, ?, 'ai_generated', ?)
    `).run(id, `Thumbnail: ${String(concept).slice(0, 48)}`, String(sceneType || 'Thumbnail'), filePath, `/media/${filename}`, result.mimeType, buffer.length, now);

    logAgentActivity(
      'AI Thumbnail Studio',
      'thumbnail_generated',
      `Membuat thumbnail 16:9 untuk "${String(concept).slice(0, 50)}" dan menyimpannya ke Media Library.`,
      'completed',
      { assetId: id }
    );

    res.json({ asset: db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id), promptUsed: result.promptUsed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menghasilkan thumbnail.' });
  }
});

app.post('/api/thumbnails/edit', async (req, res) => {
  try {
    const { assetId, instruction } = req.body;
    if (!assetId || !instruction) {
      return res.status(400).json({ error: 'Aset thumbnail dan instruksi edit wajib diisi.' });
    }
    const asset = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(String(assetId)) as
      | { id: string; name: string; category: string; file_path: string; mime_type: string }
      | undefined;

    if (!asset || !isAllowedMediaPath(asset.file_path) || !fs.existsSync(asset.file_path)) {
      return res.status(404).json({ error: 'File thumbnail asal tidak ditemukan.' });
    }

    const base64 = fs.readFileSync(asset.file_path).toString('base64');
    const edited = await editThumbnailWithGemini({
      imageBase64: base64,
      mimeType: asset.mime_type || 'image/jpeg',
      instruction: String(instruction),
    });

    const ext = edited.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const filename = `thumb_edit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`;
    const filePath = path.join(STORAGE_DIR, filename);
    const buffer = Buffer.from(edited.base64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const newId = `thumb-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO media_assets
      (id, name, type, category, file_path, url_path, mime_type, duration_sec, width, height, size_bytes, source, created_at)
      VALUES (?, ?, 'thumbnail', ?, ?, ?, ?, 0, 1280, 720, ?, 'ai_generated', ?)
    `).run(newId, `${asset.name} (Edited)`, asset.category, filePath, `/media/${filename}`, edited.mimeType, buffer.length, now);

    logAgentActivity('AI Thumbnail Studio', 'thumbnail_edited', `Mengedit thumbnail "${asset.name}".`, 'completed');

    res.json({ asset: db.prepare('SELECT * FROM media_assets WHERE id = ?').get(newId) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal mengedit thumbnail.' });
  }
});

// ========================
// SEO Assistant
// ========================
app.post('/api/seo/generate', async (req, res) => {
  try {
    const { concept, category, durationMin } = req.body;
    if (!concept) {
      return res.status(400).json({ error: 'Konsep atau topik video wajib diisi.' });
    }
    const seo = await generateSeoPackageAI(
      String(concept),
      String(category || 'Rain and Piano'),
      Number(durationMin || 180)
    );
    logAgentActivity('SEO Assistant Agent', 'seo_generated', `Menyusun paket SEO untuk "${seo.bestTitle}".`, 'completed');
    res.json({ seo });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menyusun metadata SEO.' });
  }
});

// ========================
// AI Video Generator & Render Queue (FFmpeg)
// ========================
app.get('/api/render-jobs', (_req, res) => {
  const jobs = db.prepare('SELECT * FROM render_jobs ORDER BY created_at DESC').all();
  res.json({ jobs });
});

app.post('/api/render-jobs', (req, res) => {
  const { planId, title, preset, workerMode, config } = req.body;
  if (!title || !config) {
    return res.status(400).json({ error: 'Judul video dan konfigurasi render wajib diisi.' });
  }
  const id = `job-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  const targetDurationSec = Number(config.targetDurationSec || 10800);
  const mode = String(workerMode || getSetting('worker_mode') || 'local_ffmpeg');

  db.prepare(`
    INSERT INTO render_jobs
    (id, plan_id, title, preset, status, progress, worker_mode, target_duration_sec, config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?)
  `).run(id, planId || null, String(title), String(preset || 'Custom'), mode, targetDurationSec, JSON.stringify(config), now, now);

  logAgentActivity(
    'AI Video Generator',
    'render_queued',
    `Mengirim job render "${title}" (${Math.round(targetDurationSec / 60)} menit) ke antrean ${mode}.`,
    'running',
    { jobId: id }
  );

  // Start FFmpeg background worker asynchronously
  setImmediate(() => {
    void processRenderJob(id);
  });

  res.json({ job: db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(id) });
});

app.post('/api/render-jobs/:id/retry', (req, res) => {
  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job render tidak ditemukan.' });
  db.prepare(`UPDATE render_jobs SET status = 'queued', progress = 0, error_log = '', updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    req.params.id
  );
  setImmediate(() => {
    void processRenderJob(req.params.id);
  });
  res.json({ job: db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(req.params.id) });
});

app.delete('/api/render-jobs/:id', (req, res) => {
  db.prepare('DELETE FROM render_jobs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Full Multi-Agent Automation Pipeline (stops at HUMAN APPROVAL gate!)
app.post('/api/video-generator/auto-produce', async (req, res) => {
  try {
    const {
      contentType,
      footageAssetIds,
      rainAudioAssetId,
      pianoAssetId,
      durationMode,
      scheduledDate,
      scheduledTime,
      workerMode,
    } = req.body;

    const category = String(contentType || 'Heavy Rain Forest');
    const targetDurationSec = durationMode === 'preview_30s' ? 30 : 10800; // Default 3 Hours (10800s)
    const schedDate = String(scheduledDate || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
    const schedTime = String(scheduledTime || '21:00');

    // 1. Check existing titles to avoid duplicate concepts
    const existingRows = db.prepare('SELECT english_title FROM content_plans').all() as Array<{ english_title: string }>;
    const existingTitles = existingRows.map((r) => r.english_title);

    // 2. AI Content Planner + SEO Metadata
    const planAI = await generateContentPlanAI({
      category,
      focusTheme: `${category} relaxing ambient soundscape for deep sleep and relaxation`,
      scheduledDate: schedDate,
      scheduledTime: schedTime,
      existingTitles,
    });

    const planId = `plan-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // 3. Pick matching thumbnail from Media Library (or fallback to studio asset)
    const thumbMatch =
      (db
        .prepare(`SELECT id FROM media_assets WHERE type = 'thumbnail' AND category LIKE ? ORDER BY created_at DESC LIMIT 1`)
        .get(`%${category.split(' ')[0]}%`) as { id: string } | undefined) ||
      (db.prepare(`SELECT id FROM media_assets WHERE type = 'thumbnail' ORDER BY created_at DESC LIMIT 1`).get() as
        | { id: string }
        | undefined);

    db.prepare(`
      INSERT INTO content_plans
      (id, concept_title, english_title, description, tags_json, hashtags_json, category, thumbnail_prompt, thumbnail_asset_id, target_duration_min, scheduled_date, scheduled_time, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting_approval', ?)
    `).run(
      planId,
      planAI.conceptTitleId,
      planAI.englishTitle,
      planAI.description,
      JSON.stringify(planAI.tags || []),
      JSON.stringify(planAI.hashtags || []),
      category,
      planAI.thumbnailRecommendation || '',
      thumbMatch?.id || null,
      Math.round(targetDurationSec / 60),
      schedDate,
      schedTime,
      now
    );

    // 4. Queue FFmpeg Render Job
    const jobId = `job-${crypto.randomUUID().slice(0, 12)}`;
    const isBlackScreen = category === 'Black Screen Rain';
    const isPiano = category === 'Rain and Piano';

    const renderConfig = {
      footageAssetIds: Array.isArray(footageAssetIds) ? footageAssetIds : [],
      rainAudioAssetId: String(rainAudioAssetId || 'sample-rain-audio-12s'),
      pianoAssetId: isPiano ? String(pianoAssetId || 'sample-piano-audio-12s') : pianoAssetId || null,
      blackScreen: isBlackScreen,
      rainVolume: isPiano ? 0.68 : 0.88,
      pianoVolume: isPiano ? 0.5 : 0,
      fadeInSec: 3,
      fadeOutSec: 5,
      targetDurationSec,
      loopVideo: true,
    };

    const mode = String(workerMode || getSetting('worker_mode') || 'local_ffmpeg');
    db.prepare(`
      INSERT INTO render_jobs
      (id, plan_id, title, preset, status, progress, worker_mode, target_duration_sec, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?)
    `).run(jobId, planId, planAI.englishTitle, category, mode, targetDurationSec, JSON.stringify(renderConfig), now, now);

    // 5. Create Upload Job in WAITING_APPROVAL (Human Approval Gate!)
    const uploadId = `upl-${crypto.randomUUID().slice(0, 12)}`;
    const scheduledPublishAt = `${schedDate}T${schedTime}:00Z`;
    db.prepare(`
      INSERT INTO upload_jobs
      (id, plan_id, render_job_id, title, description, tags_json, category_id, thumbnail_asset_id, approval_status, scheduled_publish_at, privacy_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '10', ?, 'waiting_approval', ?, 'private', ?, ?)
    `).run(
      uploadId,
      planId,
      jobId,
      planAI.englishTitle,
      `${planAI.description}\n\n${(planAI.hashtags || []).join(' ')}`.trim(),
      JSON.stringify(planAI.tags || []),
      thumbMatch?.id || null,
      scheduledPublishAt,
      now,
      now
    );

    logAgentActivity(
      'Orchestrator Multi-Agent',
      'auto_pipeline_waiting_approval',
      `Produksi otomatis "${planAI.englishTitle}" dikirim ke antrean render (${Math.round(targetDurationSec / 60)} menit) dan menunggu persetujuan publikasi Anda.`,
      'waiting_approval',
      { planId, jobId, uploadId }
    );

    setImmediate(() => {
      void processRenderJob(jobId);
    });

    res.json({
      plan: db.prepare('SELECT * FROM content_plans WHERE id = ?').get(planId),
      renderJob: db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(jobId),
      uploadJob: db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(uploadId),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menjalankan produksi otomatis.' });
  }
});

// ========================
// Upload Manager & Human Approval Gate
// ========================
app.get('/api/uploads', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT u.*, r.status as render_status, r.progress as render_progress, r.output_asset_id as rendered_asset_id, r.output_url as rendered_video_url,
             t.url_path as thumbnail_url
      FROM upload_jobs u
      LEFT JOIN render_jobs r ON u.render_job_id = r.id
      LEFT JOIN media_assets t ON u.thumbnail_asset_id = t.id
      ORDER BY u.created_at DESC
    `)
    .all();
  res.json({ uploads: rows });
});

app.post('/api/uploads', (req, res) => {
  const { planId, renderJobId, videoAssetId, thumbnailAssetId, title, description, tags, categoryId, scheduledPublishAt } =
    req.body;
  if (!title) {
    return res.status(400).json({ error: 'Judul video wajib diisi.' });
  }
  const id = `upl-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO upload_jobs
    (id, plan_id, render_job_id, title, description, tags_json, category_id, video_asset_id, thumbnail_asset_id, approval_status, scheduled_publish_at, privacy_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting_approval', ?, 'private', ?, ?)
  `).run(
    id,
    planId || null,
    renderJobId || null,
    String(title),
    String(description || ''),
    JSON.stringify(Array.isArray(tags) ? tags : []),
    String(categoryId || '10'),
    videoAssetId || null,
    thumbnailAssetId || null,
    scheduledPublishAt || null,
    now,
    now
  );

  logAgentActivity(
    'Upload Manager',
    'queued_for_approval',
    `Video "${title}" masuk antrean Upload Manager (menunggu persetujuan manual).`,
    'waiting_approval'
  );

  res.json({ upload: db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(id) });
});

// HUMAN APPROVAL GATE: SETUJUI DAN JADWALKAN
app.post('/api/uploads/:id/approve', async (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(req.params.id) as
      | {
          id: string;
          plan_id: string | null;
          render_job_id: string | null;
          video_asset_id: string | null;
          thumbnail_asset_id: string | null;
          title: string;
          description: string;
          tags_json: string;
          category_id: string;
          scheduled_publish_at: string | null;
        }
      | undefined;

    if (!job) {
      return res.status(404).json({ error: 'Antrean upload tidak ditemukan.' });
    }

    // Allow inline metadata updates right at approval time
    const title = String(req.body.title || job.title);
    const description = String(req.body.description ?? job.description);
    const tags = Array.isArray(req.body.tags) ? req.body.tags : JSON.parse(job.tags_json || '[]');
    const categoryId = String(req.body.categoryId || job.category_id || '10');
    const scheduledPublishAt = String(req.body.scheduledPublishAt || job.scheduled_publish_at || '');
    const thumbnailAssetId = req.body.thumbnailAssetId || job.thumbnail_asset_id;

    // Resolve video file path (either direct video_asset_id or from completed render_job)
    let videoAssetId = req.body.videoAssetId || job.video_asset_id;
    if (!videoAssetId && job.render_job_id) {
      const rJob = db.prepare('SELECT status, output_asset_id FROM render_jobs WHERE id = ?').get(job.render_job_id) as
        | { status: string; output_asset_id: string | null }
        | undefined;
      if (rJob && rJob.status !== 'completed') {
        return res.status(400).json({ error: `Video masih dalam proses render (${rJob.status}). Tunggu hingga render selesai.` });
      }
      videoAssetId = rJob?.output_asset_id || null;
    }

    const videoAsset = videoAssetId
      ? (db.prepare('SELECT file_path FROM media_assets WHERE id = ?').get(videoAssetId) as { file_path: string } | undefined)
      : undefined;

    if (!videoAsset || !isAllowedMediaPath(videoAsset.file_path) || !fs.existsSync(videoAsset.file_path)) {
      return res.status(400).json({ error: 'File video MP4 hasil render belum tersedia di Media Library.' });
    }

    const thumbAsset = thumbnailAssetId
      ? (db.prepare('SELECT file_path FROM media_assets WHERE id = ?').get(thumbnailAssetId) as { file_path: string } | undefined)
      : undefined;

    const oauth = getStoredOAuth();
    if (!oauth) {
      return res.status(400).json({
        error: 'Akun YouTube belum terhubung via OAuth 2.0. Hubungkan channel YouTube Anda terlebih dahulu sebelum mengunggah.',
      });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE upload_jobs SET
        title = ?, description = ?, tags_json = ?, category_id = ?,
        video_asset_id = ?, thumbnail_asset_id = ?, scheduled_publish_at = ?,
        approval_status = 'uploading', approved_at = ?, error_message = '', updated_at = ?
      WHERE id = ?
    `).run(title, description, JSON.stringify(tags), categoryId, videoAssetId, thumbnailAssetId || null, scheduledPublishAt || null, now, now, job.id);

    const ytResult = await uploadVideoToYouTubeReal({
      videoFilePath: videoAsset.file_path,
      thumbnailFilePath: thumbAsset?.file_path || null,
      title,
      description,
      tags,
      categoryId,
      publishAtIso: scheduledPublishAt || null,
    });

    const finalStatus = scheduledPublishAt ? 'approved_scheduled' : 'published';
    db.prepare(`
      UPDATE upload_jobs SET
        approval_status = ?, youtube_video_id = ?, youtube_url = ?, updated_at = ?
      WHERE id = ?
    `).run(finalStatus, ytResult.youtubeVideoId, ytResult.youtubeUrl, new Date().toISOString(), job.id);

    if (job.plan_id) {
      db.prepare(`UPDATE content_plans SET status = ? WHERE id = ?`).run(finalStatus, job.plan_id);
    }

    logAgentActivity(
      'Upload Manager',
      'youtube_upload_approved',
      `Disetujui & diunggah ke YouTube (${ytResult.youtubeVideoId})${scheduledPublishAt ? ` — dijadwalkan untuk ${scheduledPublishAt}` : ''}.`,
      'completed',
      { uploadId: job.id, youtubeVideoId: ytResult.youtubeVideoId }
    );

    res.json({ upload: db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(job.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengunggah video ke YouTube.';
    db.prepare(`UPDATE upload_jobs SET approval_status = 'waiting_approval', error_message = ?, updated_at = ? WHERE id = ?`).run(
      message,
      new Date().toISOString(),
      req.params.id
    );
    res.status(500).json({ error: message });
  }
});

app.post('/api/uploads/:id/reject', (req, res) => {
  db.prepare(`UPDATE upload_jobs SET approval_status = 'rejected', updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    req.params.id
  );
  logAgentActivity('Upload Manager', 'upload_rejected', `Persetujuan publikasi ditolak oleh pengguna.`, 'completed', {
    uploadId: req.params.id,
  });
  res.json({ ok: true });
});

app.delete('/api/uploads/:id', (req, res) => {
  db.prepare('DELETE FROM upload_jobs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ========================
// YouTube OAuth Endpoints
// ========================
app.get('/api/oauth/youtube/status', (req, res) => {
  const oauth = getStoredOAuth();
  res.json({
    connected: Boolean(oauth),
    oauthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: getYouTubeRedirectUri(req),
    channel: oauth
      ? {
          id: oauth.channel_id,
          title: oauth.channel_title,
          thumbnail: oauth.channel_thumbnail,
          subscriberCount: oauth.subscriber_count,
          viewCount: oauth.view_count,
          videoCount: oauth.video_count,
          scope: oauth.scope,
        }
      : null,
  });
});

app.get('/api/oauth/youtube/url', (req, res) => {
  try {
    const includeMonetary = req.query.monetary === '1';
    const url = buildYouTubeAuthUrl(req, includeMonetary);
    res.json({ url, redirectUri: getYouTubeRedirectUri(req) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'OAuth belum dikonfigurasi.' });
  }
});

app.post('/api/oauth/youtube/disconnect', (_req, res) => {
  db.prepare(`DELETE FROM oauth_tokens WHERE provider = 'youtube'`).run();
  logAgentActivity('YouTube OAuth Manager', 'channel_disconnected', 'Koneksi akun YouTube diputuskan.', 'completed');
  res.json({ ok: true });
});

// ========================
// Activities & Settings
// ========================
app.get('/api/activities', (_req, res) => {
  const activities = db.prepare('SELECT * FROM agent_activities ORDER BY created_at DESC LIMIT 100').all();
  res.json({ activities });
});

app.get('/api/settings', (req, res) => {
  const workerUrl = getSetting('external_worker_url') || process.env.EXTERNAL_WORKER_URL || '';
  const hasWorkerToken = Boolean(getSetting('external_worker_token') || process.env.EXTERNAL_WORKER_TOKEN);

  res.json({
    settings: {
      worker_mode: getSetting('worker_mode') || 'local_ffmpeg',
      external_worker_url: workerUrl,
      external_worker_connected: Boolean(workerUrl.trim()),
      has_worker_token: hasWorkerToken,
      default_duration_min: getSetting('default_duration_min') || '180',
      target_audience_region: getSetting('target_audience_region') || 'US',
      approval_mode: 'HUMAN_APPROVAL_REQUIRED',
    },
    diagnostics: {
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      youtubeApiKeyConfigured: Boolean(process.env.YOUTUBE_API_KEY),
      googleOAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      appBaseUrl: getAppBaseUrl(req),
      youtubeRedirectUri: getYouTubeRedirectUri(req),
    },
  });
});

app.post('/api/settings', (req, res) => {
  try {
    const { worker_mode, external_worker_url, external_worker_token, default_duration_min, target_audience_region } =
      req.body;

    if (external_worker_url && String(external_worker_url).trim()) {
      validateExternalWorkerUrl(String(external_worker_url).trim());
    }

    if (worker_mode) setSetting('worker_mode', String(worker_mode));
    if (external_worker_url !== undefined) setSetting('external_worker_url', String(external_worker_url).trim());
    if (external_worker_token !== undefined && String(external_worker_token).trim() !== '') {
      setSetting('external_worker_token', String(external_worker_token).trim());
    }
    if (default_duration_min) setSetting('default_duration_min', String(default_duration_min));
    if (target_audience_region) setSetting('target_audience_region', String(target_audience_region));

    logAgentActivity('System Settings', 'settings_updated', 'Konfigurasi studio & worker diperbarui.', 'completed');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.' });
  }
});

// ========================
// Continuous Autopilot Scheduler
// ========================
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, autopilotEnabled: getAutopilotStatus().enabled, timestamp: new Date().toISOString() });
});

app.get('/api/autopilot/status', (_req, res) => {
  res.json({ autopilot: getAutopilotStatus() });
});

app.post('/api/autopilot/config', (req, res) => {
  const { intervalMinutes, durationMode, generateThumbnail, categories } = req.body;
  updateAutopilotConfig({
    intervalMinutes: intervalMinutes !== undefined ? Number(intervalMinutes) : undefined,
    durationMode,
    generateThumbnail,
    categories,
  });
  res.json({ autopilot: getAutopilotStatus() });
});

app.post('/api/autopilot/start', (req, res) => {
  if (req.body && Object.keys(req.body).length > 0) {
    const { intervalMinutes, durationMode, generateThumbnail, categories } = req.body;
    updateAutopilotConfig({
      intervalMinutes: intervalMinutes !== undefined ? Number(intervalMinutes) : undefined,
      durationMode,
      generateThumbnail,
      categories,
    });
  }
  const status = startAutopilot();
  res.json({ autopilot: status });
});

app.post('/api/autopilot/stop', (_req, res) => {
  const status = stopAutopilot();
  res.json({ autopilot: status });
});

app.post('/api/autopilot/run-once', async (_req, res) => {
  try {
    const result = await executeAutopilotCycle();
    res.json({ ok: true, result, autopilot: getAutopilotStatus() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menjalankan siklus Autopilot.' });
  }
});

// ========================
// Vite / Static Server Setup
// ========================
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use('/src/assets/images', express.static(ASSETS_IMAGES_DIR));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rain Channel AI Agent server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
