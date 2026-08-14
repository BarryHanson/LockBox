import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { logAuditEvent } from '@/lib/fileAuditLog';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return new NextResponse('Unauthorized', { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = String((payload as any).userId);
    const sub = await prisma.userSubscription.findUnique({ where: { userId } });
    return NextResponse.json(sub);
  } catch (err) {
    console.error('subscription GET error', err);
    return new NextResponse('Unauthorized', { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      await logAuditEvent({ req, action: 'user.subscription.patch.unauthorized', level: 'warn', status: 401 });
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = String((payload as any).userId);

    const body = await req.json();
    const plan = body?.plan as string | undefined;
    if (!plan || !['FREE', 'PRO', 'TEAM'].includes(plan)) {
      await logAuditEvent({ req, action: 'user.subscription.patch.invalid_plan', userId, level: 'warn', status: 400, metadata: { requestedPlan: plan } });
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    if (plan !== 'FREE') {
      await logAuditEvent({ req, action: 'user.subscription.patch.blocked_paid_upgrade', userId, level: 'warn', status: 403, metadata: { requestedPlan: plan } });
      return NextResponse.json(
        { error: 'Paid plans must be activated through Stripe checkout' },
        { status: 403 }
      );
    }

    // Upsert subscription record
    const updated = await prisma.userSubscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: 'FREE' as any,
        isAdmin: false,
        expiresAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
      update: {
        plan: 'FREE' as any,
        isAdmin: false,
        expiresAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      }
    });

    await logAuditEvent({ req, action: 'user.subscription.patch.free_downgrade', userId, status: 200 });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('subscription PATCH error', err);
    await logAuditEvent({ req, action: 'user.subscription.patch.error', level: 'error', status: 500 });
    return new NextResponse('Internal server error', { status: 500 });
  }
}
