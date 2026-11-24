import { countUnread } from "../repositories/notification.repository.js";
import { findUserById } from "../repositories/user.repository.js";

// 사용자별 실시간 상태(포인트·안읽은 알림 수)를 SSE(Server-Sent Events)로 브라우저에 직접 보낸다.
// 열린 연결을 이 프로세스 메모리에 보관하므로 API 서버가 1대일 때를 전제로 한다.
// (서버를 여러 대로 늘리면 Redis pub/sub 같은 중계를 두고 notifyUserChanged가 그쪽으로 발행하도록 바꾼다)
const HEARTBEAT_MS = 25_000;

/** @type {Map<string, Set<import("express").Response>>} userId → 열린 SSE 응답들 (탭마다 하나) */
const connections = new Map();

// 브라우저에 보낼 현재 상태. 값 자체를 보내므로 프론트는 /users/me를 다시 부를 필요가 없다
async function loadUserState(userId) {
  const [user, unreadCount] = await Promise.all([findUserById(userId), countUnread(userId)]);
  if (!user) return null;
  return { point: Number(user.point), lastDrawAt: user.lastDrawAt, unreadCount };
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// GET /users/me/events — 연결을 열어 두고, 연결 직후 현재 상태를 한 번 보낸다
// (응답을 끝내지 않고 계속 쓰는 스트림이라 컨트롤러가 req/res를 그대로 넘긴다)
export async function openUserEventStream(req, res) {
  const userId = req.user.id;

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // 리버스 프록시(nginx 등)가 응답을 모았다가 보내지 않게 한다
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  // 연결이 끊기면 브라우저(EventSource)가 3초 뒤 다시 연결한다
  res.write("retry: 3000\n\n");

  let userConnections = connections.get(userId);
  if (!userConnections) {
    userConnections = new Set();
    connections.set(userId, userConnections);
  }
  userConnections.add(res);

  // 프록시·브라우저가 유휴 연결을 끊지 않도록 주기적으로 주석 줄을 보낸다
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    userConnections.delete(res);
    if (userConnections.size === 0) connections.delete(userId);
  });

  const state = await loadUserState(userId).catch(() => null);
  if (state && !res.writableEnded) send(res, "user", state);
}

// 다른 사용자의 행동(구매·교환 등)으로 이 사용자의 포인트·알림이 바뀌었을 때 호출한다.
// 트랜잭션이 커밋된 뒤에 불러야 최신 값이 읽힌다. 전송 실패가 핵심 로직을 막으면 안 되므로 에러는 삼킨다
export async function notifyUserChanged(userId) {
  const userConnections = connections.get(userId);
  if (!userConnections || userConnections.size === 0) return;

  try {
    const state = await loadUserState(userId);
    if (!state) return;
    for (const res of userConnections) send(res, "user", state);
  } catch (error) {
    console.error("[user-events] notifyUserChanged 실패", error);
  }
}

export function notifyUsersChanged(userIds) {
  return Promise.all([...new Set(userIds)].map(notifyUserChanged));
}
