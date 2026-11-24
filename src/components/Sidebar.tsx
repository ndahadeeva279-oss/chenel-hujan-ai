import React from 'react';
import {
  Activity,
  BarChart3,
  Calendar,
  CalendarDays,
  Compass,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  SearchCheck,
  Settings,
  Sliders,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { NavPage, YouTubeChannelInfo } from '../types';

export interface NavItem {
  id: NavPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'trend_research', label: 'AI Trend Research', icon: Compass },
  { id: 'competitor_analyzer', label: 'Competitor Analyzer', icon: Users },
  { id: 'channel_analytics', label: 'Channel Analytics', icon: BarChart3 },
  { id: 'content_planner', label: 'Content Planner', icon: CalendarDays },
  { id: 'video_generator', label: 'AI Video Generator', icon: Film },
  { id: 'video_editor', label: 'Video Editor', icon: Sliders },
  { id: 'thumbnail_studio', label: 'AI Thumbnail Studio', icon: ImageIcon },
  { id: 'seo_assistant', label: 'SEO Assistant', icon: SearchCheck },
  { id: 'upload_manager', label: 'Upload Manager', icon: UploadCloud },
  { id: 'schedule_calendar', label: 'Schedule Calendar', icon: Calendar },
  { id: 'media_library', label: 'Media Library', icon: FolderOpen },
  { id: 'agent_activity', label: 'AI Agent Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activePage: NavPage;
  onSelectPage: (page: NavPage) => void;
  waitingApprovalCount: number;
  channel: YouTubeChannelInfo | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  waitingApprovalCount,
  channel,
  mobileOpen,
  onCloseMobile,
}) => {
  const navContent = (
    <div className="flex h-full w-64 flex-col bg-[#0C1411] border-r border-emerald-950/80">
      <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-950/70">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/src/assets/images/rain_channel_avatar_1795464277034.jpg"
            alt="Logo Rain Channel AI Agent"
            referrerPolicy="no-referrer"
            className="h-9 w-9 rounded-lg object-cover border border-emerald-800/60 shrink-0"
          />
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold text-[#E6F1EC] truncate">
              Rain Channel AI
            </div>
            <div className="text-xs text-emerald-400/80 truncate">Studio Otomasi</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup menu navigasi"
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-emerald-950/50"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" aria-label="Navigasi utama">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectPage(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                active
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-[#121E19] border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'upload_manager' && waitingApprovalCount > 0 && (
                <span className="font-mono tabular-nums text-xs text-amber-300 shrink-0">
                  {waitingApprovalCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-emerald-950/70 text-xs">
        <div className="text-slate-400 mb-1">Koneksi Channel</div>
        {channel ? (
          <div className="flex items-center gap-2.5">
            {channel.thumbnail ? (
              <img
                src={channel.thumbnail}
                alt={channel.title}
                referrerPolicy="no-referrer"
                className="h-7 w-7 rounded-full object-cover border border-emerald-800/60 shrink-0"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-emerald-950 border border-emerald-800/60 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-medium text-emerald-300 truncate">{channel.title}</div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
                {channel.subscriberCount.toLocaleString('id-ID')} subscriber
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              onSelectPage('upload_manager');
              onCloseMobile();
            }}
            className="text-left text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
          >
            Hubungkan YouTube OAuth
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
};
