"use client";

import { useEffect, useRef, useState } from "react";

// 포인터 위치에 따라 카드가 기울어지는 3D 효과(틸트) + 포인터를 따라다니는 빛 반사(glare).
// 원리: 포인터의 카드 내 위치(0~1)를 중앙 기준으로 바꿔 rotateX/rotateY 각도로 쓴다.
//   모서리에 가까울수록 각도가 커져 그 모서리가 눌리는 것처럼 보인다.
// 성능: 포인터 이벤트마다 React 상태를 바꾸지 않고, requestAnimationFrame으로 묶어 CSS 변수만 갱신한다.
const DEFAULT_MAX_TILT_DEG = 12;
const HOVER_SCALE = 1.03;

/**
 * @param {{ children: React.ReactNode, maxTilt?: number, className?: string }} props
 */
export default function TiltCard({ children, maxTilt = DEFAULT_MAX_TILT_DEG, className = "" }) {
  // 각도 계산은 기울어지지 않는 바깥 요소 기준으로 한다 (기울어진 요소를 재면 크기가 계속 바뀌어 떨린다)
  const containerRef = useRef(null);
  const tiltRef = useRef(null);
  const frameRef = useRef(0);
  const [isActive, setIsActive] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  // 시스템의 '동작 줄이기' 설정을 켠 사용자에게는 기울기를 끈다
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setIsReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  function setVars({ rotateX, rotateY, glareX, glareY }) {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", `${rotateX}deg`);
    el.style.setProperty("--tilt-y", `${rotateY}deg`);
    el.style.setProperty("--glare-x", `${glareX}%`);
    el.style.setProperty("--glare-y", `${glareY}%`);
  }

  function handlePointerMove(event) {
    if (isReducedMotion) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);

    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      setVars({
        // 위쪽을 가리키면 위 모서리가 뒤로(멀어지게), 오른쪽을 가리키면 오른쪽 모서리가 뒤로 넘어간다
        rotateX: (0.5 - y) * 2 * maxTilt,
        rotateY: (x - 0.5) * 2 * maxTilt,
        glareX: x * 100,
        glareY: y * 100,
      });
    });
  }

  function handlePointerEnter() {
    if (!isReducedMotion) setIsActive(true);
  }

  function handlePointerLeave() {
    cancelAnimationFrame(frameRef.current);
    setIsActive(false);
    setVars({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 50 });
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ perspective: "1000px" }}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div
        ref={tiltRef}
        className="relative"
        style={{
          transform: `rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)) scale(${isActive ? HOVER_SCALE : 1})`,
          // 움직이는 동안은 짧게 따라가고, 포인터가 나가면 천천히 제자리로 돌아온다
          transition: isActive ? "transform 120ms ease-out" : "transform 600ms ease",
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {children}

        {/* 빛 반사: 포인터 위치를 중심으로 밝게 비친다. 카드 모서리 둥근 정도(10/400)에 맞춰 잘라낸다 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[2.5%/1.7%]"
          style={{
            background:
              "radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.08) 35%, transparent 60%)",
            mixBlendMode: "overlay",
            opacity: isActive ? 1 : 0,
            transition: "opacity 300ms ease",
          }}
        />
      </div>
    </div>
  );
}
