/**
 * DB-backed rate limiter — works across serverless instances.
 * Falls back to allowing the request if the DB is unavailable,
 * so a DB outage never locks out legitimate users.
 */
import { prisma } from '@/lib/prisma';

export type DbRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
};

export async function checkDbRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<DbRateLimitResult> {
  const now = new Date();

  try {
    // Occasionally purge stale entries (1% of calls) to keep the table lean.
    if (Math.random() < 0.01) {
      await prisma.rateLimitEntry.deleteMany({ where: { resetAt: { lt: now } } });
    }

    const existing = await prisma.rateLimitEntry.findUnique({ where: { key } });

    // Window expired or no record — start a fresh window with count = 1.
    if (!existing || existing.resetAt <= now) {
      const resetAt = new Date(now.getTime() + windowMs);
      await prisma.rateLimitEntry.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return { allowed: true, remaining: maxAttempts - 1 };
    }

    // Window is active and limit already reached.
    if (existing.count >= maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: existing.resetAt.getTime() - now.getTime(),
      };
    }

    // Increment within the active window.
    await prisma.rateLimitEntry.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return { allowed: true, remaining: maxAttempts - existing.count - 1 };
  } catch (error) {
    console.error('[db-rate-limit] DB error, failing open:', error);
    return { allowed: true, remaining: maxAttempts };
  }
}

export async function resetDbRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimitEntry.deleteMany({ where: { key } });
  } catch {
    // Non-fatal
  }
}
