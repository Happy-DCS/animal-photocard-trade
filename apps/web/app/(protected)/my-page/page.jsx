"use client";

import AppHeader from "@/components/ui/AppHeader";
import MobileHeader from "@/components/ui/MobileHeader";
import { useAuth } from "@/lib/auth/AuthProvider";

import PasswordSection from "./components/PasswordSection";
import ProfileSection from "./components/ProfileSection";
import WithdrawSection from "./components/WithdrawSection";

// 마이페이지: 내 정보(닉네임 변경) · 비밀번호 변경(이메일 가입자만) · 회원 탈퇴
// (protected) 레이아웃이 로그인 상태를 보장하므로 currentUser는 항상 있다
export default function MyPage() {
  const { currentUser, patchCurrentUser, logout } = useAuth();
  const isLocalAccount = currentUser.provider === "local";

  return (
    <>
      <div className="tablet:hidden">
        <MobileHeader title="마이페이지" backHref="/market" />
      </div>
      <div className="hidden tablet:block">
        <AppHeader />
      </div>

      {/* 마이갤러리·포토카드 생성과 같은 여백·폭: 모바일 좌우 16px · 태블릿 최대 680px(좌우 24px) · PC 1240px */}
      <main className="mx-auto mt-5 flex min-h-screen w-full max-w-[1248px] justify-center px-4 font-sans-400 tablet:mt-20 tablet:px-6 pc:px-0">
        <div className="mb-10 flex h-full w-full flex-col gap-8 tablet:max-w-170 pc:mb-15 pc:w-310 pc:max-w-none pc:gap-20">
          <div className="hidden w-full flex-col gap-3 tablet:flex pc:gap-5">
            <h2 className="text-left font-primary text-3xl tablet:text-4xl pc:text-[62px]">
              마이페이지
            </h2>
            <div className="h-0.5 w-full bg-gray-100" />
          </div>

          <div className="flex w-full flex-col gap-14">
            <ProfileSection currentUser={currentUser} onUpdated={patchCurrentUser} />
            {isLocalAccount && <PasswordSection />}
            {/* 서버가 이미 세션·쿠키를 지웠으므로 로그아웃 API 없이 화면 상태만 정리하고 랜딩으로 이동한다 */}
            <WithdrawSection
              isLocalAccount={isLocalAccount}
              onWithdrawn={() => logout({ skipSignout: true })}
            />
          </div>
        </div>
      </main>
    </>
  );
}
