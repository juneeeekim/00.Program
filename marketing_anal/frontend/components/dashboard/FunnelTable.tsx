/**
 * ==================================================
 * FunnelTable Component
 * ==================================================
 * Phase 5: Clothes - Premium Table Interactions
 * 
 * Features:
 * - Smooth row hover effects
 * - Color-coded metrics
 * - Responsive design
 * ==================================================
 */

// ==================================================
// SECTION 1: TypeScript Interfaces
// ==================================================

interface ChannelData {
  channel_id: string;
  channel_name: string;
  platform: string;
  traffic_type: 'paid' | 'organic' | 'unknown';
  cost: number;
  impressions: number;
  clicks: number;
  sessions: number;
  conversions: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cvr: number;
}

interface FunnelTableProps {
  data: ChannelData[];
}

// ==================================================
// SECTION 2: Main FunnelTable Component
// ==================================================

export default function FunnelTable({ data }: FunnelTableProps) {
  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl overflow-hidden">
      {/* Table Header */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <h3 className="font-semibold text-slate-200">Channel Performance</h3>
        <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors duration-200">
          Download CSV
        </button>
      </div>
      
      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          {/* Table Head */}
          <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
            <tr>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Imp.</th>
              <th className="px-4 py-3 text-right">Clicks</th>
              <th className="px-4 py-3 text-right">CTR</th>
              <th className="px-4 py-3 text-right">Sessions</th>
              <th className="px-4 py-3 text-right">CPC</th>
              <th className="px-4 py-3 text-right">Conv.</th>
              <th className="px-4 py-3 text-right">CVR</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">ROAS</th>
            </tr>
          </thead>
          
          {/* Table Body */}
          <tbody>
            {data.map((row) => (
              <tr 
                key={row.channel_id}
                className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors duration-200 cursor-default"
              >
                {/* Channel Name with Badge */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-200 font-medium">{row.channel_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border ${
                      row.traffic_type === 'paid' 
                        ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' 
                        : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                    }`}>
                      {row.traffic_type === 'paid' ? 'AD' : 'ORG'}
                    </span>
                  </div>
                </td>
                
                {/* Metrics */}
                <td className="px-4 py-3 text-right text-slate-300">{row.cost.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-400">{row.impressions.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-400">{row.clicks.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-400">{row.ctr.toFixed(2)}%</td>
                <td className="px-4 py-3 text-right text-slate-300">{row.sessions.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-400">{row.cpc.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-300">{row.conversions.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-slate-400">{row.cvr.toFixed(2)}%</td>
                <td className="px-4 py-3 text-right font-medium text-slate-200">{row.revenue.toLocaleString()}</td>
                
                {/* ROAS with Color Coding */}
                <td className={`px-4 py-3 text-right font-medium ${
                  row.roas >= 200 ? 'text-emerald-400' : 
                  row.roas >= 100 ? 'text-blue-400' : 'text-rose-400'
                }`}>
                  {row.roas.toFixed(0)}%
                </td>
              </tr>
            ))}
            
            {/* Empty State */}
            {data.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  No data available for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
