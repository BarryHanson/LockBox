import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/2fa/email/verify
 * Verifies a 2FA email code during login
 *
 * Request body:
 * - email: user email
 * - code: 6-digit code sent to email
 *
 * Response:
 * - { success: true } on success
 * - { error: string } on failure
 */
export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      );
    }

    // Rate limit by email: max 5 verification attempts per 10 minutes
    const rateLimit = checkRateLimit(`2fa-email-verify:${email.toLowerCase()}`, 5, 10 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Please try again in ${Math.ceil(rateLimit.retryAfterMs! / 1000)} seconds.` },
        { status: 429 }
      );
    }

    // Normalize and validate code
    const normalizedCode = code.trim().toString();
    if (!/^\d{6}$/.test(normalizedCode)) {
      return NextResponse.json(
        { error: 'Invalid code format' },
        { status: 400 }
      );
    }

    // Get user and their verification code
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailVerificationCode: true,
        emailVerificationCodeExpiresAt: true,
      },
    });

    if (!user) {
      // Don't reveal if user exists
      return NextResponse.json(
        { error: 'Invalid code' },
        { status: 400 }
      );
    }

    // Check if code exists and hasn't expired
    if (!user.emailVerificationCode || !user.emailVerificationCodeExpiresAt) {
      return NextResponse.json(
        { error: 'No verification code pending. Please request a new one.' },
        { status: 400 }
      );
    }

    if (user.emailVerificationCodeExpiresAt < new Date()) {
      // Clear expired code
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationCode: null,
          emailVerificationCodeExpiresAt: null,
        },
      });
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Verify code (constant-time comparison)
    const storedCode = Buffer.from(user.emailVerificationCode);
    const providedCode = Buffer.from(normalizedCode);
    if (storedCode.length !== providedCode.length || !crypto.timingSafeEqual(storedCode, providedCode)) {
      return NextResponse.json(
        { error: 'Invalid code' },
        { status: 400 }
      );
    }

    // Code is valid - clear it
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: null,
        emailVerificationCodeExpiresAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Email verification successful',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
