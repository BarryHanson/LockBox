import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/roles';
import { getAuthenticatedApiUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedApiUser(req);
    if (!authUser) {
      return NextResponse.json({ role: 'free' }, { status: 401 });
    }
    
    // Find the user with subscription information
    // Using any type assertion to avoid TypeScript errors while Prisma types are updating
    const user = await prisma.user.findFirst({
      where: {
        id: authUser.id,
      },
      include: {
        // @ts-ignore - This field exists in the Prisma schema but TypeScript doesn't recognize it yet
        userSubscription: true,
      },
    }) as any;
    
    if (!user) {
      return NextResponse.json({ role: 'free' }, { status: 404 });
    }
    
    let role: UserRole = 'free';
    
    // Determine role based on subscription type
    if (user.userSubscription) {
      // Safely access plan field with type checking
      const plan = user.userSubscription.plan;
      
      if (plan === 'PRO') {
        role = 'pro';
      } else if (plan === 'TEAM') {
        // Check if the user is the team admin or just a member
        role = user.userSubscription.isAdmin ? 'admin' : 'team_member';
      }
    }
    
    return NextResponse.json({ role });
  } catch (error) {
    console.error('Error fetching user role:', error);
    // Default to free role if there's an error
    return NextResponse.json({ role: 'free', error: 'Failed to fetch role' }, { status: 500 });
  }
}
