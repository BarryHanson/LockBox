import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// In Stripe SDK v20, current_period_end moved from Subscription to SubscriptionItem.
function getSubscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  if (itemEnd) return new Date(itemEnd * 1000);
  const top = (sub as any).current_period_end;
  if (!top) return null;
  if (typeof top === 'number') return new Date(top * 1000);
  if (typeof top === 'string') return new Date(top);
  return null;
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const token = cookies().get('token')?.value;

    if (!token) {
      return NextResponse.json(
        { message: 'You must be logged in' },
        { status: 401 }
      );
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json(
        { message: 'You must be logged in' },
        { status: 401 }
      );
    }

    // Get current subscription
    // @ts-ignore
    let subscription = await (prisma as any).userSubscription.findUnique({
      where: { userId },
    });

    // Backfill expiresAt from Stripe if missing for a paid plan
    if (
      subscription &&
      subscription.plan !== 'FREE' &&
      !subscription.expiresAt &&
      subscription.stripeSubscriptionId &&
      stripe
    ) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        const expiresAt = getSubscriptionPeriodEnd(stripeSub);
        if (expiresAt) {
          // @ts-ignore
          subscription = await (prisma as any).userSubscription.update({
            where: { userId },
            data: { expiresAt },
          });
        }
      } catch {
        // Non-critical: proceed without expiresAt if Stripe lookup fails
      }
    }

    return NextResponse.json({
      plan: subscription?.plan || 'free',
      isAdmin: subscription?.isAdmin || false,
      expiresAt: subscription?.expiresAt,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { message: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}
