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

const PLAN_PRICES: Record<string, { name: string; priceId: string; amount: number }> = {
  'FREE': {
    name: 'Free Plan',
    priceId: '',
    amount: 0,
  },
  'PRO': {
    name: 'Pro Plan',
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    amount: 499, // $4.99 in cents
  },
  'TEAM': {
    name: 'Team Plan',
    priceId: process.env.STRIPE_TEAM_PRICE_ID || '',
    amount: 999, // $9.99 in cents
  },
};

export async function POST(request: Request) {
  try {
    const token = cookies().get('token')?.value;

    if (!token) {
      await logAuditEvent({
        req: request,
        action: 'subscription.checkout.unauthorized',
        level: 'warn',
        status: 401,
      });
      return NextResponse.json(
        { message: 'You must be logged in to checkout' },
        { status: 401 }
      );
    }

    const userId = await verifyToken(token);
    if (!userId) {
      await logAuditEvent({
        req: request,
        action: 'subscription.checkout.invalid_token',
        level: 'warn',
        status: 401,
      });
      return NextResponse.json(
        { message: 'You must be logged in to checkout' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { plan } = body;

    // Validate plan type
    if (!plan || !['FREE', 'PRO', 'TEAM'].includes(plan)) {
      await logAuditEvent({
        req: request,
        action: 'subscription.checkout.invalid_plan',
        userId,
        level: 'warn',
        status: 400,
        metadata: { requestedPlan: plan },
      });
      return NextResponse.json(
        { message: 'Invalid subscription plan' },
        { status: 400 }
      );
    }

    // Free plan doesn't need Stripe checkout
    if (plan === 'FREE') {
      // Cancel existing Stripe subscription if any
      const existingSub = await prisma.userSubscription.findUnique({
        where: { userId },
        select: { stripeSubscriptionId: true },
      });

      if (existingSub?.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(existingSub.stripeSubscriptionId);
        } catch (stripeErr) {
          // Log but continue if cancellation fails (e.g., already cancelled)
        }
      }

      // Update subscription directly
      // @ts-ignore
      await (prisma as any).userSubscription.upsert({
        where: { userId },
        update: {
          plan: 'FREE',
          isAdmin: false,
          expiresAt: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
        create: {
          userId,
          plan: 'FREE',
          isAdmin: false,
          expiresAt: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
      });

      await logAuditEvent({
        req: request,
        action: 'subscription.downgrade.free',
        userId,
        email: null,
        status: 200,
      });

      return NextResponse.json({
        message: 'Subscription updated to Free plan',
        sessionUrl: '/vault/account',
      });
    }

    const planInfo = PLAN_PRICES[plan];
    if (!planInfo.priceId) {
      await logAuditEvent({
        req: request,
        action: 'subscription.checkout.misconfigured_price',
        userId,
        level: 'error',
        status: 500,
        metadata: { requestedPlan: plan },
      });
      return NextResponse.json(
        { message: 'Stripe configuration not available for this plan' },
        { status: 500 }
      );
    }

    // Get user and existing subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userSubscription: true },
    });

    if (!user || !user.email) {
      await logAuditEvent({
        req: request,
        action: 'subscription.checkout.user_missing',
        userId,
        level: 'warn',
        status: 404,
      });
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    // Reuse existing Stripe customer if available, otherwise create one
    let customerId = user.userSubscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: userId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: planInfo.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          plan,
          userId,
        },
      },
      success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/vault/account/upgrade?success=true&plan=${plan}`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/vault/account/upgrade?canceled=true`,
      metadata: {
        plan,
        userId,
      },
    });

    if (!session.url) {
      await logAuditEvent({
        req: request,
        action: 'subscription.checkout.session_missing_url',
        userId,
        email: user.email,
        level: 'error',
        status: 500,
        metadata: { requestedPlan: plan },
      });
      return NextResponse.json(
        { message: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    await logAuditEvent({
      req: request,
      action: 'subscription.checkout.session_created',
      userId,
      email: user.email,
      status: 200,
      metadata: { requestedPlan: plan, customerId, checkoutSessionId: session.id },
    });

    return NextResponse.json({
      sessionUrl: session.url,
    });
  } catch (error: any) {
    await logAuditEvent({
      req: request,
      action: 'subscription.checkout.error',
      level: 'error',
      status: 500,
      metadata: {
        message: error?.message || 'unknown',
        requestId: error?.requestId || error?.raw?.requestId || null,
      },
    });

    return NextResponse.json(
      {
        message: 'Failed to create checkout session. Please try again.',
      },
      { status: 500 }
    );
  }
}
