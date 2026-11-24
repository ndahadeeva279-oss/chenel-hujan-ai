import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'media');
export const ASSETS_IMAGES_DIR = path.resolve(process.cwd(), 'src', 'assets', 'images');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'rain_agent.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('footage', 'rain_audio', 'piano_music', 'thumbnail', 'rendered_video')),
      category TEXT NOT NULL DEFAULT 'General',
      file_path TEXT NOT NULL,
      url_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      duration_sec REAL DEFAULT 0,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      size_bytes INTEGER DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'upload',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_plans (
      id TEXT PRIMARY KEY,
      concept_title TEXT NOT NULL,
      english_title TEXT NOT NULL,
      description TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      hashtags_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL,
      thumbnail_prompt TEXT DEFAULT '',
      thumbnail_asset_id TEXT DEFAULT NULL,
      target_duration_min INTEGER NOT NULL DEFAULT 180,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL DEFAULT '20:00',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'waiting_approval', 'approved_scheduled', 'published')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      plan_id TEXT DEFAULT NULL,
      title TEXT NOT NULL,
      preset TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'processing', 'completed', 'failed')),
      progress INTEGER NOT NULL DEFAULT 0,
      worker_mode TEXT NOT NULL DEFAULT 'local_ffmpeg',
      target_duration_sec INTEGER NOT NULL DEFAULT 10800,
      actual_duration_sec REAL DEFAULT 0,
      output_asset_id TEXT DEFAULT NULL,
      output_url TEXT DEFAULT NULL,
      error_log TEXT DEFAULT '',
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upload_jobs (
      id TEXT PRIMARY KEY,
      plan_id TEXT DEFAULT NULL,
      render_job_id TEXT DEFAULT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      category_id TEXT NOT NULL DEFAULT '10',
      video_asset_id TEXT DEFAULT NULL,
      thumbnail_asset_id TEXT DEFAULT NULL,
      approval_status TEXT NOT NULL DEFAULT 'waiting_approval' CHECK(approval_status IN ('waiting_approval', 'approved_scheduled', 'uploading', 'published', 'rejected')),
      scheduled_publish_at TEXT DEFAULT NULL,
      youtube_video_id TEXT DEFAULT NULL,
      youtube_url TEXT DEFAULT NULL,
      privacy_status TEXT NOT NULL DEFAULT 'private',
      error_message TEXT DEFAULT '',
      approved_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_activities (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'running', 'failed', 'waiting_approval')),
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trend_observations (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_title TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      published_at TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER DEFAULT NULL,
      duration_iso TEXT NOT NULL DEFAULT '',
      duration_sec INTEGER NOT NULL DEFAULT 0,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      keyword TEXT NOT NULL DEFAULT '',
      observed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT DEFAULT '',
      expiry_date INTEGER NOT NULL DEFAULT 0,
      scope TEXT NOT NULL DEFAULT '',
      channel_id TEXT DEFAULT '',
      channel_title TEXT DEFAULT '',
      channel_thumbnail TEXT DEFAULT '',
      subscriber_count INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      video_count INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS editing_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      target_duration_sec INTEGER NOT NULL DEFAULT 10800,
      rain_volume REAL NOT NULL DEFAULT 0.85,
      piano_volume REAL NOT NULL DEFAULT 0.35,
      fade_in_sec REAL NOT NULL DEFAULT 3,
      fade_out_sec REAL NOT NULL DEFAULT 5,
      loop_crossfade_sec REAL NOT NULL DEFAULT 2,
      black_screen INTEGER NOT NULL DEFAULT 0,
      resolution TEXT NOT NULL DEFAULT '1920x1080',
      fps INTEGER NOT NULL DEFAULT 30
    );
  `);

  seedPresetsAndAssets();
}

function seedPresetsAndAssets() {
  const presets = [
    {
      id: 'preset-heavy-rain-3h',
      name: 'Heavy Rain 3 Hours',
      category: 'Heavy Rain Forest',
      target_duration_sec: 10800,
      rain_volume: 0.9,
      piano_volume: 0.0,
      fade_in_sec: 3,
      fade_out_sec: 5,
      loop_crossfade_sec: 2,
      black_screen: 0,
    },
    {
      id: 'preset-rain-piano-3h',
      name: 'Rain and Piano 3 Hours',
      category: 'Rain and Piano',
      target_duration_sec: 10800,
      rain_volume: 0.65,
      piano_volume: 0.5,
      fade_in_sec: 4,
      fade_out_sec: 6,
      loop_crossfade_sec: 2.5,
      black_screen: 0,
    },
    {
      id: 'preset-black-screen-3h',
      name: 'Black Screen Rain 3 Hours',
      category: 'Black Screen Rain',
      target_duration_sec: 10800,
      rain_volume: 0.88,
      piano_volume: 0.0,
      fade_in_sec: 4,
      fade_out_sec: 6,
      loop_crossfade_sec: 2,
      black_screen: 1,
    },
    {
      id: 'preset-forest-rain-3h',
      name: 'Forest Rain 3 Hours',
      category: 'Heavy Rain Forest',
      target_duration_sec: 10800,
      rain_volume: 0.85,
      piano_volume: 0.25,
      fade_in_sec: 3,
      fade_out_sec: 5,
      loop_crossfade_sec: 2,
      black_screen: 0,
    },
    {
      id: 'preset-window-rain-3h',
      name: 'Window Rain 3 Hours',
      category: 'Rain on Window',
      target_duration_sec: 10800,
      rain_volume: 0.78,
      piano_volume: 0.35,
      fade_in_sec: 3,
      fade_out_sec: 5,
      loop_crossfade_sec: 2,
      black_screen: 0,
    },
  ];

  const insertPreset = db.prepare(`
    INSERT OR IGNORE INTO editing_presets
    (id, name, category, target_duration_sec, rain_volume, piano_volume, fade_in_sec, fade_out_sec, loop_crossfade_sec, black_screen)
    VALUES (@id, @name, @category, @target_duration_sec, @rain_volume, @piano_volume, @fade_in_sec, @fade_out_sec, @loop_crossfade_sec, @black_screen)
  `);

  for (const preset of presets) {
    insertPreset.run(preset);
  }

  // Seed generated studio thumbnails into media_assets if files exist on disk
  const studioImages = [
    {
      id: 'thumb-studio-forest',
      name: 'Heavy Rain Forest — Studio Master',
      category: 'Heavy Rain Forest',
      filename: 'thumb_heavy_rain_forest_1795464278261.jpg',
    },
    {
      id: 'thumb-studio-piano',
      name: 'Rain & Piano by Window — Studio Master',
      category: 'Rain and Piano',
      filename: 'thumb_rain_piano_window_1795464279433.jpg',
    },
    {
      id: 'thumb-studio-leaves',
      name: 'Rain on Tropical Leaves — Studio Master',
      category: 'Rain on Tropical Leaves',
      filename: 'thumb_rain_on_leaves_1795464279540.jpg',
    },
    {
      id: 'thumb-studio-cabin',
      name: 'Thunderstorm Cabin Roof — Studio Master',
      category: 'Thunderstorm and Rain',
      filename: 'thumb_thunderstorm_cabin_1795464279505.jpg',
    },
  ];

  const now = new Date().toISOString();
  const insertAsset = db.prepare(`
    INSERT OR IGNORE INTO media_assets
    (id, name, type, category, file_path, url_path, mime_type, duration_sec, width, height, size_bytes, source, created_at)
    VALUES (?, ?, 'thumbnail', ?, ?, ?, 'image/jpeg', 0, 1280, 720, ?, 'studio_asset', ?)
  `);

  for (const img of studioImages) {
    const fullPath = path.join(ASSETS_IMAGES_DIR, img.filename);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      insertAsset.run(
        img.id,
        img.name,
        img.category,
        fullPath,
        `/src/assets/images/${img.filename}`,
        stats.size,
        now
      );
    }
  }

  // Default settings
  const defaultSettings: Record<string, string> = {
    worker_mode: 'local_ffmpeg',
    external_worker_url: process.env.EXTERNAL_WORKER_URL || '',
    external_worker_token: process.env.EXTERNAL_WORKER_TOKEN || '',
    default_duration_min: '180',
    target_audience_region: 'US',
    approval_mode: 'HUMAN_APPROVAL_REQUIRED',
  };

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
  `);

  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v, now);
  }
}

export function logAgentActivity(
  agentName: string,
  actionType: string,
  summary: string,
  status: 'completed' | 'running' | 'failed' | 'waiting_approval' = 'completed',
  details: Record<string, unknown> = {}
) {
  const id = `act-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO agent_activities (id, agent_name, action_type, summary, status, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, agentName, actionType, summary, status, JSON.stringify(details), now);
  return id;
}

export function getSetting(key: string): string {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? '';
}

export function setSetting(key: string, value: string) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}
