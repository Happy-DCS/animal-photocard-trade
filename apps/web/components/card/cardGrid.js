// 포토카드 목록 그리드 — 마이갤러리와 마켓플레이스가 같은 칸 폭을 갖도록 한 곳에서 정의한다.
// 카드 폭은 이 그리드 한 칸 폭으로 정해지므로(ScaledPhotoCard), 두 페이지는 컨테이너 폭도 같아야 한다:
//   모바일: 화면 - 좌우 16px, 태블릿: 최대 680px(좌우 24px 여백), PC: 1240px
//   → PC에서 3열 · 간격 20px이면 카드 한 장이 정확히 400px(PhotoCard 원본 폭)이 된다
export const PHOTO_CARD_GRID_CLASS = "grid w-full grid-cols-2 gap-3 tablet:gap-5 pc:grid-cols-3";
