-- CreateEnum
CREATE TYPE "DeveloperRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "DeveloperRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DeveloperRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeveloperRequest_status_createdAt_idx" ON "DeveloperRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeveloperRequest_userId_createdAt_idx" ON "DeveloperRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeveloperRequest" ADD CONSTRAINT "DeveloperRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperRequest" ADD CONSTRAINT "DeveloperRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
