/*
  Warnings:

  - You are about to drop the column `encryptedData` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `encryptedFileName` on the `File` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `Password` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "File" DROP COLUMN "encryptedData",
DROP COLUMN "encryptedFileName",
ADD COLUMN     "authTag" TEXT,
ADD COLUMN     "encryptedName" TEXT,
ADD COLUMN     "iv" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "Password" DROP COLUMN "tags";
