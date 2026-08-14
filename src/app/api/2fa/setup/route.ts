import { NextResponse } from "next/server";
import { authenticator } from "otplib";
import { verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const cookieStore = req.headers.get("cookie");
    console.log("Cookie header:", cookieStore);
    
    if (!cookieStore) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Try to extract token more carefully
    let token;
    const cookies = cookieStore.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      console.log("Checking cookie:", cookie);
      if (cookie.startsWith('token=')) {
        token = cookie.substring(6); // 'token='.length === 6
        break;
      }
    }
    
    if (!token) {
      // Fallback to original method
      token = cookieStore.split("token=")[1]?.split(";")[0];
      console.log("Using fallback token extraction:", token ? "Found token" : "No token");
    }
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    console.log("Token found (first 10 chars):", token.substring(0, 10) + '...');
    
    // Try to manually decode the token to check its structure
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        console.log("Token payload:", payload);
      }
    } catch (e) {
      console.log("Failed to manually decode token:", e);
    }
    
    const userId = await verifyToken(token);
    console.log("userId after verification:", userId);
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Configure authenticator with standard settings
    authenticator.options = {
      window: 1,
      step: 30,
      digits: 6
    };
    
    // Get user's email and check if 2FA is already enabled
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent re-enabling if already enabled
    if (user.twoFactorEnabled) {
      return NextResponse.json({ error: "2FA is already enabled" }, { status: 400 });
    }
    
    // Generate a new secret for the user
    const secret = authenticator.generateSecret(20);
    console.log('Generated new 2FA secret:', secret);

    // Save the secret temporarily (we'll enable it after verification)
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret }
    });

    // Generate otpauth URL for QR code
    const otpauth = authenticator.keyuri(
      user.email,
      "LockBox",
      secret
    );
    console.log('Generated otpauth URL:', otpauth);

    return NextResponse.json({ 
      qrCode: otpauth,
      secret 
    });
  } catch (error) {
    console.error("Failed to setup 2FA:", error);
    console.error("2FA setup error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
