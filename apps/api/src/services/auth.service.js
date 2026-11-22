import { randomInt } from "node:crypto";

import { ApiError } from "../lib/api-error.js";
import { createGoogleAuthRequest, fetchGoogleProfile } from "../lib/google-oauth.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../lib/password.js";
import {
  REFRESH_TOKEN_EXPIRES_IN,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "../lib/tokens.js";
import {
  createRefreshToken,
  deleteAllRefreshTokens,
  deleteExpiredRefreshTokens,
  deleteRefreshTokenByHash,
  findRefreshTokenByHash,
} from "../repositories/refresh-token.repository.js";
import {
  createUser,
  findUserByEmail,
  findUserByNickname,
  findUserByProvider,
} from "../repositories/user.repository.js";

const LOCAL_PROVIDER = "local";
const SOCIAL_PROVIDERS = ["google"];

const invalidCredentials = () =>
  new ApiError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다");

export async function signup({ email, nickname, password }) {
  if (await findUserByEmail(email)) {
    throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다");
  }
  if (await findUserByNickname(nickname)) {
    throw new ApiError(409, "NICKNAME_ALREADY_EXISTS", "이미 사용 중인 닉네임입니다");
  }

  let user;
  try {
    user = await createUser({
      email,
      nickname,
      provider: LOCAL_PROVIDER,
      passwordHash: await hashPassword(password),
    });
  } catch (error) {
    // 위 조회와 생성 사이에 같은 값으로 동시 가입한 경우 unique 제약이 막아 준다
    throw toDuplicateError(error) ?? error;
  }

  return { id: user.id, nickname: user.nickname, createdAt: user.createdAt };
}

export async function signin({ email, password }) {
  const user = await findUserByEmail(email);
  if (!user?.passwordHash) {
    // 없는 이메일·소셜 전용 계정도 같은 시간을 쓰고 같은 에러를 내서 가입 여부를 숨긴다
    await verifyAgainstDummy(password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw invalidCredentials();
  }

  return { user: toPublicUser(user), session: await issueSession(user.id) };
}

// 비밀번호 변경 (이메일 가입 계정만). 다른 기기의 로그인은 모두 끊고, 지금 기기용 새 세션을 돌려준다.
// 현재 비밀번호가 틀리면 401이 아닌 400을 쓴다 — 401은 웹이 "토큰 만료"로 보고 재발급을 시도하기 때문이다
export async function changePassword({ user, currentPassword, newPassword }) {
  if (!user.passwordHash) {
    throw new ApiError(400, "PASSWORD_NOT_SET", "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다");
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ApiError(400, "INVALID_PASSWORD", "현재 비밀번호가 올바르지 않습니다");
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new ApiError(400, "SAME_PASSWORD", "현재 비밀번호와 다른 비밀번호를 입력해 주세요");
  }

  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await deleteAllRefreshTokens(user.id, tx);
    return issueSession(user.id, tx);
  });
}

// 로그아웃: 이 브라우저의 refresh 토큰만 폐기한다 (다른 기기의 로그인은 유지)
export async function signout(refreshToken) {
  if (!refreshToken) return;
  await deleteRefreshTokenByHash(hashToken(refreshToken));
}

// 토큰 재발급: refresh 토큰을 한 번 쓰면 폐기하고 새것으로 바꾼다 (rotation)
export async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new ApiError(401, "REFRESH_TOKEN_INVALID", "리프레시 토큰이 없습니다");
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await findRefreshTokenByHash(tokenHash);
  if (!stored) {
    throw new ApiError(401, "REFRESH_TOKEN_INVALID", "리프레시 토큰이 올바르지 않습니다");
  }
  if (stored.expiresAt <= new Date()) {
    await deleteRefreshTokenByHash(tokenHash);
    throw new ApiError(
      401,
      "REFRESH_TOKEN_EXPIRED",
      "로그인이 만료되었습니다. 다시 로그인해 주세요",
    );
  }

  return prisma.$transaction(async (tx) => {
    // 같은 토큰으로 동시에 재발급을 요청하면 먼저 지운 요청 하나만 새 토큰을 받는다
    const { count } = await deleteRefreshTokenByHash(tokenHash, tx);
    if (count === 0) {
      throw new ApiError(401, "REFRESH_TOKEN_INVALID", "리프레시 토큰이 올바르지 않습니다");
    }
    return issueSession(stored.userId, tx);
  });
}

// 소셜 로그인 1단계: provider 로그인 페이지 주소와, 콜백에서 확인할 state·codeVerifier
export function startSocialLogin(provider) {
  assertSocialProvider(provider);
  return createGoogleAuthRequest();
}

// 소셜 로그인 2단계: code를 Google 사용자 정보로 바꾸고, 처음이면 가입시킨 뒤 세션을 발급한다
export async function finishSocialLogin(provider, { code, state, savedState }) {
  assertSocialProvider(provider);
  if (!code || !state || !savedState || state !== savedState.state) {
    throw new ApiError(
      401,
      "INVALID_SOCIAL_TOKEN",
      "소셜 로그인 정보가 없습니다. 다시 시도해 주세요",
    );
  }

  const profile = await fetchGoogleProfile({ code, codeVerifier: savedState.codeVerifier });
  let user = await findUserByProvider(provider, profile.providerUid);

  if (!user) {
    // 명세: provider가 달라도 같은 이메일이면 반려 (로그인 수단당 하나의 계정, 계정 연동 미지원)
    if (await findUserByEmail(profile.email)) {
      throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "다른 방식으로 이미 가입된 이메일입니다");
    }
    try {
      user = await createUser({
        email: profile.email,
        nickname: await makeUniqueNickname(profile.name ?? profile.email.split("@")[0]),
        provider,
        providerUid: profile.providerUid,
      });
    } catch (error) {
      throw toDuplicateError(error) ?? error;
    }
  }

  return { user: toPublicUser(user), session: await issueSession(user.id) };
}

async function issueSession(userId, db = prisma) {
  const refreshToken = generateRefreshToken();
  await deleteExpiredRefreshTokens(userId, db);
  await createRefreshToken(
    {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN * 1000),
    },
    db,
  );
  return { accessToken: await signAccessToken(userId), refreshToken };
}

function assertSocialProvider(provider) {
  if (!SOCIAL_PROVIDERS.includes(provider)) {
    throw new ApiError(400, "VALIDATION_ERROR", "지원하지 않는 로그인 방식입니다");
  }
}

// Prisma unique 제약 위반(P2002)을 409 응답으로 바꾼다
function toDuplicateError(error) {
  if (error?.code !== "P2002") return null;
  const target = String(
    error.meta?.target ?? error.meta?.driverAdapterError?.cause?.constraint ?? "",
  );
  if (target.includes("nickname")) {
    return new ApiError(409, "NICKNAME_ALREADY_EXISTS", "이미 사용 중인 닉네임입니다");
  }
  return new ApiError(409, "EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다");
}

// 소셜 가입 시 닉네임이 겹치면 뒤에 숫자 4자리를 붙여 본다
async function makeUniqueNickname(baseNickname) {
  const base = baseNickname.trim().slice(0, 16) || "멍냥이";
  if (!(await findUserByNickname(base))) return base;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}${randomInt(1000, 9999)}`;
    if (!(await findUserByNickname(candidate))) return candidate;
  }
  throw new ApiError(
    409,
    "NICKNAME_ALREADY_EXISTS",
    "닉네임을 만들지 못했습니다. 다시 시도해 주세요",
  );
}

// 응답에 실을 사용자 정보 (point는 BigInt라 JSON으로 바로 못 보내므로 숫자로 바꾼다)
export function toPublicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    point: Number(user.point),
    lastDrawAt: user.lastDrawAt,
    createdAt: user.createdAt,
  };
}
