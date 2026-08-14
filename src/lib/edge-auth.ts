import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function generateToken(userId: string, tokenVersion = 0): Promise<string> {
  const token = await new SignJWT({ userId, tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(JWT_SECRET);

  return token;
}

export async function verifyToken(token: string): Promise<string | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.userId && typeof payload.userId === 'string') {
      return payload.userId;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function getTokenFromCookies(): string | undefined {
  return cookies().get('token')?.value;
}

export function setTokenCookie(token: string): void {
  cookies().set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}
