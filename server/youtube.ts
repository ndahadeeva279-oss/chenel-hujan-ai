import fs from 'fs';
import type { Request } from 'express';
import { db, logAgentActivity } from './db.ts';

export function getAppBaseUrl(req?: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
    return `${proto}://${host}`;
  }
  return 'http://localhost:3000';
}

export function getYouTubeRedirectUri(req?: Request): string {
  return `${getAppBaseUrl(req)}/auth/youtube/callback`;
}

export function getStoredOAuth() {
  return db.prepare(`SELECT * FROM oauth_tokens WHERE provider = 'youtube'`).get() as
    | {
        id: string;
        provider: string;
        access_token: string;
        refresh_token: string;
        expiry_date: number;
        scope: string;
        channel_id: string;
        channel_title: string;
        channel_thumbnail: string;
        subscriber_count: number;
        view_count: number;
        video_count: number;
        updated_at: string;
      }
    | undefined;
}

export function buildYouTubeAuthUrl(req: Request, includeMonetary = false): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID belum dikonfigurasi di environment server (Settings > Secrets).');
  }
  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ];
  if (includeMonetary) {
    scopes.push('https://www.googleapis.com/auth/yt-analytics-monetary.readonly');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getYouTubeRedirectUri(req),
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCode(code: string, req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET diperlukan untuk menukar kode OAuth.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getYouTubeRedirectUri(req),
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || 'Gagal menukar OAuth code dengan access token.');
  }

  // Fetch user's channel details
  const chanRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }
  );
  const chanData = (await chanRes.json()) as {
    items?: Array<{
      id: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
      statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
    }>;
  };

  const ch = chanData.items?.[0];
  const existing = getStoredOAuth();
  const expiryDate = Date.now() + (tokenData.expires_in ?? 3600) * 1000;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO oauth_tokens (id, provider, access_token, refresh_token, expiry_date, scope, channel_id, channel_title, channel_thumbnail, subscriber_count, view_count, video_count, updated_at)
    VALUES ('youtube-primary', 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE oauth_tokens.refresh_token END,
      expiry_date = excluded.expiry_date,
      scope = excluded.scope,
      channel_id = excluded.channel_id,
      channel_title = excluded.channel_title,
      channel_thumbnail = excluded.channel_thumbnail,
      subscriber_count = excluded.subscriber_count,
      view_count = excluded.view_count,
      video_count = excluded.video_count,
      updated_at = excluded.updated_at
  `).run(
    tokenData.access_token,
    tokenData.refresh_token || existing?.refresh_token || '',
    expiryDate,
    tokenData.scope || '',
    ch?.id || '',
    ch?.snippet?.title || 'Channel Terhubung',
    ch?.snippet?.thumbnails?.default?.url || '',
    Number(ch?.statistics?.subscriberCount || 0),
    Number(ch?.statistics?.viewCount || 0),
    Number(ch?.statistics?.videoCount || 0),
    now
  );

  logAgentActivity(
    'YouTube OAuth Manager',
    'channel_connected',
    `Channel YouTube "${ch?.snippet?.title || 'Terhubung'}" berhasil diautentikasi via OAuth 2.0.`,
    'completed',
    { channelId: ch?.id }
  );

  return getStoredOAuth();
}

export async function getValidAccessToken(): Promise<string | null> {
  const oauth = getStoredOAuth();
  if (!oauth) return null;

  if (Date.now() < oauth.expiry_date - 60_000) {
    return oauth.access_token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!oauth.refresh_token || !clientId || !clientSecret) {
    return oauth.access_token;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: oauth.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (res.ok && data.access_token) {
    const newExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    db.prepare(`UPDATE oauth_tokens SET access_token = ?, expiry_date = ?, updated_at = ? WHERE provider = 'youtube'`).run(
      data.access_token,
      newExpiry,
      new Date().toISOString()
    );
    return data.access_token;
  }
  return oauth.access_token;
}

export function parseIsoDurationToSec(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  return h * 3600 + m * 60 + s;
}

async function youtubePublicFetch(url: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const accessToken = await getValidAccessToken();

  if (apiKey) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}key=${encodeURIComponent(apiKey)}`);
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const errObj = json.error as { message?: string } | undefined;
      throw new Error(errObj?.message || `YouTube Data API error (${res.status})`);
    }
    return json;
  }

  if (accessToken) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const errObj = json.error as { message?: string } | undefined;
      throw new Error(errObj?.message || `YouTube Data API error (${res.status})`);
    }
    return json;
  }

  throw new Error(
    'YOUTUBE_API_KEY belum tersedia dan akun YouTube belum terhubung via OAuth. Tambahkan YOUTUBE_API_KEY di Settings > Secrets atau hubungkan akun YouTube di Upload Manager.'
  );
}

export async function searchYouTubeTrends(params: {
  query: string;
  category: string;
  regionCode?: string;
  relevanceLanguage?: string;
  publishedAfterDays?: number;
  maxResults?: number;
}) {
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    order: 'viewCount',
    q: params.query,
    maxResults: String(Math.min(params.maxResults ?? 20, 25)),
  });

  if (params.regionCode) searchParams.set('regionCode', params.regionCode);
  if (params.relevanceLanguage) searchParams.set('relevanceLanguage', params.relevanceLanguage);
  if (params.publishedAfterDays && params.publishedAfterDays > 0) {
    const dt = new Date(Date.now() - params.publishedAfterDays * 86_400_000);
    searchParams.set('publishedAfter', dt.toISOString());
  }

  const searchData = (await youtubePublicFetch(
    `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`
  )) as {
    items?: Array<{ id?: { videoId?: string } }>;
  };

  const videoIds = (searchData.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));

  if (videoIds.length === 0) {
    return { observedAt: new Date().toISOString(), videos: [] };
  }

  const detailData = (await youtubePublicFetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}`
  )) as {
    items?: Array<{
      id: string;
      snippet: {
        title: string;
        channelTitle: string;
        channelId: string;
        publishedAt: string;
        thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
      };
      statistics?: { viewCount?: string; likeCount?: string };
      contentDetails?: { duration?: string };
    }>;
  };

  const observedAt = new Date().toISOString();
  const nowMs = Date.now();

  const insertObs = db.prepare(`
    INSERT INTO trend_observations
    (id, video_id, title, channel_title, channel_id, published_at, view_count, like_count, duration_iso, duration_sec, thumbnail_url, category, keyword, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const videos = (detailData.items ?? []).map((item) => {
    const viewCount = Number(item.statistics?.viewCount ?? 0);
    const likeCount = item.statistics?.likeCount !== undefined ? Number(item.statistics.likeCount) : null;
    const durationIso = item.contentDetails?.duration ?? 'PT0S';
    const durationSec = parseIsoDurationToSec(durationIso);
    const publishedMs = new Date(item.snippet.publishedAt).getTime();
    const ageDays = Math.max(1, (nowMs - publishedMs) / 86_400_000);
    const viewsPerDay = Math.round(viewCount / ageDays);
    const thumbnailUrl = item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '';

    // Check previous observation for genuine periodic growth calculation
    const prevObs = db
      .prepare(
        `SELECT view_count, observed_at FROM trend_observations WHERE video_id = ? ORDER BY observed_at DESC LIMIT 1`
      )
      .get(item.id) as { view_count: number; observed_at: string } | undefined;

    let observedGrowthDelta: number | null = null;
    let observedGrowthHours: number | null = null;
    if (prevObs) {
      const diffHours = (nowMs - new Date(prevObs.observed_at).getTime()) / 3_600_000;
      if (diffHours >= 0.05) {
        observedGrowthDelta = viewCount - prevObs.view_count;
        observedGrowthHours = Math.round(diffHours * 10) / 10;
      }
    }

    insertObs.run(
      `obs-${item.id}-${nowMs}`,
      item.id,
      item.snippet.title,
      item.snippet.channelTitle,
      item.snippet.channelId,
      item.snippet.publishedAt,
      viewCount,
      likeCount,
      durationIso,
      durationSec,
      thumbnailUrl,
      params.category,
      params.query,
      observedAt
    );

    return {
      videoId: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      publishedAt: item.snippet.publishedAt,
      viewCount,
      likeCount,
      durationIso,
      durationSec,
      viewsPerDay,
      observedGrowthDelta,
      observedGrowthHours,
      thumbnailUrl,
      youtubeUrl: `https://www.youtube.com/watch?v=${item.id}`,
    };
  });

  return { observedAt, videos };
}

export async function fetchCompetitorChannelData(input: string) {
  const trimmed = input.trim();
  let channelId = '';
  let handle = '';

  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    channelId = trimmed;
  } else {
    try {
      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://youtube.com/${trimmed}`);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'channel' && parts[1]) {
        channelId = parts[1];
      } else if (parts[0]?.startsWith('@')) {
        handle = parts[0];
      } else if (trimmed.startsWith('@')) {
        handle = trimmed;
      }
    } catch {
      if (trimmed.startsWith('@')) {
        handle = trimmed;
      }
    }
  }

  let chanUrl = '';
  if (channelId) {
    chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(channelId)}`;
  } else if (handle) {
    chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(handle)}`;
  } else {
    // Fallback search channel by name
    const s = (await youtubePublicFetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(trimmed)}&maxResults=1`
    )) as { items?: Array<{ id?: { channelId?: string } }> };
    const foundId = s.items?.[0]?.id?.channelId;
    if (!foundId) {
      throw new Error('Channel kompetitor tidak ditemukan. Gunakan URL channel, @handle, atau Channel ID (UC...).');
    }
    chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(foundId)}`;
  }

  const chanJson = (await youtubePublicFetch(chanUrl)) as {
    items?: Array<{
      id: string;
      snippet: { title: string; description: string; thumbnails?: { medium?: { url?: string } } };
      statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };

  const channel = chanJson.items?.[0];
  if (!channel) {
    throw new Error('Channel tidak ditemukan pada YouTube Data API.');
  }

  // Fetch recent videos and top popular videos
  const [recentRes, topRes] = await Promise.all([
    youtubePublicFetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channel.id)}&type=video&order=date&maxResults=15`
    ) as Promise<{ items?: Array<{ id?: { videoId?: string } }> }>,
    youtubePublicFetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channel.id)}&type=video&order=viewCount&maxResults=15`
    ) as Promise<{ items?: Array<{ id?: { videoId?: string } }> }>,
  ]);

  const idSet = new Set<string>();
  for (const item of [...(recentRes.items ?? []), ...(topRes.items ?? [])]) {
    if (item.id?.videoId) idSet.add(item.id.videoId);
  }

  const allIds = Array.from(idSet).slice(0, 30);
  let videos: Array<{
    videoId: string;
    title: string;
    publishedAt: string;
    viewCount: number;
    likeCount: number | null;
    durationSec: number;
    viewsPerDay: number;
    thumbnailUrl: string;
    tags: string[];
  }> = [];

  if (allIds.length > 0) {
    const details = (await youtubePublicFetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${allIds.join(',')}`
    )) as {
      items?: Array<{
        id: string;
        snippet: {
          title: string;
          publishedAt: string;
          tags?: string[];
          thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
        };
        statistics?: { viewCount?: string; likeCount?: string };
        contentDetails?: { duration?: string };
      }>;
    };

    const nowMs = Date.now();
    videos = (details.items ?? []).map((v) => {
      const viewCount = Number(v.statistics?.viewCount ?? 0);
      const ageDays = Math.max(1, (nowMs - new Date(v.snippet.publishedAt).getTime()) / 86_400_000);
      return {
        videoId: v.id,
        title: v.snippet.title,
        publishedAt: v.snippet.publishedAt,
        viewCount,
        likeCount: v.statistics?.likeCount !== undefined ? Number(v.statistics.likeCount) : null,
        durationSec: parseIsoDurationToSec(v.contentDetails?.duration ?? 'PT0S'),
        viewsPerDay: Math.round(viewCount / ageDays),
        thumbnailUrl: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.medium?.url || '',
        tags: v.snippet.tags ?? [],
      };
    });
  }

  return {
    observedAt: new Date().toISOString(),
    channel: {
      id: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnailUrl: channel.snippet.thumbnails?.medium?.url || '',
      subscriberCount: Number(channel.statistics.subscriberCount ?? 0),
      viewCount: Number(channel.statistics.viewCount ?? 0),
      videoCount: Number(channel.statistics.videoCount ?? 0),
    },
    recentVideos: [...videos].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    topVideos: [...videos].sort((a, b) => b.viewCount - a.viewCount),
  };
}

export async function fetchYouTubeChannelAnalytics(days: 7 | 28 | 90) {
  const oauth = getStoredOAuth();
  const accessToken = await getValidAccessToken();

  if (!oauth || !accessToken) {
    return {
      connected: false,
      message: 'Channel YouTube belum terhubung via OAuth 2.0. Hubungkan akun Anda untuk melihat analitik aktual.',
    };
  }

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const hasMonetaryScope = oauth.scope.includes('yt-analytics-monetary.readonly');

  const baseMetrics = 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost';
  const metrics = hasMonetaryScope ? `${baseMetrics},estimatedRevenue` : baseMetrics;

  const queryAnalytics = async (params: Record<string, string>) => {
    const sp = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      ...params,
    });
    const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${sp.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as {
      columnHeaders?: Array<{ name: string }>;
      rows?: Array<Array<string | number>>;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data.error?.message || `YouTube Analytics API error (${res.status})`);
    }
    return data;
  };

  const [dailyReport, countryReport, topVideoReport] = await Promise.all([
    queryAnalytics({ dimensions: 'day', metrics, sort: 'day' }),
    queryAnalytics({ dimensions: 'country', metrics: 'views,estimatedMinutesWatched', sort: '-views', maxResults: '10' }),
    queryAnalytics({
      dimensions: 'video',
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained',
      sort: '-views',
      maxResults: '15',
    }),
  ]);

  const dailyCols = (dailyReport.columnHeaders ?? []).map((c) => c.name);
  const dailyRows = (dailyReport.rows ?? []).map((r) => {
    const obj: Record<string, string | number> = {};
    dailyCols.forEach((col, i) => {
      obj[col] = r[i];
    });
    return obj;
  });

  const totals = dailyRows.reduce(
    (acc, row) => {
      acc.views += Number(row.views || 0);
      acc.estimatedMinutesWatched += Number(row.estimatedMinutesWatched || 0);
      acc.subscribersGained += Number(row.subscribersGained || 0);
      acc.subscribersLost += Number(row.subscribersLost || 0);
      if (hasMonetaryScope && row.estimatedRevenue !== undefined) {
        acc.estimatedRevenue = (acc.estimatedRevenue ?? 0) + Number(row.estimatedRevenue || 0);
      }
      return acc;
    },
    {
      views: 0,
      estimatedMinutesWatched: 0,
      subscribersGained: 0,
      subscribersLost: 0,
      estimatedRevenue: hasMonetaryScope ? 0 : (null as number | null),
    }
  );

  const avgDurationSec =
    dailyRows.length > 0
      ? Math.round(dailyRows.reduce((s, r) => s + Number(r.averageViewDuration || 0), 0) / dailyRows.length)
      : 0;

  // Map video IDs to titles via YouTube Data API
  const videoIds = (topVideoReport.rows ?? []).map((r) => String(r[0]));
  const videoTitles: Record<string, string> = {};
  if (videoIds.length > 0) {
    const vRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (vRes.ok) {
      const vJson = (await vRes.json()) as { items?: Array<{ id: string; snippet: { title: string } }> };
      for (const item of vJson.items ?? []) {
        videoTitles[item.id] = item.snippet.title;
      }
    }
  }

  return {
    connected: true,
    channel: {
      id: oauth.channel_id,
      title: oauth.channel_title,
      thumbnail: oauth.channel_thumbnail,
      subscriberCount: oauth.subscriber_count,
      viewCount: oauth.view_count,
      videoCount: oauth.video_count,
    },
    days,
    startDate,
    endDate,
    revenueAvailable: hasMonetaryScope,
    summary: {
      views: totals.views,
      watchHours: Math.round((totals.estimatedMinutesWatched / 60) * 10) / 10,
      averageViewDurationSec: avgDurationSec,
      subscribersGained: totals.subscribersGained,
      subscribersLost: totals.subscribersLost,
      estimatedRevenue: totals.estimatedRevenue,
    },
    dailySeries: dailyRows,
    countries: (countryReport.rows ?? []).map((r) => ({
      country: String(r[0]),
      views: Number(r[1] || 0),
      watchHours: Math.round((Number(r[2] || 0) / 60) * 10) / 10,
    })),
    topVideos: (topVideoReport.rows ?? []).map((r) => ({
      videoId: String(r[0]),
      title: videoTitles[String(r[0])] || String(r[0]),
      views: Number(r[1] || 0),
      watchHours: Math.round((Number(r[2] || 0) / 60) * 10) / 10,
      averageViewDurationSec: Number(r[3] || 0),
      subscribersGained: Number(r[4] || 0),
    })),
  };
}

export async function uploadVideoToYouTubeReal(params: {
  videoFilePath: string;
  thumbnailFilePath?: string | null;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  publishAtIso?: string | null;
}) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error('Akun YouTube belum terhubung via OAuth 2.0.');
  }
  if (!fs.existsSync(params.videoFilePath)) {
    throw new Error('File video MP4 tidak ditemukan di storage server.');
  }

  const stat = fs.statSync(params.videoFilePath);
  const metadata = {
    snippet: {
      title: params.title.slice(0, 100),
      description: params.description.slice(0, 5000),
      tags: params.tags.slice(0, 30),
      categoryId: params.categoryId || '10',
    },
    status: params.publishAtIso
      ? {
          privacyStatus: 'private',
          publishAt: params.publishAtIso,
          selfDeclaredMadeForKids: false,
        }
      : {
          privacyStatus: 'private',
          selfDeclaredMadeForKids: false,
        },
  };

  // 1. Initiate resumable upload
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(stat.size),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Gagal memulai upload YouTube (${initRes.status}): ${errText}`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('YouTube API tidak mengembalikan URL upload resumable.');
  }

  // 2. Upload MP4 file buffer
  const videoBuffer = fs.readFileSync(params.videoFilePath);
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
    },
    body: videoBuffer,
  });

  const videoResult = (await putRes.json()) as { id?: string; error?: { message?: string } };
  if (!putRes.ok || !videoResult.id) {
    throw new Error(videoResult.error?.message || `Gagal mengunggah file video ke YouTube (${putRes.status})`);
  }

  // 3. Upload thumbnail if provided
  if (params.thumbnailFilePath && fs.existsSync(params.thumbnailFilePath)) {
    const thumbBuf = fs.readFileSync(params.thumbnailFilePath);
    const mime = params.thumbnailFilePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoResult.id)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': mime,
        },
        body: thumbBuf,
      }
    );
  }

  return {
    youtubeVideoId: videoResult.id,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoResult.id}`,
  };
}
