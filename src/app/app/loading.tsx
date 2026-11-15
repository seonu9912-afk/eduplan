export default function Loading() {
  return (
    <main className="loading-page" aria-busy="true">
      <div className="loading-logo">EduPlan</div>
      <div className="skeleton-line" />
      <p role="status">학교의 계획을 불러오고 있어요…</p>
    </main>
  );
}
