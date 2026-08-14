import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserUsageStats } from '@/lib/usage-tracker';
import { getAuthenticatedApiUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedApiUser(req);

    if (!authUser) {
      return NextResponse.json(
        { message: 'You must be logged in to view usage metrics' }, 
        { status: 401 }
      );
    }
    
    // Find the user in the database
    const user = await prisma.user.findUnique({
      where: { 
        id: authUser.id
      },
      include: {
        // @ts-ignore - This field exists in the Prisma schema but TypeScript doesn't recognize it yet
        userSubscription: true
      },
    }) as any;
    
    if (!user) {
      return NextResponse.json(
        { message: 'User not found' }, 
        { status: 404 }
      );
    }
    
    // Get plan limits based on subscription type
    let planLimits: {
      passwords: number | null;
      secureNotes: number | null;
      subscriptions: number | null;
      dataBreaches: number | null;
      teamMembers: number | null;
    } = {
      passwords: 50,
      secureNotes: 10,
      subscriptions: 5,
      dataBreaches: 0,
      teamMembers: 0
    };
    
    // Determine actual limits based on subscription plan
    if (user.userSubscription) {
      const plan = user.userSubscription.plan;
      
      if (plan === 'PRO') {
        planLimits = {
          passwords: 500,
          secureNotes: 50,
          subscriptions: null, // unlimited
          dataBreaches: null, // unlimited
          teamMembers: 0,
        };
      } else if (plan === 'TEAM') {
        planLimits = {
          passwords: 1000,
          secureNotes: null, // unlimited
          subscriptions: null, // unlimited
          dataBreaches: null, // unlimited
          teamMembers: 10,
        };
      }
    }
    
    // Get actual usage statistics from our usage tracker module
    const usageStats = await getUserUsageStats(user.id);
    
    // Compile the usage metrics with the limits
    const usageMetrics = {
      passwords: {
        current: usageStats.passwords,
        limit: planLimits.passwords
      },
      secureNotes: {
        current: usageStats.secureNotes,
        limit: planLimits.secureNotes
      },
      subscriptions: {
        current: usageStats.subscriptions,
        limit: planLimits.subscriptions
      },
      dataBreaches: {
        current: usageStats.dataBreaches,
        limit: planLimits.dataBreaches
      },
      teamMembers: {
        current: usageStats.teamMembers,
        limit: planLimits.teamMembers
      }
    };
    
    return NextResponse.json({ usageMetrics });
    
  } catch (error) {
    console.error('Error fetching subscription usage metrics:', error);
    return NextResponse.json(
      { message: 'Failed to fetch subscription usage metrics' },
      { status: 500 }
    );
  }
}
