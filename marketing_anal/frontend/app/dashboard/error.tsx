/**
 * ==================================================
 * Dashboard Error Boundary
 * ==================================================
 * Purpose: Catch dashboard-specific errors (e.g., Firestore connection)
 * Features:
 * - Dashboard-specific error messages
 * - Connection troubleshooting tips
 * - Retry functionality
 * ==================================================
 */

'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Dashboard Error:', error);
  }, [error]);

  // Determine error type
  const isNetworkError = error.message.includes('network') || 
                         error.message.includes('fetch') ||
                         error.message.includes('connection');

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-xl p-8">
        {/* Error Icon */}
        <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">{isNetworkError ? '🔌' : '⚠️'}</span>
        </div>

        {/* Error Title */}
        <h2 className="text-2xl font-bold text-slate-100 mb-2 text-center">
          {isNetworkError ? 'Connection Error' : 'Dashboard Error'}
        </h2>

        {/* Error Message */}
        <p className="text-slate-400 mb-6 text-center">
          {isNetworkError 
            ? 'Unable to connect to the database. Please check your internet connection.'
            : 'Failed to load dashboard data. Please try again.'}
        </p>

        {/* Troubleshooting Tips */}
        {isNetworkError && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Troubleshooting:</h3>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• Check your internet connection</li>
              <li>• Verify Firebase configuration in .env.local</li>
              <li>• Ensure Firestore is accessible</li>
            </ul>
          </div>
        )}

        {/* Error Details (Development) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-slate-950 border border-slate-800 rounded p-3 mb-6">
            <p className="text-xs text-rose-400 font-mono break-all">
              {error.message}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            Retry
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors font-medium"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}
