import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeBackupCode, verifyTotpCode } from "@/lib/totp";
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAuditEvent } from '@/lib/fileAuditLog';

export async function POST(req: Request) {
  try {
    // Get token from cookie
    const cookieStore = req.headers.get("cookie");

    if (!cookieStore) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Token extraction
    let token;
    const cookies = cookieStore.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('token=')) {
        token = cookie.substring(6);
        break;
      }
    }

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if token is properly formatted (should be a JWT with 3 parts)
    if (!token.includes('.') || token.split('.').length !== 3) {
      return NextResponse.json({ error: "Invalid authentication token" }, { status: 401 });
    }

    const userId = await verifyToken(token);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: max 5 attempts per 15 minutes per user
    const rateLimit = checkRateLimit(`2fa-disable:${userId}`, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      await logAuditEvent({ req, action: '2fa.disable.rate_limited', level: 'warn', status: 429, userId });
      return NextResponse.json(
        { error: `Too many attempts. Please try again in ${Math.ceil(rateLimit.retryAfterMs! / 1000)} seconds.` },
        { status: 429 }
      );
    }

    const { code, accountPassword } = await req.json();
    const normalizedCode = typeof code === 'string' ? code.trim() : '';
    const normalizedPassword = typeof accountPassword === 'string' ? accountPassword : '';

    if (!normalizedCode && !normalizedPassword) {
      return NextResponse.json({ error: "Verification code or account password required" }, { status: 400 });
    }

    // Get user's 2FA secret
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: true,
        twoFactorSecret: true,
        twoFactorEnabled: true,
        backupCodes: true
      }
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return NextResponse.json({ error: "2FA not enabled" }, { status: 400 });
    }

    let isVerified = false;

    // Recovery path: verify current account password if provided
    if (normalizedPassword) {
      if (!user.password) {
        return NextResponse.json({ error: "Password-based recovery is unavailable for this account" }, { status: 400 });
      }

      const isPasswordValid = await bcrypt.compare(normalizedPassword, user.password);
      if (!isPasswordValid) {
        return NextResponse.json({ error: "Invalid account password" }, { status: 401 });
      }

      isVerified = true;
    }

    const normalizedBackup = normalizeBackupCode(normalizedCode);

    if (!isVerified && user.backupCodes.map(normalizeBackupCode).includes(normalizedBackup)) {
      // Remove the used backup code
      await prisma.user.update({
        where: { id: userId },
        data: {
          backupCodes: user.backupCodes.filter(c => normalizeBackupCode(c) !== normalizedBackup)
        }
      });
      isVerified = true;
    }

    if (!isVerified) {
      // Verify TOTP code
      const isValid = verifyTotpCode(user.twoFactorSecret, normalizedCode);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
      }

      isVerified = true;
    }

    if (!isVerified) {
      return NextResponse.json({ error: "Unable to verify disable request" }, { status: 401 });
    }

    // Disable 2FA and clear related data
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: []
      }
    });

    await logAuditEvent({ req, action: '2fa.disable.success', status: 200, userId });
    return NextResponse.json({ message: "2FA disabled successfully" });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
