import React from 'react';
import { Lock, Plus, Network, LogOut, Settings } from 'lucide-react';
import { User } from '../api/client';

interface NavbarProps {
  user: User | null;
  onOpenNewModal: () => void;
  onOpenGuideModal: () => void;
  onOpenSettingsModal: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onOpenNewModal,
  onOpenGuideModal,
  onOpenSettingsModal,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-zinc-900 border border-zinc-700/80 text-white">
            <Lock className="w-4 h-4 stroke-[2]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-tight text-white">
              homelab<span className="text-zinc-400">/idp</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              v1.0
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Setup Guide for Nginx Forward Auth */}
          <button
            onClick={onOpenGuideModal}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-mono transition-colors"
            title="Nginx Forward Auth Setup Guide"
          >
            <Network className="w-3.5 h-3.5" />
            <span>Forward Auth</span>
          </button>

          {/* New Credential */}
          <button
            onClick={onOpenNewModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Entry</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-800 mx-1 hidden sm:block" />

          {/* User Profile & Logout */}
          {user && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenSettingsModal}
                className="hidden lg:flex flex-col items-end hover:opacity-80 transition-opacity text-left"
                title={`Pengaturan Akun & SSO (${user.username})`}
              >
                <span className="text-xs font-medium text-zinc-200 leading-tight">
                  {user.displayName || user.username}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {user.role}
                </span>
              </button>
              <button
                type="button"
                onClick={onOpenSettingsModal}
                className="w-7 h-7 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                title={`Pengaturan Akun & SSO (${user.username})`}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onLogout}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
