/**
 * Marketing Analytics Dashboard - Main Page
 * ==========================================
 * 
 * Phase 1: Skeleton - Raw Data View
 * This page fetches data from Firestore and displays it as JSON
 * to verify the end-to-end data pipeline.
 */

'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface MetricData {
  id: string;
  date: string;
  project_id: string;
  landing_id: string;
  channel_id: string;
  sessions: number;
  conversions: Record<string, number>;
  revenue: number;
  cost?: number;
  source: string;
  [key: string]: any;
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function Home() {
  // State management
  const [dailyMetrics, setDailyMetrics] = useState<MetricData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  useEffect(() => {
    /**
     * Fetch metrics data from Firestore
     * This function runs once when the component mounts
     */
    const fetchMetricsData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch all documents from metrics_daily collection
        const querySnapshot = await getDocs(collection(db, 'metrics_daily'));
        
        // Transform Firestore documents to array of objects
        const metrics: MetricData[] = [];
        querySnapshot.forEach((doc) => {
          metrics.push({
            id: doc.id,
            ...doc.data()
          } as MetricData);
        });

        setDailyMetrics(metrics);
        console.log(`✓ Successfully loaded ${metrics.length} metrics from Firestore`);
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(`Failed to fetch data: ${errorMessage}`);
        console.error('✗ Error fetching metrics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetricsData();
  }, []); // Empty dependency array = run once on mount

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1 style={{ marginBottom: '1rem' }}>
        Marketing Analytics - Raw Data View
      </h1>
      
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Phase 1: Skeleton - Verifying data pipeline from CSV → Firestore → Browser
      </p>

      {/* Loading State */}
      {isLoading && (
        <div role="status" aria-live="polite">
          <p>Loading data from Firestore...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div 
          role="alert" 
          aria-live="assertive"
          style={{ 
            padding: '1rem', 
            backgroundColor: '#fee', 
            border: '1px solid #fcc',
            borderRadius: '4px',
            marginBottom: '1rem'
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Data Display */}
      {!isLoading && !error && (
        <div>
          <h2 style={{ marginBottom: '1rem' }}>
            Loaded {dailyMetrics.length} records from metrics_daily collection
          </h2>
          
          <pre 
            style={{ 
              backgroundColor: '#f5f5f5', 
              padding: '1rem', 
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '600px'
            }}
            aria-label="Raw JSON data from Firestore"
          >
            {JSON.stringify(dailyMetrics, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
