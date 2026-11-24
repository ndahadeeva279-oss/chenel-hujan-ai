export type NavPage =
  | 'dashboard'
  | 'trend_research'
  | 'competitor_analyzer'
  | 'channel_analytics'
  | 'content_planner'
  | 'video_generator'
  | 'video_editor'
  | 'thumbnail_studio'
  | 'seo_assistant'
  | 'upload_manager'
  | 'schedule_calendar'
  | 'media_library'
  | 'agent_activity'
  | 'settings';

export interface MediaAsset {
  id: string;
  name: string;
  type: 'footage' | 'rain_audio' | 'piano_music' | 'thumbnail' | 'rendered_video';
  category: string;
  file_path: string;
  url_path: string;
  mime_type: string;
  duration_sec: number;
  width: number;
  height: number;
  size_bytes: number;
  source: string;
  created_at: string;
}

export interface ContentPlan {
  id: string;
  concept_title: string;
  english_title: string;
  description: string;
  tags_json: string;
  hashtags_json: string;
  category: string;
  thumbnail_prompt: string;
  thumbnail_asset_id: string | null;
  target_duration_min: number;
  scheduled_date: string;
  scheduled_time: string;
  status: 'draft' | 'waiting_approval' | 'approved_scheduled' | 'published';
  created_at: string;
}

export interface RenderJob {
  id: string;
  plan_id: string | null;
  title: string;
  preset: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  worker_mode: string;
  target_duration_sec: number;
  actual_duration_sec: number;
  output_asset_id: string | null;
  output_url: string | null;
  error_log: string;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface UploadJob {
  id: string;
  plan_id: string | null;
  render_job_id: string | null;
  title: string;
  description: string;
  tags_json: string;
  category_id: string;
  video_asset_id: string | null;
  thumbnail_asset_id: string | null;
  approval_status: 'waiting_approval' | 'approved_scheduled' | 'uploading' | 'published' | 'rejected';
  scheduled_publish_at: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  privacy_status: string;
  error_message: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  render_status?: string;
  render_progress?: number;
  rendered_asset_id?: string | null;
  rendered_video_url?: string | null;
  thumbnail_url?: string | null;
}

export interface AgentActivity {
  id: string;
  agent_name: string;
  action_type: string;
  summary: string;
  status: 'completed' | 'running' | 'failed' | 'waiting_approval';
  details_json: string;
  created_at: string;
}

export interface EditingPreset {
  id: string;
  name: string;
  category: string;
  target_duration_sec: number;
  rain_volume: number;
  piano_volume: number;
  fade_in_sec: number;
  fade_out_sec: number;
  loop_crossfade_sec: number;
  black_screen: number;
  resolution: string;
  fps: number;
}

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  thumbnail: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  scope?: string;
}
