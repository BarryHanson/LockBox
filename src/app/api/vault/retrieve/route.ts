import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

export const dynamic = 'force-dynamic';

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

export async function GET(req: Request) {
  try {
    const token = extractToken(req);

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the token
    let userId: string;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (!payload.userId || typeof payload.userId !== 'string') {
        console.log('Invalid token payload for vault retrieve');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = payload.userId;
    } catch (error) {
      console.log('Invalid token for vault retrieve');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      // Get user's vault settings using standard Prisma API
      // @ts-ignore - Prisma client might not be synchronized with schema
      const vaultSettings = await prisma.vaultSettings.findUnique({
        where: {
          userId: userId
        },
        select: {
          id: true,
          // @ts-ignore - Prisma client might not be synchronized with schema
          keySalt: true
        }
      });
      
      // @ts-ignore - Prisma client might not be synchronized with schema
      if (!vaultSettings || !vaultSettings.keySalt) {
        return NextResponse.json({ error: 'Vault not set up' }, { status: 404 });
      }
      
      // Return just the salt - in zero-knowledge architecture, we never store or retrieve encryption keys
      // @ts-ignore - Prisma client might not be synchronized with schema
      const keySalt = vaultSettings.keySalt;

      return NextResponse.json({ keySalt });
    } catch (error) {
      return NextResponse.json({ error: 'Failed to retrieve vault settings' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error retrieving vault data:', error);
    return NextResponse.json({ error: 'Failed to retrieve vault data' }, { status: 500 });
  }
}
