import { Disclosure } from "@/components/ui/disclosure";
import { PersonalDay } from "./personal-day";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  BookOpen,
  School,
  Users,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/common";
import { weekRange, overlaps, dateLabel, eventTypes } from "@/lib/domain";
import type { Context } from "@/lib/models";
export function Dashboard({
  context: c,
  today,
}: {
  context: Context;
  today: string;
}) {
  const base = `/app/${c.workspace.id}`;
  const suffix = c.year ? `?year=${c.year.year}` : "";
  const week = weekRange(today);
  const weekly = c.events.filter((e) => overlaps(e, week.start, week.end));
  const upcoming = c.events.filter((e) => e.end_date >= today).slice(0, 4);
  const steps = [
    { done: !!c.year, label: "학년도와 학급 설정", path: "settings" },
    { done: c.events.length > 0, label: "첫 학사일정 등록", path: "calendar" },
    {
      done: c.plans.length > 0,
      label: "교육과정 편성 시작",
      path: "curriculum",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>학교 현황</h1>
        </div>
        <Button asChild variant="outline">
          <Link href={`${base}/calendar${suffix}`}>
            <CalendarDays />
            학사일정 보기
          </Link>
        </Button>
      </div>
      <PersonalDay context={c} today={today}/>
      <section className="stats-grid" aria-label="작업공간 현황">
        {[
          {
            icon: School,
            label: "전체 학급",
            value: c.classes.length,
            unit: "학급",
            detail: c.year
              ? c.grades
                  .map(
                    (g) =>
                      `${g}학년 ${c.classes.filter((x) => x.grade === g).length}`,
                  )
                  .join(" · ")
              : "학년도 설정이 필요해요",
            color: "blue",
          },
          {
            icon: CalendarDays,
            label: "이번 주 일정",
            value: weekly.length,
            unit: "건",
            detail: `${dateLabel(week.start)} – ${dateLabel(week.end)}`,
            color: "teal",
          },
          {
            icon: BookOpen,
            label: "교육과정 편성안",
            value: c.plans.length,
            unit: "개",
            detail: `입학년도별 ${c.grades.length}개년 계획`,
            color: "violet",
          },
          {
            icon: Users,
            label: "구성원",
            value: c.members.length,
            unit: "명",
            detail:
              c.workspace.kind === "personal"
                ? "개인 작업공간"
                : "학교 작업공간",
            color: "amber",
          },
        ].map(({ icon: Icon, ...s }) => (
          <article className="stat-card" key={s.label}>
            <div>
              <span>{s.label}</span>
              <span className={`tile-icon ${s.color}`}>
                <Icon size={20} />
              </span>
            </div>
            <strong>
              {s.value.toLocaleString()}
              <small>{s.unit}</small>
            </strong>
            <p>{s.detail}</p>
          </article>
        ))}
      </section>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <CalendarDays size={19} />
              다가오는 일정
            </h2>
            <Link href={`${base}/calendar${suffix}`}>
              전체 보기
              <ArrowRight size={14} />
            </Link>
          </div>
          {upcoming.length ? (
            <div className="upcoming-list">
              {upcoming.map((e) => (
                <Link
                  href={`${base}/calendar${suffix}`}
                  className="upcoming-item"
                  key={e.id}
                >
                  <div className="date-tile">
                    <small>{Number(e.start_date.slice(5, 7))}월</small>
                    <strong>{Number(e.start_date.slice(8, 10))}</strong>
                  </div>
                  <div>
                    <span className={`event-label type-${e.event_type}`}>
                      {eventTypes[e.event_type as keyof typeof eventTypes]}
                    </span>
                    <h3>{e.title}</h3>
                    <p>
                      {e.department || "담당 부서 미지정"} ·{" "}
                      {e.target_grades.join("·")}학년
                    </p>
                  </div>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              icon={<CalendarDays />}
              title="다가오는 일정이 없어요"
              description="학사일정을 등록하면 여기에서 함께 확인할 수 있어요."
              action={
                <Button variant="outline" asChild>
                  <Link href={`${base}/calendar${suffix}`}>
                    일정 등록하러 가기
                  </Link>
                </Button>
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <Clock3 size={19} />
              최근 작업
            </h2>
            <span className="muted-small">최신 8건</span>
          </div>
          {c.activities.length ? (
            <ol className="activity-list">
              {c.activities.map((a) => (
                <li key={a.id}>
                  <span className="activity-point" />
                  <div>
                    <strong>{a.label}</strong>
                    <p>
                      {new Intl.DateTimeFormat("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(a.created_at))}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <Empty
              icon={<Clock3 />}
              title="첫 계획을 기다리고 있어요"
              description="일정이나 편성표를 저장하면 작업 이력이 남습니다."
            />
          )}
        </section>
      </div>
      <Disclosure className="dashboard-setup no-print" label="학교 운영 시작 가이드">
        <ul>
          {steps.map(({ done, label, path }) => (
            <li key={path}>
              <Link href={`${base}/${path}${suffix}`}>
                {label}
                <span className={done ? "setup-complete" : undefined}>
                  {done ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}
                  {done ? "완료" : "열기"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Disclosure>
    </>
  );
}
