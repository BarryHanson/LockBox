import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the token
    let userId: string;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (!payload.userId || typeof payload.userId !== 'string') {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
      userId = payload.userId;
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();

    const { vaultPassword, keySalt, vaultCheckEncrypted, vaultCheckIv } = body;

    if (!vaultPassword) {
      return NextResponse.json({ error: 'Missing vault password' }, { status: 400 });
    }

    if (typeof vaultPassword !== 'string' || vaultPassword.length < 4) {
      return NextResponse.json({ error: 'Vault password must be at least 4 characters' }, { status: 400 });
    }

    // Hash the vault password server-side before storing
    const vaultPasswordHash = await bcrypt.hash(vaultPassword, 12);

    if (!keySalt) {
      return NextResponse.json({ error: 'Missing key salt' }, { status: 400 });
    }

    if (!vaultCheckEncrypted) {
      return NextResponse.json({ error: 'Missing vault check' }, { status: 400 });
    }

    if (!vaultCheckIv) {
      return NextResponse.json({ error: 'Missing vault check IV' }, { status: 400 });
    }

    // Verify that the user actually exists in the database
    const userExists = await prisma.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!userExists) {
      console.error('Vault setup: User ID from token does not exist in database');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Use Prisma's built-in upsert functionality
    try {
      // Update the Prisma model to store salt instead of the encrypted master key
      const result = await prisma.vaultSettings.upsert({
        where: {
          userId: userId
        },
        create: {
          userId: userId,
          vaultPasswordHash: vaultPasswordHash,
          // @ts-ignore - The Prisma client type definitions may be out of sync with the schema
          keySalt: keySalt,
          vaultCheckEncrypted: vaultCheckEncrypted,
          vaultCheckIv: vaultCheckIv
        },
        update: {
          vaultPasswordHash: vaultPasswordHash,
          // @ts-ignore - The Prisma client type definitions may be out of sync with the schema
          keySalt: keySalt,
          vaultCheckEncrypted: vaultCheckEncrypted,
          vaultCheckIv: vaultCheckIv
        }
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Vault setup: Error during upsert:', error);
      return NextResponse.json({ error: 'Failed to save vault settings' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error setting up vault:', error);
    return NextResponse.json({ error: 'Failed to set up vault' }, { status: 500 });
  }
}
