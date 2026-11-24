"use client";

import { toPng } from "html-to-image";
import { useRef, useState } from "react";

import PhotoCard from "./PhotoCard";

// 포토카드 앞면 전체(테두리·제목·관상 지수·설명·로고)를 PNG로 저장한다.
// 화면에 보이는 카드는 크기 맞춤(scale)·기울기·뒤집기가 걸려 있어 그대로 찍으면 틀어지므로,
// 화면 밖에 원본 크기(400×586) 앞면을 따로 그려 두고 그걸 3배 해상도(1200×1758)로 캡처한다.
// 카드 이미지가 API 서버(다른 출처)에 있으므로, 캡처하려면 그 서버가 CORS를 허용해야 한다 (apps/api app.js의 /uploads)
const PIXEL_RATIO = 3;

/**
 * @param {{ cardProps: object }} props  PhotoCard에 넘길 props (CardPreviewModal과 같은 값)
 */
export default function CardDownloadButton({ cardProps }) {
  const captureRef = useRef(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload() {
    if (!captureRef.current || isDownloading) return;

    setIsDownloading(true);
    setError("");
    try {
      const dataUrl = await toPng(captureRef.current, {
        pixelRatio: PIXEL_RATIO,
        // 화면 표시용으로 이미 받아 둔(CORS 헤더 없이 캐시된) 이미지를 피하려고 주소에 쿼리를 붙여 다시 받는다
        cacheBust: true,
      });
      saveDataUrl(dataUrl, toFileName(cardProps.card?.name));
    } catch (downloadError) {
      console.error("[card-download] 카드 이미지 저장 실패", downloadError);
      setError("카드 이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className="mx-auto mt-3 flex h-10 items-center justify-center rounded-xs border border-gray-200 px-5 font-sans-500 text-sm text-gray-200 hover:border-white hover:text-white disabled:opacity-50"
      >
        {isDownloading ? "저장 중..." : "카드 이미지 다운로드"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-red">
          {error}
        </p>
      )}

      {/* 캡처용 원본 크기 앞면. 화면 밖에 두되 display:none이면 그려지지 않아 캡처가 안 되므로 위치만 옮긴다 */}
      <div aria-hidden="true" className="pointer-events-none fixed top-0 -left-[10000px]">
        <div ref={captureRef} className="w-fit">
          <PhotoCard {...cardProps} onClick={undefined} />
        </div>
      </div>
    </>
  );
}

// 파일 이름에 쓸 수 없는 문자(\ / : * ? " < > |)는 빼고, 비어 있으면 기본 이름을 쓴다
function toFileName(cardName) {
  const safeName = (cardName ?? "").replace(/[\\/:*?"<>|]/g, "").trim();
  return `${safeName || "포토카드"}_최애멍냥.png`;
}

function saveDataUrl(dataUrl, fileName) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
