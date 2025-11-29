/**
 * ==================================================
 * LoadingSkeleton Component
 * ==================================================
 * Phase 5: Clothes - Premium Loading States
 * 
 * Purpose: Reusable loading skeleton with pulse animation
 * Features:
 * - Smooth pulse animation
 * - Glassmorphism styling
 * - Configurable dimensions
 * - Matches design system
 * ==================================================
 */

interface LoadingSkeletonProps {
  width?: string;
  height?: string;
  className?: string;
  variant?: 'card' | 'text' | 'circle' | 'rectangle';
}

/**
 * ==================================================
 * SECTION 1: Main LoadingSkeleton Component
 * ==================================================
 */

export default function LoadingSkeleton({ 
  width = '100%', 
  height = '20px',
  className = '',
  variant = 'rectangle'
}: LoadingSkeletonProps) {
  
  // Determine base styles based on variant
  const getVariantStyles = () => {
    switch (variant) {
      case 'card':
        return 'rounded-xl p-5';
      case 'text':
        return 'rounded h-4';
      case 'circle':
        return 'rounded-full';
      case 'rectangle':
      default:
        return 'rounded-lg';
    }
  };

  return (
    <div 
      className={`
        animate-pulse 
        bg-slate-800/50 
        backdrop-blur 
        border 
        border-slate-700/50
        ${getVariantStyles()}
        ${className}
      `}
      style={{ width, height }}
      aria-label="Loading..."
      role="status"
    >
      {/* Optional: Add shimmer effect overlay */}
      <div className="w-full h-full bg-gradient-to-r from-transparent via-slate-700/20 to-transparent animate-shimmer" />
    </div>
  );
}

/**
 * ==================================================
 * SECTION 2: Specialized Skeleton Components
 * ==================================================
 */

/**
 * KPI Card Skeleton - Matches KPICard dimensions
 */
export function KPICardSkeleton() {
  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl p-5 space-y-3">
      <LoadingSkeleton width="60%" height="16px" variant="text" />
      <LoadingSkeleton width="40%" height="32px" variant="text" />
    </div>
  );
}

/**
 * Table Row Skeleton - For FunnelTable loading state
 */
export function TableRowSkeleton({ columns = 11 }: { columns?: number }) {
  return (
    <tr className="border-b border-slate-800/50">
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="px-4 py-3">
          <LoadingSkeleton height="16px" />
        </td>
      ))}
    </tr>
  );
}

/**
 * Chart Skeleton - For TrendChart loading state
 */
export function ChartSkeleton() {
  return (
    <div className="bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl p-6">
      <LoadingSkeleton width="30%" height="24px" className="mb-4" />
      <LoadingSkeleton width="100%" height="300px" />
    </div>
  );
}
