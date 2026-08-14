-- Add location and device metadata for account activity entries
ALTER TABLE "LoginHistory"
ADD COLUMN "city" TEXT,
ADD COLUMN "deviceType" TEXT;