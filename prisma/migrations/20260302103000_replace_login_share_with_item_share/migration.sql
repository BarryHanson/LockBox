-- Drop old login-share table if present
DROP TABLE IF EXISTS "SharedLoginLink";

-- CreateEnum
CREATE TYPE "SharedItemType" AS ENUM ('PASSWORD', 'CARD', 'NOTE', 'FILE');

-- CreateTable
CREATE TABLE "SharedItemLink" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "itemType" "SharedItemType" NOT NULL,
  "itemId" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "payloadCipher" TEXT NOT NULL,
  "payloadIv" TEXT NOT NULL,
  "payloadSalt" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SharedItemLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedItemLink_publicId_key" ON "SharedItemLink"("publicId");

-- CreateIndex
CREATE INDEX "SharedItemLink_ownerUserId_idx" ON "SharedItemLink"("ownerUserId");

-- CreateIndex
CREATE INDEX "SharedItemLink_itemType_itemId_idx" ON "SharedItemLink"("itemType", "itemId");

-- CreateIndex
CREATE INDEX "SharedItemLink_publicId_idx" ON "SharedItemLink"("publicId");

-- CreateIndex
CREATE INDEX "SharedItemLink_expiresAt_idx" ON "SharedItemLink"("expiresAt");

-- AddForeignKey
ALTER TABLE "SharedItemLink"
ADD CONSTRAINT "SharedItemLink_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
