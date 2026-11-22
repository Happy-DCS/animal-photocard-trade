import * as userEventService from "../services/user-event.service.js";
import * as userService from "../services/user.service.js";

// GET /users/me/events — 내 포인트·안읽은 알림 수가 바뀔 때마다 SSE로 받는다
export function events(req, res) {
  return userEventService.openUserEventStream(req, res);
}

export async function me(req, res) {
  const user = await userService.getCurrentUser(req.user);
  res.json({ data: { user } });
}

// 현재 로그인 사용자의 랜덤 포인트 추첨을 처리
export async function drawRandomPoint(req, res) {
  const result = await userService.drawRandomPoint(req.user);

  res.json({ data: result });
}
