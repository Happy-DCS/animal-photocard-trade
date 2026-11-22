import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiError } from "./api-error.js";
import { createUserScopedClient } from "./supabase.js";

// 업로드 이미지를 어디에 둘지 고른다.
// - SUPABASE_URL·SUPABASE_ANON_KEY가 실제 값이면 Supabase Storage 버킷
// - 비어 있거나 .env.example의 예시 값 그대로면 로컬 디스크(apps/api/uploads/)에 저장하고 API가 /uploads로 직접 서빙
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "card-images";
const PLACEHOLDER_PATTERN = /your-project|your_anon_key|^$/;

export const LOCAL_UPLOAD_ROUTE = "/uploads";
export const LOCAL_UPLOAD_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../uploads",
);

function isConfigured(value) {
  return typeof value === "string" && !PLACEHOLDER_PATTERN.test(value.trim());
}

export const isLocalStorage = !(
  isConfigured(process.env.SUPABASE_URL) && isConfigured(process.env.SUPABASE_ANON_KEY)
);

// 로컬 파일 URL의 앞부분. 웹에서 이미지를 불러올 API 주소다 (기본: http://localhost:{PORT})
function getLocalPublicBaseUrl() {
  const base = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  return base.replace(/\/+$/, "");
}

// objectPath 예: "<폴더>/<uuid>.png". 저장 후 공개 URL을 돌려준다
export async function saveImage({ objectPath, file, accessToken }) {
  return isLocalStorage
    ? saveToLocal({ objectPath, file })
    : saveToSupabase({ objectPath, file, accessToken });
}

async function saveToLocal({ objectPath, file }) {
  const relativePath = path.posix.join(STORAGE_BUCKET, objectPath);
  const absolutePath = path.resolve(LOCAL_UPLOAD_DIR, relativePath);
  // objectPath는 서버가 만든 값이지만, 혹시라도 uploads 밖으로 나가는 경로는 막는다
  if (!absolutePath.startsWith(LOCAL_UPLOAD_DIR + path.sep)) {
    throw new ApiError(500, "IMAGE_UPLOAD_FAILED", "이미지 업로드에 실패했습니다");
  }

  try {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.buffer);
  } catch (error) {
    console.error(error);
    throw new ApiError(500, "IMAGE_UPLOAD_FAILED", "이미지 업로드에 실패했습니다");
  }
  return `${getLocalPublicBaseUrl()}${LOCAL_UPLOAD_ROUTE}/${relativePath}`;
}

async function saveToSupabase({ objectPath, file, accessToken }) {
  const supabase = createUserScopedClient(accessToken);
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, file.buffer, { contentType: file.mimetype });
  if (error) {
    throw new ApiError(500, "IMAGE_UPLOAD_FAILED", "이미지 업로드에 실패했습니다");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
  return publicUrl;
}
