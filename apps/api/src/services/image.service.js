import { randomUUID } from "node:crypto";

import { isLocalStorage, saveImage } from "../lib/image-storage.js";
import { predictProbabilities } from "../lib/score-model.js";
import { SCORE_AXES } from "../lib/score-config.js";
import { createImage } from "../repositories/image.repository.js";

const TOTAL_SCORE = 100;

// image/jpeg → jpg 처럼 확장자를 mimetype에서 결정한다 (원본 파일명은 신뢰하지 않음)
export const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadImage({ uploaderId, authUid, accessToken, category, file }) {
  const [imageUrl, axes] = await Promise.all([
    uploadToStorage({ accessToken, authUid, uploaderId, file }),
    generateScoreAxes(category, file.buffer),
  ]);
  const image = await createImage({ uploaderId, imageUrl, category, score: { axes } });
  return toImageResponse(image);
}

// 저장 위치(Supabase 버킷 / 로컬 디스크)는 lib/image-storage.js가 .env 설정을 보고 고른다.
// Supabase를 쓸 때는 경로의 첫 폴더가 Storage RLS 정책의 auth.uid()와 비교된다 (User.providerUid)
async function uploadToStorage({ accessToken, authUid, uploaderId, file }) {
  const folder = isLocalStorage ? uploaderId : authUid;
  const objectPath = `${folder}/${randomUUID()}.${MIME_EXTENSIONS[file.mimetype]}`;
  return saveImage({ objectPath, file, accessToken });
}

// 관상 지수: 카테고리별 ML 모델로 이미지를 분류해 나온 확률(합계 1에 가까움)을 퍼센트로 바꾼다.
// 모델 출력 순서는 models/{category}/metadata.json 의 labels 순서 = SCORE_AXES 순서 (라벨을 그렇게 맞춰둠)
async function generateScoreAxes(category, imageBuffer) {
  const keys = SCORE_AXES[category];
  const probabilities = await predictProbabilities(category, imageBuffer);
  const values = toPercentages(probabilities);

  return keys.map((field, i) => ({ field, value: values[i] }));
}

// [0,1] 확률 배열 → 합계가 정확히 100인 정수 퍼센트 배열 (최대 나머지법: 버림 후 소수부가 큰 값부터 1씩 보정)
function toPercentages(probabilities) {
  const raw = probabilities.map((p) => p * TOTAL_SCORE);
  const floors = raw.map(Math.floor);
  const remainder = Math.max(
    0,
    Math.min(raw.length, TOTAL_SCORE - floors.reduce((sum, value) => sum + value, 0)),
  );

  const byFractionDesc = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const values = [...floors];
  for (let i = 0; i < remainder; i += 1) {
    values[byFractionDesc[i].index] += 1;
  }
  return values;
}

function toImageResponse(image) {
  return {
    id: image.id,
    uploaderId: image.uploaderId,
    category: image.category,
    imageUrl: image.imageUrl,
    score: image.score,
    createdAt: image.createdAt,
  };
}
