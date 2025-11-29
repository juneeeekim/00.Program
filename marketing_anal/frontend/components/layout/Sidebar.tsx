/**
 * ==================================================
 * Sidebar Component
 * ==================================================
 * Phase 5: Clothes - Premium Interactions
 * 
 * Features:
 * - Smooth hover effects on links
 * - Interactive project switcher
 * - Animated navigation
 * ==================================================
 */

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function Sidebar() {
  const params = useParams();
  const router = useRouter();
  const currentProjectId = (params?.projectId as string) || 'p_main';
  
  // Handle project change
  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProjectId = e.target.value;
    router.push(`/dashboard/${newProjectId}`);
  };

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col border-r border-slate-800">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          Director&apos;s Console
        </h1>
      </div>
      
      {/* Navigation Section */}
      <nav className="flex-1 p-4 space-y-2">
        {/* Project Switcher */}
        <div className="mb-6">
          <label className="text-xs text-slate-500 uppercase font-semibold px-2 mb-2 block">
            Project
          </label>
          <select 
            value={currentProjectId}
            onChange={handleProjectChange}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer hover:bg-slate-750 hover:border-slate-600 transition-all duration-200"
          >
            <option value="p_main">Main Project</option>
            <option value="p_test">Test Project</option>
          </select>
        </div>

        {/* Dashboard Link */}
        <Link 
          href={`/dashboard/${currentProjectId}`}
          className="flex items-center space-x-3 px-3 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30 transition-all duration-200 hover:translate-x-1"
        >
          <span className="text-lg">📊</span>
          <span className="font-medium">Dashboard</span>
        </Link>
        
        {/* Settings (Disabled for now) */}
        <div className="px-3 py-2.5 text-slate-500 cursor-not-allowed flex items-center space-x-3 rounded-lg hover:bg-slate-800/50 transition-colors duration-200">
          <span className="text-lg">⚙️</span>
          <span>Settings (Phase 4)</span>
        </div>
      </nav>
      
      {/* User Profile Section */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors duration-200 cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-lg shadow-lg">
            👤
          </div>
          <div className="text-sm flex-1">
            <p className="font-medium text-slate-200">Director</p>
            <p className="text-xs text-slate-500">admin@example.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
