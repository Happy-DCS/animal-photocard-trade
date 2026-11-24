-- Supabase Auth 대신 API가 직접 인증한다: 비밀번호 해시 컬럼 + 리프레시 토큰 테이블

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "providerUid" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

-- 기존 local 계정의 providerUid는 Supabase Auth uid라 더 이상 의미가 없다
UPDATE "User" SET "providerUid" = NULL WHERE "provider" = 'local';

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
