import { apiFetch, csrfHeaders } from "@/lib/api-client";

// auth 도메인 API (/signup, /login 페이지에서 사용). 소셜 로그인은 API 주소로 이동만 하므로 여기에 없다

// POST /auth/signup — 성공하면 { user: { id, nickname, createdAt } }
export function signup({ email, nickname, password, passwordConfirm }) {
  return apiFetch("/auth/signup", {
    method: "POST",
    body: { email, nickname, password, passwordConfirm },
  });
}

// POST /auth/signin — 성공하면 { user }. 토큰은 httpOnly 쿠키로만 심어진다 (JS에서 읽을 수 없음)
export function signin({ email, password }) {
  return apiFetch("/auth/signin", { method: "POST", body: { email, password } });
}

// GET /users/me — 로그인한 유저 정보. 성공하면 { user }, 로그인 안 했으면 401
// (access 토큰이 만료됐으면 apiFetch가 재발급 후 한 번 더 시도한다)
export function getCurrentUser() {
  return apiFetch("/users/me");
}

// POST /auth/signout — 204
export async function signout() {
  return apiFetch("/auth/signout", { method: "POST", headers: await csrfHeaders() });
}

// 토큰 재발급(POST /auth/refresh-token)은 api-client.js의 refreshSession()이 401 처리 중에 자동으로 한다
