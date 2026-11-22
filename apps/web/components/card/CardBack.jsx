import Image from "next/image";

// 포토카드 뒷면. 앞면(PhotoCard)과 같은 400:586 비율로, 부모 크기를 꽉 채운다.
// 앞면과 같은 테두리·배경 위에 로고와 "최애를 담습니다" 문구를 둔다.
//
// 나중에 이미지로 된 뒷면 디자인을 쓰려면 CARD_BACK_IMAGE에 public 경로를 넣으면 된다.
//   규격: 400:586 비율, 권장 1200×1758px (PNG·WebP·SVG), 모서리는 사각형 그대로 (여기서 둥글게 잘라냄)
const CARD_BACK_IMAGE = null; // 예: "/card-back.png"

// 앞면과 같은 둥글기(10/400 = 2.5%)와 테두리 두께(13/400 = 3.25%)를 퍼센트로 맞춰, 어떤 크기로 표시돼도 비율이 같다
const CARD_RADIUS = "2.5% / 1.7%";

export default function CardBack() {
  if (CARD_BACK_IMAGE) {
    return (
      <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: CARD_RADIUS }}>
        <Image
          src={CARD_BACK_IMAGE}
          alt="포토카드 뒷면"
          fill
          sizes="440px"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className="h-full w-full p-[3.25%]"
      style={{
        borderRadius: CARD_RADIUS,
        background:
          "linear-gradient(135deg, #353535 0%, #575656 38%, #686666 60%, #555454 82%, #353535 100%)",
      }}
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-[4%] rounded-[2px]"
        style={{ background: "linear-gradient(180deg, #636363 0%, #313131 100%)" }}
      >
        <Image
          src="/logo.png"
          alt="최애 멍냥"
          width={351}
          height={86}
          className="h-auto w-1/2 opacity-90"
        />
        <span className="text-xs tracking-[0.2em] text-gray-300">최애를 담습니다</span>
      </div>
    </div>
  );
}
