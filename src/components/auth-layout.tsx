import type { ReactNode } from "react";
import { BookOpenCheck, CalendarDays, Layers3 } from "lucide-react";
import { Brand } from "@/components/brand";
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <Brand light />
        <div>
          <span className="eyebrow">FOR BETTER SCHOOL DAYS</span>
          <h2>
            교육과정부터 수업까지,
            <br />
            하나의 계획으로.
          </h2>
          <p>
            계획은 더 간결하게,
            <br />
            선생님의 시간은 더 가치 있게.
          </p>
          <div className="auth-features">
            <span>
              <Layers3 />
              함께 설계하는 교육과정
            </span>
            <span>
              <CalendarDays />한 번 입력하는 학사일정
            </span>
            <span>
              <BookOpenCheck />
              학교별로 안전한 작업공간
            </span>
          </div>
        </div>
        <small>EduPlan · 학교의 내일을 함께 계획합니다.</small>
      </aside>
      <section className="auth-form-area">{children}</section>
    </main>
  );
}
