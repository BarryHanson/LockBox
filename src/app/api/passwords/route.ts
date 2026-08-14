import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { z } from "zod";
import { getUserById } from "@/lib/auth";

// Schema for password validation
const passwordSchema = z.object({
  title: z.string().min(1, "Title is required"),
  username: z.string().min(1, "Username/Email is required"),
  password: z.string().min(1, "Password is required"),
  url: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export async function GET() {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const passwords = await prisma.password.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(passwords);
  } catch (error) {
    console.error("Failed to fetch passwords:", error);
    return NextResponse.json(
      { error: "Failed to fetch passwords" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const json = await req.json();
    const { encryptionData, ...passwordData } = json;
    const validatedData = passwordSchema.parse(passwordData);

    // Calculate password strength (simple version)
    const strength = calculatePasswordStrength(validatedData.password);

    // Store the password with encryption metadata
    const password = await prisma.password.create({
      data: {
        ...validatedData,
        userId,
        strength,
        encryptionData: encryptionData || {},
      },
    });

    return NextResponse.json(password);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("Failed to create password:", error);
    return NextResponse.json(
      { error: "Failed to create password" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const json = await req.json();
    const { id, encryptionData, ...data } = json;

    const validatedData = passwordSchema.parse(data);

    // Verify ownership
    const password = await prisma.password.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!password || password.user.id !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Calculate password strength if password changed
    const strength = data.password !== password.password
      ? calculatePasswordStrength(data.password)
      : password.strength;

    const updatedPassword = await prisma.password.update({
      where: { id },
      data: {
        ...validatedData,
        strength,
        encryptionData: encryptionData || password.encryptionData || {},
      },
    });

    return NextResponse.json(updatedPassword);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("Failed to update password:", error);
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const token = cookies().get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await verifyToken(token);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // Verify ownership
    const password = await prisma.password.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!password || password.user.id !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.password.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete password:", error);
    return NextResponse.json(
      { error: "Failed to delete password" },
      { status: 500 }
    );
  }
}

function calculatePasswordStrength(password: string): number {
  let strength = 0;
  const maxScore = 6; // Maximum possible score
  
  // Length (up to 2 points)
  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;
  
  // Contains number (1 point)
  if (/\d/.test(password)) strength += 1;
  
  // Contains lowercase (1 point)
  if (/[a-z]/.test(password)) strength += 1;
  
  // Contains uppercase (1 point)
  if (/[A-Z]/.test(password)) strength += 1;
  
  // Contains special character (1 point)
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength += 1;
  
  // Convert to percentage
  return Math.round((strength / maxScore) * 100);
}
