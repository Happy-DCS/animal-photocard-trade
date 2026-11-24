import { randomUUID } from "node:crypto";

import { ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from "./tokens.js";

export const ACCESS_TOKEN_COOKIE = "accessToken";
export const REFRESH_TOKEN_COOKIE = "refreshToken";
export const CSRF_TOKEN_COOKIE = "csrfToken";
export const OAUTH_STATE_COOKIE = "oauthState";

// refresh 토큰은 재발급·로그아웃 때만 필요하므로 auth 경로에만 실려 가게 한다 (다른 API 요청에 노출되지 않음)
const AUTH_PATH = "/api/v1/auth";
const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000; // 소셜 로그인 왕복에 충분한 10분

// 배포에서는 웹과 API 도메인이 다르므로(교차 사이트) 쿠키가 오가려면 sameSite: "none" + secure(https)가 필요하다.
// 교차 사이트 배포는 CORS_ENABLED=true 로 켜므로, 그 값으로 배포 여부를 판단한다.
// 로컬(CORS_ENABLED=false, http://localhost:3000 ↔ 4000)은 같은 사이트이고 http라서 lax + secure 끔
const isCrossSite = process.env.CORS_ENABLED === "true";
const BASE_OPTIONS = {
  httpOnly: true,
  secure: isCrossSite,
  sameSite: isCrossSite ? "none" : "lax",
  path: "/",
};
const REFRESH_OPTIONS = { ...BASE_OPTIONS, path: AUTH_PATH };
const OAUTH_STATE_OPTIONS = { ...BASE_OPTIONS, path: `${AUTH_PATH}/social` };

// 로그인·토큰 재발급 후 토큰을 쿠키로 내려준다. CSRF 쿠키는 여기서 건드리지 않는다
// (재발급 때마다 CSRF 값이 바뀌면 클라이언트가 들고 있던 값이 무효가 되어 다음 요청이 403이 난다)
export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...BASE_OPTIONS,
    maxAge: ACCESS_TOKEN_EXPIRES_IN * 1000,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...REFRESH_OPTIONS,
    maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
  });
}

// CSRF 토큰 쿠키를 새로 발급하고 그 값을 돌려준다.
// 도메인이 다르면 웹 JS가 이 쿠키를 읽을 수 없으므로 값은 GET /auth/csrf-token 응답으로 따로 알려준다
export function setCsrfCookie(res) {
  const token = randomUUID();
  res.cookie(CSRF_TOKEN_COOKIE, token, {
    ...BASE_OPTIONS,
    maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
  });
  return token;
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, BASE_OPTIONS);
  res.clearCookie(REFRESH_TOKEN_COOKIE, REFRESH_OPTIONS);
  // Supabase Auth 시절 path=/ 로 심었던 refresh 쿠키도 함께 정리한다
  res.clearCookie(REFRESH_TOKEN_COOKIE, BASE_OPTIONS);
  res.clearCookie(CSRF_TOKEN_COOKIE, BASE_OPTIONS);
}

// 소셜 로그인 시작 때 state·codeVerifier를 묶어 저장하고, 콜백에서 꺼내 확인한다
export function setOAuthStateCookie(res, { state, codeVerifier }) {
  res.cookie(OAUTH_STATE_COOKIE, JSON.stringify({ state, codeVerifier }), {
    ...OAUTH_STATE_OPTIONS,
    maxAge: OAUTH_STATE_MAX_AGE,
  });
}

export function readOAuthStateCookie(req) {
  try {
    const value = JSON.parse(req.cookies[OAUTH_STATE_COOKIE] ?? "null");
    if (typeof value?.state === "string" && typeof value?.codeVerifier === "string") return value;
  } catch {
    // 형식이 깨진 쿠키는 없는 것으로 본다
  }
  return null;
}

export function clearOAuthStateCookie(res) {
  res.clearCookie(OAUTH_STATE_COOKIE, OAUTH_STATE_OPTIONS);
}
