import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NavPage, YouTubeChannelInfo } from './types';
import { DashboardView } from './views/DashboardView';
import { TrendResearchView } from './views/TrendResearchView';
import { CompetitorAnalyzerView } from './views/CompetitorAnalyzerView';
import { ChannelAnalyticsView } from './views/ChannelAnalyticsView';
import { ContentPlannerView } from './views/ContentPlannerView';
import { VideoGeneratorView } from './views/VideoGeneratorView';
import { VideoEditorView } from './views/VideoEditorView';
import { ThumbnailStudioView } from './views/ThumbnailStudioView';
import { SeoAssistantView } from './views/SeoAssistantView';
import { UploadManagerView } from './views/UploadManagerView';
import { ScheduleCalendarView } from './views/ScheduleCalendarView';
import { MediaLibraryView } from './views/MediaLibraryView';
import { AgentActivityView } from './views/AgentActivityView';
import { SettingsView } from './views/SettingsView';

export default function App() {
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [waitingApprovalCount, setWaitingApprovalCount] = useState(0);
  const [channel, setChannel] = useState<YouTubeChannelInfo | null>(null);

  const refreshHeaderState = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const json = await res.json();
        setWaitingApprovalCount(json.counts?.waitingApproval ?? 0);
        setChannel(json.channel ?? null);
      }
    } catch {
      // Ignore transient network poll error
    }
  };

  useEffect(() => {
    void refreshHeaderState();
    const timer = setInterval(() => {
      void refreshHeaderState();
    }, 10000);
    return () => clearInterval(timer);
  }, [activePage]);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardView onNavigate={setActivePage} />;
      case 'trend_research':
        return <TrendResearchView />;
      case 'competitor_analyzer':
        return <CompetitorAnalyzerView />;
      case 'channel_analytics':
        return <ChannelAnalyticsView />;
      case 'content_planner':
        return <ContentPlannerView onNavigate={setActivePage} />;
      case 'video_generator':
        return <VideoGeneratorView onNavigate={setActivePage} />;
      case 'video_editor':
        return <VideoEditorView onNavigate={setActivePage} />;
      case 'thumbnail_studio':
        return <ThumbnailStudioView />;
      case 'seo_assistant':
        return <SeoAssistantView />;
      case 'upload_manager':
        return <UploadManagerView />;
      case 'schedule_calendar':
        return <ScheduleCalendarView />;
      case 'media_library':
        return <MediaLibraryView />;
      case 'agent_activity':
        return <AgentActivityView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-[#060B09] text-[#E6F1EC]">
      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        waitingApprovalCount={waitingApprovalCount}
        channel={channel}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activePage={activePage}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={setActivePage}
        />

        <main className="flex-1 p-5 lg:p-8 max-w-[1440px] w-full mx-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
