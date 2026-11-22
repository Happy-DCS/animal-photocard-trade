import { optional, refine, size, string, type, validate } from "superstruct";

import { ApiError } from "../lib/api-error.js";
import { clearAuthCookies, setAuthCookies } from "../lib/auth-cookies.js";
import * as authService from "../services/auth.service.js";
import * as userEventService from "../services/user-event.service.js";
import * as userService from "../services/user.service.js";

const NICKNAME_MAX_LENGTH = 20;

// PATCH /users/me — 앞뒤 공백을 뺀 1~20자
const UpdateProfileBody = type({
  nickname: refine(string(), "nickname", (value) => {
    const length = value.trim().length;
    return length >= 1 && length <= NICKNAME_MAX_LENGTH;
  }),
});

// PATCH /users/me/password — 새 비밀번호 규칙은 회원가입과 같다 (8자 이상)
const ChangePasswordBody = refine(
  type({
    currentPassword: size(string(), 1, Infinity),
    newPassword: size(string(), 8, Infinity),
    newPasswordConfirm: string(),
  }),
  "newPasswordConfirm",
  (body) => body.newPassword === body.newPasswordConfirm,
);

// DELETE /users/me — 이메일 가입자는 password, 소셜 가입자는 confirmText
const WithdrawBody = type({
  password: optional(string()),
  confirmText: optional(string()),
});

const VALIDATION_MESSAGES = {
  nickname: `닉네임은 1~${NICKNAME_MAX_LENGTH}자로 입력해 주세요`,
  currentPassword: "현재 비밀번호를 입력해 주세요",
  newPassword: "새 비밀번호는 8자 이상이어야 합니다",
  newPasswordConfirm: "새 비밀번호 확인이 일치하지 않습니다",
};

function validateBody(body, Struct) {
  const [error, value] = validate(body ?? {}, Struct);
  if (error) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      VALIDATION_MESSAGES[error.key ?? error.refinement] ?? "입력값이 올바르지 않습니다",
    );
  }
  return value;
}

// GET /users/me/events — 내 포인트·안읽은 알림 수가 바뀔 때마다 SSE로 받는다
export function events(req, res) {
  return userEventService.openUserEventStream(req, res);
}

export async function me(req, res) {
  const user = await userService.getCurrentUser(req.user);
  res.json({ data: { user } });
}

// PATCH /users/me — 닉네임 변경. 성공하면 바뀐 내 정보(GET /users/me와 같은 형태)
export async function updateProfile(req, res) {
  const body = validateBody(req.body, UpdateProfileBody);
  const user = await userService.updateNickname(req.user, body.nickname.trim());
  res.json({ data: { user } });
}

// PATCH /users/me/password — 비밀번호 변경. 다른 기기의 로그인은 끊고 이 기기에는 새 토큰 쿠키를 내려준다
export async function changePassword(req, res) {
  const body = validateBody(req.body, ChangePasswordBody);
  const session = await authService.changePassword({
    user: req.user,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });
  setAuthCookies(res, session);
  res.status(204).end();
}

// DELETE /users/me — 회원 탈퇴. 성공하면 인증 쿠키를 모두 지운다
export async function withdraw(req, res) {
  const body = validateBody(req.body, WithdrawBody);
  await userService.withdraw(req.user, body);
  clearAuthCookies(res);
  res.status(204).end();
}

// 현재 로그인 사용자의 랜덤 포인트 추첨을 처리
export async function drawRandomPoint(req, res) {
  const result = await userService.drawRandomPoint(req.user);

  res.json({ data: result });
}
