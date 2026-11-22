"use client";

import { useLayoutEffect, useRef, useState } from "react";

// 한 줄을 넘는 텍스트를 카드(가장 가까운 .group)에 마우스를 올렸을 때 왼쪽→오른쪽으로 훑어 보여준다.
// 넘치지 않으면 아무 움직임 없이 그대로 표시한다. 이동 속도는 글자 길이와 상관없이 일정하다
const PAN_SPEED_PX_PER_SEC = 40;
const MIN_DURATION_SEC = 2;

/**
 * @param {{ children: React.ReactNode, className?: string }} props
 */
export default function MarqueeText({ children, className = "" }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [overflow, setOverflow] = useState(0);

  // transform: scale()로 줄어든 카드 안에서도 scrollWidth·clientWidth는 축소 전 레이아웃 값이라 그대로 비교하면 된다
  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const measure = () => setOverflow(Math.max(0, text.scrollWidth - container.clientWidth));
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(text);
    return () => observer.disconnect();
  }, [children]);

  const isOverflowing = overflow > 0;
  // 양 끝에서 잠깐 멈추는 시간(키프레임의 0~15%, 85~100%)까지 포함한 한 방향 이동 시간
  const duration = Math.max(MIN_DURATION_SEC, overflow / PAN_SPEED_PX_PER_SEC / 0.7);

  return (
    <span
      ref={containerRef}
      className={`block overflow-hidden whitespace-nowrap ${isOverflowing ? "" : "text-ellipsis"} ${className}`}
    >
      <span
        ref={textRef}
        className={`inline-block ${isOverflowing ? "marquee-pan" : ""}`}
        style={
          isOverflowing
            ? {
                "--marquee-distance": `-${overflow}px`,
                "--marquee-duration": `${duration}s`,
              }
            : undefined
        }
      >
        {children}
      </span>
    </span>
  );
}
