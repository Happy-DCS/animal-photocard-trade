import { API_BASE_URL } from "@/lib/api-client";

// GET /users/me/events (SSE) 연결. 서버가 { point, lastDrawAt, unreadCount }를 "user" 이벤트로 직접 보낸다
// (연결 직후 한 번 + 다른 사용자의 구매·교환 등으로 값이 바뀔 때마다).
//
// 네트워크가 잠깐 끊기면 EventSource가 스스로 다시 연결한다.
// 서버가 401 등 오류 응답을 주면 EventSource는 재연결을 멈추므로(readyState CLOSED) onClosed로 알려,
// 호출한 쪽이 토큰 재발급(/users/me 재조회) 뒤 다시 연결할지 정하게 한다
export function connectUserEvents({ onUser, onClosed }) {
  const source = new EventSource(`${API_BASE_URL}/users/me/events`, { withCredentials: true });

  source.addEventListener("user", (event) => {
    try {
      onUser(JSON.parse(event.data));
    } catch {
      // 형식이 깨진 메시지는 무시한다
    }
  });

  source.onerror = () => {
    if (source.readyState !== EventSource.CLOSED) return;
    source.close();
    onClosed?.();
  };

  return () => source.close();
}
