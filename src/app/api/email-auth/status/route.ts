import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Verify user authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get user's email if it exists
    const userEmail = await prisma.userEmail.findFirst({
      where: {
        userId: userId
      }
    });

    return NextResponse.json({
      email: userEmail?.email || null
    });
  } catch (error) {
    console.error('Email auth status error:', error);
    return NextResponse.json(
      { error: 'Failed to get email status' },
      { status: 500 }
    );
  }
}
