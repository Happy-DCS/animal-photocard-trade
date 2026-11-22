import { Router } from "express";

import * as authController from "../controllers/auth.controller.js";

export const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/signin", authController.signin);
authRouter.post("/signout", authController.signout);
authRouter.post("/refresh-token", authController.refreshToken);
authRouter.get("/csrf-token", authController.csrfToken);

// 소셜 로그인: 브라우저가 /social/google 로 이동 -> Google -> /social/google/callback 으로 복귀 -> 웹으로 리다이렉트
authRouter.get("/social/:provider/callback", authController.socialFinish);
authRouter.get("/social/:provider", authController.socialStart);
