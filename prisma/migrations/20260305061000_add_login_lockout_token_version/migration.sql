-- Add account lockout and token version columns for auth hardening
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
