import { CalendarDays, Layers3, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/domain";
export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const q = await searchParams;
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (data.user) redirect(safeNext(q.next));
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <nav>
          <a href="#features">에듀플랜 소개</a>
        </nav>
      </header>
      <main id="main-content">
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="hero-badge">
              <span /> 선생님을 위한 연결된 작업공간
            </span>
            <h1>
              교육의 큰 그림,
              <br />
              <em>하나의 계획으로.</em>
            </h1>
            <p>
              교육과정 편성부터 학사일정까지.
              <br />
              흩어져 있던 학교의 계획을 에듀플랜에서 함께 만드세요.
            </p>
            <div className="hero-footnote">
              <ShieldCheck size={17} />
              개인과 학교의 자료를 안전하게 분리합니다.
            </div>
          </div>
          <section className="landing-login" aria-label="로그인">
            <AuthForm mode="login" next={q.next} error={q.error} embedded />
          </section>
        </section>
        <section id="features" className="landing-features">
          <div className="section-intro">
            <span className="eyebrow">LESS REPETITION, MORE EDUCATION</span>
            <h2>학교의 계획이 자연스럽게 이어지도록</h2>
            <p>선생님의 실제 업무 흐름을 담았습니다.</p>
          </div>
          <div className="feature-grid">
            {[
              {
                icon: Layers3,
                title: "입학부터 졸업까지",
                description:
                  "학교급에 맞는 입학년도별 편성표와 운영 학년도별 시수를 연결해 관리합니다.",
                tag: "교육과정 편성",
              },
              {
                icon: CalendarDays,
                title: "한 번 입력하면, 모든 계획에",
                description:
                  "학교 행사 하나를 달력과 월중·주간계획에서 같은 데이터로 확인합니다.",
                tag: "학사운영",
              },
              {
                icon: ShieldCheck,
                title: "개인의 구상에서 학교의 계획으로",
                description:
                  "개인 작업공간과 학교 공동 작업공간을 분리하고 역할별로 함께 작업합니다.",
                tag: "작업공간",
              },
            ].map(({ icon: Icon, ...f }) => (
              <article key={f.title}>
                <span className="tile-icon">
                  <Icon />
                </span>
                <small>{f.tag}</small>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>교육과정부터 수업까지, 하나의 계획으로.</span>
        <small>EduPlan · MVP</small>
      </footer>
    </div>
  );
}
