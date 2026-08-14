import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getAuthenticatedApiUser } from '@/lib/api-auth';

const ENDPOINT = process.env.BACKBLAZE_ENDPOINT || process.env.B2_ENDPOINT || process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
const BUCKET = process.env.BACKBLAZE_BUCKET || process.env.B2_BUCKET || process.env.R2_BUCKET || process.env.S3_BUCKET;
const ACCESS_KEY = process.env.BACKBLAZE_KEY_ID || process.env.B2_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.BACKBLAZE_APPLICATION_KEY || process.env.B2_APPLICATION_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;

function createS3Client() {
  if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
    throw new Error('Missing S3-compatible storage configuration in environment (set BACKBLAZE_/B2_/R2_/S3_ vars)');
  }

  return new S3Client({
    endpoint: ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
    forcePathStyle: true,
  });
}

export async function DELETE(req: Request) {
  try {
    const authUser = await getAuthenticatedApiUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body for verificationToken
    let verificationToken: string | undefined;
    try {
      const body = await req.json();
      verificationToken = body.verificationToken;
    } catch (e) {
      // Body is optional, continue without it
    }

    // Find the user with 2FA settings
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorEmailEnabled: true,
        lastActionVerificationToken: true,
        lastActionVerificationExpiry: true,
      }
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has 2FA enabled
    const has2FA = user.twoFactorEnabled || user.twoFactorEmailEnabled;
    
    if (has2FA) {
      // Require 2FA verification for account deletion
      if (!verificationToken) {
        return NextResponse.json(
          { error: '2FA verification required', requires2FA: true },
          { status: 403 }
        );
      }

      // Verify the action token (constant-time comparison)
      const storedToken = Buffer.from(user.lastActionVerificationToken || '');
      const providedToken = Buffer.from(verificationToken || '');
      if (!user.lastActionVerificationToken ||
          !user.lastActionVerificationExpiry ||
          storedToken.length !== providedToken.length ||
          !crypto.timingSafeEqual(storedToken, providedToken)) {
        return NextResponse.json(
          { error: 'Invalid verification token' },
          { status: 403 }
        );
      }

      // Check if token is expired
      const now = new Date();
      if (now > user.lastActionVerificationExpiry) {
        return NextResponse.json(
          { error: 'Verification token expired. Please verify again.' },
          { status: 403 }
        );
      }
    }

    const userFiles = await prisma.file.findMany({
      where: { userId: user.id },
      select: { storageKey: true },
    });

    const storageKeys = userFiles
      .map((file) => file.storageKey)
      .filter((storageKey): storageKey is string => typeof storageKey === 'string' && storageKey.length > 0);

    if (storageKeys.length > 0) {
      const s3 = createS3Client();
      await Promise.all(storageKeys.map(async (storageKey) => {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: BUCKET!, Key: storageKey }));
        } catch (error) {
          const errorName = error && typeof error === 'object' && 'name' in error
            ? String((error as { name?: unknown }).name)
            : '';

          // Ignore keys that do not exist; continue deleting account data.
          if (errorName === 'NoSuchKey' || errorName === 'NotFound') {
            return;
          }

          throw error;
        }
      }));
    }
    
    // Begin transaction to delete all user data
    await prisma.$transaction(async (prismaClient) => {
      const userId = user.id;
      
      // Delete all user's sessions
      await prismaClient.session.deleteMany({
        where: { userId },
      });

      // Delete all user's uploaded file metadata (objects already removed from storage)
      await prismaClient.file.deleteMany({
        where: { userId },
      });
      
      // Delete all user's passwords
      await prismaClient.password.deleteMany({
        where: { userId },
      });
      
      // Delete all user's cards
      await prismaClient.card.deleteMany({
        where: { userId },
      });
      
      // Delete all user's subscriptions
      await prismaClient.subscription.deleteMany({
        where: { userId },
      });

      // Delete user's app plan subscription
      await prismaClient.userSubscription.deleteMany({
        where: { userId },
      });

      // Delete all user's notes and tags
      await prismaClient.note.deleteMany({
        where: { userId },
      });

      await prismaClient.tag.deleteMany({
        where: { userId },
      });

      // Delete login history entries
      await prismaClient.loginHistory.deleteMany({
        where: { userId },
      });
      
      // Delete all user's accounts
      await prismaClient.account.deleteMany({
        where: { userId },
      });
      
      // Delete all user's emails
      await prismaClient.userEmail.deleteMany({
        where: { userId },
      });
      
      // Delete user's vault settings
      await prismaClient.vaultSettings.deleteMany({
        where: { userId },
      });
      
      // Finally, delete the user
      await prismaClient.user.delete({
        where: { id: userId },
      });
    });
    
    // Clear cookies and session
    return NextResponse.json({ 
      success: true, 
      message: 'Account deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
