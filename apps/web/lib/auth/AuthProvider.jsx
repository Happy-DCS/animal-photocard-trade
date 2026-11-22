"use client";

import { ApiError, onSessionExpired } from "@/lib/api-client";
import { getCurrentUser, signout } from "@/lib/auth/api";
import { getRealtimeClient } from "@/lib/realtime/client";
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

export function AuthProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState(undefined);
  const initialAuthPromiseRef = useRef(null);
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    if (pathname === "/market") isLoggingOutRef.current = false;
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

  // 다른 사용자의 행동(구매·교환 제시 등)으로 내 포인트·알림이 바뀌는 경우를 실시간으로 반영한다.
  // 서버가 /users/me로 내려주는 realtimeChannel(추측 불가능한 채널명)을 구독해서,
  // "바뀌었다"는 신호만 받으면 현재 사용자 정보를 다시 불러온다 (값 자체는 서버 응답을 신뢰)
  useEffect(() => {
    const channelTopic = currentUser?.realtimeChannel;
    if (!channelTopic) return;

    const supabase = getRealtimeClient();
    if (!supabase) return;

    const channel = supabase
      .channel(channelTopic)
      .on("broadcast", { event: "changed" }, () => {
        reloadCurrentUser();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.realtimeChannel, reloadCurrentUser]);

  //앱전체 로그아웃 함수
  const logout = useCallback(async () => {
    // 보호 페이지의 비로그인 게이트가 로그아웃 이동을 /login으로 바꾸지 않도록 한다.
    isLoggingOutRef.current = pathname !== "/market";
    try {
      await signout();
    } finally {
      setCurrentUser(null);
      router.replace("/market");
    }
  }, [pathname, router]);

  //context생성
  const value = useMemo(
    () => ({
      currentUser,
      isLoading: currentUser === undefined,
      isLoggingOutRef,
      login,
      logout,
      reloadCurrentUser,
    }),
    [currentUser, login, logout, reloadCurrentUser],
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
