"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import ScaledPhotoCard from "./ScaledPhotoCard";
import TiltCard from "./TiltCard";

// 카드를 화면 정중앙에 크게 띄워 보는 모달. 카드에는 3D 틸트 효과(TiltCard)가 걸려 있다.
// 배경(어두운 막)을 누르거나, 닫기 버튼, Esc 키로 닫는다
/**
 * @param {{ cardProps: object | null, onClose: () => void }} props
 *   cardProps: ScaledPhotoCard(PhotoCard)에 넘길 props. null이면 닫힌 상태
 */
export default function CardPreviewModal({ cardProps, onClose }) {
  const isOpen = cardProps !== null;

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    // 모달이 떠 있는 동안 뒤 페이지 스크롤을 막는다
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 페이지 쪽 stacking context(isolate 등)에 갇히지 않도록 body에 바로 그린다
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${cardProps.card?.name ?? "포토카드"} 크게 보기`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute top-5 right-5 flex size-10 items-center justify-center text-3xl leading-none text-gray-200 hover:text-white"
      >
        ×
      </button>

      {/* 카드 영역 클릭은 배경 클릭(닫기)으로 번지지 않게 막는다.
          폭: 화면 폭의 88% 또는 화면 높이의 88%에 카드 비율(400:586)을 적용한 값 중 작은 쪽 */}
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(88vw, calc(88vh * 400 / 586), 440px)" }}
      >
        <TiltCard>
          <ScaledPhotoCard {...cardProps} onClick={undefined} />
        </TiltCard>
      </div>
    </div>,
    document.body,
  );
}
