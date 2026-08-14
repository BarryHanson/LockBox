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

    // Check if user has vault settings using standard Prisma API
    try {
      // Use findUnique to get vault settings
      // @ts-ignore - The Prisma client may not be synchronized with the schema
      const vaultSettings = await prisma.vaultSettings.findUnique({
        where: {
          userId: userId
        },
        // Explicitly select fields we need
        select: {
          id: true,
          // @ts-ignore - The keySalt field exists in the DB even if TypeScript doesn't know about it
          keySalt: true,
          vaultCheckEncrypted: true,
          vaultCheckIv: true
        }
      });

      // Determine if user needs to set up their vault
      // User needs setup if either vault settings don't exist OR if keySalt is missing or null
      // @ts-ignore - Using type assertion to access keySalt
      const hasKeySalt = vaultSettings && vaultSettings.keySalt !== null && vaultSettings.keySalt !== undefined;
      const needsSetup = !hasKeySalt;

      // Prepare response object
      let response: any = { needsSetup };

      // If vault is set up, include the salt and VaultCheck data for verification
      if (!needsSetup && vaultSettings) {
        // @ts-ignore - Using type assertion to access keySalt
        response.keySalt = vaultSettings.keySalt;
        response.vaultCheckEncrypted = vaultSettings.vaultCheckEncrypted || null;
        response.vaultCheckIv = vaultSettings.vaultCheckIv || null;
      }

      return NextResponse.json(response);

    } catch (error) {
      // This catch block handles errors from the entire try block above
      console.error('Vault status: Error checking vault status:', error);
      return NextResponse.json({ error: 'Failed to check vault status' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error checking vault status:', error);
    // Don't expose error details to client
    return NextResponse.json({ needsSetup: true });
  }
}
