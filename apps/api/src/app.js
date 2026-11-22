import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { LOCAL_UPLOAD_DIR, LOCAL_UPLOAD_ROUTE, isLocalStorage } from "./lib/image-storage.js";
import { csrfProtection } from "./middlewares/csrf.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";
import { authRouter } from "./routes/auth.routes.js";
import { cardRouter } from "./routes/card.routes.js";
import { exchangeRouter } from "./routes/exchange.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { imageRouter } from "./routes/image.routes.js";
import { notificationRouter } from "./routes/notification.routes.js";
import { saleRouter } from "./routes/sale.routes.js";
import { userRouter } from "./routes/user.routes.js";
BigInt.prototype.toJSON = function () {
  return Number(this);
};

export const app = express();

// Render 등 리버스 프록시 뒤에서 실행될 때 X-Forwarded-For/Proto를 신뢰하게 한다.
// 이게 없으면 express-rate-limit이 X-Forwarded-For 헤더를 보고도 trust proxy가 꺼져있다며
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR 에러를 던져 card/image 라우트 요청이 실패한다.
app.set("trust proxy", 1);

// 보호 해제 상태에서는 아무 사이트나 쿠키를 실어 API를 부를 수 있으므로 로컬 개발용이며, 배포 환경에서는 반드시 true로 켠다
const allowedOrigin =
  process.env.CORS_ENABLED === "true" ? (process.env.CORS_ORIGIN ?? "http://localhost:3000") : true;

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Supabase 설정이 없을 때만: apps/api/uploads/ 에 저장된 업로드 이미지를 /uploads 로 공개한다 (lib/image-storage.js)
if (isLocalStorage) {
  app.use(
    LOCAL_UPLOAD_ROUTE,
    express.static(LOCAL_UPLOAD_DIR, {
      index: false,
      dotfiles: "ignore",
      setHeaders: (res) => {
        res.set("X-Content-Type-Options", "nosniff");
        // 웹(3000)이 다른 출처에서 <img>/next/image로 불러갈 수 있게 한다
        res.set("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );
}

// GET이 아닌 API 요청은 로그인·가입을 빼고 모두 CSRF 헤더를 확인한다 (middlewares/csrf.js)
app.use("/api/v1", csrfProtection);

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/images", imageRouter);
app.use("/api/v1/cards", cardRouter);
app.use("/api/v1/sales", saleRouter);
app.use("/api/v1/notification", notificationRouter);
app.use("/api/v1/exchanges", exchangeRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);
