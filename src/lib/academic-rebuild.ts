import { addDays, monthRange, isoDate } from "./domain";
import { type AnnualPlan, type AcademicDay } from "./academic";
import type { Context } from "./models";

export function datePeriod(
  year: number,
  from: string,
  to: string,
  plan: AnnualPlan,
) {
  if (!isoDate.safeParse(from).success || !isoDate.safeParse(to).success || from < `${year}-03-01` ||
      to > monthRange(`${year + 1}-02`).end || from > to) return [];
  const days: { date: string; conflict: string | null }[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const entry = plan.days[date];
    const holiday = plan.holidays[date] || (date.endsWith("-03-01") ? "삼일절" : "");
    const vacation = plan.vacations.find((v) => v.start <= date && date <= v.end);
    days.push({ date, conflict: entry?.name || (entry ? "개별 설정" : "") ||
      holiday || vacation?.name || null });
  }
  return days;
}

export type PeriodAssignment = Pick<AnnualPlan["allocations"][number],
  "eventId" | "date" | "title" | "department">;

export function applyEventPeriods(
  allocations: AnnualPlan["allocations"],
  event: PeriodAssignment,
  grade: number,
  slots: number[],
  area: AnnualPlan["allocations"][number]["areas"][string],
  makeId: () => string,
  classId?: string,
) {
  const selected = new Set(slots);
  const relevant = (row: AnnualPlan["allocations"][number]) =>
    row.eventId === event.eventId && row.date === event.date && row.classId === classId &&
    [...selected].some((period) => row.start <= period && period <= row.end);
  const rows = allocations.flatMap((row) => {
    if (!relevant(row) || !row.areas[grade]) return [row];
    const pieces: AnnualPlan["allocations"] = [];
    for (let period = row.start; period <= row.end; period++) {
      const fields = { ...row.areas };
      if (selected.has(period)) delete fields[grade];
      if (Object.values(fields).some((value) => value !== "없음")) {
        const last = pieces.at(-1);
        if (last?.end === period - 1 &&
            Object.entries(last.areas).length === Object.entries(fields).length &&
            Object.entries(fields).every(([key, value]) => last.areas[key] === value)) {
          last.end = period;
        } else {
          pieces.push({ ...row, id: pieces.length ? makeId() : row.id,
            start: period, end: period, areas: fields });
        }
      }
    }
    return pieces;
  });
  if (area === "없음") return rows;
  let last: AnnualPlan["allocations"][number] | undefined;
  for (const period of [...selected].sort((a, b) => a - b)) {
    if (last?.end === period - 1) {
      last.end = period;
    } else {
      last = { ...event, id: makeId(), classId, start: period, end: period, areas: { [grade]: area } };
      rows.push(last);
    }
  }
  return rows;
}

type CurriculumInput = Pick<Context, "plans" | "hours" | "subjects" | "groups" | "grades">;

export function hoursRange(values: number[]) {
  const min = Math.min(...values), max = Math.max(...values);
  return min === max ? min : `${min}~${max}`;
}

export function curriculumTargets(year: number, context: CurriculumInput) {
  const groups = new Map(context.groups.map(({ id, name }) => [id, name]));
  const subjects = new Map(context.subjects.map((subject) => [subject.id, subject]));
  return context.grades.flatMap((grade) => {
    const plan = context.plans.find((item) => item.cohort_year === year - grade + 1 && item.unit === "hours");
    return [1, 2].map((semester) => {
      const rows = context.hours.filter((row) =>
        row.plan_id === plan?.id && row.grade === grade && row.semester === semester);
      let subject = 0;
      let creative = 0;
      for (const row of rows) {
        const item = subjects.get(row.subject_id);
        if (!item) continue;
        const group = groups.get(item.group_id) ?? "";
        if (/창의적\s*체험활동|^창체$/u.test(group) ||
            /^(창의적\s*체험활동|창체|자율[·ㆍ]자치|동아리|봉사|진로)$/u.test(item.name)) {
          creative += row.hours;
        } else {
          subject += row.hours;
        }
      }
      return { grade, semester, subject: rows.length ? subject : null,
        creative: rows.length ? creative : null };
    });
  });
}

export function academicEventInTerm(
  event: { start_date: string; end_date: string },
  days: AcademicDay[],
  semester: number,
) {
  return !semester || days.some((day) =>
    day.semester === semester && event.start_date <= day.date && day.date <= event.end_date);
}
