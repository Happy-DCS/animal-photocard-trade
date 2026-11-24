import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { LOCAL_UPLOAD_DIR, STORAGE_BUCKET, toLocalImageUrl } from "../src/lib/image-storage.js";

// 로컬 저장 모드(Supabase 미설정)에서 쓸 시드용 카드 이미지.
// 실제 사진 대신 카테고리별 얼굴 일러스트를 SVG로 그려 PNG로 만든다 (카드 이미지 영역 비율 400:232에 맞춤)
const WIDTH = 800;
const HEIGHT = 464;
const SEED_FOLDER = "seed";

// 시드 imageUrl(.../seed/image-001.png)에서 파일명만 꺼낸다
function toSeedFileName(imageUrl) {
  return path.posix.basename(new URL(imageUrl).pathname);
}

// 파일명 숫자로 색을 정해 이미지마다 조금씩 다르게 보이게 한다 (항상 같은 결과)
function paletteFor(index, category) {
  const baseHue = category === "CAT" ? 20 : 200;
  const hue = (baseHue + index * 37) % 360;
  return {
    background: `hsl(${hue}, 55%, 82%)`,
    backgroundEdge: `hsl(${hue}, 45%, 70%)`,
    fur: `hsl(${(hue + 180) % 360}, 30%, ${category === "CAT" ? 55 : 45}%)`,
    furLight: `hsl(${(hue + 180) % 360}, 35%, 80%)`,
  };
}

function catFace({ fur, furLight }) {
  return `
    <polygon points="290,150 330,40 380,135" fill="${fur}"/>
    <polygon points="510,150 470,40 420,135" fill="${fur}"/>
    <polygon points="305,140 330,75 362,132" fill="#f4b6c2"/>
    <polygon points="495,140 470,75 438,132" fill="#f4b6c2"/>
    <ellipse cx="400" cy="250" rx="150" ry="135" fill="${fur}"/>
    <ellipse cx="400" cy="300" rx="80" ry="60" fill="${furLight}"/>
    <ellipse cx="345" cy="230" rx="22" ry="30" fill="#222"/>
    <ellipse cx="455" cy="230" rx="22" ry="30" fill="#222"/>
    <circle cx="352" cy="220" r="7" fill="#fff"/>
    <circle cx="462" cy="220" r="7" fill="#fff"/>
    <polygon points="388,280 412,280 400,295" fill="#e57f95"/>
    <path d="M400 295 Q385 315 368 305 M400 295 Q415 315 432 305" stroke="#333" stroke-width="4" fill="none"/>
    <path d="M330 290 L250 275 M330 302 L248 305 M470 290 L550 275 M470 302 L552 305" stroke="#333" stroke-width="3"/>`;
}

function dogFace({ fur, furLight }) {
  return `
    <ellipse cx="270" cy="230" rx="55" ry="105" fill="${fur}" transform="rotate(18 270 230)"/>
    <ellipse cx="530" cy="230" rx="55" ry="105" fill="${fur}" transform="rotate(-18 530 230)"/>
    <ellipse cx="400" cy="245" rx="140" ry="140" fill="${furLight}"/>
    <ellipse cx="400" cy="320" rx="85" ry="62" fill="#fff8ee"/>
    <circle cx="350" cy="225" r="20" fill="#222"/>
    <circle cx="450" cy="225" r="20" fill="#222"/>
    <circle cx="356" cy="217" r="6" fill="#fff"/>
    <circle cx="456" cy="217" r="6" fill="#fff"/>
    <ellipse cx="400" cy="290" rx="28" ry="20" fill="#222"/>
    <path d="M400 310 L400 330 Q385 350 365 338 M400 330 Q415 350 435 338" stroke="#333" stroke-width="4" fill="none"/>
    <ellipse cx="400" cy="362" rx="16" ry="20" fill="#f08a9b"/>`;
}

function renderSvg({ index, category, label }) {
  const palette = paletteFor(index, category);
  const face = category === "CAT" ? catFace(palette) : dogFace(palette);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="45%" r="75%">
        <stop offset="0%" stop-color="${palette.background}"/>
        <stop offset="100%" stop-color="${palette.backgroundEdge}"/>
      </radialGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    ${face}
    <text x="${WIDTH - 24}" y="${HEIGHT - 24}" text-anchor="end" font-family="sans-serif" font-size="28" font-weight="700" fill="rgba(0,0,0,0.35)">${label}</text>
  </svg>`;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// 시드 이미지마다 uploads/{bucket}/seed/에 파일이 없으면 만들고, 로컬 URL로 바꾼 imageUrl을 돌려준다
export async function ensureLocalSeedImages(images, { force = false } = {}) {
  const directory = path.join(LOCAL_UPLOAD_DIR, STORAGE_BUCKET, SEED_FOLDER);
  await mkdir(directory, { recursive: true });

  const urlById = new Map();
  let created = 0;
  for (const [index, image] of images.entries()) {
    const fileName = toSeedFileName(image.imageUrl);
    const filePath = path.join(directory, fileName);

    if (force || !(await exists(filePath))) {
      const label = `${image.category} ${path.parse(fileName).name.replace("image-", "#")}`;
      await sharp(Buffer.from(renderSvg({ index, category: image.category, label })))
        .png()
        .toFile(filePath);
      created += 1;
    }
    urlById.set(image.id, toLocalImageUrl(`${STORAGE_BUCKET}/${SEED_FOLDER}/${fileName}`));
  }

  return { urlById, created, directory };
}
