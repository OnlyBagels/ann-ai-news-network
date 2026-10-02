-- AlterEnum
ALTER TYPE "Category" ADD VALUE 'world';
ALTER TYPE "Category" ADD VALUE 'us';
ALTER TYPE "Category" ADD VALUE 'politics';
ALTER TYPE "Category" ADD VALUE 'business';
ALTER TYPE "Category" ADD VALUE 'crypto';
ALTER TYPE "Category" ADD VALUE 'tech';
ALTER TYPE "Category" ADD VALUE 'science';
ALTER TYPE "Category" ADD VALUE 'climate';
ALTER TYPE "Category" ADD VALUE 'health';
ALTER TYPE "Category" ADD VALUE 'sports';
ALTER TYPE "Category" ADD VALUE 'entertainment';
ALTER TYPE "Category" ADD VALUE 'gaming';
ALTER TYPE "Category" ADD VALUE 'internet';

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "sources" JSONB;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "lean" TEXT,
ADD COLUMN     "paywalled" BOOLEAN NOT NULL DEFAULT false;
