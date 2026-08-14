import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// Environment variables validation - always require JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

// Validation schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64WithPadding = base64 + padding;
  const rawData = atob(base64WithPadding);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function generateToken(userId: string, tokenVersion = 0): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not set');
  }

  return jwt.sign(
    { userId, tokenVersion },
    jwtSecret,
    { expiresIn: '7d' }
  );
}

export async function verifyToken(token: string | undefined): Promise<string | null> {
  if (!token) {
    return null;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not set');
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);

    // Handle different possible payload structures
    let userId: string | null = null;

    if (typeof decoded === 'object') {
      // Check standard structure
      if ('userId' in decoded && typeof decoded.userId === 'string') {
        userId = decoded.userId;
      }
      // Check sub field which is sometimes used in JWTs
      else if ('sub' in decoded && typeof decoded.sub === 'string') {
        userId = decoded.sub;
      }
    }

    if (!userId) {
      return null;
    }

    // Check tokenVersion against database to ensure session hasn't been revoked
    if (typeof decoded === 'object' && 'tokenVersion' in decoded) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { tokenVersion: true },
      });
      if (!user || (user.tokenVersion ?? 0) !== decoded.tokenVersion) {
        return null;
      }
    }

    return userId;
  } catch (error) {
    return null;
  }
}

export async function createUser(data: RegisterInput) {
  const hashedPassword = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.fullName,
      password: hashedPassword,
    },
  });

  const token = generateToken(user.id);
  return { user, token };
}

export async function validateUser(data: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      createdAt: true,
      updatedAt: true,
      twoFactorSecret: true,
      twoFactorEnabled: true,
      backupCodes: true,
      emailVerified: true,
      image: true,
    },
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValid = await verifyPassword(data.password, user.password || '');
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  const token = generateToken(user.id);
  return { user, token };
}

export async function getUserById(id: string | null) {
  if (!id) return null;

  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });
}
