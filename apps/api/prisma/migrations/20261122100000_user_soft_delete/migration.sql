-- 회원 탈퇴: 유저 행을 지우지 않고 탈퇴 시각만 기록한다 (카드 원작자·거래 기록 유지)
-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
