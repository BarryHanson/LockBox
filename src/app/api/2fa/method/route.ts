import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateVerificationCode, send2FACodeEmail } from '@/lib/email';

/**
 * POST /api/2fa/method
 * Determines which 2FA method to use for a user and initiates it
 * Priority: TOTP > Email
 * 
 * Request body:
 * - email: user email
 * 
 * Response:
 * - { method: 'totp' } - if TOTP is enabled
 * - { method: 'email', expiresIn: 600 } - if email 2FA is enabled
 * - { method: 'none' } - if no 2FA is enabled
 * - { error: string } - on failure
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Get user's 2FA settings
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorEmailEnabled: true,
        lastEmailCodeSentAt: true,
      },
    });

    if (!user) {
      // For security, don't reveal if email exists
      return NextResponse.json(
        { method: 'none' },
        { status: 200 }
      );
    }

    // Priority 1: Check if TOTP is enabled
    if (user.twoFactorEnabled) {
      return NextResponse.json({
        method: 'totp',
        message: 'Please enter your authenticator code',
      });
    }

    // Priority 2: Check if email 2FA is enabled
    if (user.twoFactorEmailEnabled) {
      // Check rate limiting
      if (user.lastEmailCodeSentAt) {
        const timeSinceLastEmail =
          (Date.now() - user.lastEmailCodeSentAt.getTime()) / 1000;
        if (timeSinceLastEmail < 60) {
          return NextResponse.json(
            { error: `Please wait ${Math.ceil(60 - timeSinceLastEmail)} seconds before requesting another code` },
            { status: 429 }
          );
        }
      }

      // Generate and send verification code
      const verificationCode = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Save code to database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationCode: verificationCode,
          emailVerificationCodeExpiresAt: expiresAt,
          lastEmailCodeSentAt: new Date(),
        },
      });

      // Send email
      try {
        await send2FACodeEmail(user.email, verificationCode);
      } catch (emailError) {
        console.error('Failed to send 2FA email:', emailError);
        // Clear the code if email sending fails
        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerificationCode: null,
            emailVerificationCodeExpiresAt: null,
          },
        });
        return NextResponse.json(
          { error: 'Failed to send verification email. Please try again.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        method: 'email',
        expiresIn: 600,
        message: 'A verification code has been sent to your email',
      });
    }

    // No 2FA enabled
    return NextResponse.json({
      method: 'none',
    });
  } catch (error) {
    console.error('Error in 2FA method endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
