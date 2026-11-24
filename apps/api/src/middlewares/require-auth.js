import { ACCESS_TOKEN_COOKIE } from "../lib/auth-cookies.js";
import { ApiError } from "../lib/api-error.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { findUserById } from "../repositories/user.repository.js";

// Authorization: Bearer <accessToken> 이 없으면 쿠키의 토큰을 쓴다.
// JWT 서명을 로컬에서 확인하므로 외부 인증 서버 왕복 없이 DB 조회 한 번으로 끝난다
export async function requireAuth(req, res, next) {
  const bearer = req.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const accessToken = bearer || req.cookies[ACCESS_TOKEN_COOKIE];
  if (!accessToken) {
    throw new ApiError(401, "UNAUTHORIZED", "로그인이 필요합니다");
  }

  const userId = await verifyAccessToken(accessToken);
  const user = userId ? await findUserById(userId) : null;
  // 탈퇴한 계정(deletedAt)은 세션이 모두 지워지지만, 이미 발급된 access 토큰이 남아 있어도 통과시키지 않는다
  if (!user || user.deletedAt) {
    throw new ApiError(401, "UNAUTHORIZED", "로그인이 필요합니다");
  }

  req.user = user;
  next();
}
