import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma  } from "@/lib/prisma";
import { normalizeBackupCode, verifyTotpCode } from "@/lib/totp";
import { logAuditEvent } from '@/lib/fileAuditLog';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { generateVerificationCode, send2FACodeEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkDbRateLimit, resetDbRateLimit } from '@/lib/db-rate-limit';

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

function extractCity(req: Request): string | null {
  const vercelCity = req.headers.get('x-vercel-ip-city');
  if (vercelCity && vercelCity.trim().length > 0) {
    return vercelCity.trim();
  }

  const cloudflareCity = req.headers.get('cf-ipcity');
  if (cloudflareCity && cloudflareCity.trim().length > 0) {
    return cloudflareCity.trim();
  }

  return null;
}

function detectDeviceType(userAgent: string | null): string {
  if (!userAgent) return 'Unknown';

  const ua = userAgent.toLowerCase();
  if (ua.includes('tablet') || ua.includes('ipad')) return 'Tablet';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'Mobile';
  return 'Desktop';
}

function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim() === 'https';
  }

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body?.email;
    const password = body?.password;
    const totpCode = body?.totpCode;
    const turnstileToken = body?.turnstileToken;
    // Extension flag: checked via header OR body field (header may be stripped by proxy)
    const clientType = request.headers.get('x-client-type') || body?.clientType;
    const ip = extractIp(request);

    // Rate limit by IP: max 10 login attempts per 15 minutes (DB-backed, works across instances)
    const ipRateLimit = await checkDbRateLimit(`login:ip:${ip}`, 10, 15 * 60 * 1000);
    if (!ipRateLimit.allowed) {
      await logAuditEvent({ req: request, action: 'auth.login.rate_limited', level: 'warn', status: 429, metadata: { ip } });
      return NextResponse.json(
        { error: `Too many login attempts. Please try again in ${Math.ceil(ipRateLimit.retryAfterMs! / 1000)} seconds.` },
        { status: 429 }
      );
    }

    // Rate limit by email if provided: max 5 attempts per 15 minutes
    if (email) {
      const emailRateLimit = checkRateLimit(`login:email:${email.toLowerCase()}`, 5, 15 * 60 * 1000);
      if (!emailRateLimit.allowed) {
        await logAuditEvent({ req: request, action: 'auth.login.rate_limited', level: 'warn', status: 429, metadata: { email } });
        return NextResponse.json(
          { error: `Too many login attempts for this account. Please try again in ${Math.ceil(emailRateLimit.retryAfterMs! / 1000)} seconds.` },
          { status: 429 }
        );
      }
    }

    // Browser extensions cannot load Cloudflare Turnstile (MV3 CSP restrictions).
    // Extension requests identify themselves via header or body field,
    // and are protected by stricter IP-based rate limiting instead of captcha.
    const isExtensionRequest = clientType === 'extension';

    // Require CAPTCHA on initial login attempts (not on 2FA code submissions,
    // since Turnstile tokens are single-use and already verified on the first request)
    if (!totpCode) {
      if (isExtensionRequest) {
        // Extension requests: apply stricter rate limit instead of captcha
        const extRateLimit = checkRateLimit(`login:ext:${ip}`, 5, 15 * 60 * 1000);
        if (!extRateLimit.allowed) {
          await logAuditEvent({ req: request, action: 'auth.login.ext_rate_limited', level: 'warn', status: 429, metadata: { ip, clientType } });
          return NextResponse.json(
            { error: `Too many login attempts. Please try again in ${Math.ceil(extRateLimit.retryAfterMs! / 1000)} seconds.` },
            { status: 429 }
          );
        }
      } else {
        if (!turnstileToken || typeof turnstileToken !== 'string') {
          await logAuditEvent({ req: request, action: 'auth.login.captcha_missing', level: 'warn', status: 400, metadata: { emailPresent: !!email } });
          return NextResponse.json({ error: 'Captcha verification is required' }, { status: 400 });
        }

        const captchaResult = await verifyTurnstileToken({
          token: turnstileToken,
          ip,
        });

        if (!captchaResult.success) {
          await logAuditEvent({ req: request, action: 'auth.login.captcha_invalid', level: 'warn', status: 400, metadata: { emailPresent: !!email, errorCodes: captchaResult.errorCodes } });
          return NextResponse.json({ error: 'Captcha verification failed' }, { status: 400 });
        }
      }
    }

    if (!email || !password) {
      await logAuditEvent({ req: request, action: 'auth.login.invalid_input', level: 'warn', status: 400, metadata: { emailPresent: !!email } });
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        backupCodes: true,
        twoFactorEmailEnabled: true,
        emailVerificationCode: true,
        emailVerificationCodeExpiresAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        tokenVersion: true,
      }
    });

    // Check account lockout
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const remainingSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      await logAuditEvent({ req: request, action: 'auth.login.account_locked', level: 'warn', status: 423, userId: user.id, email: user.email });
      return NextResponse.json(
        { error: `Account is temporarily locked. Please try again in ${remainingSeconds} seconds.` },
        { status: 423 }
      );
    }

    if (!user || !user.password || !password || !(await bcrypt.compare(password, user.password))) {
      // Increment failed login attempts if user exists
      if (user) {
        const failedAttempts = (user.failedLoginAttempts || 0) + 1;
        const lockoutData: { failedLoginAttempts: number; lockedUntil?: Date } = {
          failedLoginAttempts: failedAttempts,
        };

        // Lock account after 5 failed attempts for 15 minutes
        if (failedAttempts >= 5) {
          lockoutData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          await logAuditEvent({ req: request, action: 'auth.login.account_lockout_triggered', level: 'warn', status: 423, userId: user.id, email: user.email, metadata: { failedAttempts } });
        }

        await prisma.user.update({
          where: { id: user.id },
          data: lockoutData,
        });
      }

      await logAuditEvent({ req: request, action: 'auth.login.invalid_credentials', level: 'warn', status: 401, metadata: { email } });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Priority 1: Check if TOTP is enabled
    if (user.twoFactorEnabled) {
      if (!totpCode) {
        await logAuditEvent({ req: request, action: 'auth.login.2fa_totp_required', level: 'info', status: 200, userId: user.id, email: user.email });
        return NextResponse.json({
          requiresTwoFactor: true,
          method: 'totp',
          message: 'Please enter your authenticator code'
        }, { status: 200 });
      }

      const normalizedTotpCode = typeof totpCode === 'string' ? totpCode.trim() : '';
      const normalizedBackupCode = normalizeBackupCode(normalizedTotpCode);

      // Check if it's a backup code
      if (user.backupCodes.map(normalizeBackupCode).includes(normalizedBackupCode)) {
        // Remove the used backup code
        await prisma.user.update({
          where: { id: user.id },
          data: {
            backupCodes: user.backupCodes.filter(code => normalizeBackupCode(code) !== normalizedBackupCode)
          }
        });
      } else {
        if (!user.twoFactorSecret) {
          await logAuditEvent({ req: request, action: 'auth.login.2fa_misconfigured', level: 'warn', status: 401, userId: user.id, email: user.email });
          return NextResponse.json({ error: "2FA not properly set up" }, { status: 401 });
        }

        try {
          const isCodeValid = verifyTotpCode(user.twoFactorSecret, normalizedTotpCode);

          if (!isCodeValid) {
            await logAuditEvent({ req: request, action: 'auth.login.2fa_invalid', level: 'warn', status: 401, userId: user.id, email: user.email });
            return NextResponse.json({ error: "Invalid 2FA code" }, { status: 401 });
          }
        } catch (err) {
          await logAuditEvent({ req: request, action: 'auth.login.2fa_error', level: 'error', status: 401, userId: user.id, email: user.email });
          return NextResponse.json({ error: "Invalid 2FA code" }, { status: 401 });
        }
      }

      // TOTP verification successful, issue token below
    }
    // Priority 2: Check if email 2FA is enabled
    else if (user.twoFactorEmailEnabled) {
      if (!totpCode) {
        // First time: send email code and request verification
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
          await logAuditEvent({ req: request, action: 'auth.login.2fa_email_sent', level: 'info', status: 200, userId: user.id, email: user.email });
        } catch (emailError) {
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
          requiresTwoFactor: true,
          method: 'email',
          expiresIn: 600,
          message: 'A verification code has been sent to your email',
        }, { status: 200 });
      }

      // User provided code - verify it
      const normalizedCode = totpCode.trim().toString();
      if (!/^\d{6}$/.test(normalizedCode)) {
        await logAuditEvent({ req: request, action: 'auth.login.2fa_invalid_format', level: 'warn', status: 401, userId: user.id, email: user.email });
        return NextResponse.json(
          { error: 'Invalid code format' },
          { status: 401 }
        );
      }

      // Check if code exists and hasn't expired
      if (!user.emailVerificationCode || !user.emailVerificationCodeExpiresAt) {
        await logAuditEvent({ req: request, action: 'auth.login.2fa_no_code', level: 'warn', status: 401, userId: user.id, email: user.email });
        return NextResponse.json(
          { error: 'No verification code pending. Please request a new one.' },
          { status: 401 }
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
        await logAuditEvent({ req: request, action: 'auth.login.2fa_expired', level: 'warn', status: 401, userId: user.id, email: user.email });
        return NextResponse.json(
          { error: 'Verification code has expired. Please request a new one.' },
          { status: 401 }
        );
      }

      // Verify code (constant-time comparison)
      const codeA = Buffer.from(user.emailVerificationCode);
      const codeB = Buffer.from(normalizedCode);
      if (codeA.length !== codeB.length || !crypto.timingSafeEqual(codeA, codeB)) {
        await logAuditEvent({ req: request, action: 'auth.login.2fa_invalid', level: 'warn', status: 401, userId: user.id, email: user.email });
        return NextResponse.json(
          { error: 'Invalid code' },
          { status: 401 }
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

      await logAuditEvent({ req: request, action: 'auth.login.2fa_email_verified', level: 'info', status: 200, userId: user.id, email: user.email });
      // Email verification successful, issue token below
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      await logAuditEvent({ req: request, action: 'auth.login.server_misconfigured', level: 'error', status: 500, userId: user.id, email: user.email });
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const token = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion ?? 0 },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Reset failed login attempts on successful login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // For extension requests, include the token in the response body
    // (service workers cannot access httpOnly cookies)
    const responseBody: Record<string, unknown> = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      message: 'Login successful',
    };
    if (isExtensionRequest) {
      responseBody.token = token;
    }

    const response = NextResponse.json(responseBody, { status: 200 });

    // Set cookie with proper type
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    };

    response.cookies.set('token', token, cookieOptions);

    try {
      const city = extractCity(request);
      const userAgent = request.headers.get('user-agent');
      const deviceType = detectDeviceType(userAgent);

      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          ip,
          city,
          deviceType,
          userAgent,
          successful: true,
        }
      });
    } catch (loginHistoryError) {
      // Login history write failure is non-critical
    }

    await logAuditEvent({ req: request, action: 'auth.login.success', status: 200, userId: user.id, email: user.email });

    return response;
  } catch (error) {
    await logAuditEvent({ req: request, action: 'auth.login.error', level: 'error', status: 500 });
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
