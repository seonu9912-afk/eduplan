import { annualSchema, defaultAnnual } from "./academic";
import type { Json } from "./database.types";
import type { Context, Row } from "./models";
import type { PlanningDomain } from "./planning-completion";

export type SchoolPlanPublication = Row<"school_plan_publications">;
export type CurriculumPublication = {
  id: string;
  cohort_year: number;
  confirmed_at: string;
  version: number;
  hours: Pick<Row<"curriculum_hours">, "grade" | "semester" | "subject_id" | "hours">[];
};
export type TeachingPublication = {
  course_id: string;
  version: number;
  published_at: string;
  grade: number;
  semester: number;
  subject_name: string;
  teacher_name: string;
  units: import("./teaching").TeachingDocument["units"];
  evaluations: import("./teaching").TeachingDocument["evaluations"];
};

export const managementDomains: Partial<Record<string, PlanningDomain>> = {
  calendar: "calendar",
  plans: "plans",
  curriculum: "curriculum",
  timetable: "timetable",
  teachers: "staffing",
};

export function publicationAt(publications: SchoolPlanPublication[], domain: "calendar" | "plans", date: string) {
  return publications.filter((p) => p.domain === domain && p.starts_on <= date)
    .sort((a, b) => b.starts_on.localeCompare(a.starts_on) || b.source_version - a.source_version ||
      b.published_at.localeCompare(a.published_at))[0];
}

function objectValue(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json> : {};
}

export function publishedSchoolContext(c: Context, date: string): Context {
  if (!c.schoolPublications || !c.year) return c;
  const calendar = publicationAt(c.schoolPublications, "calendar", date);
  const work = publicationAt(c.schoolPublications, "plans", date);
  const calendarData = calendar ? objectValue(calendar.payload) : {};
  const workData = work ? objectValue(work.payload) : {};
  const plan = annualSchema.parse({
    ...defaultAnnual(c.grades),
    ...objectValue(calendarData.document ?? null),
    ...Object.fromEntries(Object.entries(workData).filter(([, value]) => value != null)),
  });
  return {
    ...c,
    annual: calendar || work ? {
      academic_year_id: c.year.id, workspace_id: c.workspace.id,
      version: calendar?.source_version ?? work!.source_version,
      history: [], calendar_confirmation: null, document: plan,
      updated_at: calendar?.published_at ?? work!.published_at,
    } as Context["annual"] : null,
    hasOfficialCalendar: !!calendar,
    events: (calendarData.events ?? []) as unknown as Context["events"],
    semesters: calendar ? calendarData.semesters as unknown as Context["semesters"] : c.semesters,
    classes: calendar && Array.isArray(calendarData.classes) && calendarData.classes.length
      ? calendarData.classes as unknown as Context["classes"] : c.classes,
  };
}
