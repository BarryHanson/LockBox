import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { logAuditEvent } from '@/lib/fileAuditLog';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request: Request) {
  try {
    const token = cookies().get('token')?.value;

    if (!token) {
      await logAuditEvent({ req: request, action: 'subscription.update.unauthorized', level: 'warn', status: 401 });
      return NextResponse.json(
        { message: 'You must be logged in to update your subscription' },
        { status: 401 }
      );
    }

    const userId = await verifyToken(token);
    if (!userId) {
      await logAuditEvent({ req: request, action: 'subscription.update.invalid_token', level: 'warn', status: 401 });
      return NextResponse.json(
        { message: 'You must be logged in to update your subscription' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { plan } = body;

    // Validate plan type
    if (!plan || !['FREE', 'PRO', 'TEAM'].includes(plan)) {
      await logAuditEvent({ req: request, action: 'subscription.update.invalid_plan', userId, level: 'warn', status: 400, metadata: { requestedPlan: plan } });
      return NextResponse.json(
        { message: 'Invalid subscription plan' },
        { status: 400 }
      );
    }

    if (plan !== 'FREE') {
      await logAuditEvent({ req: request, action: 'subscription.update.blocked_paid_upgrade', userId, level: 'warn', status: 403, metadata: { requestedPlan: plan } });
      return NextResponse.json(
        { message: 'Paid plan changes must be completed through Stripe checkout' },
        { status: 403 }
      );
    }

    // Get the user and their subscription from the database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userSubscription: true },
    });

    if (!user) {
      await logAuditEvent({ req: request, action: 'subscription.update.user_missing', userId, level: 'warn', status: 404 });
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    // Cancel the Stripe subscription if one exists before downgrading to FREE
    const stripeSubscriptionId = user.userSubscription?.stripeSubscriptionId;
    if (stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
        await logAuditEvent({ req: request, action: 'subscription.update.stripe_canceled', userId, status: 200, metadata: { stripeSubscriptionId } });
      } catch (stripeError: any) {
        // If subscription is already canceled or doesn't exist, continue
        if (stripeError?.code !== 'resource_missing') {
          await logAuditEvent({ req: request, action: 'subscription.update.stripe_cancel_failed', userId, level: 'error', status: 500, metadata: { stripeSubscriptionId, error: stripeError?.message } });
          return NextResponse.json(
            { message: 'Failed to cancel existing subscription. Please try again.' },
            { status: 500 }
          );
        }
      }
    }

    // Update or create subscription
    // @ts-ignore - UserSubscription exists in the schema but TypeScript doesn't recognize it yet
    const updatedSubscription = await (prisma as any).userSubscription.upsert({
      where: {
        userId: user.id,
      },
      update: {
        plan,
        isAdmin: false,
        expiresAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
      create: {
        userId: user.id,
        plan,
        isAdmin: false,
        expiresAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    return NextResponse.json({
      message: 'Subscription updated successfully',
      plan: updatedSubscription.plan,
      isAdmin: updatedSubscription.isAdmin,
      expiresAt: updatedSubscription.expiresAt,
    });

  } catch (error) {
    await logAuditEvent({ req: request, action: 'subscription.update.error', level: 'error', status: 500 });
    return NextResponse.json(
      { message: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}
