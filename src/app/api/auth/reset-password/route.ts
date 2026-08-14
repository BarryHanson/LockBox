import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logAuditEvent } from "@/lib/fileAuditLog";
import { validatePassword } from "@/lib/passwordValidation";
import { checkRateLimit } from '@/lib/rate-limit';
import { verifyTotpCode } from "@/lib/totp";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  totpCode: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password, totpCode } = resetPasswordSchema.parse(body);

    // Rate limit password reset attempts
    const tokenPrefix = token.substring(0, 8);
    const rateLimit = checkRateLimit(`reset-password:${tokenPrefix}`, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Please try again later.` },
        { status: 429 }
      );
    }

    // Validate password requirements
    if (!validatePassword(password)) {
      return NextResponse.json(
        { error: "Password does not meet security requirements" },
        { status: 400 }
      );
    }

    // Hash the token to compare with database
    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: resetTokenHash,
        resetTokenExpiry: {
          gt: new Date(), // Token not expired
        },
      },
      select: {
        id: true,
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorEmailEnabled: true,
        emailVerificationCode: true,
        emailVerificationCodeExpiresAt: true,
      },
    });

    if (!user) {
      await logAuditEvent({
        req: request,
        action: "auth.reset_password.invalid_token",
        level: "warn",
        status: 400,
      });
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    // If user has TOTP 2FA enabled, require TOTP verification for password reset
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!totpCode) {
        return NextResponse.json(
          { error: "2FA verification required", requiresTwoFactor: true, method: 'totp' },
          { status: 403 }
        );
      }

      const isValidTotp = verifyTotpCode(user.twoFactorSecret, totpCode.trim());
      if (!isValidTotp) {
        await logAuditEvent({
          req: request,
          action: "auth.reset_password.invalid_2fa",
          level: "warn",
          status: 401,
          userId: user.id,
        });
        return NextResponse.json(
          { error: "Invalid 2FA code" },
          { status: 401 }
        );
      }
    }
    // Also enforce email 2FA if enabled (and TOTP is not enabled)
    else if (user.twoFactorEmailEnabled) {
      if (!totpCode) {
        return NextResponse.json(
          { error: "2FA verification required", requiresTwoFactor: true, method: 'email' },
          { status: 403 }
        );
      }

      // Verify the email 2FA code
      const normalizedCode = totpCode.trim();
      if (!user.emailVerificationCode || !user.emailVerificationCodeExpiresAt) {
        return NextResponse.json(
          { error: "No verification code pending. Please request a new one." },
          { status: 401 }
        );
      }

      if (user.emailVerificationCodeExpiresAt < new Date()) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerificationCode: null, emailVerificationCodeExpiresAt: null },
        });
        return NextResponse.json(
          { error: "Verification code has expired. Please request a new one." },
          { status: 401 }
        );
      }

      const emailCodeA = Buffer.from(user.emailVerificationCode);
      const emailCodeB = Buffer.from(normalizedCode);
      if (emailCodeA.length !== emailCodeB.length || !crypto.timingSafeEqual(emailCodeA, emailCodeB)) {
        await logAuditEvent({
          req: request,
          action: "auth.reset_password.invalid_2fa",
          level: "warn",
          status: 401,
          userId: user.id,
        });
        return NextResponse.json(
          { error: "Invalid 2FA code" },
          { status: 401 }
        );
      }

      // Clear the used email code
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationCode: null, emailVerificationCodeExpiresAt: null },
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user password, clear reset token, and increment tokenVersion to invalidate existing sessions
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await logAuditEvent({
      req: request,
      action: "auth.reset_password.success",
      level: "info",
      status: 200,
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({
      message: "Password reset successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    );
  }
}
