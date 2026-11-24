import { apiFetch } from "@/lib/api-client";

// card 도메인 API (포토카드 생성 페이지에서 사용)

// POST /cards — 성공하면 생성된 카드 전체
// { id, ownerId, createdById, imageId, name, category, description, filterType, imageUrl, tag, topScore, score, createdAt, updatedAt }
// crop: 카드에 보일 영역 { x, y, width, height } (원본 기준 %, react-easy-crop의 croppedArea).
// 서버가 업로드해 둔 원본을 이 영역으로 잘라 카드 규격(800×464)으로 저장한다. 없으면 가운데 기준
export async function createCard({ imageId, filterType, name, crop }) {
  return apiFetch("/cards", {
    method: "POST",
    body: { imageId, filterType, name, ...(crop && { crop }) },
  });
}

// GET /cards/remaining-count — 오늘 남은 카드 생성 가능 횟수. 성공하면 { remainingCount, limit }
export function getRemainingCount() {
  return apiFetch("/cards/remaining-count");
}
