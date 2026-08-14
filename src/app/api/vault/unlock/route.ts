import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { jwtVerify } from 'jose';
import { checkRateLimit } from '@/lib/rate-limit';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

function extractToken(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') || '';
  for (const rawCookie of cookieHeader.split(';')) {
    const cookie = rawCookie.trim();
    if (!cookie) continue;
    const [name, ...rest] = cookie.split('=');
    if (name === 'token' || name === '__Host-token') {
      const value = rest.join('=');
      if (value) return decodeURIComponent(value);
    }
  }

  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const bearer = authHeader.slice(7).trim();
  if (!bearer || bearer === 'null' || bearer === 'undefined') return null;
  return bearer;
}

export async function POST(req: Request) {
  try {
    const token = extractToken(req);

    if (!token) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Verify the token
    let userId: string;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (!payload.userId || typeof payload.userId !== 'string') {
        return new NextResponse('Unauthorized', { status: 401 });
      }
      userId = payload.userId;
    } catch (error) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Rate limit vault unlock: max 5 attempts per 15 minutes per user
    const rateLimit = checkRateLimit(`vault-unlock:${userId}`, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many unlock attempts. Please try again in ${Math.ceil(rateLimit.retryAfterMs! / 1000)} seconds.` },
        { status: 429 }
      );
    }

    // Get the password from request body
    const body = await req.json();
    const { vaultPassword } = body;

    if (!vaultPassword || typeof vaultPassword !== 'string') {
      return new NextResponse('Invalid request', { status: 400 });
    }

    // Find vault settings for user
    const vaultSettings = await prisma.vaultSettings.findFirst({
      where: {
        userId
      }
    });

    if (!vaultSettings) {
      return new NextResponse('Vault not set up', { status: 400 });
    }

    // Verify the password
    const isValid = await bcrypt.compare(vaultPassword, vaultSettings.vaultPasswordHash);

    if (!isValid) {
      return new NextResponse('Invalid vault password', { status: 401 });
    }

    // Get the encrypted master key to return to client (legacy flow)
    // @ts-ignore - Prisma client might not be synchronized with schema
    const encryptedMasterKey = vaultSettings.encryptedMasterKey;

    // Zero-knowledge flow may not store encryptedMasterKey. Password validity is still sufficient.
    if (!encryptedMasterKey) {
      return NextResponse.json({ success: true });
    }

    // Password is valid - return encrypted master key for legacy clients
    return NextResponse.json({
      success: true,
      encryptedMasterKey
    });
  } catch (error) {
    return new NextResponse('Internal error', { status: 500 });
  }
}
