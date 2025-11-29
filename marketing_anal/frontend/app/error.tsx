/**
 * ==================================================
 * Global Error Boundary
 * ==================================================
 * Purpose: Catch and display errors at the application level
 * Features:
 * - User-friendly error messages
 * - Retry functionality
 * - Error logging
 * ==================================================
 */

'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console for debugging
    console.error('Application Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        {/* Error Icon */}
        <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">⚠️</span>
        </div>

        {/* Error Title */}
        <h2 className="text-2xl font-bold text-slate-100 mb-2">
          Something went wrong
        </h2>

        {/* Error Message */}
        <p className="text-slate-400 mb-6">
          We encountered an unexpected error. Please try again or contact support if the problem persists.
        </p>

        {/* Error Details (Development only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-slate-950 border border-slate-800 rounded p-3 mb-6 text-left">
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
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors font-medium"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}
