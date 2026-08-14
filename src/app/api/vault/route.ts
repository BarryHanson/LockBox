import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedApiUser } from '@/lib/api-auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedApiUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { encryptedMasterKey, vaultPasswordType } = await req.json();

    if (!encryptedMasterKey || !vaultPasswordType || !['pin', 'password'].includes(vaultPasswordType)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    // Update user's vault settings
    await prisma.$executeRaw`
      UPDATE "User"
      SET "encryptedMasterKey" = ${encryptedMasterKey},
          "vaultPasswordType" = ${vaultPasswordType}
      WHERE id = ${authUser.id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error setting up vault:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedApiUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's vault settings
    const user = await prisma.$queryRaw<{ id: string; encryptedMasterKey: string | null; vaultPasswordType: string | null }[]>`
      SELECT id, "encryptedMasterKey", "vaultPasswordType"
      FROM "User"
      WHERE id = ${authUser.id}
      LIMIT 1
    `;

    return NextResponse.json(user[0]);
  } catch (error) {
    console.error('Error getting vault settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
