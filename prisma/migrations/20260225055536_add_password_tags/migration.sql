-- AlterTable
ALTER TABLE "Password" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
