import { ApiError } from "../lib/api-error.js";
import { verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { WITHDRAWN_USER_NICKNAME } from "../lib/user-display.js";
import { findPendingExchangeIdsByOfferer } from "../repositories/exchange.repository.js";
import { countUnread } from "../repositories/notification.repository.js";
import { deleteAllRefreshTokens } from "../repositories/refresh-token.repository.js";
import { findOnSaleIdsBySeller } from "../repositories/sale.repository.js";
import { grantRandomPointIfAvailable, updateUser } from "../repositories/user.repository.js";
import { cancelExchange } from "./exchange.service.js";
import { cancelSale } from "./sale.service.js";

// 랜덤 포인트별 누적 당첨 확률을 관리
const RANDOM_POINT_REWARDS = [
  { point: 10, max: 30 },
  { point: 20, max: 60 },
  { point: 30, max: 80 },
  { point: 50, max: 92 },
  { point: 100, max: 98 },
  { point: 300, max: 100 },
];

// 1부터 100 사이의 값을 이용해 확률에 맞는 랜덤 포인트를 반환
function getRandomPoint() {
  const randomNumber = Math.floor(Math.random() * 100) + 1;

  return RANDOM_POINT_REWARDS.find((reward) => randomNumber <= reward.max).point;
}

// 한국 시간 기준 오늘 시작 시각과 다음 추첨 가능 시각을 계산
function getKstDayBounds(now = new Date()) {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);

  const todayStart = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - KST_OFFSET_MS,
  );

  const nextDrawAt = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  return {
    todayStart,
    nextDrawAt,
  };
}

// GET /users/me — 인증은 requireAuth가 끝낸 상태로, req.user를 받는다
export async function getCurrentUser(user) {
  const unreadCount = await countUnread(user.id);
  return {
    id: user.id,
    nickname: user.nickname,
    // 마이페이지 표시용. provider: "local"(이메일 가입) | "google". 이메일 가입자만 비밀번호를 바꿀 수 있다
    email: user.email,
    provider: user.provider,
    point: Number(user.point),
    lastDrawAt: user.lastDrawAt,
    unreadCount,
    createdAt: user.createdAt,
  };
}

// ── 마이페이지 ──

// 닉네임 변경. 카드 원작자·판매자 표시는 매번 조인해서 가져오므로 바꾸면 모든 화면에 바로 반영된다
export async function updateNickname(user, nickname) {
  if (nickname === user.nickname) return getCurrentUser(user);
  if (nickname === WITHDRAWN_USER_NICKNAME || nickname.startsWith(WITHDRAWN_NICKNAME_PREFIX)) {
    throw new ApiError(400, "VALIDATION_ERROR", "사용할 수 없는 닉네임입니다");
  }

  try {
    const updated = await updateUser(user.id, { nickname });
    return getCurrentUser(updated);
  } catch (error) {
    if (error?.code === "P2002") {
      throw new ApiError(409, "NICKNAME_ALREADY_EXISTS", "이미 사용 중인 닉네임입니다");
    }
    throw error;
  }
}

// 탈퇴 확인: 이메일 가입자는 비밀번호, 소셜 가입자는 안내 문구를 그대로 입력해야 한다
export const WITHDRAW_CONFIRM_TEXT = "탈퇴합니다";
// DB의 nickname은 고유값이라 탈퇴 시 이 접두어 + 유저 id로 바꾼다 (화면에는 "탈퇴한 사용자"로 표시)
const WITHDRAWN_NICKNAME_PREFIX = "탈퇴한사용자_";

// 회원 탈퇴. 유저 행은 지우지 않는다 — 다른 사람이 가진 카드의 원작자, 지난 거래의 판매자로 남아야 하기 때문.
// 1) 진행 중인 판매글을 내리고(들어온 교환 제시는 함께 취소·알림) 2) 내가 보낸 교환 제시를 취소한 뒤
// 3) 개인정보를 지우고 탈퇴 시각을 기록, 모든 로그인 세션을 끊는다. 보유 카드·포인트는 탈퇴 계정에 그대로 둔다
export async function withdraw(user, { password, confirmText }) {
  if (user.passwordHash) {
    if (!password || !(await verifyPassword(password, user.passwordHash))) {
      // 401이면 웹이 토큰 만료로 보고 재발급을 시도하므로 400을 쓴다
      throw new ApiError(400, "INVALID_PASSWORD", "비밀번호가 올바르지 않습니다");
    }
  } else if (confirmText !== WITHDRAW_CONFIRM_TEXT) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `"${WITHDRAW_CONFIRM_TEXT}"를 정확히 입력해 주세요`,
    );
  }

  // 각각 기존 판매글 내리기·교환 취소 로직(알림·실시간 전송 포함)을 그대로 쓴다.
  // 그사이 다른 요청으로 이미 처리된 건(409·404)은 건너뛴다
  for (const { id } of await findOnSaleIdsBySeller(user.id)) {
    await ignoreAlreadyHandled(() => cancelSale(id, user));
  }
  for (const { id } of await findPendingExchangeIdsByOfferer(user.id)) {
    await ignoreAlreadyHandled(() => cancelExchange({ exchangeId: id, offerer: user }));
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        // 이메일·닉네임은 고유값이라 겹치지 않는 값으로 바꿔, 같은 이메일·닉네임으로 다시 가입할 수 있게 한다
        email: `withdrawn-${user.id}@deleted.invalid`,
        nickname: `${WITHDRAWN_NICKNAME_PREFIX}${user.id}`,
        passwordHash: null,
        providerUid: null,
        deletedAt: new Date(),
      },
    });
    await deleteAllRefreshTokens(user.id, tx);
  });
}

async function ignoreAlreadyHandled(action) {
  try {
    await action();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) return;
    throw error;
  }
}

// 하루 한 번 랜덤 포인트를 지급하고 다음 추첨 가능 시각을 반환
export async function drawRandomPoint(user) {
  const drawnAt = new Date();
  const { todayStart, nextDrawAt } = getKstDayBounds(drawnAt);
  const earnedPoint = getRandomPoint();

  return prisma.$transaction(async (tx) => {
    const result = await grantRandomPointIfAvailable(tx, user.id, earnedPoint, todayStart, drawnAt);

    // 오늘 이미 포인트를 받았다면 중복 지급을 막음
    if (result.count === 0) {
      throw new ApiError(
        409,
        "RANDOM_POINT_ALREADY_DRAWN",
        "오늘의 랜덤 포인트를 이미 획득했습니다",
      );
    }

    return {
      earnedPoint,
      drawnAt,
      nextDrawAt,
    };
  });
}
