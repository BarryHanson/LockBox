import React, { useState, useEffect } from 'react';
import { useRole } from '@/lib/context/role-context';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Shield, Lock, Users, Key, AlertCircle, RefreshCw } from 'lucide-react';

interface UsageMetric {
  name: string;
  current: number;
  limit: number | null; // null means unlimited
  icon: React.ReactNode;
  key: string; // unique key for each metric
}

interface ApiMetrics {
  passwords: { current: number; limit: number | null };
  secureNotes: { current: number; limit: number | null };
  subscriptions: { current: number; limit: number | null };
  dataBreaches: { current: number; limit: number | null };
  teamMembers: { current: number; limit: number | null };
}

export function SubscriptionUsageMetrics() {
  const { userRole, features } = useRole();
  const { data: session, status: authStatus } = useSession();
  const [metrics, setMetrics] = useState<UsageMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Function to fetch actual usage metrics from the API
  const fetchUsageMetrics = async () => {
    // Don't attempt to fetch if not authenticated
    if (authStatus !== 'authenticated' || !session) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/subscriptions/usage', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized specifically
          setError('Please log in to view usage metrics');
          return;
        }
        throw new Error('Failed to fetch usage metrics');
      }
      
      const data = await response.json();
      const apiMetrics: ApiMetrics = data.usageMetrics;
      
      // Transform API metrics into component metrics with icons
      const formattedMetrics: UsageMetric[] = [];
      
      // Always include passwords metric
      if (apiMetrics.passwords) {
        formattedMetrics.push({
          name: 'Password Storage',
          current: apiMetrics.passwords.current,
          limit: apiMetrics.passwords.limit,
          icon: <Lock className="h-5 w-5" />,
          key: 'passwords'
        });
      }
      
      // Always include secure notes
      if (apiMetrics.secureNotes) {
        formattedMetrics.push({
          name: 'Secure Notes',
          current: apiMetrics.secureNotes.current,
          limit: apiMetrics.secureNotes.limit,
          icon: <Key className="h-5 w-5" />,
          key: 'secureNotes'
        });
      }
      
      // Always include subscriptions
      if (apiMetrics.subscriptions) {
        formattedMetrics.push({
          name: 'Subscription Tracking',
          current: apiMetrics.subscriptions.current,
          limit: apiMetrics.subscriptions.limit,
          icon: <Shield className="h-5 w-5" />,
          key: 'subscriptions'
        });
      }
      
      // Only include data breach alerts for Pro and Team plans
      if (apiMetrics.dataBreaches && (userRole === 'pro' || userRole === 'admin' || userRole === 'team_member')) {
        formattedMetrics.push({
          name: 'Data Breach Alerts',
          current: apiMetrics.dataBreaches.current,
          limit: apiMetrics.dataBreaches.limit,
          icon: <AlertCircle className="h-5 w-5" />,
          key: 'dataBreaches'
        });
      }
      
      // Only include team members for Team plans
      if (apiMetrics.teamMembers && (userRole === 'admin' || userRole === 'team_member')) {
        formattedMetrics.push({
          name: 'Team Members',
          current: apiMetrics.teamMembers.current,
          limit: apiMetrics.teamMembers.limit,
          icon: <Users className="h-5 w-5" />,
          key: 'teamMembers'
        });
      }
      
      setMetrics(formattedMetrics);
    } catch (err) {
      console.error('Error fetching usage metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch usage metrics');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch metrics on component mount or when auth status changes
  useEffect(() => {
    // Only fetch if authenticated
    if (authStatus === 'authenticated') {
      fetchUsageMetrics();
    } else if (authStatus === 'unauthenticated') {
      // Clear data and stop loading if unauthenticated
      setMetrics([]);
      setIsLoading(false);
      setError('Please log in to view usage metrics');
    }
  }, [authStatus, userRole]); // Re-fetch when auth status or user role changes

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Usage Metrics</h3>
        {!isLoading && (
          <button 
            onClick={fetchUsageMetrics}
            className="flex items-center text-xs text-gray-500 hover:text-gray-700 transition-colors"
            title="Refresh metrics"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </button>
        )}
      </div>
      
      {error && (
        <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[110px] bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.map((metric) => (
            <Card key={metric.key} className="shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {metric.icon}
                    <CardTitle className="text-base">{metric.name}</CardTitle>
                  </div>
                  <div className="text-sm font-medium">
                    {metric.current} / {metric.limit ?? '∞'}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Progress
                  value={metric.limit ? (metric.current / metric.limit) * 100 : 30}
                  className="h-2"
                  data-state={metric.limit && metric.current / metric.limit > 0.8 ? "warning" : "normal"}
                  style={{
                    background: metric.limit && metric.current / metric.limit > 0.8 ? "rgba(252, 211, 77, 0.2)" : undefined,
                    '--progress-fill': metric.limit && metric.current / metric.limit > 0.8 ? "#f59e0b" : undefined
                  } as React.CSSProperties}
                />
                <CardDescription className="text-xs mt-1">
                  {metric.limit 
                    ? `${Math.round((metric.current / metric.limit) * 100)}% used`
                    : 'Unlimited access'}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {metrics.length === 0 && !isLoading && !error && (
        <div className="p-4 text-center text-gray-500">
          No usage metrics available.
        </div>
      )}
      
      {authStatus === 'unauthenticated' && (
        <div className="p-6 text-center bg-gray-50 rounded-lg border border-gray-100 shadow-sm">
          <h4 className="text-lg font-medium mb-2">Authentication Required</h4>
          <p className="text-gray-500 mb-4">
            Please log in to view your subscription usage metrics.
          </p>
          <a 
            href={`/login?callbackUrl=${encodeURIComponent(window.location.href)}`}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 py-2 transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Log In Now
          </a>
        </div>
      )}
    </div>
  );
}
