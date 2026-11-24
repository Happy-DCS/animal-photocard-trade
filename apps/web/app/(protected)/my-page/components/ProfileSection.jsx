"use client";

import { useState } from "react";

import FormField from "@/components/auth/FormField";
import { ApiError } from "@/lib/api-client";
import { updateProfile } from "@/lib/user/api";

import SectionTitle from "./SectionTitle";

const NICKNAME_MAX_LENGTH = 20;
const PROVIDER_LABELS = { local: "이메일 가입", google: "Google 계정" };

/**
 * 내 정보: 로그인 방식·이메일(읽기 전용)과 닉네임 변경.
 * 이메일은 인증 메일 수단이 없어 바꿀 수 없게 한다 (다른 사람 이메일로 바꿔 선점하는 걸 막기 위함)
 * @param {{ currentUser: object, onUpdated: (patch: object) => void }} props
 */
export default function ProfileSection({ currentUser, onUpdated }) {
  const [nickname, setNickname] = useState(currentUser.nickname);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmed = nickname.trim();
  const canSubmit = trimmed !== "" && trimmed !== currentUser.nickname && !isSubmitting;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    if (trimmed.length > NICKNAME_MAX_LENGTH) {
      setError(`닉네임은 ${NICKNAME_MAX_LENGTH}자 이하로 입력해 주세요.`);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");
    try {
      const { user } = await updateProfile({ nickname: trimmed });
      onUpdated({ nickname: user.nickname });
      setNickname(user.nickname);
      setMessage("닉네임을 변경했어요.");
    } catch (submitError) {
      setError(
        submitError instanceof ApiError && submitError.code === "NICKNAME_ALREADY_EXISTS"
          ? "이미 사용 중인 닉네임이에요."
          : (submitError.message ?? "닉네임을 변경하지 못했어요."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <SectionTitle title="내 정보" />

      <dl className="grid grid-cols-[96px_1fr] gap-y-3 tablet:grid-cols-[120px_1fr] font-sans-400 text-sm tablet:text-base">
        <dt className="text-gray-300">로그인 방식</dt>
        <dd className="text-white">
          {PROVIDER_LABELS[currentUser.provider] ?? currentUser.provider}
        </dd>
        <dt className="text-gray-300">이메일</dt>
        <dd className="break-all text-white">{currentUser.email}</dd>
      </dl>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <FormField
              label="닉네임"
              name="nickname"
              value={nickname}
              maxLength={NICKNAME_MAX_LENGTH}
              onChange={(event) => {
                setNickname(event.target.value);
                setError("");
                setMessage("");
              }}
              error={error}
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className={`h-14 shrink-0 rounded-xs bg-purple-button px-6 font-sans-600 text-sm text-white disabled:opacity-50 ${
              error ? "mb-6" : ""
            }`}
          >
            {isSubmitting ? "저장 중..." : "저장"}
          </button>
        </div>
        {message && (
          <p role="status" className="font-sans-400 text-sm text-purple-button">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
