"use client";

import { useState, useEffect } from 'react';
import { useRole } from '@/lib/context/role-context';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Lock } from 'lucide-react';
import Link from 'next/link';

export function SubscriptionStatus() {
  const { userRole, features, hasAccess, getLimit, isLoading } = useRole();
  const [planName, setPlanName] = useState<string>('');
  const [planColor, setPlanColor] = useState<string>('text-muted-foreground');

  useEffect(() => {
    if (!isLoading) {
      switch(userRole) {
        case 'free':
          setPlanName('Free Plan');
          setPlanColor('text-muted-foreground');
          break;
        case 'pro':
          setPlanName('Pro Plan');
          setPlanColor('text-blue-500');
          break;
        case 'admin':
          setPlanName('Team Plan (Admin)');
          setPlanColor('text-purple-500');
          break;
        case 'team_member':
          setPlanName('Team Plan');
          setPlanColor('text-purple-400');
          break;
        default:
          setPlanName('Free Plan');
          setPlanColor('text-muted-foreground');
      }
    }
  }, [userRole, isLoading]);

  const passwordLimit = getLimit('passwordLimit');
  const storageLimit = getLimit('fileStorageLimit');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 rounded-lg bg-muted/50 animate-pulse">
        <p className="text-muted-foreground">Loading subscription info...</p>
      </div>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full">
          <div>
            <h3 className="text-xl font-semibold flex items-center gap-2">
              Your Subscription
              <span className={planColor}>{planName}</span>
            </h3>
            <p className="text-muted-foreground">
              {userRole === 'free' ? 'Upgrade to access premium features' : 'Your account has access to premium features'}
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex items-center gap-2">
            {userRole === 'free' && (
              <Button asChild className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white">
                <Link href="/vault/account/upgrade">Upgrade Plan</Link>
              </Button>
            )}
            {(userRole === 'pro' || userRole === 'admin' || userRole === 'team_member') && (
              <Button asChild variant="outline">
                <Link href="/vault/account/upgrade">Manage Subscription</Link>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          <FeatureCard 
            title="Password Storage"
            available={true}
            detail={passwordLimit === Infinity ? 'Unlimited' : `${passwordLimit} passwords`}
          />

          <FeatureCard 
            title="Subscription Tracking" 
            available={hasAccess('subscriptionTracking')}
            detail="Track recurring payments"
          />

          <FeatureCard 
            title="Secure File Storage" 
            available={hasAccess('secureFileStorage')}
            detail={hasAccess('secureFileStorage') ? `${storageLimit} MB` : 'Unavailable'}
          />

          <FeatureCard 
            title="Advanced Password Generator" 
            available={hasAccess('advancedPasswordGenerator')}
            detail={hasAccess('advancedPasswordGenerator') ? 'Available' : 'Basic version only'}
          />

          <FeatureCard 
            title="Privacy Monitoring" 
            available={hasAccess('privacyMonitoring')}
            detail={hasAccess('privacyMonitoring') ? 'Active monitoring' : 'Unavailable'}
          />

          <FeatureCard 
            title="Team Password Sharing" 
            available={hasAccess('teamPasswordSharing')}
            detail={hasAccess('teamPasswordSharing') ? 'Available' : 'Pro or Team plans only'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface FeatureCardProps {
  title: string;
  available: boolean;
  detail: string;
}

function FeatureCard({ title, available, detail }: FeatureCardProps) {
  return (
    <div className={`border rounded-lg p-4 flex items-start gap-3 ${available ? 'bg-card' : 'bg-muted/20'}`}>
      {available ? (
        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
      ) : (
        <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
      )}
      <div>
        <h4 className={`font-medium ${available ? '' : 'text-muted-foreground'}`}>{title}</h4>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
