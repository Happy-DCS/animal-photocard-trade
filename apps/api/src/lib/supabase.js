import { createClient } from "@supabase/supabase-js";

// Supabase는 DB 호스팅과 Storage에만 쓴다. 인증(가입·로그인·토큰)은 API가 직접 처리한다 (auth.service.js)
function getEnv() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY 환경 변수가 필요합니다 (.env.example 참고)");
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

// TODO(storage): Supabase Auth를 걷어내면서 accessToken이 Supabase 토큰이 아니게 되어
// "본인 폴더만 업로드" RLS를 더 이상 통과하지 못한다. Storage 업로드 방식을 새로 반영할 때 교체한다
export function createUserScopedClient(accessToken) {
  const { url, anonKey } = getEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
