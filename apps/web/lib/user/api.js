import { apiFetch } from "@/lib/api-client";

// 현재 로그인 사용자의 랜덤 포인트 추첨을 요청
export async function drawRandomPoint() {
  return apiFetch("/users/me/random-point", {
    method: "POST",
  });
}

// ── 마이페이지 ──

// PATCH /users/me — 닉네임 변경. 성공하면 { user } (GET /users/me와 같은 형태)
export function updateProfile({ nickname }) {
  return apiFetch("/users/me", { method: "PATCH", body: { nickname } });
}

// PATCH /users/me/password — 비밀번호 변경(이메일 가입자만). 204, 이 기기의 토큰은 새것으로 교체된다
export function changePassword({ currentPassword, newPassword, newPasswordConfirm }) {
  return apiFetch("/users/me/password", {
    method: "PATCH",
    body: { currentPassword, newPassword, newPasswordConfirm },
  });
}

// DELETE /users/me — 회원 탈퇴. 이메일 가입자는 password, 소셜 가입자는 confirmText("탈퇴합니다"). 204
export function withdraw({ password, confirmText }) {
  return apiFetch("/users/me", { method: "DELETE", body: { password, confirmText } });
}
