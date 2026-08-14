import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { z } from "zod";
import { getUserById } from "@/lib/auth";

// Schema for card validation
const cardSchema = z.object({
  name: z.string().min(1, "Name is required"),
  cardNumber: z.string().min(1, "Card number is required"), // More flexible validation to handle encrypted data
  expiryMonth: z.number().min(1).max(12),
  expiryYear: z.number().min(2000), // More flexible year validation
  cvv: z.string().min(1, "CVV is required"), // More flexible validation to handle encrypted data
  billingAddress: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
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

    const cards = await prisma.card.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    // Return cards without masking - client will handle masking
    return NextResponse.json(cards);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch cards" },
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
    const { encryptionData, ...cardData } = json;

    try {
      const validatedData = cardSchema.parse(cardData);

      // Store the card with encryption metadata
      const card = await prisma.card.create({
        data: {
          ...validatedData,
          userId,
          encryptionData: encryptionData || {},
        },
      });

      // Return card without masking - client will handle masking
      return NextResponse.json(card);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return NextResponse.json({ error: validationError.errors }, { status: 400 });
      }
      throw validationError; // Re-throw if it's not a ZodError
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create card" },
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

    const validatedData = cardSchema.parse(data);

    // Verify ownership
    const card = await prisma.card.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!card || card.user.id !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updatedCard = await prisma.card.update({
      where: { id },
      data: {
        ...validatedData,
        encryptionData: encryptionData || card.encryptionData || {},
      },
    });

    // Return the card data without masking - client will handle masking
    return NextResponse.json(updatedCard);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update card" },
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
    const card = await prisma.card.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!card || card.user.id !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.card.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete card" },
      { status: 500 }
    );
  }
}
