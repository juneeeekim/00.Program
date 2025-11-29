/**
 * ==================================================
 * Dashboard Page Component
 * ==================================================
 * Phase 4: Details - Enhanced UX with Loading & Empty States
 * 
 * Purpose: Main dashboard view with comprehensive error handling
 * Features:
 * - Skeleton loading UI
 * - Empty state handling
 * - Error boundaries
 * - KPI cards, Channel table, Trend chart
 * ==================================================
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDashboardMetrics, DashboardMetrics, getTrendData, TrendDataPoint } from '@/lib/firebase';
import KPICard from '@/components/dashboard/KPICard';
import FunnelTable from '@/components/dashboard/FunnelTable';
import TrendChart from '@/components/dashboard/TrendChart';
import { format } from 'date-fns';

// ==================================================
// SECTION 1: LOADING SKELETON COMPONENTS
// ==================================================

function SkeletonKPICard() {
  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl p-4 animate-pulse">
      <div className="h-4 w-24 bg-slate-800 rounded mb-2"></div>
      <div className="h-8 w-32 bg-slate-800 rounded mb-2"></div>
      <div className="h-3 w-16 bg-slate-800 rounded"></div>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl overflow-hidden animate-pulse">
      <div className="p-4 border-b border-slate-800">
        <div className="h-5 w-40 bg-slate-800 rounded"></div>
      </div>
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-slate-800 rounded"></div>
        ))}
      </div>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl p-6 animate-pulse">
      <div className="h-5 w-32 bg-slate-800 rounded mb-4"></div>
      <div className="h-64 bg-slate-800 rounded"></div>
    </div>
  );
}

// ==================================================
// SECTION 2: EMPTY STATE COMPONENT
// ==================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-slate-900/30 border border-slate-800 border-dashed rounded-xl p-12 text-center">
      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl">📊</span>
      </div>
      <h3 className="text-lg font-semibold text-slate-300 mb-2">No Data Available</h3>
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  );
}

// ==================================================
// SECTION 3: MAIN DASHBOARD PAGE COMPONENT
// ==================================================

export default function DashboardPage() {
  const params = useParams();
  const projectId = (params?.projectId as string) || 'p_main';
  
  // State management
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Date range state (default: last 30 days)
  const startDate = new Date(2025, 10, 1); // Nov 1, 2025
  const endDate = new Date(2025, 10, 30); // Nov 30, 2025

  // ==================================================
  // SECTION 4: DATA FETCHING LOGIC
  // ==================================================

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        
        console.log(`Fetching data for project: ${projectId}, dates: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
        
        // Fetch dashboard metrics
        const metricsData = await getDashboardMetrics(
          projectId,
          format(startDate, 'yyyy-MM-dd'),
          format(endDate, 'yyyy-MM-dd')
        );
        
        // Fetch trend data
        const trend = await getTrendData(
          projectId,
          format(startDate, 'yyyy-MM-dd'),
          format(endDate, 'yyyy-MM-dd')
        );
        
        setMetrics(metricsData);
        setTrendData(trend);
      } catch (err) {
        console.error('Dashboard data fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    if (projectId) {
      fetchData();
    }
  }, [projectId, startDate, endDate]);

  // ==================================================
  // SECTION 5: LOADING STATE
  // ==================================================

  if (loading) {
    return (
      <div className="space-y-6">
        {/* KPI Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonKPICard key={i} />
          ))}
        </div>

        {/* Chart Skeleton */}
        <SkeletonChart />

        {/* Table Skeleton */}
        <SkeletonTable />
      </div>
    );
  }

  // ==================================================
  // SECTION 6: ERROR STATE
  // ==================================================

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">⚠️</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-300 mb-2">Error Loading Data</h3>
          <p className="text-slate-500 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ==================================================
  // SECTION 7: EMPTY STATE
  // ==================================================

  if (!metrics || (metrics.totalSessions === 0 && metrics.totalCost === 0)) {
    return (
      <div className="space-y-6">
        <EmptyState message="No data found for the selected date range. Try selecting a different period or check if data has been uploaded." />
      </div>
    );
  }

  // ==================================================
  // SECTION 8: MAIN DASHBOARD RENDER
  // ==================================================

  return (
    <div className="space-y-6">
      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard 
          title="Total Cost" 
          value={`₩${metrics.totalCost.toLocaleString()}`} 
          trend="neutral" 
          trendValue="0%"
        />
        <KPICard 
          title="Total Sessions" 
          value={metrics.totalSessions.toLocaleString()} 
          trend="up" 
          trendValue="12%"
        />
        <KPICard 
          title="Total Conversions" 
          value={metrics.totalConversions.toLocaleString()} 
          trend="up" 
          trendValue="5%"
        />
        <KPICard 
          title="Total Revenue" 
          value={`₩${metrics.totalRevenue.toLocaleString()}`} 
          trend="up" 
          trendValue="8%"
        />
        <KPICard 
          title="ROAS" 
          value={`${metrics.roas.toFixed(0)}%`} 
          trend={metrics.roas >= 200 ? 'up' : 'down'} 
          trendValue="2%"
        />
      </div>

      {/* Trend Chart Section */}
      <TrendChart data={trendData} />

      {/* Funnel Table Section */}
      <FunnelTable data={metrics.channelData} />
    </div>
  );
}
