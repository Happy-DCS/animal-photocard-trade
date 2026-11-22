"use client";

import Image from "next/image";
import { useState } from "react";

import FormField from "@/components/auth/FormField";
import { withdraw } from "@/lib/user/api";

import SectionTitle from "./SectionTitle";

// 소셜 가입자는 비밀번호가 없어서, 이 문구를 그대로 입력해 본인 의사를 확인한다 (서버와 같은 값)
const CONFIRM_TEXT = "탈퇴합니다";

const NOTICES = [
  "보유한 포토카드와 포인트는 모두 사라지며 복구할 수 없어요.",
  "판매 중인 포토카드는 자동으로 판매가 취소되고, 보낸 교환 제시도 취소돼요.",
  '이미 거래된 카드와 기록에는 이름 대신 "탈퇴한 사용자"로 표시돼요.',
];

/**
 * 회원 탈퇴. 버튼을 누르면 확인 모달에서 본인 확인(비밀번호 또는 안내 문구 입력) 후 탈퇴한다.
 * @param {{ isLocalAccount: boolean, onWithdrawn: () => void }} props
 */
export default function WithdrawSection({ isLocalAccount, onWithdrawn }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section className="flex flex-col gap-6">
      <SectionTitle title="회원 탈퇴" />

      <ul className="flex list-disc flex-col gap-1.5 pl-5 font-sans-400 text-sm text-gray-300">
        {NOTICES.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="h-14 w-full rounded-xs border border-red font-sans-600 text-sm text-red hover:bg-red/10"
      >
        회원 탈퇴
      </button>

      {isModalOpen && (
        <WithdrawModal
          isLocalAccount={isLocalAccount}
          onClose={() => setIsModalOpen(false)}
          onWithdrawn={onWithdrawn}
        />
      )}
    </section>
  );
}

function WithdrawModal({ isLocalAccount, onClose, onWithdrawn }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = isLocalAccount ? value !== "" : value === CONFIRM_TEXT;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    try {
      await withdraw(isLocalAccount ? { password: value } : { confirmText: value });
      onWithdrawn();
    } catch (submitError) {
      setError(submitError.message ?? "탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        disabled={isSubmitting}
        className="absolute inset-0 cursor-default bg-black/70"
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-title"
        className="relative z-10 flex w-full max-w-105 flex-col gap-5 rounded-[20px] bg-gray-500 p-8 tablet:p-10"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 disabled:opacity-50"
        >
          <Image src="/close.png" alt="닫기" width={20} height={20} />
        </button>

        <h2
          id="withdraw-title"
          className="text-center font-sans-700 text-lg text-white tablet:text-xl"
        >
          정말 탈퇴하시겠어요?
        </h2>
        <p className="text-center font-sans-400 text-sm text-gray-200">
          {isLocalAccount
            ? "본인 확인을 위해 비밀번호를 입력해 주세요."
            : `확인을 위해 "${CONFIRM_TEXT}"를 그대로 입력해 주세요.`}
        </p>

        <FormField
          label={isLocalAccount ? "비밀번호" : "확인 문구"}
          type={isLocalAccount ? "password" : "text"}
          name="withdrawConfirm"
          autoComplete={isLocalAccount ? "current-password" : "off"}
          placeholder={isLocalAccount ? "" : CONFIRM_TEXT}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          error={error}
        />

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="h-12.5 flex-1 rounded-xs bg-red font-sans-600 text-sm text-white disabled:opacity-50 tablet:h-14"
          >
            {isSubmitting ? "탈퇴 처리 중..." : "탈퇴하기"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-12.5 flex-1 rounded-xs border border-white font-sans-600 text-sm text-white disabled:opacity-50 tablet:h-14"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
