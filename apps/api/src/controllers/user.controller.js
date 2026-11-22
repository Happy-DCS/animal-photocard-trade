import * as userService from "../services/user.service.js";

export async function me(req, res) {
  const user = await userService.getCurrentUser(req.user);
  res.json({ data: { user } });
}

// 현재 로그인 사용자의 랜덤 포인트 추첨을 처리
export async function drawRandomPoint(req, res) {
  const result = await userService.drawRandomPoint(req.user);

  res.json({ data: result });
}
