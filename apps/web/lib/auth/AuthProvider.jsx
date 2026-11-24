"use client";

import { ApiError, onSessionExpired } from "@/lib/api-client";
import { getCurrentUser, signout } from "@/lib/auth/api";
import { connectUserEvents } from "@/lib/realtime/user-events";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const AuthContext = createContext(null);

// 첫 진입 때 /users/me가 네트워크 오류 등으로 실패하면 1초부터 두 배씩, 최대 10초 간격으로 다시 시도한다
const INITIAL_RETRY_BASE_MS = 1000;
const INITIAL_RETRY_MAX_MS = 10_000;

// 로그아웃하면 어느 페이지에 있었든 랜딩(/)으로 보낸다
const LOGOUT_REDIRECT_PATH = "/";

// 실시간 연결(SSE)을 서버가 거절했을 때 재발급·재연결을 시도하기까지 기다리는 시간
const USER_EVENTS_RECONNECT_MS = 3000;

export function AuthProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState(undefined);
  const initialAuthPromiseRef = useRef(null);
  const isLoggingOutRef = useRef(false);

  // 로그아웃 후 도착 페이지(LOGOUT_REDIRECT_PATH)에 오면 로그아웃 진행 표시를 해제한다
  useEffect(() => {
    if (pathname === LOGOUT_REDIRECT_PATH) isLoggingOutRef.current = false;
  }, [pathname]);

  // 최신 currentUser를 콜백 안에서 읽기 위한 ref (reloadCurrentUser가 실패 시 기존 값을 돌려줄 때 사용)
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  //유저정보 조회 함수 (useCallback : 렌더링마다 새 함수생성되지 않도록 함)
  //-> 사용자 조회 결과만 반환하고 여기서는 React 상태를 직접 변경하지 않는다.
  // access 토큰 만료 시 재발급·재시도는 apiFetch가 처리하므로 여기서는 결과만 받는다.
  // 401이 남았다면 재발급까지 실패한 것(로그인 만료) — 서버가 이미 인증 쿠키를 지웠으므로 비로그인(null)으로 본다.
  // 그 밖의 실패(네트워크 오류·서버 5xx)는 서버가 요청을 처리하지 못한 것이라 토큰은 그대로이므로 에러를 그대로 던져
  // 호출한 쪽이 로그인 상태를 건드리지 않게 한다
  const resolveCurrentUser = useCallback(async () => {
    try {
      const { user } = await getCurrentUser();
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }, []);

  // 첫 진입용: 401이 아닌 실패면 로딩 상태를 유지한 채 잠시 뒤 다시 시도한다 (서버가 돌아오면 새로고침 없이 이어짐)
  const resolveInitialUser = useCallback(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await resolveCurrentUser();
      } catch {
        const delay = Math.min(INITIAL_RETRY_BASE_MS * 2 ** attempt, INITIAL_RETRY_MAX_MS);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }, [resolveCurrentUser]);

  // 어떤 API 호출에서든 재발급이 실패하면(로그인 만료) 로그인 상태를 비운다.
  // 보호 페이지는 currentUser가 null이 되면 /login?next=... 로 이동한다
  useEffect(() => onSessionExpired(() => setCurrentUser(null)), []);

  //첫 렌더링 (resolveInitialUser 변경될 때만 effect재실행)
  useEffect(() => {
    //오래된 유저응답을 덮어쓰지 않기 위함
    let ignore = false;

    if (!initialAuthPromiseRef.current) {
      initialAuthPromiseRef.current = resolveInitialUser();
    }

    initialAuthPromiseRef.current.then((user) => {
      if (!ignore) setCurrentUser(user);
    });

    return () => {
      ignore = true;
    };
  }, [resolveInitialUser]);

  //재요청방지를 위한 user 저장
  const login = useCallback((user) => {
    setCurrentUser(user);
  }, []);

  //포인트나 알림 수가 바뀌었을 때
  // 네트워크 오류 등 401이 아닌 실패면 로그인 상태를 유지하고 기존 사용자 정보를 그대로 돌려준다.
  // (구매·추첨이 성공한 직후 같은 try 안에서 호출되므로, 여기서 에러를 던지면 성공한 작업이 실패로 보인다)
  const reloadCurrentUser = useCallback(async () => {
    try {
      const user = await resolveCurrentUser();
      setCurrentUser(user);
      return user;
    } catch {
      return currentUserRef.current;
    }
  }, [resolveCurrentUser]);

  // 로그인한 사용자 정보의 일부만 바꾼다 (SSE로 받은 값, 알림 드롭다운에서 바뀐 안읽은 개수 등).
  // patch는 객체 또는 (prev) => 객체 함수. 비로그인 상태면 무시한다
  const patchCurrentUser = useCallback((patch) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      return { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
    });
  }, []);

  // 다른 사용자의 행동(구매·교환 등)으로 바뀐 내 포인트·안읽은 알림 수를 API의 SSE로 직접 받아 반영한다.
  // 연결 직후에도 현재 값을 한 번 받으므로, 로그인 응답에 없던 unreadCount도 로그인 직후 바로 채워진다
  const currentUserId = currentUser?.id;
  useEffect(() => {
    if (!currentUserId) return;

    let isActive = true;
    let disconnect = () => {};
    let reconnectTimer;

    const connect = () => {
      disconnect = connectUserEvents({
        onUser: patchCurrentUser,
        // 서버가 연결을 거절함(대개 access 토큰 만료) → /users/me 재조회로 재발급을 거친 뒤,
        // 여전히 로그인 상태면 다시 연결한다 (로그인 만료면 currentUser가 null이 되어 이 effect가 정리된다)
        onClosed: () => {
          reconnectTimer = setTimeout(async () => {
            if (!isActive) return;
            const user = await reloadCurrentUser();
            if (isActive && user) connect();
          }, USER_EVENTS_RECONNECT_MS);
        },
      });
    };

    connect();

    return () => {
      isActive = false;
      clearTimeout(reconnectTimer);
      disconnect();
    };
  }, [currentUserId, patchCurrentUser, reloadCurrentUser]);

  //앱전체 로그아웃 함수
  // skipSignout: 회원 탈퇴처럼 서버가 이미 세션·쿠키를 지운 경우 로그아웃 API 없이 화면 상태만 정리한다
  const logout = useCallback(
    async ({ skipSignout = false } = {}) => {
      // 보호 페이지의 비로그인 게이트가 로그아웃 이동을 /login으로 바꾸지 않도록 한다.
      isLoggingOutRef.current = pathname !== LOGOUT_REDIRECT_PATH;
      try {
        if (!skipSignout) await signout();
      } finally {
        setCurrentUser(null);
        router.replace(LOGOUT_REDIRECT_PATH);
      }
    },
    [pathname, router],
  );

  //context생성
  const value = useMemo(
    () => ({
      currentUser,
      isLoading: currentUser === undefined,
      isLoggingOutRef,
      login,
      logout,
      reloadCurrentUser,
      patchCurrentUser,
    }),
    [currentUser, login, logout, reloadCurrentUser, patchCurrentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

//포장
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth는 AuthProvider 내부에서 사용해야 합니다.");
  }
  return context;
}
