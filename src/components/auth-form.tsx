"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import {
  login,
  signup,
  requestPasswordReset,
  updatePassword,
} from "@/app/actions";
import {
  Field,
  InlineNotice,
  SubmitButton,
  useMutation,
} from "@/components/common";
import { safeNext } from "@/lib/domain";
export type AuthMode = "login" | "signup" | "forgot" | "reset";
export function AuthForm({
  mode,
  next,
  error,
  embedded = false,
}: {
  mode: AuthMode;
  next?: string;
  error?: string;
  embedded?: boolean;
}) {
  const Heading = embedded ? "h2" : "h1";
  const m = useMutation();
  const router = useRouter();
  const title = {
    login: "다시 만나 반가워요",
    signup: "함께 만드는 교육의 시작",
    forgot: "비밀번호 재설정",
    reset: "새 비밀번호 설정",
  }[mode];
  const subtitle = {
    login: "에듀플랜에서 오늘의 학교를 계획해 보세요.",
    signup: "개인 작업공간에서 시작하고, 학교와 함께하세요.",
    forgot: "가입하신 이메일로 재설정 링크를 보내드립니다.",
    reset: "안전한 새 비밀번호를 입력해 주세요.",
  }[mode];
  return (
    <div className="auth-card">
      <span className="eyebrow">YOUR EDUCATION, CONNECTED</span>
      {mode !== "login" ? <Heading>{title}</Heading> : null}
      <p className="auth-description">{subtitle}</p>
      {error ? (
        <p className="notice notice-error" role="alert">
          인증 링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const email = String(f.get("email") ?? "");
          const password = String(f.get("password") ?? "");
          if (mode === "login")
            m.execute(
              () => login({ email, password }),
              () => {
                router.push(safeNext(next));
                router.refresh();
              },
              "로그인되었습니다.",
            );
          if (mode === "signup")
            m.execute(
              () =>
                signup({
                  email,
                  password,
                  display_name: String(f.get("display_name")),
                }),
              (data) => {
                if (data.signedIn) router.push("/app");
              },
              "이메일을 확인해 인증을 완료해 주세요. 스팸함도 확인해 주세요.",
            );
          if (mode === "forgot")
            m.execute(
              () => requestPasswordReset(email),
              undefined,
              "가입된 이메일이라면 재설정 안내가 전송됩니다.",
            );
          if (mode === "reset")
            m.execute(
              () => updatePassword(password),
              () => router.push("/app"),
              "비밀번호가 변경되었습니다.",
            );
        }}
        className="form-stack"
      >
        {mode === "signup" ? (
          <Field label="이름" id="display_name">
            <input
              id="display_name"
              name="display_name"
              placeholder="김선생"
              autoComplete="name"
              maxLength={40}
              required
            />
          </Field>
        ) : null}
        {mode !== "reset" ? (
          <Field label="이메일" id="email">
            <input
              id="email"
              name="email"
              type="email"
              placeholder="teacher@school.kr"
              autoComplete="email"
              required
            />
          </Field>
        ) : null}
        {mode !== "forgot" ? (
          <Field
            label={mode === "reset" ? "새 비밀번호" : "비밀번호"}
            id="password"
            hint={
              mode !== "login"
                ? "10자 이상, 128자 이하로 입력해 주세요."
                : undefined
            }
          >
            <input
              id="password"
              name="password"
              type="password"
              minLength={mode === "login" ? 1 : 10}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
            />
          </Field>
        ) : null}
        {mode === "login" ? (
          <Link href="/forgot-password" className="forgot-link">
            비밀번호를 잊으셨나요?
          </Link>
        ) : null}
        <InlineNotice mutation={m} />
        <SubmitButton pending={m.pending}>
          {mode === "login"
            ? "로그인"
            : mode === "signup"
              ? "계정 만들기"
              : mode === "forgot"
                ? "재설정 링크 보내기"
                : "새 비밀번호 저장"}
          <ArrowRight size={17} />
        </SubmitButton>
      </form>
      <p className="auth-switch">
        {mode === "login" ? (
          <>
            아직 계정이 없으신가요? <Link href="/signup">회원가입</Link>
          </>
        ) : (
          <Link href="/">로그인으로 돌아가기</Link>
        )}
      </p>
      <p className="auth-note">
        <LockKeyhole size={14} />
        학교와 개인 자료는 분리하여 보관됩니다.
      </p>
    </div>
  );
}
