import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="error-page">
      <h1>접근할 수 없는 페이지입니다</h1>
      <p>주소나 소속 학교의 접근 권한을 확인해 주세요.</p>
      <Link href="/app">소속 학교로 돌아가기</Link>
    </main>
  );
}
