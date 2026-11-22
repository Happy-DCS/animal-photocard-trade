import { createHash, randomBytes } from "node:crypto";

import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";

import { ApiError } from "./api-error.js";

// Google OAuth 2.0 (Authorization Code + PKCE)를 API 서버가 직접 처리한다.
// Google Cloud Console > API 및 서비스 > 사용자 인증 정보에서 "웹 애플리케이션" OAuth 클라이언트를 만들고,
// 승인된 리디렉션 URI에 GOOGLE_REDIRECT_URI(예: http://localhost:4000/api/v1/auth/social/google/callback)를 등록한다
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function getConfig() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI 환경 변수가 필요합니다 (.env.example 참고)",
    );
  }
  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: GOOGLE_REDIRECT_URI,
  };
}

const invalidSocialToken = () =>
  new ApiError(
    401,
    "INVALID_SOCIAL_TOKEN",
    "소셜 로그인 정보가 올바르지 않습니다. 다시 시도해 주세요",
  );

// 1단계: Google 로그인 페이지 주소를 만든다.
// state(CSRF 방지)와 codeVerifier(PKCE)는 콜백에서 다시 확인해야 하므로 호출한 쪽이 쿠키에 보관한다
export function createGoogleAuthRequest() {
  const { clientId, redirectUri } = getConfig();
  const state = randomBytes(16).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  return { url: url.toString(), state, codeVerifier };
}

// 2단계: 콜백으로 받은 code를 토큰으로 바꾸고, id_token 서명을 검증해 Google 사용자 정보를 돌려준다
export async function fetchGoogleProfile({ code, codeVerifier }) {
  const { clientId, clientSecret, redirectUri } = getConfig();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.id_token) throw invalidSocialToken();

  let payload;
  try {
    ({ payload } = await jwtVerify(json.id_token, googleJwks, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
    }));
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) throw invalidSocialToken();
    throw error;
  }

  if (!payload.email || payload.email_verified !== true) {
    throw new ApiError(
      401,
      "INVALID_SOCIAL_TOKEN",
      "인증된 이메일이 있는 Google 계정이 필요합니다",
    );
  }

  return {
    providerUid: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : null,
  };
}
