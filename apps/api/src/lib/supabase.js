import { createClient } from "@supabase/supabase-js";

// Supabase는 DB 호스팅과 Storage에만 쓴다. 인증(가입·로그인·토큰)은 API가 직접 처리한다 (auth.service.js)
function getEnv() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다 (.env.example 참고)",
    );
  }
  return { url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY };
}

// 서버 전용 비밀 키를 쓰므로 RLS를 우회한다. 권한 확인은 호출 전에 API(requireAuth·service)가 끝내야 한다
let storageClient;
export function getStorageClient() {
  if (!storageClient) {
    const { url, serviceRoleKey } = getEnv();
    storageClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return storageClient;
}
