import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { logAuditEvent } from '@/lib/fileAuditLog';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const publicId = typeof body?.publicId === 'string' ? body.publicId : '';
    const token = typeof body?.token === 'string' ? body.token : '';

    if (!publicId || !token) {
      await logAuditEvent({ req, action: 'share.redeem.invalid_input', level: 'warn', status: 400, metadata: { publicIdPresent: !!publicId } });
      return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const link = await prisma.sharedItemLink.findUnique({
      where: { publicId },
      select: {
        id: true,
        itemType: true,
        tokenHash: true,
        payloadCipher: true,
        payloadIv: true,
        payloadSalt: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
        revokedAt: true,
      }
    });

    if (!link) {
      await logAuditEvent({ req, action: 'share.redeem.invalid_link', level: 'warn', status: 401, metadata: { publicId } });
      return NextResponse.json({ error: 'This share link is invalid.' }, { status: 401 });
    }

    if (link.revokedAt) {
      await logAuditEvent({ req, action: 'share.redeem.revoked', level: 'warn', status: 410, metadata: { publicId } });
      return NextResponse.json({ error: 'This share link was revoked.' }, { status: 410 });
    }

    if (link.tokenHash !== tokenHash) {
      await logAuditEvent({ req, action: 'share.redeem.token_mismatch', level: 'warn', status: 401, metadata: { publicId } });
      return NextResponse.json({ error: 'This share link is invalid.' }, { status: 401 });
    }

    if (link.expiresAt && link.expiresAt <= now) {
      await logAuditEvent({ req, action: 'share.redeem.expired', level: 'warn', status: 410, metadata: { publicId } });
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
    }

    if (typeof link.maxUses === 'number' && link.usedCount >= link.maxUses) {
      await logAuditEvent({ req, action: 'share.redeem.max_uses_reached', level: 'warn', status: 410, metadata: { publicId } });
      return NextResponse.json({ error: 'This share link can no longer be used.' }, { status: 410 });
    }

    // Atomic increment: WHERE guard prevents TOCTOU race on concurrent requests
    const updated = await prisma.sharedItemLink.updateMany({
      where: {
        id: link.id,
        revokedAt: null,
        ...(link.maxUses !== null ? { usedCount: { lt: link.maxUses } } : {}),
      },
      data: {
        usedCount: { increment: 1 },
        lastUsedAt: now,
      }
    });
    if (updated.count === 0) {
      await logAuditEvent({ req, action: 'share.redeem.max_uses_reached', level: 'warn', status: 410, metadata: { publicId } });
      return NextResponse.json({ error: 'This share link can no longer be used.' }, { status: 410 });
    }

    await logAuditEvent({ req, action: 'share.redeem.success', status: 200, metadata: { publicId, itemType: link.itemType } });

    // Only return the encrypted payload - do not expose internal itemId
    return NextResponse.json(
      {
        itemType: link.itemType,
        payloadCipher: link.payloadCipher,
        payloadIv: link.payloadIv,
        payloadSalt: link.payloadSalt,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    await logAuditEvent({ req, action: 'share.redeem.error', level: 'error', status: 500 });
    return NextResponse.json({ error: 'Unable to redeem this link' }, { status: 500 });
  }
}
