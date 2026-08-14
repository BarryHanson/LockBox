import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode, normalizeBackupCode } from "@/lib/totp";
import crypto from "crypto";
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/2fa/verify-action
 * Verifies a 2FA code for a sensitive action
 * Returns a short-lived token that can be used to authorize the action
 */
export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedApiUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: max 5 attempts per 15 minutes per user
    const rateLimit = checkRateLimit(`verify-action:${authUser.id}`, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Please try again in ${Math.ceil(rateLimit.retryAfterMs! / 1000)} seconds.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: "2FA code is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        twoFactorEnabled: true,
        twoFactorEmailEnabled: true,
        twoFactorSecret: true,
        backupCodes: true,
        emailVerificationCode: true,
        emailVerificationCodeExpiresAt: true,
      }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has any 2FA method enabled
    if (!user.twoFactorEnabled && !user.twoFactorEmailEnabled) {
      return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
    }

    let isValidCode = false;

    // Try TOTP verification if enabled
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      try {
        isValidCode = verifyTotpCode(user.twoFactorSecret, code);
      } catch (err) {
        // TOTP verification failed, try other methods
      }
    }

    // Try backup code verification if TOTP failed
    if (!isValidCode && user.twoFactorEnabled && user.backupCodes && user.backupCodes.length > 0) {
      const normalizedCode = normalizeBackupCode(code);
      const backupIndex = user.backupCodes.findIndex((bc) => normalizeBackupCode(bc) === normalizedCode);

      if (backupIndex !== -1) {
        isValidCode = true;
        // Remove the used backup code
        const updatedBackupCodes = [...user.backupCodes];
        updatedBackupCodes.splice(backupIndex, 1);

        await prisma.user.update({
          where: { id: authUser.id },
          data: { backupCodes: updatedBackupCodes }
        });
      }
    }

    // Try email 2FA verification if other methods failed
    if (!isValidCode && user.twoFactorEmailEnabled) {
      if (user.emailVerificationCode && user.emailVerificationCodeExpiresAt) {
        const now = new Date();
        const emailCodeA = Buffer.from(user.emailVerificationCode);
        const emailCodeB = Buffer.from(code);
        if (now <= user.emailVerificationCodeExpiresAt && emailCodeA.length === emailCodeB.length && crypto.timingSafeEqual(emailCodeA, emailCodeB)) {
          isValidCode = true;
          // Clear the used email code
          await prisma.user.update({
            where: { id: authUser.id },
            data: {
              emailVerificationCode: null,
              emailVerificationCodeExpiresAt: null
            }
          });
        }
      }
    }

    if (!isValidCode) {
      return NextResponse.json({ error: "Invalid 2FA code" }, { status: 400 });
    }

    // Generate a short-lived verification token (valid for 5 minutes)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store the verification token in the database
    await prisma.user.update({
      where: { id: authUser.id },
      data: {
        lastActionVerificationToken: verificationToken,
        lastActionVerificationExpiry: expiresAt,
      }
    });

    return NextResponse.json({
      success: true,
      verificationToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
