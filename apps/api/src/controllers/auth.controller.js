import { refine, size, string, type, validate } from "superstruct";

import { ApiError } from "../lib/api-error.js";
import {
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  clearOAuthStateCookie,
  readOAuthStateCookie,
  setAuthCookies,
  setCsrfCookie,
  setOAuthStateCookie,
} from "../lib/auth-cookies.js";
import * as authService from "../services/auth.service.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3000";

const NonEmpty = refine(string(), "nonEmpty", (value) => value.trim() !== "");

// POST /auth/signup 본문 형식
const SignupBody = refine(
  type({
    email: refine(string(), "email", (value) => EMAIL_PATTERN.test(value.trim())),
    nickname: NonEmpty,
    password: size(string(), 8, Infinity),
    passwordConfirm: string(),
  }),
  "passwordConfirm",
  (body) => body.password === body.passwordConfirm,
);

// POST /auth/signin
const SigninBody = type({
  email: NonEmpty,
  password: NonEmpty,
});

const VALIDATION_MESSAGES = {
  email: "이메일 형식이 올바르지 않습니다",
  nickname: "닉네임을 입력해 주세요",
  password: "비밀번호는 8자 이상이어야 합니다",
  passwordConfirm: "비밀번호 확인이 일치하지 않습니다",
};

function validateBody(body, Struct) {
  const [error, value] = validate(body, Struct);
  if (error) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      VALIDATION_MESSAGES[error.key ?? "passwordConfirm"] ?? "입력값이 올바르지 않습니다",
    );
  }
  return value;
}

export async function signup(req, res) {
  const body = validateBody(req.body, SignupBody);
  const user = await authService.signup({
    email: body.email.trim().toLowerCase(),
    nickname: body.nickname.trim(),
    password: body.password,
  });
  res.status(201).json({ data: { user } });
}

// 토큰은 httpOnly 쿠키로만 내려준다 (응답 본문에 실으면 JS가 읽을 수 있어 httpOnly의 의미가 없어진다)
export async function signin(req, res) {
  const body = validateBody(req.body, SigninBody);
  const { user, session } = await authService.signin({
    email: body.email.trim().toLowerCase(),
    password: body.password,
  });

  setAuthCookies(res, session);
  setCsrfCookie(res);
  res.json({ data: { user } });
}

export async function signout(req, res) {
  await authService.signout(req.cookies[REFRESH_TOKEN_COOKIE]);

  clearAuthCookies(res);
  res.status(204).end();
}

export async function refreshToken(req, res) {
  try {
    const session = await authService.refresh(req.cookies[REFRESH_TOKEN_COOKIE]);
    setAuthCookies(res, session);
    res.status(204).end();
  } catch (error) {
    // 쓸 수 없는 refresh 토큰이면 쿠키도 지워서 다음 요청이 같은 실패를 반복하지 않게 한다
    if (error instanceof ApiError) clearAuthCookies(res);
    throw error;
  }
}

// GET /auth/social/:provider — provider 로그인 페이지로 보낸다
export function socialStart(req, res) {
  const { url, state, codeVerifier } = authService.startSocialLogin(req.params.provider);

  setOAuthStateCookie(res, { state, codeVerifier });
  res.redirect(url);
}

// GET /auth/social/:provider/callback — provider가 code·state를 붙여 돌려보내는 곳
export async function socialFinish(req, res) {
  const savedState = readOAuthStateCookie(req);
  clearOAuthStateCookie(res);

  try {
    const { session } = await authService.finishSocialLogin(req.params.provider, {
      code: typeof req.query.code === "string" ? req.query.code : null,
      state: typeof req.query.state === "string" ? req.query.state : null,
      savedState,
    });
    setAuthCookies(res, session);
    setCsrfCookie(res);
    res.redirect(`${WEB_URL}/`);
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(error);
    const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
    res.redirect(`${WEB_URL}/login?error=${code}`);
  }
}

// GET /auth/csrf-token — 로그아웃·토큰 재발급 때 X-CSRF-TOKEN 헤더에 넣을 값.
// 웹과 API 도메인이 달라 JS가 쿠키를 직접 읽을 수 없으므로 이 응답으로 알려준다 (쿠키가 없으면 새로 발급)
export function csrfToken(req, res) {
  const token = req.cookies[CSRF_TOKEN_COOKIE] ?? setCsrfCookie(res);
  res.json({ data: { csrfToken: token } });
}
