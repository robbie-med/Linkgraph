/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LayoutDashboard,
  Users,
  GitCommit,
  Eye,
  PhoneCall,
  Network,
  ShieldCheck,
  FileText,
  Settings,
  Lock,
  Hourglass
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLock: () => void;
  autoLockTimeLeft?: number | null;
  findingsCount?: number;
}

export default function Sidebar({ activeTab, setActiveTab, onLock, autoLockTimeLeft = null, findingsCount = 0 }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "entities", label: "Entities & Identifiers", icon: Users },
    { id: "relationships", label: "Relationships", icon: GitCommit },
    { id: "observers", label: "Observers", icon: Eye },
    { id: "communications", label: "Communications", icon: PhoneCall },
    { id: "graph_explorer", label: "Graph Explorer", icon: Network }, // Fixed id to graph_explorer matching App.tsx!
    { id: "findings", label: "Findings & Actions", icon: ShieldCheck, badge: findingsCount },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "settings", label: "Settings", icon: Settings }
  ];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div id="sidebar" className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between h-screen shrink-0 text-slate-300 font-sans">
      <div className="flex flex-col overflow-y-auto">
        {/* Brand header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <Network className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <span className="font-bold text-white text-base tracking-tight block">LinkGraph</span>
            <span className="text-xs text-slate-500 font-mono">v1.2.0-secure</span>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                id={`nav-${item.id}`}
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"
                    : "text-slate-400 hover:text-white hover:bg-slate-900/50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 text-3xs font-bold bg-red-950 text-red-400 border border-red-900 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Locking details */}
      <div className="p-4 border-t border-slate-900 bg-slate-950/80">
        <div className="mb-3 px-2 py-1.5 bg-slate-900 border border-slate-800/50 rounded-lg flex items-center justify-between text-xs text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <Hourglass className="w-3 h-3 text-cyan-500" />
            Auto-lock:
          </span>
          <span>{autoLockTimeLeft !== null ? formatTime(autoLockTimeLeft) : "Disabled"}</span>
        </div>

        <button
          id="lock-app-btn"
          onClick={onLock}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-950/25 border border-red-900/40 hover:bg-red-900/30 text-red-300 hover:text-red-200 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all"
        >
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Lock Vault (Clear Session)
        </button>
      </div>
    </div>
  );
}
