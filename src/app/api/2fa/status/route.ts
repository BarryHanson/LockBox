import { NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedApiUser(req);
    if (!authUser) {
      console.log('2FA status: No authenticated user found');
      return NextResponse.json({ error: "Unauthorized", twoFactorEnabled: false, emailTwoFactorEnabled: false }, { status: 401 });
    }
    
    // Get the user from the database with 2FA status
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        twoFactorEnabled: true,
        twoFactorEmailEnabled: true,
      }
    });
    
    console.log('2FA status for user:', authUser.id, 'is:', { totp: user?.twoFactorEnabled, email: user?.twoFactorEmailEnabled });
    
    if (!user) {
      return NextResponse.json({ error: "User not found", twoFactorEnabled: false, emailTwoFactorEnabled: false }, { status: 404 });
    }

    return NextResponse.json({ 
      enabled: user.twoFactorEnabled, // For backward compatibility
      twoFactorEnabled: user.twoFactorEnabled,
      emailTwoFactorEnabled: user.twoFactorEmailEnabled
    });
  } catch (error) {
    console.error("Failed to get 2FA status:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
