import React from 'react';
import { Menu, Film } from 'lucide-react';
import { NavPage } from '../types';
import { NAV_ITEMS } from './Sidebar';

interface TopBarProps {
  activePage: NavPage;
  onOpenMobileMenu: () => void;
  onNavigate: (page: NavPage) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activePage, onOpenMobileMenu, onNavigate }) => {
  const current = NAV_ITEMS.find((i) => i.id === activePage);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 lg:px-8 py-3.5 bg-[#060B09]/95 backdrop-blur-sm border-b border-emerald-950/70">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Buka menu navigasi"
          className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#121E19] border border-emerald-950/70"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-400 whitespace-nowrap hidden sm:inline">Rain Channel AI Agent</span>
          <span className="text-slate-600 hidden sm:inline" aria-hidden="true">/</span>
          <h1 className="font-display text-base font-semibold text-[#E6F1EC] truncate">
            {current?.label ?? 'Dashboard'}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="hidden md:inline text-xs text-slate-400 whitespace-nowrap">
          Persetujuan Manual Aktif
        </span>
        <button
          type="button"
          onClick={() => onNavigate('video_generator')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#04120B] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <Film className="h-4 w-4 shrink-0" />
          <span>Buat Video 3 Jam</span>
        </button>
      </div>
    </header>
  );
};
