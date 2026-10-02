-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "aiOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastItemCount" INTEGER,
ADD COLUMN     "lastSuccessAt" TIMESTAMP(3);

