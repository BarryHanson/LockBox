import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/fileAuditLog';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const createShareSchema = z.object({
  publicId: z.string().min(12),
  tokenHash: z.string().length(64),
  itemType: z.enum(['PASSWORD', 'CARD', 'NOTE', 'FILE']),
  itemId: z.string().min(1),
  payloadCipher: z.string().min(1),
  payloadIv: z.string().min(1),
  payloadSalt: z.string().min(1),
  duration: z.enum(['one_time', 'forever', 'one_day', 'one_month'])
});

function extractBearerOrCookieToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (bearer) return bearer;

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

  return cookies['token'] || null;
}

function getDurationSettings(duration: 'one_time' | 'forever' | 'one_day' | 'one_month'): { expiresAt: Date | null; maxUses: number | null } {
  const now = Date.now();
  if (duration === 'one_time') return { expiresAt: null, maxUses: 1 };
  if (duration === 'one_day') return { expiresAt: new Date(now + 24 * 60 * 60 * 1000), maxUses: null };
  if (duration === 'one_month') return { expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000), maxUses: null };
  return { expiresAt: null, maxUses: null };
}

async function assertItemOwnership(userId: string, itemType: 'PASSWORD' | 'CARD' | 'NOTE' | 'FILE', itemId: string): Promise<boolean> {
  if (itemType === 'PASSWORD') {
    const found = await prisma.password.findFirst({ where: { id: itemId, userId }, select: { id: true } });
    return !!found;
  }

  if (itemType === 'CARD') {
    const found = await prisma.card.findFirst({ where: { id: itemId, userId }, select: { id: true } });
    return !!found;
  }

  if (itemType === 'NOTE') {
    const found = await prisma.note.findFirst({ where: { id: itemId, userId }, select: { id: true } });
    return !!found;
  }

  const found = await prisma.file.findFirst({ where: { id: itemId, userId }, select: { id: true } });
  return !!found;
}

export async function POST(req: Request) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      await logAuditEvent({ req, action: 'share.create.unauthorized', level: 'warn', status: 401 });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = typeof payload.userId === 'string' ? payload.userId : null;
    if (!userId) {
      await logAuditEvent({ req, action: 'share.create.invalid_token', level: 'warn', status: 401 });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userSub = await prisma.userSubscription.findUnique({
      where: { userId },
      select: { plan: true, expiresAt: true }
    });
    const plan = userSub?.plan ?? 'FREE';
    const now = new Date();
    const isPaidPlan = plan === 'PRO' || plan === 'TEAM';
    const hasActivePaidSubscription =
      isPaidPlan &&
      !!userSub?.expiresAt &&
      new Date(userSub.expiresAt) > now;

    if (!hasActivePaidSubscription) {
      await logAuditEvent({ req, action: 'share.create.blocked_inactive_plan', userId, level: 'warn', status: 403, metadata: { plan } });
      return NextResponse.json({ error: 'Sharing is available on Pro and Team plans.' }, { status: 403 });
    }

    const parsed = createShareSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      await logAuditEvent({ req, action: 'share.create.invalid_request', userId, level: 'warn', status: 400 });
      return NextResponse.json({ error: 'Invalid share request' }, { status: 400 });
    }

    const { publicId, tokenHash, itemType, itemId, payloadCipher, payloadIv, payloadSalt, duration } = parsed.data;
    const ownsItem = await assertItemOwnership(userId, itemType, itemId);
    if (!ownsItem) {
      await logAuditEvent({ req, action: 'share.create.item_not_found', userId, level: 'warn', status: 404, metadata: { itemType } });
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { expiresAt, maxUses } = getDurationSettings(duration);

    await prisma.sharedItemLink.create({
      data: {
        ownerUserId: userId,
        itemType,
        itemId,
        publicId,
        tokenHash,
        payloadCipher,
        payloadIv,
        payloadSalt,
        expiresAt,
        maxUses,
      }
    });

    await logAuditEvent({
      req,
      action: 'share.create.success',
      userId,
      status: 201,
      metadata: { publicId, itemType, duration }
    });

    return NextResponse.json(
      { publicId, duration, expiresAt, oneTime: maxUses === 1 },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('share-items create error:', error);
    await logAuditEvent({ req, action: 'share.create.error', level: 'error', status: 500 });
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
  }
}
