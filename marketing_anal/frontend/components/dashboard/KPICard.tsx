/**
 * ==================================================
 * KPI Card Component
 * ==================================================
 * Phase 5: Clothes - Premium Interactions
 * 
 * Features:
 * - Smooth hover effects
 * - Subtle scale animation
 * - Trend indicators
 * ==================================================
 */

interface KPICardProps {
  title: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

export default function KPICard({ title, value, subValue, trend, trendValue }: KPICardProps) {
  return (
    <div className="group bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl p-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 cursor-default">
      <h3 className="text-sm text-slate-400 font-medium mb-2 group-hover:text-slate-300 transition-colors duration-200">
        {title}
      </h3>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-bold text-white">{value}</span>
          {subValue && <span className="text-sm text-slate-500 ml-2">{subValue}</span>}
        </div>
        {trend && trendValue && (
          <div className={`text-xs font-medium px-2 py-1 rounded transition-all duration-200 ${
            trend === 'up' ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20' : 
            trend === 'down' ? 'bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20' : 
            'bg-slate-800 text-slate-400 group-hover:bg-slate-700'
          }`}>
            {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '-'} {trendValue}
          </div>
        )}
      </div>
    </div>
  );
}
