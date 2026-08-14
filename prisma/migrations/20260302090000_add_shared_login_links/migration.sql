-- CreateTable
CREATE TABLE "SharedLoginLink" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SharedLoginLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedLoginLink_tokenHash_key" ON "SharedLoginLink"("tokenHash");

-- CreateIndex
CREATE INDEX "SharedLoginLink_ownerUserId_idx" ON "SharedLoginLink"("ownerUserId");

-- CreateIndex
CREATE INDEX "SharedLoginLink_expiresAt_idx" ON "SharedLoginLink"("expiresAt");

-- AddForeignKey
ALTER TABLE "SharedLoginLink"
ADD CONSTRAINT "SharedLoginLink_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
