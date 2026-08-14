import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const prisma = new PrismaClient();

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

export async function validateUser(data: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  if (!user.password) {
    throw new Error('Invalid email or password');
  }

  const isValid = await verifyPassword(data.password, user.password);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  return user;
}

export async function createUser(data: RegisterInput) {
  const hashedPassword = await hashPassword(data.password);
  
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.fullName,
      password: hashedPassword,
    },
  });
}
