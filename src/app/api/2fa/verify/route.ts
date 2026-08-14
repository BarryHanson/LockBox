import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { verifyTotpCode } from "@/lib/totp";

function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString("hex"));
  }
  return codes;
}

export async function POST(req: Request) {
  try {
    const cookieStore = req.headers.get("cookie");
    console.log("Raw cookie header:", cookieStore);
    
    if (!cookieStore) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // More robust token extraction
    let token;
    const cookies = cookieStore.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('token=')) {
        token = cookie.substring(6); // 'token='.length === 6
        console.log("Found token in cookie:", token.substring(0, 10) + '...');
        break;
      }
    }
    
    if (!token) {
      console.log("No token found in cookies");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Check if token is properly formatted (should be a JWT with 3 parts)
    if (!token.includes('.') || token.split('.').length !== 3) {
      console.log("Token is malformed, doesn't look like a valid JWT");
      return NextResponse.json({ error: "Invalid authentication token" }, { status: 401 });
    }
    
    const userId = await verifyToken(token);
    console.log("userId after verification:", userId);
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { code } = body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true }
    });

    if (!user?.twoFactorSecret) {
      return NextResponse.json({ error: "2FA not setup" }, { status: 400 });
    }

    try {
      const isValid = verifyTotpCode(user.twoFactorSecret, code);
      console.log('Verification result:', isValid);

      if (!isValid) {
        return NextResponse.json({ error: "Invalid code" }, { status: 400 });
      }
    } catch (err) {
      console.error('TOTP verification error:', err);
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();

    // Enable 2FA and save backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        backupCodes
      }
    });

    return NextResponse.json({ backupCodes });
  } catch (error) {
    console.error("Failed to verify 2FA:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
