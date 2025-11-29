import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { db };

// ==================================================
// ERROR HANDLING UTILITIES
// ==================================================

function createUserFriendlyError(error: unknown, context: string): Error {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Network errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
    return new Error(`Network error: Unable to connect to database. Please check your internet connection.`);
  }
  
  // Permission errors
  if (errorMessage.includes('permission') || errorMessage.includes('PERMISSION_DENIED')) {
    return new Error(`Permission denied: Unable to access ${context}. Please check Firebase security rules.`);
  }
  
  // Configuration errors
  if (errorMessage.includes('app/invalid-api-key') || errorMessage.includes('auth/invalid-api-key')) {
    return new Error(`Configuration error: Invalid Firebase API key. Please check your .env.local file.`);
  }
  
  // Generic error
  return new Error(`Failed to ${context}: ${errorMessage}`);
}

// ==================================================
// DASHBOARD DATA FETCHING LOGIC
// ==================================================

export interface ChannelMetrics {
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
  ctr: number;
  cpc: number;
  cvr: number;
  roas: number;
}

export interface DashboardMetrics {
  totalCost: number;
  totalRevenue: number;
  totalSessions: number;
  totalConversions: number;
  roas: number;
  channelData: ChannelMetrics[];
}

interface FirestoreMetricData {
  cost?: number;
  revenue?: number;
  sessions?: number;
  impressions?: number;
  clicks?: number;
  conversions?: { [key: string]: number };
  channel_id: string;
}

export async function getDashboardMetrics(
  projectId: string,
  startDate?: string,
  endDate?: string
): Promise<DashboardMetrics> {
  try {
    const metricsRef = collection(db, "metrics_daily");
    
    // Build query with date range if provided
    let q = query(metricsRef, where("project_id", "==", projectId));
    
    if (startDate) {
      q = query(q, where("date", ">=", startDate));
    }
    if (endDate) {
      q = query(q, where("date", "<=", endDate));
    }
    
    const querySnapshot = await getDocs(q);

    let totalCost = 0;
    let totalRevenue = 0;
    let totalSessions = 0;
    let totalConversions = 0;
    
    // Channel aggregation map
    // Using a partial type for accumulation before calculating rates
    type AccumulatedChannelData = Omit<ChannelMetrics, 'ctr' | 'cpc' | 'cvr' | 'roas'>;
    const channelMap = new Map<string, AccumulatedChannelData>();

    querySnapshot.forEach((doc) => {
      const data = doc.data() as FirestoreMetricData;
      
      // 1. Aggregate Totals
      totalCost += data.cost || 0;
      totalRevenue += data.revenue || 0;
      totalSessions += data.sessions || 0;
      
      // Handle conversions map (sum all values)
      if (data.conversions) {
        const convSum = Object.values(data.conversions).reduce((a: number, b: number) => a + b, 0);
        totalConversions += convSum;
      }

      // 2. Aggregate by Channel
      const channelId = data.channel_id;
      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, {
          channel_id: channelId,
          cost: 0,
          impressions: 0,
          clicks: 0,
          sessions: 0,
          conversions: 0,
          revenue: 0,
          // Metadata (should ideally come from 'channels' collection join)
          channel_name: channelId, // Temporary fallback
          platform: 'unknown',
          traffic_type: 'unknown'
        });
      }
      
      const ch = channelMap.get(channelId)!;
      ch.cost += data.cost || 0;
      ch.impressions += data.impressions || 0;
      ch.clicks += data.clicks || 0;
      ch.sessions += data.sessions || 0;
      ch.revenue += data.revenue || 0;
      
      if (data.conversions) {
        const convSum = Object.values(data.conversions).reduce((a: number, b: number) => a + b, 0);
        ch.conversions += convSum;
      }
    });

    // 3. Process Channel Data (Calculate Rates & Enrich Metadata)
    // In a real app, fetch 'channels' collection to get name/platform/type
    const channelData: ChannelMetrics[] = Array.from(channelMap.values()).map(ch => {
      // Simple heuristic for metadata if not joined
      if (ch.channel_id.includes('naver')) ch.platform = 'Naver';
      else if (ch.channel_id.includes('google')) ch.platform = 'Google';
      else if (ch.channel_id.includes('meta') || ch.channel_id.includes('instagram')) ch.platform = 'Meta';
      else if (ch.channel_id.includes('youtube')) ch.platform = 'YouTube';
      
      if (ch.channel_id.includes('ad') || ch.channel_id.includes('sa') || ch.channel_id.includes('da')) ch.traffic_type = 'paid';
      else ch.traffic_type = 'organic';
      
      ch.channel_name = ch.channel_id.replace(/_/g, ' ').toUpperCase();

      return {
        ...ch,
        ctr: ch.impressions > 0 ? (ch.clicks / ch.impressions) * 100 : 0,
        cpc: ch.clicks > 0 ? ch.cost / ch.clicks : 0,
        cvr: ch.sessions > 0 ? (ch.conversions / ch.sessions) * 100 : 0,
        roas: ch.cost > 0 ? (ch.revenue / ch.cost) * 100 : 0
      };
    });

    // Sort by Revenue DESC by default
    channelData.sort((a, b) => b.revenue - a.revenue);

    return {
      totalCost,
      totalRevenue,
      totalSessions,
      totalConversions,
      roas: totalCost > 0 ? (totalRevenue / totalCost) * 100 : 0,
      channelData
    };

  } catch (error) {
    console.error("Error fetching dashboard metrics:", error);
    throw createUserFriendlyError(error, 'load dashboard metrics');
  }
}

// ==================================================
// Trend Data Interface and Function
// ==================================================

export interface TrendDataPoint {
  date: string;
  sessions: number;
  revenue: number;
  conversions: number;
  cost: number;
}

export async function getTrendData(
  projectId: string,
  startDate?: string,
  endDate?: string
): Promise<TrendDataPoint[]> {
  try {
    const metricsRef = collection(db, "metrics_daily");
    
    // Build query with date range
    let q = query(metricsRef, where("project_id", "==", projectId));
    
    if (startDate) {
      q = query(q, where("date", ">=", startDate));
    }
    if (endDate) {
      q = query(q, where("date", "<=", endDate));
    }
    
    const querySnapshot = await getDocs(q);
    
    // Aggregate by date
    const dateMap = new Map<string, TrendDataPoint>();
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const date = data.date;
      
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          date,
          sessions: 0,
          revenue: 0,
          conversions: 0,
          cost: 0
        });
      }
      
      const point = dateMap.get(date)!;
      point.sessions += data.sessions || 0;
      point.revenue += data.revenue || 0;
      point.cost += data.cost || 0;
      
      if (data.conversions) {
        const conversionsObj = data.conversions as { [key: string]: number };
        const convSum = Object.values(conversionsObj).reduce(
          (a: number, b: number) => a + b,
          0
        );
        point.conversions += convSum;
      }
    });
    
    // Convert to array and sort by date
    const trendData = Array.from(dateMap.values()).sort((a, b) => 
      a.date.localeCompare(b.date)
    );
    
    return trendData;
    
  } catch (error) {
    console.error("Error fetching trend data:", error);
    throw createUserFriendlyError(error, 'load trend data');
  }
}
