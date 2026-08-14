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

interface Params {
  noteId: string;
}

export async function PUT(req: Request, { params }: { params: Params }) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { noteId } = params;
    const body = await req.json();
    const { encryptedTitle, encryptedContent, encryptionMetadata, lastModified, isPinned, tagIds } = body;

    if (!encryptedTitle || typeof encryptedTitle !== 'string' || 
        !encryptedContent || typeof encryptedContent !== 'string') {
      return new NextResponse('Invalid request: encryptedTitle and encryptedContent are required.', { status: 400 });
    }

    const note = await prisma.note.findUnique({
      where: { id: noteId },
    });

    if (!note || note.userId !== userId) {
      return new NextResponse('Note not found or access denied', { status: 404 });
    }

    const updatedNote = await prisma.note.update({
      where: {
        id: noteId,
        userId: userId, // Ensure the user owns the note
      },
      data: {
        encryptedTitle,
        encryptedContent,
        encryptionMetadata: encryptionMetadata || undefined,
        isPinned: typeof isPinned === 'boolean' ? isPinned : undefined, // Update if provided
        lastModified: lastModified ? new Date(lastModified) : new Date(), // Use provided or current date
        updatedAt: new Date(), // Explicitly set updatedAt
        // Handle tags update: if tagIds is provided and is an array, set them; otherwise, disconnect all tags.
        tags: (Array.isArray(tagIds)) 
              ? { set: tagIds.map((id: string) => ({ id })) } 
              : { set: [] }
      },
      include: {
        tags: true // Include tags in the response
      }
    });

    return NextResponse.json(updatedNote);
  } catch (error) {
    console.error('Error updating note:', error);
    // @ts-ignore
    if (error.code === 'P2025') { // Prisma error code for record not found
      return new NextResponse('Note not found', { status: 404 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Params }) {
  try {
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { noteId } = params;

    const note = await prisma.note.findUnique({
      where: { id: noteId },
    });

    if (!note || note.userId !== userId) {
      return new NextResponse('Note not found or access denied', { status: 404 });
    }

    await prisma.note.delete({
      where: {
        id: noteId,
        userId: userId, // Ensure the user owns the note
      },
    });

    return new NextResponse(null, { status: 204 }); // No content
  } catch (error) {
    console.error('Error deleting note:', error);
    // @ts-ignore
    if (error.code === 'P2025') { // Prisma error code for record not found during delete
      return new NextResponse('Note not found', { status: 404 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
