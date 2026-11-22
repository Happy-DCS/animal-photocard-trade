// 모든 도메인이 함께 쓰는 API 호출 공통 부분. 도메인별 함수는 lib/{도메인}/api.js에 둔다 (예: lib/auth/api.js)

// API 서버 주소. .env.local의 NEXT_PUBLIC_API_URL로 바꿀 수 있다 (기본: 로컬 Express 서버)
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// API가 실패 응답을 주면 이 에러를 던진다. code는 명세서의 ErrorCode (예: EMAIL_ALREADY_EXISTS)
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// 401이 나도 토큰 재발급을 시도하지 않는 경로.
// 로그인·가입은 "자격 증명이 틀림"이라는 뜻의 401이고, 재발급·로그아웃·CSRF 조회는 재발급 흐름 자체라 다시 태우면 무한 반복된다
const NO_REFRESH_PATHS = [
  "/auth/signin",
  "/auth/signup",
  "/auth/signout",
  "/auth/refresh-token",
  "/auth/csrf-token",
];

// 공통 fetch: JSON으로 보내고 받는다 (body가 FormData면 그대로 보낸다 — Content-Type은 브라우저가 boundary와 함께 채움).
// 쿠키(httpOnly 토큰)를 함께 보내기 위해 credentials: "include".
// 브라우저에서 401을 받으면 access 토큰을 한 번 재발급하고 원래 요청을 1회 다시 보낸다.
// 재발급까지 실패하면 세션 만료를 알리고(onSessionExpired) 원래의 401 에러를 던진다
export async function apiFetch(path, options = {}) {
  try {
    return await request(path, options);
  } catch (error) {
    if (!shouldRefresh(path, error)) throw error;

    const refreshed = await refreshSession();
    if (!refreshed) {
      notifySessionExpired();
      throw error;
    }

    try {
      return await request(path, options);
    } catch (retryError) {
      // 새 토큰으로도 401이면 계정 자체를 쓸 수 없는 상태 (예: 삭제된 사용자)
      if (retryError instanceof ApiError && retryError.status === 401) notifySessionExpired();
      throw retryError;
    }
  }
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const isFormData = body instanceof FormData;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body && !isFormData ? { "Content-Type": "application/json", ...headers } : headers,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
  }

  if (response.status === 204) return null;

  // 성공은 { data }, 실패는 { code, message } (docs/conventions.md §3)
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      json?.code ?? "UNKNOWN_ERROR",
      json?.message ?? "요청에 실패했어요.",
    );
  }
  return json?.data;
}

function shouldRefresh(path, error) {
  // 서버 컴포넌트에서 부를 땐 브라우저 쿠키가 없으므로 재발급할 수 없다
  if (typeof window === "undefined") return false;
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  return !NO_REFRESH_PATHS.some((noRefreshPath) => path.startsWith(noRefreshPath));
}

// ── 토큰 재발급 (한 번에 하나만) ──
// refresh 토큰은 한 번 쓰면 서버에서 폐기된다(rotation). 401을 받은 요청 여럿이 각자 재발급하면
// 첫 요청만 성공하고 나머지는 이미 폐기된 토큰을 보내 실패하므로, 진행 중인 재발급이 있으면 그 결과를 함께 기다린다
let refreshPromise = null;

// 재발급에 성공하면 true, 실패(로그인 만료·refresh 토큰 없음)면 false
export function refreshSession() {
  refreshPromise ??= (async () => {
    try {
      await request("/auth/refresh-token", { method: "POST", headers: await csrfHeaders() });
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// ── 세션 만료 알림 ──
// AuthProvider가 구독해서 로그인 상태를 비운다 (보호 페이지는 그 결과로 /login으로 이동)
const sessionExpiredListeners = new Set();

export function onSessionExpired(listener) {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function notifySessionExpired() {
  sessionExpiredListeners.forEach((listener) => listener());
}

// 로그아웃·토큰 재발급·이미지 업로드처럼 상태를 바꾸는 요청에 필요한 CSRF 헤더.
// 웹과 API 도메인이 달라 쿠키를 직접 읽을 수 없으므로 서버에 값을 물어본 뒤 헤더로 보낸다
export async function csrfHeaders() {
  const { csrfToken } = await apiFetch("/auth/csrf-token");
  return { "X-CSRF-TOKEN": csrfToken };
}
