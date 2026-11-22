import { ApiError } from "../lib/api-error.js";
import { CSRF_TOKEN_COOKIE } from "../lib/auth-cookies.js";

// 상태를 바꾸지 않는 메서드는 CSRF 확인이 필요 없다
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// 아직 CSRF 쿠키가 없는(로그인 전) 요청이라 확인할 수 없는 경로. 성공하면 서버가 CSRF 쿠키를 새로 심는다
const EXEMPT_PATHS = new Set(["/api/v1/auth/signin", "/api/v1/auth/signup"]);

// double-submit 방식: 쿠키의 값과 X-CSRF-TOKEN 헤더의 값이 같아야 한다.
// 다른 사이트는 우리 쿠키를 자동으로 실어 보낼 수는 있어도 그 값을 읽어 헤더에 넣을 수는 없다
export function requireCsrfToken(req, res, next) {
  const fromHeader = req.get("X-CSRF-TOKEN");
  const fromCookie = req.cookies[CSRF_TOKEN_COOKIE];

  if (!fromHeader || !fromCookie || fromHeader !== fromCookie) {
    throw new ApiError(403, "CSRF_TOKEN_INVALID", "CSRF 토큰이 올바르지 않습니다");
  }
  next();
}

// app.js에서 모든 API 라우터 앞에 건다: GET이 아닌 요청은 (로그인·가입 제외) 모두 CSRF 확인을 거친다.
// 라우트마다 붙이지 않으므로 새 API를 추가해도 빠지지 않는다
export function csrfProtection(req, res, next) {
  // app.use("/api/v1", ...) 안에서는 req.path가 "/auth/signin"처럼 앞부분이 빠지므로 baseUrl과 합쳐 비교한다
  if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.has(`${req.baseUrl}${req.path}`)) {
    next();
    return;
  }
  requireCsrfToken(req, res, next);
}
