import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ASSETS_IMAGES_DIR, db, getSetting, logAgentActivity, STORAGE_DIR } from './db.ts';

export function isAllowedMediaPath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return (
    resolved.startsWith(STORAGE_DIR + path.sep) ||
    resolved.startsWith(ASSETS_IMAGES_DIR + path.sep)
  );
}

export function validateExternalWorkerUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL worker VPS tidak valid.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL worker VPS harus menggunakan protokol http:// atau https://.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host === '169.254.169.254' ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error('URL worker VPS tidak boleh mengarah ke alamat loopback atau jaringan privat internal.');
  }
  return parsed;
}

export function runFfprobe(filePath: string): Promise<{
  durationSec: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
}> {
  return new Promise((resolve, reject) => {
    if (!isAllowedMediaPath(filePath) || !fs.existsSync(filePath)) {
      return reject(new Error('File media tidak ditemukan atau di luar direktori storage.'));
    }
    const proc = spawn('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe gagal (kode ${code}): ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout) as {
          format?: { duration?: string };
          streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
        };
        const vStream = parsed.streams?.find((s) => s.codec_type === 'video');
        const aStream = parsed.streams?.find((s) => s.codec_type === 'audio');
        resolve({
          durationSec: Math.round(Number(parsed.format?.duration || 0) * 10) / 10,
          width: vStream?.width ?? 0,
          height: vStream?.height ?? 0,
          videoCodec: vStream?.codec_name ?? '',
          audioCodec: aStream?.codec_name ?? '',
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

function execFfmpeg(
  args: string[],
  expectedDurationSec: number,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderrLog = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrLog += text;
      if (stderrLog.length > 8000) {
        stderrLog = stderrLog.slice(-8000);
      }
      if (onProgress && expectedDurationSec > 0) {
        const match = text.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
        if (match) {
          const secs = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
          const pct = Math.min(98, Math.max(1, Math.round((secs / expectedDurationSec) * 100)));
          onProgress(pct);
        }
      }
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stderrLog);
      } else {
        reject(new Error(`FFmpeg berhenti dengan kode ${code}:\n${stderrLog.slice(-1200)}`));
      }
    });
  });
}

export async function ensureStudioSamples() {
  const now = new Date().toISOString();
  const rainPath = path.join(STORAGE_DIR, 'sample_heavy_rain_12s.m4a');
  const pianoPath = path.join(STORAGE_DIR, 'sample_soft_piano_12s.m4a');
  const videoPath = path.join(STORAGE_DIR, 'sample_forest_rain_12s.mp4');

  try {
    if (!fs.existsSync(rainPath)) {
      await execFfmpeg(
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'anoisesrc=color=brown:sample_rate=48000:duration=12',
          '-af',
          'highpass=f=120,lowpass=f=3200,volume=0.8,afade=t=in:st=0:d=1,afade=t=out:st=11:d=1',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          rainPath,
        ],
        12
      );
    }

    if (!fs.existsSync(pianoPath)) {
      await execFfmpeg(
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=261.63:sample_rate=48000:duration=12',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=329.63:sample_rate=48000:duration=12',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=392.00:sample_rate=48000:duration=12',
          '-filter_complex',
          '[0:a][1:a][2:a]amix=inputs=3:normalize=0,volume=0.14,lowpass=f=1400,afade=t=in:st=0:d=1.5,afade=t=out:st=10.5:d=1.5',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          pianoPath,
        ],
        12
      );
    }

    const forestImg = path.join(ASSETS_IMAGES_DIR, 'thumb_heavy_rain_forest_1795464278261.jpg');
    if (!fs.existsSync(videoPath) && fs.existsSync(forestImg)) {
      await execFfmpeg(
        [
          '-y',
          '-loop',
          '1',
          '-i',
          forestImg,
          '-t',
          '12',
          '-vf',
          'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-pix_fmt',
          'yuv420p',
          '-an',
          videoPath,
        ],
        12
      );
    }

    const upsertSample = db.prepare(`
      INSERT OR IGNORE INTO media_assets
      (id, name, type, category, file_path, url_path, mime_type, duration_sec, width, height, size_bytes, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'studio_asset', ?)
    `);

    if (fs.existsSync(rainPath)) {
      upsertSample.run(
        'sample-rain-audio-12s',
        'Sample Studio — Heavy Rain Ambience (12s Loop)',
        'rain_audio',
        'Heavy Rain Forest',
        rainPath,
        '/media/sample_heavy_rain_12s.m4a',
        'audio/mp4',
        12,
        0,
        0,
        fs.statSync(rainPath).size,
        now
      );
    }
    if (fs.existsSync(pianoPath)) {
      upsertSample.run(
        'sample-piano-audio-12s',
        'Sample Studio — Soft Nocturne Piano Pad (12s Loop)',
        'piano_music',
        'Rain and Piano',
        pianoPath,
        '/media/sample_soft_piano_12s.m4a',
        'audio/mp4',
        12,
        0,
        0,
        fs.statSync(pianoPath).size,
        now
      );
    }
    if (fs.existsSync(videoPath)) {
      upsertSample.run(
        'sample-forest-video-12s',
        'Sample Studio — Misty Rain Forest Loop (1080p 30fps)',
        'footage',
        'Heavy Rain Forest',
        videoPath,
        '/media/sample_forest_rain_12s.mp4',
        'video/mp4',
        12,
        1920,
        1080,
        fs.statSync(videoPath).size,
        now
      );
    }
  } catch (err) {
    console.error('Gagal membuat sample studio FFmpeg:', err);
  }
}

export interface RenderConfig {
  footageAssetIds?: string[];
  rainAudioAssetId?: string;
  pianoAssetId?: string | null;
  blackScreen?: boolean;
  rainVolume?: number;
  pianoVolume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  trimStartSec?: number;
  trimDurationSec?: number;
  targetDurationSec: number;
  loopVideo?: boolean;
}

export async function processRenderJob(jobId: string) {
  const job = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(jobId) as
    | {
        id: string;
        plan_id: string | null;
        title: string;
        preset: string;
        worker_mode: string;
        target_duration_sec: number;
        config_json: string;
      }
    | undefined;

  if (!job) return;

  const updateJob = (fields: Record<string, unknown>) => {
    const keys = Object.keys(fields);
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    const vals = keys.map((k) => fields[k]);
    db.prepare(`UPDATE render_jobs SET ${sets}, updated_at = ? WHERE id = ?`).run(
      ...vals,
      new Date().toISOString(),
      jobId
    );
  };

  updateJob({ status: 'processing', progress: 2, error_log: '' });

  try {
    const config = JSON.parse(job.config_json || '{}') as RenderConfig;
    const workerMode = job.worker_mode || getSetting('worker_mode') || 'local_ffmpeg';

    // Handle External VPS Worker honestly
    if (workerMode === 'external_vps') {
      const workerUrl = getSetting('external_worker_url') || process.env.EXTERNAL_WORKER_URL || '';
      const workerToken = getSetting('external_worker_token') || process.env.EXTERNAL_WORKER_TOKEN || '';

      if (!workerUrl.trim()) {
        throw new Error(
          'BELUM TERHUBUNG: Server rendering VPS eksternal belum dikonfigurasi di menu Settings. Tidak dapat memulai render jarak jauh.'
        );
      }

      const validUrl = validateExternalWorkerUrl(workerUrl.trim());
      const endpoint = `${validUrl.toString().replace(/\/$/, '')}/api/render`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
        },
        body: JSON.stringify({
          jobId: job.id,
          title: job.title,
          preset: job.preset,
          targetDurationSec: job.target_duration_sec,
          config,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Worker VPS merespons error (${resp.status}): ${text.slice(0, 300)}`);
      }

      updateJob({
        status: 'processing',
        progress: 15,
        error_log: 'Job dikirim ke External VPS Worker. Menunggu callback/polling status.',
      });
      return;
    }

    // Local FFmpeg Execution
    const targetSec = Math.max(5, Math.min(10800, Number(config.targetDurationSec || job.target_duration_sec || 10800)));
    const rainVol = Math.max(0, Math.min(1.5, Number(config.rainVolume ?? 0.85)));
    const pianoVol = Math.max(0, Math.min(1.5, Number(config.pianoVolume ?? 0.35)));
    const fadeIn = Math.max(0, Math.min(15, Number(config.fadeInSec ?? 3)));
    const fadeOut = Math.max(0, Math.min(15, Number(config.fadeOutSec ?? 5)));
    const blackScreen = Boolean(config.blackScreen);

    // Resolve media paths safely
    const getAsset = (id?: string | null) => {
      if (!id) return undefined;
      return db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id) as
        | { id: string; file_path: string; type: string; duration_sec: number }
        | undefined;
    };

    const footageAssets = (config.footageAssetIds ?? [])
      .map((id) => getAsset(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a && isAllowedMediaPath(a.file_path) && fs.existsSync(a.file_path)));

    const rainAsset = getAsset(config.rainAudioAssetId);
    const pianoAsset = getAsset(config.pianoAssetId);

    if (!rainAsset || !isAllowedMediaPath(rainAsset.file_path) || !fs.existsSync(rainAsset.file_path)) {
      throw new Error('Audio hujan belum dipilih atau file tidak ditemukan di Media Library.');
    }

    const baseLoopPath = path.join(STORAGE_DIR, `tmp_base_${job.id}.mp4`);
    const slug = job.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48);
    const finalFilename = `${slug || 'rain_video'}_${job.id.slice(-6)}.mp4`;
    const finalOutputPath = path.join(STORAGE_DIR, finalFilename);

    // Determine base segment duration: if targetSec > 120s (e.g. 3 hours = 10800s),
    // encode a pristine 15s normalized H.264 + AAC base loop segment first, then stream-copy loop to targetSec!
    const isLongForm = targetSec > 120;
    const baseSegmentSec = isLongForm ? 15 : targetSec;

    const ffmpegArgs: string[] = ['-y'];
    const filterParts: string[] = [];
    let inputIdx = 0;

    // 1. Video Input
    if (blackScreen || footageAssets.length === 0) {
      ffmpegArgs.push('-f', 'lavfi', '-i', `color=c=black:s=1920x1080:r=30:d=${baseSegmentSec}`);
      filterParts.push(`[${inputIdx}:v]format=yuv420p[vout]`);
      inputIdx++;
    } else if (footageAssets.length === 1) {
      const f = footageAssets[0];
      const isImg = /\.(jpg|jpeg|png|webp)$/i.test(f.file_path);
      if (isImg) {
        ffmpegArgs.push('-loop', '1', '-t', String(baseSegmentSec), '-i', f.file_path);
      } else {
        if (config.trimStartSec && config.trimStartSec > 0) {
          ffmpegArgs.push('-ss', String(config.trimStartSec));
        }
        ffmpegArgs.push('-stream_loop', '-1', '-t', String(baseSegmentSec), '-i', f.file_path);
      }
      filterParts.push(
        `[${inputIdx}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p[vout]`
      );
      inputIdx++;
    } else {
      // Multi-clip concatenation
      const perClipSec = Math.max(3, Math.ceil(baseSegmentSec / footageAssets.length));
      const concatInputs: string[] = [];
      for (const f of footageAssets) {
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(f.file_path);
        if (isImg) {
          ffmpegArgs.push('-loop', '1', '-t', String(perClipSec), '-i', f.file_path);
        } else {
          ffmpegArgs.push('-stream_loop', '-1', '-t', String(perClipSec), '-i', f.file_path);
        }
        filterParts.push(
          `[${inputIdx}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setsar=1,format=yuv420p[v${inputIdx}]`
        );
        concatInputs.push(`[v${inputIdx}]`);
        inputIdx++;
      }
      filterParts.push(`${concatInputs.join('')}concat=n=${footageAssets.length}:v=1:a=0,trim=duration=${baseSegmentSec}[vout]`);
    }

    // 2. Audio Inputs (Rain + optional Piano)
    const rainIdx = inputIdx++;
    ffmpegArgs.push('-stream_loop', '-1', '-t', String(baseSegmentSec), '-i', rainAsset.file_path);

    const hasPiano = Boolean(pianoAsset && isAllowedMediaPath(pianoAsset.file_path) && fs.existsSync(pianoAsset.file_path) && pianoVol > 0);
    let pianoIdx = -1;
    if (hasPiano && pianoAsset) {
      pianoIdx = inputIdx++;
      ffmpegArgs.push('-stream_loop', '-1', '-t', String(baseSegmentSec), '-i', pianoAsset.file_path);
    }

    const fadeOutStart = Math.max(0, baseSegmentSec - fadeOut);
    if (hasPiano) {
      filterParts.push(`[${rainIdx}:a]volume=${rainVol},aresample=48000[arain]`);
      filterParts.push(`[${pianoIdx}:a]volume=${pianoVol},aresample=48000[apiano]`);
      if (isLongForm) {
        filterParts.push(`[arain][apiano]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[aout]`);
      } else {
        filterParts.push(
          `[arain][apiano]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}[aout]`
        );
      }
    } else {
      if (isLongForm) {
        filterParts.push(`[${rainIdx}:a]volume=${rainVol},aresample=48000,alimiter=limit=0.95[aout]`);
      } else {
        filterParts.push(
          `[${rainIdx}:a]volume=${rainVol},aresample=48000,alimiter=limit=0.95,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}[aout]`
        );
      }
    }

    ffmpegArgs.push(
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-t',
      String(baseSegmentSec),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      isLongForm ? baseLoopPath : finalOutputPath
    );

    await execFfmpeg(ffmpegArgs, baseSegmentSec, (pct) => {
      updateJob({ progress: isLongForm ? Math.round(pct * 0.5) : pct });
    });

    if (isLongForm) {
      updateJob({ progress: 55 });
      const loopCount = Math.ceil(targetSec / baseSegmentSec);
      await execFfmpeg(
        [
          '-y',
          '-stream_loop',
          String(loopCount),
          '-i',
          baseLoopPath,
          '-t',
          String(targetSec),
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          finalOutputPath,
        ],
        targetSec,
        (pct) => {
          updateJob({ progress: 55 + Math.round(pct * 0.42) });
        }
      );
      if (fs.existsSync(baseLoopPath)) {
        fs.unlinkSync(baseLoopPath);
      }
    }

    // Quality & Duration Verification via ffprobe
    const probe = await runFfprobe(finalOutputPath);
    if (probe.durationSec <= 0 || probe.videoCodec !== 'h264' || probe.audioCodec !== 'aac') {
      throw new Error(
        `Verifikasi kualitas FFprobe gagal: duration=${probe.durationSec}s, video=${probe.videoCodec}, audio=${probe.audioCodec}`
      );
    }

    const stats = fs.statSync(finalOutputPath);
    const assetId = `vid-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO media_assets
      (id, name, type, category, file_path, url_path, mime_type, duration_sec, width, height, size_bytes, source, created_at)
      VALUES (?, ?, 'rendered_video', ?, ?, ?, 'video/mp4', ?, ?, ?, ?, 'ffmpeg_render', ?)
    `).run(
      assetId,
      `${job.title} (${Math.round(probe.durationSec / 60)}m)`,
      job.preset,
      finalOutputPath,
      `/media/${finalFilename}`,
      probe.durationSec,
      probe.width || 1920,
      probe.height || 1080,
      stats.size,
      now
    );

    updateJob({
      status: 'completed',
      progress: 100,
      actual_duration_sec: probe.durationSec,
      output_asset_id: assetId,
      output_url: `/media/${finalFilename}`,
      error_log: '',
    });

    logAgentActivity(
      'AI Video Generator',
      'render_completed',
      `Video "${job.title}" selesai dirender (${probe.width}x${probe.height}, H.264/AAC, durasi ${Math.round(probe.durationSec)} detik).`,
      'completed',
      { jobId: job.id, assetId, durationSec: probe.durationSec }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob({
      status: 'failed',
      error_log: message,
    });
    logAgentActivity('AI Video Generator', 'render_failed', `Render "${job.title}" gagal: ${message}`, 'failed', {
      jobId: job.id,
    });
  }
}
