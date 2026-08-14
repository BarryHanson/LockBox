import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateVerificationCode, send2FACodeEmail } from '@/lib/email';
import { getAuthenticatedApiUser } from '@/lib/api-auth';
import { checkDbRateLimit } from '@/lib/db-rate-limit';

/**
 * POST /api/2fa/email/send
 * Sends a 2FA verification code via email
 * 
 * Request body:
 * - email: user email (optional for authenticated users)
 * 
 * Response:
 * - { success: true, expiresIn: 600 } on success
 * - { error: string } on failure
 */
export async function POST(request: Request) {
  try {
    // IP-based rate limit before any DB access: 10 requests per 5 minutes (DB-backed, works across instances)
    const ip = (request.headers.get('x-forwarded-for') ?? '0.0.0.0').split(',')[0].trim();
    const ipRateLimit = await checkDbRateLimit(`2fa-email-send:ip:${ip}`, 10, 5 * 60 * 1000);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Please try again in ${Math.ceil(ipRateLimit.retryAfterMs! / 1000)} seconds.` },
        { status: 429 }
      );
    }

    // Try to get authenticated user first
    const authUser = await getAuthenticatedApiUser(request);
    
    let email: string | undefined | null;
    
    // If authenticated, use their email
    if (authUser) {
      email = authUser.email;
    } else {
      // Otherwise, require email in body (for login flow)
      const body = await request.json();
      email = body.email;
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if email exists in the system
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        twoFactorEmailEnabled: true,
        lastEmailCodeSentAt: true,
      },
    });

    if (!user) {
      // For security, don't reveal if email exists
      return NextResponse.json(
        { success: true, expiresIn: 600 },
        { status: 200 }
      );
    }

    // Check if 2FA email is enabled for this account
    // Return the same response as success to prevent account enumeration
    if (!user.twoFactorEmailEnabled) {
      return NextResponse.json(
        { success: true, expiresIn: 600 },
        { status: 200 }
      );
    }

    // Rate limiting: prevent sending more than 1 code per minute
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

    // Generate verification code
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
      console.error('Failed to send email:', emailError);
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
      success: true,
      expiresIn: 600, // 10 minutes in seconds
    });
  } catch (error) {
    console.error('Error in 2FA email send:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
