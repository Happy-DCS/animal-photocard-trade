import { createHash, randomBytes } from "node:crypto";

import { SignJWT, errors as joseErrors, jwtVerify } from "jose";

// access 토큰: API가 서명하는 짧은 JWT. 서버가 로컬에서 서명만 확인하면 되므로 요청마다 외부 왕복이 없다
// refresh 토큰: 추측 불가능한 랜덤 문자열. DB에는 해시만 두고 재발급 때마다 교체한다
export const ACCESS_TOKEN_EXPIRES_IN = 60 * 60; // 초 (1시간)
export const REFRESH_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60; // 초 (30일)

const ISSUER = "animal-photocard-trade-api";
const AUDIENCE = "animal-photocard-trade-web";
const ALGORITHM = "HS256";

let cachedSecret;
function getAccessSecret() {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET 환경 변수(32자 이상)가 필요합니다 (.env.example 참고)");
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export function signAccessToken(userId) {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRES_IN}s`)
    .sign(getAccessSecret());
}

// 검증에 성공하면 userId를, 서명·만료·발급자가 맞지 않으면 null을 돌려준다
export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return null;
    throw error;
  }
}

export function generateRefreshToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
