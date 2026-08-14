import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

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

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function GET(req: Request) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.get('Authorization');
    let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // If no Authorization header token, try cookies
    if (!token) {
      const cookieHeader = req.headers.get('cookie') || '';
      const cookies = Object.fromEntries(
        cookieHeader
          .split(';')
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => {
            const [k, ...v] = c.split('=');
            return [k, decodeURIComponent(v.join('='))];
          })
      );
      token = cookies['__Host-token'] || cookies['token'] || cookies['next-auth.session-token'] || cookies['session'] || null;
      if (!token) {
        console.log('No token found in Authorization header or cookies');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    // Verify the token
    let userId: string;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (!payload.userId || typeof payload.userId !== 'string') {
        console.log('Invalid token payload');
        return new NextResponse('Unauthorized', { status: 401 });
      }
      userId = payload.userId;
    } catch (error) {
      console.log('Invalid token');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Fetch user data including UserSubscription and recent login history.
    // Backward-compatible fallback is kept for environments where Prisma Client
    // has not yet been regenerated with new LoginHistory fields.
    let user: any = null;

    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          userSubscription: {
            select: {
              plan: true,
              isAdmin: true,
              teamId: true,
              expiresAt: true,
              stripeSubscriptionId: true,
              createdAt: true,
              updatedAt: true
            }
          },
          loginHistory: {
            select: {
              id: true,
              ip: true,
              city: true,
              deviceType: true,
              userAgent: true,
              successful: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          }
          // Don't include sensitive data like password hashes
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      const isMissingFieldError = msg.includes('Unknown field `city`') || msg.includes('Unknown field `deviceType`');
      if (!isMissingFieldError) throw error;

      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          userSubscription: {
            select: {
              plan: true,
              isAdmin: true,
              teamId: true,
              expiresAt: true,
              stripeSubscriptionId: true,
              createdAt: true,
              updatedAt: true
            }
          },
          loginHistory: {
            select: {
              id: true,
              ip: true,
              userAgent: true,
              successful: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          }
        }
      });

      if (user?.loginHistory?.length) {
        user.loginHistory = user.loginHistory.map((entry: any) => ({
          ...entry,
          city: null,
          deviceType: null,
        }));
      }
    }

    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Backfill expiresAt from Stripe if missing for a paid plan
    const sub = user.userSubscription;
    if (sub && sub.plan !== 'FREE' && !sub.expiresAt && sub.stripeSubscriptionId && stripe) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const expiresAt = getSubscriptionPeriodEnd(stripeSub);
        if (expiresAt) {
          await (prisma as any).userSubscription.update({
            where: { userId },
            data: { expiresAt },
          });
          user.userSubscription.expiresAt = expiresAt;
        }
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
