/**
 * Simple in-memory rate limiter using a sliding window approach.
 * For production at scale, consider using Redis-based rate limiting.
 */

type RateLimitEntry = {
  timestamps: number[];
};

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove entries where all timestamps are older than 30 minutes
    if (entry.timestamps.every(ts => now - ts > 30 * 60 * 1000)) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
};

/**
 * Check if a request is within the rate limit.
 * @param key - Unique identifier for the rate limit (e.g., "login:ip:1.2.3.4")
 * @param maxAttempts - Maximum number of attempts allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Whether the request is allowed and how many attempts remain
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter(ts => now - ts < windowMs);

  if (entry.timestamps.length >= maxAttempts) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = windowMs - (now - oldestInWindow);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    };
  }

  // Record this attempt
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: maxAttempts - entry.timestamps.length,
  };
}

/**
 * Reset rate limit for a given key (e.g., after successful login).
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}
