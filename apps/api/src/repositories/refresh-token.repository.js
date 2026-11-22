import { prisma } from "../lib/prisma.js";

export function createRefreshToken({ userId, tokenHash, expiresAt }, db = prisma) {
  return db.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
}

export function findRefreshTokenByHash(tokenHash, db = prisma) {
  return db.refreshToken.findUnique({ where: { tokenHash } });
}

// deleteMany는 행이 없어도 에러를 내지 않으므로, count로 "내가 지웠는지"를 판단할 수 있다 (동시 재발급 방지)
export function deleteRefreshTokenByHash(tokenHash, db = prisma) {
  return db.refreshToken.deleteMany({ where: { tokenHash } });
}

export function deleteExpiredRefreshTokens(userId, db = prisma) {
  return db.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
}
