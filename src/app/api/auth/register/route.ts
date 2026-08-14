import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { logAuditEvent } from '@/lib/fileAuditLog';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { generateVerificationCode, send2FACodeEmail } from '@/lib/email';
import { validatePassword } from '@/lib/passwordValidation';

function extractIp(req: Request): string {
  const toIpv4 = (rawIp: string): string => {
    const ip = rawIp.trim();
    if (ip === '::1') return '127.0.0.1';
    if (ip.startsWith('::ffff:')) return ip.slice(7);
    return ip;
  };

  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return toIpv4(xForwardedFor.split(',')[0].trim());
  }

  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) {
    return toIpv4(xRealIp);
  }

  return '0.0.0.0';
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  turnstileToken: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    // Validate password requirements
    if (!validatePassword(validatedData.password)) {
      await logAuditEvent({ req: request, action: 'auth.register.weak_password', level: 'warn', status: 400, metadata: { email: validatedData.email } });
      return NextResponse.json(
        { message: 'Password does not meet security requirements' },
        { status: 400 }
      );
    }

    const captchaResult = await verifyTurnstileToken({
      token: validatedData.turnstileToken,
      ip: extractIp(request),
    });

    if (!captchaResult.success) {
      await logAuditEvent({ req: request, action: 'auth.register.captcha_invalid', level: 'warn', status: 400, metadata: { email: validatedData.email, errorCodes: captchaResult.errorCodes } });
      return NextResponse.json(
        { message: 'Captcha verification failed' },
        { status: 400 }
      );
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    });

    if (existingUser) {
      await logAuditEvent({ req: request, action: 'auth.register.duplicate_email', level: 'warn', status: 400, metadata: { email: validatedData.email } });
      return NextResponse.json(
        { message: 'Please check your email to complete registration.' },
        { status: 200 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);
    
    // Generate email verification code
    const verificationCode = generateVerificationCode();
    const codeExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Create user with verification code but NOT fully activated
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        name: validatedData.fullName,
        password: hashedPassword,
        emailVerificationCode: verificationCode,
        emailVerificationCodeExpiresAt: codeExpiresAt,
        userSubscription: {
          create: {
            plan: 'FREE',
            isAdmin: false,
            expiresAt: null,
          }
        },
      },
      include: {
        userSubscription: true,
      },
    });

    // Send verification email
    try {
      await send2FACodeEmail(user.email, verificationCode);
      await logAuditEvent({ req: request, action: 'auth.register.verification_email_sent', status: 200, userId: user.id, email: user.email });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Delete the user if email sending fails
      await prisma.user.delete({ where: { id: user.id } });
      await logAuditEvent({ req: request, action: 'auth.register.email_send_failed', level: 'error', status: 500, metadata: { email: validatedData.email } });
      return NextResponse.json(
        { message: 'Failed to send verification email. Please try again.' },
        { status: 500 }
      );
    }

    await logAuditEvent({ req: request, action: 'auth.register.success', status: 200, userId: user.id, email: user.email });
    
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription: user.userSubscription ?? null,
      },
      requiresEmailVerification: true,
      message: 'Registration successful. Please check your email to verify your account.',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      await logAuditEvent({ req: request, action: 'auth.register.invalid_input', level: 'warn', status: 400 });
      return NextResponse.json(
        { message: 'Invalid input', errors: error.errors },
        { status: 400 }
      );
    }

    // Prisma unique constraint error (race condition)
    if (error?.code === 'P2002') {
      await logAuditEvent({ req: request, action: 'auth.register.duplicate_race', level: 'warn', status: 400 });
      return NextResponse.json(
        { message: 'Email already registered' },
        { status: 400 }
      );
    }
    
    console.error('Registration error:', error);
    await logAuditEvent({ req: request, action: 'auth.register.error', level: 'error', status: 500 });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
