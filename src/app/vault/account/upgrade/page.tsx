"use client";

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useRole } from '@/lib/context/role-context';
import { ArrowLeft, Check, Crown, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function UpgradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userRole: roleContextValue, isLoading: roleContextLoading } = useRole();
  const [currentPlan, setCurrentPlan] = useState<'FREE' | 'PRO' | 'TEAM' | null>(null);
  const [userRole, setUserRole] = useState<string>(roleContextValue);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<'FREE' | 'PRO' | 'TEAM' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch current subscription on page load
  useEffect(() => {
    const fetchCurrentSubscription = async () => {
      try {
        const response = await fetch('/api/subscriptions/current', {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          const plan = data.plan.toUpperCase() as 'FREE' | 'PRO' | 'TEAM';
          setCurrentPlan(plan);
          setUserRole(plan === 'FREE' ? 'free' : plan === 'PRO' ? 'pro' : data.isAdmin ? 'admin' : 'team_member');
        }
      } catch (err) {
        console.error('Error fetching current subscription:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentSubscription();
  }, []);

  // Handle successful payment redirect from Stripe
  useEffect(() => {
    const successParam = searchParams.get('success');
    const canceledParam = searchParams.get('canceled');
    const plan = searchParams.get('plan');

    if (successParam === 'true' && plan) {
      // Verify subscription was updated
      const verifySubscription = async () => {
        try {
          const response = await fetch('/api/subscriptions/current', {
            credentials: 'include',
          });
          
          if (response.ok) {
            const data = await response.json();
            const dbPlan = data.plan.toUpperCase() as 'FREE' | 'PRO' | 'TEAM';
            if (dbPlan === plan) {
              // Clear the stored previous plan
              sessionStorage.removeItem('previousSubscriptionPlan');
              // Update the current plan display
              setCurrentPlan(dbPlan);
              setUserRole(dbPlan === 'FREE' ? 'free' : dbPlan === 'PRO' ? 'pro' : data.isAdmin ? 'admin' : 'team_member');
              setSuccess(`Successfully upgraded to ${plan === 'PRO' ? 'Pro' : 'Team'} plan! Your subscription is now active.`);
              setTimeout(() => {
                router.push('/vault/account');
              }, 2000);
            } else {
              // Subscription hasn't been updated yet, try again in a moment
              setTimeout(verifySubscription, 1000);
            }
          }
        } catch (err) {
          console.error('Error verifying subscription:', err);
          setTimeout(verifySubscription, 1000);
        }
      };

      verifySubscription();
    } else if (canceledParam === 'true') {
      // User canceled payment - no plan mutation happens before Stripe success
      const handleCancellation = async () => {
        try {
          const response = await fetch('/api/subscriptions/current', {
            credentials: 'include',
          });
          if (response.ok) {
            const data = await response.json();
            const dbPlan = data.plan.toUpperCase() as 'FREE' | 'PRO' | 'TEAM';
            setCurrentPlan(dbPlan);
            setUserRole(dbPlan === 'FREE' ? 'free' : dbPlan === 'PRO' ? 'pro' : data.isAdmin ? 'admin' : 'team_member');
          }
          setError('Payment was canceled. Your subscription remains unchanged.');
        } catch (err) {
          console.error('Error refreshing subscription on cancellation:', err);
          setError('Payment was canceled. Please refresh to confirm your current plan.');
        }
      };
      
      handleCancellation();
    }
  }, [searchParams, router]);

  const handleUpgrade = async () => {
    if (!selectedPlan) {
      setError('Please select a plan first.');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      // Call checkout endpoint to create Stripe session
      const response = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: selectedPlan }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create checkout session');
      }

      const data = await response.json();

      // For free plan, redirect to account page
      if (selectedPlan === 'FREE') {
        setSuccess('Successfully downgraded to Free plan!');
        setTimeout(() => {
          router.push('/vault/account');
        }, 2000);
        return;
      }

      // Redirect to Stripe checkout
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const getCurrentPlanName = () => {
    switch (userRole) {
      case 'free':
        return 'Free Plan';
      case 'pro':
        return 'Pro Plan';
      case 'admin':
        return 'Team Plan (Admin)';
      case 'team_member':
        return 'Team Plan';
      default:
        return 'Loading...';
    }
  };

  return (
    <motion.main
      className="max-w-4xl mx-auto px-6 py-10"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-8 flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link href="/vault/account" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Account
          </Link>
        </Button>
      </div>
      
      <h1 className="text-3xl font-bold mb-2">Upgrade Your Plan</h1>
      <p className="text-muted-foreground mb-8">
        {!isLoading && `Current plan: ${getCurrentPlanName()}`}
      </p>

      {success ? (
        <div className="bg-green-100 border border-green-200 text-green-800 p-4 rounded-lg mb-6">
          {success}
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-200 text-red-800 p-4 rounded-lg mb-6">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Free Plan */}
        <div 
          className={`border rounded-lg p-6 cursor-pointer transition-all ${selectedPlan === 'FREE' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary'}`}
          onClick={() => setSelectedPlan('FREE')}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold">Free</h3>
              <p className="text-xl font-bold">$0<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            </div>
            {selectedPlan === 'FREE' && (
              <div className="bg-primary text-primary-foreground rounded-full p-1">
                <Check className="h-4 w-4" />
              </div>
            )}
          </div>
          
          <ul className="space-y-2 mb-6">
            <PlanFeature available>Up to 50 passwords</PlanFeature>
            <PlanFeature available>Basic password generator</PlanFeature>
            <PlanFeature available>Secure notes</PlanFeature>
            <PlanFeature available>Mobile access</PlanFeature>
            <PlanFeature>Advanced password generator</PlanFeature>
            <PlanFeature>Secure file storage</PlanFeature>
          </ul>
          
          <Button 
            variant={userRole === 'free' ? "secondary" : "default"} 
            className="w-full" 
            disabled={userRole === 'free' || isProcessing} 
            onClick={() => setSelectedPlan('FREE')}
          >
            {userRole === 'free' ? 'Current Plan' : 'Downgrade'}
          </Button>
        </div>
        
        {/* Pro Plan */}
        <div 
          className={`border rounded-lg p-6 cursor-pointer transition-all ${selectedPlan === 'PRO' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary'}`}
          onClick={() => setSelectedPlan('PRO')}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold">Pro</h3>
                <Crown className="h-4 w-4 text-yellow-500" />
              </div>
              <p className="text-xl font-bold">$4.99<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            </div>
            {selectedPlan === 'PRO' && (
              <div className="bg-primary text-primary-foreground rounded-full p-1">
                <Check className="h-4 w-4" />
              </div>
            )}
          </div>
          
          <ul className="space-y-2 mb-6">
            <PlanFeature available>Unlimited passwords</PlanFeature>
            <PlanFeature available>Advanced password generator</PlanFeature>
            <PlanFeature available>Secure file storage (1GB)</PlanFeature>
            <PlanFeature available>Priority support</PlanFeature>
            <PlanFeature available>Privacy monitoring</PlanFeature>
            <PlanFeature available>Data breach alerts</PlanFeature>
            <PlanFeature available>Password health analysis</PlanFeature>
            <PlanFeature>Team password sharing</PlanFeature>
          </ul>
          
          <Button 
            variant={userRole === 'pro' ? "secondary" : "default"} 
            className="w-full" 
            disabled={userRole === 'pro' || isProcessing} 
            onClick={() => setSelectedPlan('PRO')}
          >
            {userRole === 'pro' ? 'Current Plan' : 'Upgrade to Pro'}
          </Button>
        </div>
        
        {/* Team Plan */}
        <div 
          className={`border rounded-lg p-6 cursor-pointer transition-all ${selectedPlan === 'TEAM' ? 'ring-2 ring-primary border-primary' : 'hover:border-primary'}`}
          onClick={() => setSelectedPlan('TEAM')}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold">Team</h3>
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-xl font-bold">$9.99<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            </div>
            {selectedPlan === 'TEAM' && (
              <div className="bg-primary text-primary-foreground rounded-full p-1">
                <Check className="h-4 w-4" />
              </div>
            )}
          </div>
          
          <ul className="space-y-2 mb-6">
            <PlanFeature available>Everything in Pro</PlanFeature>
            <PlanFeature available>Team password sharing</PlanFeature>
            <PlanFeature available>Admin dashboard</PlanFeature>
            <PlanFeature available>5GB secure storage</PlanFeature>
            <PlanFeature available>Usage analytics</PlanFeature>
            <PlanFeature available>Role management</PlanFeature>
            <PlanFeature available>Enterprise support</PlanFeature>
          </ul>
          
          <Button 
            variant={userRole === 'admin' || userRole === 'team_member' ? "secondary" : "default"} 
            className="w-full" 
            disabled={(userRole === 'admin' || userRole === 'team_member') || isProcessing} 
            onClick={() => setSelectedPlan('TEAM')}
          >
            {userRole === 'admin' || userRole === 'team_member' ? 'Current Plan' : 'Upgrade to Team'}
          </Button>
        </div>
      </div>

      <div className="flex justify-center">
        <Button 
          size="lg" 
          onClick={handleUpgrade}
          disabled={isProcessing || (
            (selectedPlan === 'FREE' && userRole === 'free') ||
            (selectedPlan === 'PRO' && userRole === 'pro') ||
            (selectedPlan === 'TEAM' && (userRole === 'admin' || userRole === 'team_member'))
          )}
          className="px-8"
        >
          {isProcessing ? 'Processing...' : 'Confirm Change'}
        </Button>
      </div>
    </motion.main>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={null}>
      <UpgradePageContent />
    </Suspense>
  );
}

interface PlanFeatureProps {
  children: React.ReactNode;
  available?: boolean;
}

function PlanFeature({ children, available = false }: PlanFeatureProps) {
  return (
    <li className="flex items-center gap-2">
      {available ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <div className="h-4 w-4 border-2 rounded-full border-muted" />
      )}
      <span className={available ? '' : 'text-muted-foreground'}>{children}</span>
    </li>
  );
}
