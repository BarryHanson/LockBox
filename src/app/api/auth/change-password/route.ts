import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { verifyToken, hashPassword, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { validatePassword } from '@/lib/passwordValidation';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  verificationToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword, verificationToken } = changePasswordSchema.parse(body);

    // Validate new password requirements
    if (!validatePassword(newPassword)) {
      return NextResponse.json(
        { message: 'New password does not meet security requirements' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        password: true,
        twoFactorEnabled: true,
        twoFactorEmailEnabled: true,
        lastActionVerificationToken: true,
        lastActionVerificationExpiry: true,
      }
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Check if user has 2FA enabled
    const has2FA = user.twoFactorEnabled || user.twoFactorEmailEnabled;
    
    if (has2FA) {
      // Require 2FA verification for password change
      if (!verificationToken) {
        return NextResponse.json(
          { message: '2FA verification required', requires2FA: true },
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
          { message: 'Invalid verification token' },
          { status: 403 }
        );
      }

      // Check if token is expired
      const now = new Date();
      if (now > user.lastActionVerificationExpiry) {
        return NextResponse.json(
          { message: 'Verification token expired. Please verify again.' },
          { status: 403 }
        );
      }

      // Clear the used verification token
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastActionVerificationToken: null,
          lastActionVerificationExpiry: null,
        }
      });
    }

    if (!user.password) {
      return NextResponse.json({ message: 'User has no password set' }, { status: 400 });
    }

    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ message: 'Current password is incorrect' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 },
      },
    });

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Invalid input', errors: error.errors }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
