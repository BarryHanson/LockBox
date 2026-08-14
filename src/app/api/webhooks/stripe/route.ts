import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/fileAuditLog';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || '';
const TEAM_PRICE_ID = process.env.STRIPE_TEAM_PRICE_ID || '';

type PaidPlan = 'PRO' | 'TEAM';

// In Stripe SDK v20, current_period_end moved from Subscription to SubscriptionItem.
// Falls back to the top-level field for older SDK versions.
function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const itemEnd = subscription.items?.data?.[0]?.current_period_end;
  if (itemEnd) return new Date(itemEnd * 1000);
  // Fallback: top-level field (pre-v20) which may be number or ISO string
  const top = (subscription as any).current_period_end;
  if (!top) return null;
  if (typeof top === 'number') return new Date(top * 1000);
  if (typeof top === 'string') return new Date(top);
  return null;
}

function planFromPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  if (PRO_PRICE_ID && priceId === PRO_PRICE_ID) return 'PRO';
  if (TEAM_PRICE_ID && priceId === TEAM_PRICE_ID) return 'TEAM';
  return null;
}

function getPrimaryPriceId(subscription: Stripe.Subscription): string | null {
  const firstItem = subscription.items?.data?.[0];
  const price = firstItem?.price;
  return typeof price === 'string' ? price : price?.id || null;
}

async function resolveUserIdFromCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
  if (!customer) return null;

  if (typeof customer !== 'string') {
    return customer.deleted ? null : customer.metadata?.userId || null;
  }

  const customerObj = await stripe.customers.retrieve(customer);
  if (!customerObj || ('deleted' in customerObj && customerObj.deleted)) {
    return null;
  }

  return customerObj.metadata?.userId || null;
}

export async function POST(request: Request) {
  try {
    if (!webhookSecret) {
      await logAuditEvent({ req: request, action: 'stripe.webhook.missing_secret', level: 'error', status: 500 });
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      await logAuditEvent({ req: request, action: 'stripe.webhook.missing_signature', level: 'warn', status: 400 });
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      await logAuditEvent({ req: request, action: 'stripe.webhook.invalid_signature', level: 'warn', status: 400 });
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      );
    }

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = (session.metadata?.userId || session.client_reference_id || '') as string;

      if (!userId) {
        console.error('Missing userId in session metadata');
        return NextResponse.json({ received: true });
      }

      // Get the subscription ID if it exists
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      if (!subscriptionId) {
        console.error('Missing subscriptionId for checkout.session.completed');
        return NextResponse.json({ received: true });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const status = subscription.status;
      if (status !== 'active' && status !== 'trialing') {
        console.warn(`Ignoring checkout completion for inactive subscription status: ${status}`);
        return NextResponse.json({ received: true });
      }

      const priceId = getPrimaryPriceId(subscription);
      const plan = planFromPriceId(priceId);
      if (!plan) {
        console.error(`Unable to map Stripe price to plan. priceId=${priceId || 'none'}`);
        return NextResponse.json({ received: true });
      }

      const expiresAt = getSubscriptionPeriodEnd(subscription);

      // Update user subscription
      // @ts-ignore
      await (prisma as any).userSubscription.upsert({
        where: { userId },
        update: {
          plan,
          isAdmin: plan === 'TEAM' ? true : false,
          expiresAt,
          stripeCustomerId: customerId || undefined,
          stripeSubscriptionId: subscriptionId || undefined,
        },
        create: {
          userId,
          plan,
          isAdmin: plan === 'TEAM' ? true : false,
          expiresAt,
          stripeCustomerId: customerId || undefined,
          stripeSubscriptionId: subscriptionId || undefined,
        },
      });

      await logAuditEvent({
        req: request,
        action: 'stripe.webhook.checkout_completed',
        status: 200,
        userId,
        metadata: { plan, customerId, subscriptionId }
      });

      console.log(`Subscription updated for user ${userId} to ${plan}`);
    }

    // Handle invoice.payment_succeeded event (for recurring charges)
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;
      const subscriptionId = invoice.subscription_id || invoice.subscription;
      let userId: string | null = null;

      if (typeof subscriptionId === 'string') {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        userId = subscription.metadata?.userId || await resolveUserIdFromCustomer(subscription.customer);
        const plan = planFromPriceId(getPrimaryPriceId(subscription));
        const status = subscription.status;

        if (userId && plan && (status === 'active' || status === 'trialing')) {
          const newExpiresAt = getSubscriptionPeriodEnd(subscription);

          // @ts-ignore
          await (prisma as any).userSubscription.upsert({
            where: { userId },
            update: {
              plan,
              isAdmin: plan === 'TEAM',
              expiresAt: newExpiresAt,
              stripeSubscriptionId: subscription.id,
            },
            create: {
              userId,
              plan,
              isAdmin: plan === 'TEAM',
              expiresAt: newExpiresAt,
              stripeSubscriptionId: subscription.id,
            },
          });

          await logAuditEvent({
            req: request,
            action: 'stripe.webhook.invoice_payment_succeeded',
            status: 200,
            userId,
            metadata: { plan, subscriptionId: subscription.id, subscriptionStatus: status }
          });

          console.log(`Subscription renewed for user ${userId}, new expiration: ${newExpiresAt?.toISOString() || 'null'}`);
        }
      }

      console.log(`Payment succeeded for subscription ${subscriptionId || 'unknown'}`);
    }

    // Handle customer.subscription.deleted event (for cancellations)
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId || await resolveUserIdFromCustomer(subscription.customer);

      if (userId) {
        // @ts-ignore
        await (prisma as any).userSubscription.updateMany({
          where: { userId },
          data: {
            plan: 'FREE',
            isAdmin: false,
            expiresAt: null,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
          },
        });

        await logAuditEvent({
          req: request,
          action: 'stripe.webhook.subscription_deleted',
          status: 200,
          userId,
          metadata: { subscriptionId: subscription.id }
        });

        console.log(`Subscription canceled for user ${userId}`);
      } else {
        console.warn(`Subscription canceled but userId could not be resolved for subscription ${subscription.id}`);
      }
    }

    // Handle customer.subscription.updated event (for plan changes, renewals, etc.)
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId || await resolveUserIdFromCustomer(subscription.customer);
      const plan = planFromPriceId(getPrimaryPriceId(subscription));

      if (userId) {
        // Get the subscription status
        const status = subscription.status;
        // Only update if the subscription is active or trialing
        if ((status === 'active' || status === 'trialing') && plan) {
          const newExpiresAt = getSubscriptionPeriodEnd(subscription);

          // @ts-ignore
          await (prisma as any).userSubscription.upsert({
            where: { userId },
            update: {
              plan,
              isAdmin: plan === 'TEAM',
              expiresAt: newExpiresAt,
              stripeSubscriptionId: subscription.id,
            },
            create: {
              userId,
              plan,
              isAdmin: plan === 'TEAM',
              expiresAt: newExpiresAt,
              stripeSubscriptionId: subscription.id,
            },
          });

          await logAuditEvent({
            req: request,
            action: 'stripe.webhook.subscription_updated_active',
            status: 200,
            userId,
            metadata: { plan, subscriptionId: subscription.id, subscriptionStatus: status }
          });

          console.log(`Subscription updated for user ${userId}, status: ${status}, new expiration: ${newExpiresAt?.toISOString() ?? 'null'}`);
        } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
          // Downgrade to free if subscription is no longer active
          // @ts-ignore
          await (prisma as any).userSubscription.updateMany({
            where: { userId },
            data: {
              plan: 'FREE',
              isAdmin: false,
              expiresAt: null,
            },
          });

          await logAuditEvent({
            req: request,
            action: 'stripe.webhook.subscription_downgraded',
            status: 200,
            userId,
            metadata: { subscriptionId: subscription.id, subscriptionStatus: status }
          });

          console.log(`Subscription downgraded to FREE for user ${userId} due to status: ${status}`);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    await logAuditEvent({ req: request, action: 'stripe.webhook.error', level: 'error', status: 500 });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
