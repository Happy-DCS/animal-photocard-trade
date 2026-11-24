import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiError } from "./api-error.js";
import { getStorageClient } from "./supabase.js";

// 업로드 이미지를 어디에 둘지 고른다.
// - SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 실제 값이면 Supabase Storage 버킷
// - 비어 있거나 .env.example의 예시 값 그대로면 로컬 디스크(apps/api/uploads/)에 저장하고 API가 /uploads로 직접 서빙
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "card-images";
const PLACEHOLDER_PATTERN = /your-project|your_secret_key|^$/;

export const LOCAL_UPLOAD_ROUTE = "/uploads";
export const LOCAL_UPLOAD_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../uploads",
);

function isConfigured(value) {
  return typeof value === "string" && !PLACEHOLDER_PATTERN.test(value.trim());
}

export const isLocalStorage = !(
  isConfigured(process.env.SUPABASE_URL) && isConfigured(process.env.SUPABASE_SERVICE_ROLE_KEY)
);

// 로컬 파일 URL의 앞부분. 웹에서 이미지를 불러올 API 주소다 (기본: http://localhost:{PORT})
function getLocalPublicBaseUrl() {
  const base = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  return base.replace(/\/+$/, "");
}

// uploads/ 기준 상대 경로(예: "card-images/seed/image-001.png") → 웹에서 쓸 공개 URL
export function toLocalImageUrl(relativePath) {
  return `${getLocalPublicBaseUrl()}${LOCAL_UPLOAD_ROUTE}/${relativePath}`;
}

// objectPath 예: "<폴더>/<uuid>.png". 저장 후 공개 URL을 돌려준다
export async function saveImage({ objectPath, file }) {
  return isLocalStorage ? saveToLocal({ objectPath, file }) : saveToSupabase({ objectPath, file });
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
  return toLocalImageUrl(relativePath);
}

// 저장된 이미지 URL → 로컬 파일 절대 경로. 로컬 저장소 URL이 아니면(또는 uploads 밖을 가리키면) null
function toLocalFilePath(imageUrl) {
  if (!isLocalStorage) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(imageUrl).pathname);
  } catch {
    return null;
  }
  const prefix = `${LOCAL_UPLOAD_ROUTE}/`;
  if (!pathname.startsWith(prefix)) return null;

  const absolutePath = path.resolve(LOCAL_UPLOAD_DIR, pathname.slice(prefix.length));
  return absolutePath.startsWith(LOCAL_UPLOAD_DIR + path.sep) ? absolutePath : null;
}

// Supabase 공개 URL(.../storage/v1/object/public/<bucket>/<objectPath>) → objectPath
function toSupabaseObjectPath(imageUrl) {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const index = imageUrl.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(imageUrl.slice(index + marker.length));
}

// 저장된 이미지의 원본 바이트를 읽는다 (카드 생성 때 규격에 맞게 다시 자르기 위해)
export async function readImage(imageUrl) {
  try {
    const localPath = toLocalFilePath(imageUrl);
    if (localPath) return await readFile(localPath);

    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`이미지 조회 실패: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error(error);
    throw new ApiError(500, "IMAGE_PROCESSING_FAILED", "이미지를 불러오지 못했습니다");
  }
}

// 더 이상 쓰지 않는 이미지 파일을 지운다. 실패해도 핵심 흐름을 막지 않도록 에러는 기록만 한다.
// 시드 이미지(seed/)는 여러 환경에서 공유하므로 지우지 않는다
export async function deleteImage(imageUrl) {
  try {
    const localPath = toLocalFilePath(imageUrl);
    if (localPath) {
      if (!localPath.includes(`${path.sep}seed${path.sep}`)) await rm(localPath, { force: true });
      return;
    }

    const objectPath = toSupabaseObjectPath(imageUrl);
    if (!objectPath || objectPath.startsWith("seed/")) return;
    const { error } = await getStorageClient().storage.from(STORAGE_BUCKET).remove([objectPath]);
    if (error) throw error;
  } catch (error) {
    console.error("[image-storage] deleteImage 실패", error);
  }
}

async function saveToSupabase({ objectPath, file }) {
  const supabase = getStorageClient();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, file.buffer, { contentType: file.mimetype });
  if (error) {
    console.error(error);
    throw new ApiError(500, "IMAGE_UPLOAD_FAILED", "이미지 업로드에 실패했습니다");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
  return publicUrl;
}
