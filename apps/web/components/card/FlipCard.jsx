"use client";

import { useState } from "react";

// 클릭하면 Y축으로 180도 돌아 뒷면을 보여주는 카드. 다시 클릭하면 앞면으로 돌아온다.
// 앞면(front)이 크기를 정하고, 뒷면(back)은 그 위에 겹쳐 같은 크기로 그려진다.
//
// TiltCard 안에 넣어 쓸 때: 바깥 div는 transform-style이 기본값(flat)이라 뒤집기 결과를 한 평면으로 합친다.
// 그래서 TiltCard의 빛 반사가 뒤집히는 도중에도 카드 앞쪽에 그대로 얹혀 보인다
const FLIP_DURATION_MS = 600;

/**
 * @param {{ front: React.ReactNode, back: React.ReactNode, className?: string }} props
 */
export default function FlipCard({ front, back, className = "" }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className={className} style={{ perspective: "1200px" }}>
      <button
        type="button"
        onClick={() => setIsFlipped((value) => !value)}
        aria-pressed={isFlipped}
        aria-label={isFlipped ? "앞면 보기" : "뒷면 보기"}
        className="relative block w-full cursor-pointer text-left"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateY(${isFlipped ? 180 : 0}deg)`,
          transition: `transform ${FLIP_DURATION_MS}ms cubic-bezier(0.4, 0.2, 0.2, 1)`,
        }}
      >
        <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          {front}
        </div>
        <div
          aria-hidden={!isFlipped}
          className="absolute inset-0"
          style={{
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          {back}
        </div>
      </button>
    </div>
  );
}
