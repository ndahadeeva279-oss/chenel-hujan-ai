import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, getSetting, logAgentActivity, setSetting, STORAGE_DIR } from './db.ts';
import { generateContentPlanAI, generateThumbnailWithGemini } from './gemini.ts';
import { processRenderJob } from './ffmpegWorker.ts';

const DEFAULT_CATEGORIES = [
  'Heavy Rain Forest',
  'Rain and Piano',
  'Rain on Window',
  'Black Screen Rain',
  'Rain on Tropical Leaves',
  'Rain on Roof',
  'Thunderstorm and Rain',
  'Nature Rain Ambience',
];

let schedulerTimer: NodeJS.Timeout | null = null;
let isRunningInProcess = false;

export interface AutopilotStatus {
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
  lastCategoryIndex: number;
}

export function getAutopilotStatus(): AutopilotStatus {
  let categories = DEFAULT_CATEGORIES;
  try {
    const parsed = JSON.parse(getSetting('autopilot_categories_json') || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      categories = parsed;
    }
  } catch {
    categories = DEFAULT_CATEGORIES;
  }

  return {
    enabled: getSetting('autopilot_enabled') === '1',
    runningNow: isRunningInProcess,
    intervalMinutes: Math.max(5, Number(getSetting('autopilot_interval_minutes') || 720)),
    durationMode: getSetting('autopilot_duration_mode') === 'preview_30s' ? 'preview_30s' : 'full_3h',
    generateThumbnail: getSetting('autopilot_generate_thumbnail') !== '0',
    categories,
    lastRunAt: getSetting('autopilot_last_run_at') || '',
    nextRunAt: getSetting('autopilot_next_run_at') || '',
    totalCycles: Number(getSetting('autopilot_total_cycles') || 0),
    lastError: getSetting('autopilot_last_error') || '',
    lastCategoryIndex: Number(getSetting('autopilot_last_category_index') || 0),
  };
}

export function updateAutopilotConfig(params: {
  intervalMinutes?: number;
  durationMode?: 'full_3h' | 'preview_30s';
  generateThumbnail?: boolean;
  categories?: string[];
}) {
  if (params.intervalMinutes !== undefined) {
    const mins = Math.max(5, Math.min(10080, Math.round(params.intervalMinutes)));
    setSetting('autopilot_interval_minutes', String(mins));
    // Recompute nextRunAt if currently enabled
    if (getSetting('autopilot_enabled') === '1') {
      const next = new Date(Date.now() + mins * 60_000).toISOString();
      setSetting('autopilot_next_run_at', next);
    }
  }
  if (params.durationMode) {
    setSetting('autopilot_duration_mode', params.durationMode === 'preview_30s' ? 'preview_30s' : 'full_3h');
  }
  if (params.generateThumbnail !== undefined) {
    setSetting('autopilot_generate_thumbnail', params.generateThumbnail ? '1' : '0');
  }
  if (Array.isArray(params.categories) && params.categories.length > 0) {
    setSetting('autopilot_categories_json', JSON.stringify(params.categories));
  }
}

export function startAutopilot() {
  const status = getAutopilotStatus();
  setSetting('autopilot_enabled', '1');
  setSetting('autopilot_last_error', '');
  const nextRun = new Date(Date.now() + status.intervalMinutes * 60_000).toISOString();
  if (!status.nextRunAt) {
    setSetting('autopilot_next_run_at', nextRun);
  }
  logAgentActivity(
    'Autopilot Scheduler',
    'autopilot_started',
    `Mode Autopilot berkelanjutan diaktifkan (interval setiap ${status.intervalMinutes} menit tanpa batas waktu hingga dihentikan).`,
    'running'
  );
  return getAutopilotStatus();
}

export function stopAutopilot() {
  setSetting('autopilot_enabled', '0');
  setSetting('autopilot_next_run_at', '');
  logAgentActivity(
    'Autopilot Scheduler',
    'autopilot_stopped',
    'Mode Autopilot dihentikan oleh pengguna.',
    'completed'
  );
  return getAutopilotStatus();
}

export async function executeAutopilotCycle(): Promise<{ planId: string; jobId: string; uploadId: string }> {
  if (isRunningInProcess) {
    throw new Error('Siklus Autopilot sedang berjalan. Tunggu hingga siklus saat ini selesai.');
  }
  isRunningInProcess = true;
  setSetting('autopilot_last_error', '');

  try {
    const status = getAutopilotStatus();
    const categories = status.categories.length > 0 ? status.categories : DEFAULT_CATEGORIES;
    const nextIdx = (status.lastCategoryIndex + 1) % categories.length;
    const category = categories[nextIdx];
    setSetting('autopilot_last_category_index', String(nextIdx));

    // Schedule for next available day/evening slot
    const targetDate = new Date(Date.now() + (status.totalCycles + 1) * 86_400_000);
    const schedDate = targetDate.toISOString().slice(0, 10);
    const schedTime = '21:00';
    const targetDurationSec = status.durationMode === 'preview_30s' ? 30 : 10800;

    // 1. Existing titles to avoid repetition
    const existingRows = db.prepare('SELECT english_title FROM content_plans').all() as Array<{ english_title: string }>;
    const existingTitles = existingRows.map((r) => r.english_title);

    // 2. Generate unique content plan & SEO via Gemini
    const planAI = await generateContentPlanAI({
      category,
      focusTheme: `${category} natural continuous ambience for deep sleep, calm focus, and nighttime relaxation`,
      scheduledDate: schedDate,
      scheduledTime: schedTime,
      existingTitles,
    });

    // 3. Thumbnail: generate fresh AI thumbnail if enabled, else pick from Media Library
    let thumbAssetId: string | null = null;
    if (status.generateThumbnail) {
      try {
        const thumbRes = await generateThumbnailWithGemini({
          concept: planAI.englishTitle,
          sceneType: category,
          moodNotes: planAI.thumbnailRecommendation || 'Cinematic dark emerald night rain atmosphere, crisp raindrops, clear focal subject',
        });
        const ext = thumbRes.mimeType.includes('jpeg') ? 'jpg' : 'png';
        const filename = `thumb_auto_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`;
        const filePath = path.join(STORAGE_DIR, filename);
        const buf = Buffer.from(thumbRes.base64, 'base64');
        fs.writeFileSync(filePath, buf);

        thumbAssetId = `thumb-${crypto.randomUUID()}`;
        db.prepare(`
          INSERT INTO media_assets
          (id, name, type, category, file_path, url_path, mime_type, duration_sec, width, height, size_bytes, source, created_at)
          VALUES (?, ?, 'thumbnail', ?, ?, ?, ?, 0, 1280, 720, ?, 'ai_generated', ?)
        `).run(
          thumbAssetId,
          `Autopilot Thumb: ${planAI.englishTitle.slice(0, 42)}`,
          category,
          filePath,
          `/media/${filename}`,
          thumbRes.mimeType,
          buf.length,
          new Date().toISOString()
        );
      } catch (thumbErr) {
        // Fallback cleanly to existing Media Library thumbnail so pipeline continues
        logAgentActivity(
          'AI Thumbnail Studio',
          'autopilot_thumbnail_fallback',
          `Fallback ke thumbnail Media Library karena: ${thumbErr instanceof Error ? thumbErr.message : 'Error gambar'}`,
          'completed'
        );
      }
    }

    if (!thumbAssetId) {
      const fallbackThumb =
        (db
          .prepare(`SELECT id FROM media_assets WHERE type = 'thumbnail' ORDER BY RANDOM() LIMIT 1`)
          .get() as { id: string } | undefined);
      thumbAssetId = fallbackThumb?.id || null;
    }

    // 4. Save Content Plan
    const planId = `plan-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
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
      thumbAssetId,
      Math.round(targetDurationSec / 60),
      schedDate,
      schedTime,
      now
    );

    // 5. Pick matching footage & audio from Media Library
    const footageRow = db
      .prepare(`SELECT id FROM media_assets WHERE type IN ('footage', 'thumbnail') ORDER BY CASE WHEN type = 'footage' THEN 0 ELSE 1 END, RANDOM() LIMIT 1`)
      .get() as { id: string } | undefined;
    const rainRow = db
      .prepare(`SELECT id FROM media_assets WHERE type = 'rain_audio' ORDER BY RANDOM() LIMIT 1`)
      .get() as { id: string } | undefined;
    const pianoRow = db
      .prepare(`SELECT id FROM media_assets WHERE type = 'piano_music' ORDER BY RANDOM() LIMIT 1`)
      .get() as { id: string } | undefined;

    const isBlackScreen = category === 'Black Screen Rain';
    const isPiano = category === 'Rain and Piano';

    const jobId = `job-${crypto.randomUUID().slice(0, 12)}`;
    const renderConfig = {
      footageAssetIds: isBlackScreen ? [] : footageRow ? [footageRow.id] : [],
      rainAudioAssetId: rainRow?.id || 'sample-rain-audio-12s',
      pianoAssetId: isPiano && pianoRow ? pianoRow.id : null,
      blackScreen: isBlackScreen,
      rainVolume: isPiano ? 0.68 : 0.88,
      pianoVolume: isPiano ? 0.5 : 0,
      fadeInSec: 3,
      fadeOutSec: 5,
      targetDurationSec,
      loopVideo: true,
    };

    const workerMode = getSetting('worker_mode') || 'local_ffmpeg';
    db.prepare(`
      INSERT INTO render_jobs
      (id, plan_id, title, preset, status, progress, worker_mode, target_duration_sec, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?)
    `).run(jobId, planId, planAI.englishTitle, category, workerMode, targetDurationSec, JSON.stringify(renderConfig), now, now);

    // 6. Queue into Upload Manager strictly in WAITING_APPROVAL (Human Approval Gate!)
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
      thumbAssetId,
      scheduledPublishAt,
      now,
      now
    );

    // Update autopilot counters & next schedule
    const nextTotal = status.totalCycles + 1;
    setSetting('autopilot_total_cycles', String(nextTotal));
    setSetting('autopilot_last_run_at', now);
    if (getSetting('autopilot_enabled') === '1') {
      setSetting('autopilot_next_run_at', new Date(Date.now() + status.intervalMinutes * 60_000).toISOString());
    }

    logAgentActivity(
      'Autopilot Scheduler',
      'autopilot_cycle_queued',
      `Siklus #${nextTotal} (${category}): "${planAI.englishTitle}" masuk antrean render dan menunggu persetujuan publikasi Anda.`,
      'waiting_approval',
      { planId, jobId, uploadId }
    );

    // Run FFmpeg render asynchronously
    setImmediate(() => {
      void processRenderJob(jobId);
    });

    return { planId, jobId, uploadId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setSetting('autopilot_last_error', msg);
    logAgentActivity('Autopilot Scheduler', 'autopilot_cycle_error', `Siklus Autopilot gagal: ${msg}`, 'failed');
    throw err;
  } finally {
    isRunningInProcess = false;
  }
}

export function initAutopilotScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  // Check every 15 seconds if Autopilot is enabled and due
  schedulerTimer = setInterval(() => {
    try {
      if (getSetting('autopilot_enabled') !== '1' || isRunningInProcess) {
        return;
      }
      const nextRunStr = getSetting('autopilot_next_run_at');
      const nextRunMs = nextRunStr ? new Date(nextRunStr).getTime() : 0;
      if (!nextRunStr || Number.isNaN(nextRunMs) || Date.now() >= nextRunMs) {
        void executeAutopilotCycle().catch((e) => {
          console.error('Autopilot cycle error:', e);
        });
      }
    } catch (e) {
      console.error('Autopilot tick error:', e);
    }
  }, 15_000);
}
