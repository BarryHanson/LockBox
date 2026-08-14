import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

async function getUserIdFromToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    const cookieHeader = req.headers.get('cookie');
    if (cookieHeader) {
      const cookies = cookieHeader.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'token') {
          token = decodeURIComponent(value);
          break;
        }
      }
    }
  }

  if (!token) {
    console.log('No token found for notes API');
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.userId || typeof payload.userId !== 'string') {
      console.log('Invalid token payload for notes API');
      return null;
    }
    return payload.userId;
  } catch (error) {
    console.log('Invalid token for notes API:', error);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { encryptedTitle, encryptedContent, encryptionMetadata, lastModified, tagIds } = body;

    if (!encryptedTitle || typeof encryptedTitle !== 'string' || 
        !encryptedContent || typeof encryptedContent !== 'string') {
      return new NextResponse('Invalid request: encryptedTitle and encryptedContent are required and must be strings.', { status: 400 });
    }

    const note = await prisma.note.create({
      data: {
        userId,
        encryptedTitle,
        encryptedContent,
        encryptionMetadata: encryptionMetadata || undefined, // Prisma handles optional Json field
        lastModified: lastModified ? new Date(lastModified) : new Date(), // Use provided lastModified or current date
        ...(tagIds && Array.isArray(tagIds) && tagIds.length > 0 && { 
          tags: {
            connect: tagIds.map((id: string) => ({ id }))
          }
        })
      }
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Error creating note:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const notes = await prisma.note.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
