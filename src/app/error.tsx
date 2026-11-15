"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="error-page">
      <h1>자료를 불러오지 못했어요</h1>
      <p>
        네트워크 연결을 확인하고 다시 시도해 주세요.
        <br />
        계속 문제가 발생하면 다시 로그인해 주세요.
      </p>
      <button onClick={reset}>다시 시도</button>
      <Link href="/login">로그인으로 이동</Link>
    </main>
  );
}
