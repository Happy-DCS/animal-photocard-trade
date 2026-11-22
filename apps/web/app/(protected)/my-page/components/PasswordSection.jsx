"use client";

import { useState } from "react";

import FormField from "@/components/auth/FormField";
import { ApiError } from "@/lib/api-client";
import { changePassword } from "@/lib/user/api";

import SectionTitle from "./SectionTitle";

const MIN_PASSWORD_LENGTH = 8;
const EMPTY_VALUES = { currentPassword: "", newPassword: "", newPasswordConfirm: "" };

// 서버 에러 코드 → 어느 입력칸 아래에 보여줄지
const ERROR_FIELDS = {
  INVALID_PASSWORD: "currentPassword",
  SAME_PASSWORD: "newPassword",
};

/**
 * 비밀번호 변경 (이메일 가입자만 보이는 섹션).
 * 성공하면 다른 기기의 로그인은 끊기고 이 기기는 그대로 유지된다 (서버가 새 토큰을 쿠키로 내려줌)
 */
export default function PasswordSection() {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined, form: undefined }));
    setMessage("");
  }

  function validate() {
    const nextErrors = {};
    if (!values.currentPassword) nextErrors.currentPassword = "현재 비밀번호를 입력해 주세요.";
    if (values.newPassword.length < MIN_PASSWORD_LENGTH) {
      nextErrors.newPassword = `새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`;
    }
    if (values.newPassword !== values.newPasswordConfirm) {
      nextErrors.newPasswordConfirm = "새 비밀번호가 일치하지 않아요.";
    }
    return nextErrors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    try {
      await changePassword(values);
      setValues(EMPTY_VALUES);
      setMessage("비밀번호를 변경했어요. 다른 기기에서는 다시 로그인해야 해요.");
    } catch (submitError) {
      const field = submitError instanceof ApiError ? ERROR_FIELDS[submitError.code] : undefined;
      setErrors({ [field ?? "form"]: submitError.message ?? "비밀번호를 변경하지 못했어요." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <SectionTitle title="비밀번호 변경" />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <FormField
          label="현재 비밀번호"
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={handleChange}
          error={errors.currentPassword}
        />
        <FormField
          label="새 비밀번호"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          placeholder={`${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요`}
          value={values.newPassword}
          onChange={handleChange}
          error={errors.newPassword}
        />
        <FormField
          label="새 비밀번호 확인"
          type="password"
          name="newPasswordConfirm"
          autoComplete="new-password"
          value={values.newPasswordConfirm}
          onChange={handleChange}
          error={errors.newPasswordConfirm}
        />

        {errors.form && (
          <p role="alert" className="font-sans-400 text-sm text-red">
            {errors.form}
          </p>
        )}
        {message && (
          <p role="status" className="font-sans-400 text-sm text-purple-button">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="h-14 w-full rounded-xs bg-purple-button font-sans-600 text-sm text-white disabled:opacity-50"
        >
          {isSubmitting ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </section>
  );
}
