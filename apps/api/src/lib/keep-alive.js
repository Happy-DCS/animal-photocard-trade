// Render 무료 웹 서비스는 15분간 들어오는 요청이 없으면 잠든다.
// 10분마다 자기 공개 주소의 헬스 체크를 호출해 깨어 있게 한다 (localhost가 아니라 공개 주소여야 외부 요청으로 집계된다).
// RENDER_EXTERNAL_URL은 Render가 자동으로 넣어 주므로 로컬에서는 동작하지 않는다
export const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;

async function ping(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    await response.body?.cancel();
    if (!response.ok) console.error(`[keep-alive] 헬스 체크 응답 ${response.status}`);
  } catch (error) {
    // 호출이 실패해도 서버는 계속 동작해야 하므로 기록만 하고 다음 주기에 다시 시도한다
    console.error("[keep-alive] 헬스 체크 호출 실패", error.message);
  }
}

export function startKeepAlive() {
  const baseUrl = process.env.RENDER_EXTERNAL_URL;
  if (!baseUrl) return null;

  const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/health`;
  const timer = setInterval(() => ping(url), KEEP_ALIVE_INTERVAL_MS);
  // 이 타이머 때문에 프로세스 종료가 막히지 않게 한다
  timer.unref();
  console.log(`keep-alive: ${url} (10분 주기)`);
  return timer;
}
