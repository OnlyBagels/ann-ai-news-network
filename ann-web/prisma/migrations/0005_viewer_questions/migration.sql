-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('received', 'screened', 'declined', 'answered', 'aired');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewerQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'received',
    "reason" TEXT,
    "answer" TEXT,
    "articleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "judge" JSONB,
    "segmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "ViewerQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "ViewerQuestion_status_createdAt_idx" ON "ViewerQuestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ViewerQuestion_userId_createdAt_idx" ON "ViewerQuestion"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ViewerQuestion" ADD CONSTRAINT "ViewerQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

