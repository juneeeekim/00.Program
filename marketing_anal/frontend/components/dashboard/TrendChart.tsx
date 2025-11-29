/**
 * ==================================================
 * TrendChart Component
 * ==================================================
 * Purpose: Visualize time-series marketing metrics
 * Features:
 * - Line chart for Sessions, Revenue, Conversions
 * - Interactive tooltips
 * - Responsive design
 * ==================================================
 */

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ==================================================
// SECTION 1: TypeScript Interfaces
// ==================================================

interface TrendDataPoint {
  date: string;
  sessions: number;
  revenue: number;
  conversions: number;
  cost: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  metric?: 'sessions' | 'revenue' | 'conversions' | 'all';
}

// ==================================================
// SECTION 2: Custom Tooltip Component
// ==================================================

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
        <p className="text-slate-300 text-sm font-medium mb-2">{label}</p>
        {payload && payload.map((entry, index: number) => (
          <p key={index} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ==================================================
// SECTION 3: Main TrendChart Component
// ==================================================

export default function TrendChart({ data, metric = 'all' }: TrendChartProps) {
  // Return empty state if no data
  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl p-8 flex items-center justify-center">
        <p className="text-slate-500">No trend data available for this period.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl overflow-hidden">
      {/* Chart Header */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <h3 className="font-semibold text-slate-200">Performance Trend</h3>
        <div className="flex gap-2">
          {/* Metric selector can be added here in future */}
          <span className="text-xs text-slate-500">Last 30 days</span>
        </div>
      </div>

      {/* Chart Container */}
      <div className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            {/* Grid */}
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            
            {/* Axes */}
            <XAxis 
              dataKey="date" 
              stroke="#94A3B8" 
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#94A3B8" 
              style={{ fontSize: '12px' }}
            />
            
            {/* Tooltip */}
            <Tooltip content={<CustomTooltip />} />
            
            {/* Legend */}
            <Legend 
              wrapperStyle={{ fontSize: '12px' }}
              iconType="line"
            />
            
            {/* Lines - Show based on metric prop */}
            {(metric === 'all' || metric === 'sessions') && (
              <Line 
                type="monotone" 
                dataKey="sessions" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={{ fill: '#3B82F6', r: 3 }}
                activeDot={{ r: 5 }}
                name="Sessions"
              />
            )}
            
            {(metric === 'all' || metric === 'revenue') && (
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={{ fill: '#10B981', r: 3 }}
                activeDot={{ r: 5 }}
                name="Revenue"
              />
            )}
            
            {(metric === 'all' || metric === 'conversions') && (
              <Line 
                type="monotone" 
                dataKey="conversions" 
                stroke="#F59E0B" 
                strokeWidth={2}
                dot={{ fill: '#F59E0B', r: 3 }}
                activeDot={{ r: 5 }}
                name="Conversions"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
