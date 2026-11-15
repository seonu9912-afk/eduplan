import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="error-page">
      <h1>접근할 수 없는 페이지입니다</h1>
      <p>주소가 올바르지 않거나 작업공간 접근 권한이 없습니다.</p>
      <Link href="/app">내 작업공간으로 돌아가기</Link>
    </main>
  );
}
