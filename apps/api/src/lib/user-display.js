// 다른 사람에게 보여줄 유저 닉네임. 탈퇴한 유저는 행이 남아 있어도(카드 원작자·판매 기록 유지) 이름 대신 이 문구로 보인다.
// DB의 nickname은 고유값이라 탈퇴 시 "탈퇴한사용자_<id 일부>"처럼 겹치지 않는 값으로 바꿔 두고, 화면에는 이 함수 결과를 쓴다
export const WITHDRAWN_USER_NICKNAME = "탈퇴한 사용자";

export function toPublicNickname(user) {
  if (!user) return null;
  return user.deletedAt ? WITHDRAWN_USER_NICKNAME : user.nickname;
}

// 카드 원작자·판매자·교환 제시자처럼 응답에 싣는 다른 유저 정보
export function toPublicUserRef(user) {
  return user ? { id: user.id, nickname: toPublicNickname(user) } : null;
}
