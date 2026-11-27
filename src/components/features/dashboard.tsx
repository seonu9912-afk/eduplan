import { PersonalDay } from "./personal-day";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Context } from "@/lib/models";
import { canPlan } from "@/lib/planning-completion";
import { managementDomains } from "@/lib/school-publications";
import { SchoolShortcuts } from "./school-links";

const tasks = [
  { section: "calendar", name: "학사일정 관리" },
  { section: "plans", name: "월중·주간계획 관리" },
  { section: "curriculum", name: "교육과정 편성" },
  { section: "teachers", name: "교원·수급 관리" },
  { section: "timetable", name: "시간표 관리" },
  { section: "teaching", name: "수업·평가 관리" },
];

export function Dashboard({ context: c, today, publicData }: { context: Context; today: string; publicData?: ReactNode }) {
  const base = `/app/${c.workspace.id}`;
  const suffix = c.year ? `?year=${c.year.year}` : "";
  const manage = suffix ? `${suffix}&view=manage` : "?view=manage";
  const duties = tasks.filter(({ section }) => {
    const domain = managementDomains[section] ?? "assessment";
    return canPlan(c, domain);
  });
  const releases: { id: string; date: string; startsOn: string; name: string; path: string }[] = (c.schoolPublications ?? []).filter((release) => release.starts_on <= today)
    .map((release) => ({
      id: release.id, date: release.published_at, startsOn: release.starts_on,
      name: release.domain === "calendar" ? "학사일정" : "월중·주간계획",
      path: release.domain,
    }));
  for (const timetable of c.operations?.effectiveTimetables ?? []) {
    if (timetable.starts_on <= today && timetable.published_at)
      releases.push({ id: timetable.id, date: timetable.published_at, startsOn: timetable.starts_on, name: "시간표", path: "timetable" });
  }
  releases.sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <h1 className="sr-only">홈</h1>
    <PersonalDay context={c} today={today} />
    <div className="school-home-extras">
      <SchoolShortcuts context={c} />
      {publicData}
    </div>
    <div className="dashboard-columns school-dashboard-plans">
      <section className="school-dashboard-section">
        <h2>최근 공개 계획</h2>
        {releases.length ? <ul className="school-dashboard-links">
          {releases.slice(0, 5).map((release) => <li key={release.id}>
            <Link href={`${base}/${release.path}${suffix}`}>
              <span>{release.name} <small>{release.startsOn} 적용</small></span><ArrowRight size={16} />
            </Link>
          </li>)}
        </ul> : <p>공개된 계획이 없습니다.</p>}
      </section>
      {(duties.length > 0 || c.role === "admin") && <section className="school-dashboard-section">
        <h2>담당 업무</h2>
        <ul className="school-dashboard-links">
          {duties.map((duty) => <li key={duty.section}>
            <Link href={`${base}/${duty.section}${manage}`}>{duty.name}<ArrowRight size={16} /></Link>
          </li>)}
          {c.role === "admin" && <li><Link href={`${base}/people${suffix}`}>구성원·업무 담당자<ArrowRight size={16} /></Link></li>}
        </ul>
      </section>}
    </div>
  </>;
}
