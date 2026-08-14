import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    const cookieHeader = req.headers.get('cookie') || '';
    for (const rawCookie of cookieHeader.split(';')) {
      const cookie = rawCookie.trim();
      if (!cookie) continue;

      const [name, ...rest] = cookie.split('=');
      if (name === 'token' || name === '__Host-token') {
        token = decodeURIComponent(rest.join('='));
        break;
      }
    }
  }

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.userId || typeof payload.userId !== 'string') {
      return null;
    }
    return payload.userId;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const tags = await prisma.tag.findMany({
      where: { userId },
      orderBy: { name: 'asc' }, // Optional: order tags alphabetically
    });

    return NextResponse.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return new NextResponse('Invalid request: Tag name is required and must be a non-empty string.', { status: 400 });
    }

    const tagName = name.trim();

    // Check if tag with the same name already exists for this user
    const existingTag = await prisma.tag.findUnique({
      where: {
        userId_name: {
          userId: userId,
          name: tagName,
        },
      },
    });

    if (existingTag) {
      return new NextResponse('Tag with this name already exists.', { status: 409 });
    }

    const newTag = await prisma.tag.create({
      data: {
        name: tagName,
        userId,
      },
    });

    return NextResponse.json(newTag, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    // Handle potential Prisma unique constraint violation if race condition occurs (though less likely with prior check)
    if (error instanceof Error && 'code' in error && (error as any).code === 'P2002') {
        return new NextResponse('Tag with this name already exists.', { status: 409 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
