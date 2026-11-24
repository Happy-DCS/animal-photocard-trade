import { Router } from "express";

import * as userController from "../controllers/user.controller.js";
import {
  accountUpdateRateLimit,
  currentUserRateLimit,
  randomPointRateLimit,
} from "../middlewares/rate-limit.js";
import { requireAuth } from "../middlewares/require-auth.js";

export const userRouter = Router();

userRouter.get("/me", currentUserRateLimit, requireAuth, userController.me);

// 마이페이지: 닉네임 변경 · 비밀번호 변경(이메일 가입자) · 회원 탈퇴
userRouter.patch("/me", accountUpdateRateLimit, requireAuth, userController.updateProfile);
userRouter.patch(
  "/me/password",
  accountUpdateRateLimit,
  requireAuth,
  userController.changePassword,
);
userRouter.delete("/me", accountUpdateRateLimit, requireAuth, userController.withdraw);

// 내 포인트·안읽은 알림 수 실시간 수신 (SSE). 연결이 끊기면 브라우저가 다시 연결하므로 /me와 같은 제한을 쓴다
userRouter.get("/me/events", currentUserRateLimit, requireAuth, userController.events);

// 현재 사용자의 랜덤 포인트 추첨을 처리
userRouter.post(
  "/me/random-point",
  randomPointRateLimit,
  requireAuth,
  userController.drawRandomPoint,
);
