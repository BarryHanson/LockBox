import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/2fa/email/status
 * Get the current email 2FA status for the authenticated user
 * 
 * Response:
 * - { enabled: boolean }
 */
export async function GET(request: Request) {
  try {
    const cookieStore = request.headers.get('cookie');
    if (!cookieStore) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let token;
    const cookies = cookieStore.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('token=')) {
        token = cookie.substring(6);
        break;
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEmailEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ enabled: user.twoFactorEmailEnabled });
  } catch (error) {
    console.error('Error in 2FA email status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/2fa/email/status
 * Toggle email 2FA on/off for the authenticated user
 * 
 * Request body:
 * - enabled: boolean
 * 
 * Response:
 * - { enabled: boolean }
 */
export async function POST(request: Request) {
  try {
    const cookieStore = request.headers.get('cookie');
    if (!cookieStore) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let token;
    const cookies = cookieStore.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('token=')) {
        token = cookie.substring(6);
        break;
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { enabled } = await request.json();

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled must be a boolean' },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEmailEnabled: enabled },
      select: { twoFactorEmailEnabled: true },
    });

    return NextResponse.json({ enabled: user.twoFactorEmailEnabled });
  } catch (error) {
    console.error('Error in 2FA email status update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
