import { getServerSession } from 'next-auth/next';
import { jwtVerify } from 'jose';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export type AuthenticatedApiUser = {
  id: string;
  email: string | null;
  name: string | null;
};

function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name === 'token') {
      const value = rest.join('=');
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

async function resolveUserFromJwtToken(token: string): Promise<AuthenticatedApiUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = typeof payload.userId === 'string' ? payload.userId : null;
    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return user;
  } catch {
    return null;
  }
}

async function resolveUserFromNextAuthSession(): Promise<AuthenticatedApiUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return null;
  }

  if (session.user.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    if (user) {
      return user;
    }
  }

  if (!session.user.email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return user;
}

export async function getAuthenticatedApiUser(req: Request): Promise<AuthenticatedApiUser | null> {
  const token = extractTokenFromRequest(req);
  if (token) {
    const user = await resolveUserFromJwtToken(token);
    if (user) {
      return user;
    }
  }

  return resolveUserFromNextAuthSession();
}
