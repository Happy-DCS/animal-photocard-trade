import { randomUUID } from "node:crypto";

import sharp from "sharp";

import { ApiError } from "../lib/api-error.js";
import { isLocalStorage, readImage, saveImage } from "../lib/image-storage.js";
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
function toStorageFolder({ authUid, uploaderId }) {
  return isLocalStorage ? uploaderId : authUid;
}

async function uploadToStorage({ accessToken, authUid, uploaderId, file }) {
  const folder = toStorageFolder({ authUid, uploaderId });
  const objectPath = `${folder}/${randomUUID()}.${MIME_EXTENSIONS[file.mimetype]}`;
  return saveImage({ objectPath, file, accessToken });
}

// ── 카드 이미지 규격화 ──
// 카드 이미지 영역은 400:232. 레티나(2배) 화면까지 선명하도록 800×464로 저장한다 (웹 PhotoCard.jsx와 같은 비율)
export const CARD_IMAGE_WIDTH = 800;
export const CARD_IMAGE_HEIGHT = 464;
const CARD_IMAGE_QUALITY = 85;

// crop: 원본 기준 퍼센트 영역 { x, y, width, height } (0~100, 웹의 react-easy-crop croppedAreaPercentages).
// crop이 없으면 가운데를 기준으로 카드 비율에 맞춰 자른다
async function renderCardImage(original, crop) {
  // 휴대폰 사진의 EXIF 회전 정보를 먼저 반영해야 웹 미리보기에서 본 방향과 좌표가 맞는다
  const oriented = await sharp(original).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = oriented.info;

  let pipeline = sharp(oriented.data);
  if (crop) {
    const left = clamp(Math.round((crop.x / 100) * width), 0, width - 1);
    const top = clamp(Math.round((crop.y / 100) * height), 0, height - 1);
    pipeline = pipeline.extract({
      left,
      top,
      width: clamp(Math.round((crop.width / 100) * width), 1, width - left),
      height: clamp(Math.round((crop.height / 100) * height), 1, height - top),
    });
  }

  return pipeline
    .resize(CARD_IMAGE_WIDTH, CARD_IMAGE_HEIGHT, { fit: "cover", position: "centre" })
    .webp({ quality: CARD_IMAGE_QUALITY })
    .toBuffer();
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

// 업로드해 둔 원본을 사용자가 고른 영역(crop)으로 잘라 카드 규격(800×464 webp)으로 저장하고 새 URL을 돌려준다.
// 관상 지수는 업로드 때 원본으로 이미 계산해 두었으므로 여기서는 이미지 모양만 바꾼다
export async function saveCardImage({ image, crop, authUid, accessToken }) {
  const original = await readImage(image.imageUrl);

  let buffer;
  try {
    buffer = await renderCardImage(original, crop);
  } catch (error) {
    console.error(error);
    throw new ApiError(
      400,
      "IMAGE_PROCESSING_FAILED",
      "이미지를 카드 규격으로 변환하지 못했습니다",
    );
  }

  const folder = toStorageFolder({ authUid, uploaderId: image.uploaderId });
  return saveImage({
    objectPath: `${folder}/${randomUUID()}.webp`,
    file: { buffer, mimetype: "image/webp" },
    accessToken,
  });
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
