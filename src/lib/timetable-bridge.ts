import { z } from "zod";
import type { Context } from "./models";
import { annualSchema, calculateAcademic, defaultAnnual, isTeachingDay } from "./academic";
import type { Json } from "./database.types";

/** The old timetable editor's real document shape, retained for lossless legacy reuse. */
export const timetableDocumentSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  classes: z.array(z.object({ id: z.string().min(1), grade: z.number().int().min(1).max(6), label: z.string().min(1) }).passthrough()).max(120),
  subjects: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), kind: z.string().min(1) }).passthrough()).max(150),
  teachers: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) }).passthrough()).max(150),
  groups: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), classIds: z.array(z.string()) }).passthrough()).max(120),
  rooms: z.array(z.string().max(70)).max(100),
  weekly: z.array(z.object({
    id: z.string().min(1), scope: z.enum(["class", "group"]), scopeId: z.string().min(1),
    weekday: z.number().int().min(1).max(5), period: z.number().int().min(1).max(12),
    subjectId: z.string().min(1), teacherId: z.string(), room: z.string(),
  }).passthrough()).max(2400),
  dayRules: z.array(z.object({ date: z.iso.date(), kind: z.string(), label: z.string(), weekdayOverride: z.number().int().min(0).max(5) }).passthrough()).max(370),
  overrides: z.array(z.object({ date: z.iso.date(), scope: z.enum(["class", "group"]), scopeId: z.string(), period: z.number().int().min(1).max(12) }).passthrough()).max(1800),
  timetableConfig: z.object({
    lessons: z.array(z.object({
      id: z.string(), scope: z.enum(["class", "group"]), scopeId: z.string(), subjectId: z.string(),
      teacherId: z.string(), room: z.string(), hours: z.number().min(0).max(40),
    }).passthrough()).max(1200),
    unavailable: z.array(z.object({ teacherId: z.string(), weekday: z.number().int(), period: z.number().int() }).passthrough()).max(3000),
    periods: z.record(z.string(), z.number().int().min(0).max(12)),
  }).passthrough().optional(),
}).passthrough();
export type TimetableDocument = z.infer<typeof timetableDocumentSchema>;
export type TimetableRecord = { version: number; document: TimetableDocument; updated_at: string | null };

const DEFAULT_ACTIVITIES = [
  { id: "creative-self", label: "자율·자치", kind: "creative_self" },
  { id: "creative-club", label: "동아리", kind: "creative_club" },
  { id: "creative-career", label: "진로활동", kind: "creative_career" },
  { id: "school-autonomy", label: "학교자율시간", kind: "autonomous" },
  { id: "sports", label: "학교스포츠클럽", kind: "sports" },
];
const displayKind = (name: string): string =>
  /자율.?자치/.test(name) ? "creative_self" : /동아리/.test(name) ? "creative_club" :
  /진로/.test(name) ? "creative_career" : /스포츠/.test(name) ? "sports" :
  /학교자율/.test(name) ? "autonomous" : "subject";
export function officialTimetableDayRules(c: Context): TimetableDocument["dayRules"] {
  if (!c.year) return [];
  const parsed = annualSchema.safeParse(c.annual?.document ?? defaultAnnual(c.grades));
  if (!parsed.success) return [];
  const result = calculateAcademic(c.year.year, parsed.data, c.grades, c.semesters, c.classes);
  return result.days.filter((day) => (day.type !== "instructional" || day.name || !day.enabled)).map((day) => ({
    date: day.date,
    kind: isTeachingDay(day) ? "instruction" :
      day.type === "vacation" ? "vacation" : day.type === "holiday" ? "holiday" : "closed",
    label: day.name || "",
    weekdayOverride: day.type === "swap" ? day.weekday : 0,
  }));
}
function baseSubjects(c: Context): TimetableDocument["subjects"] {
  const subjects = c.subjects.map((subject) => ({
    id: subject.id, label: subject.name, kind: displayKind(subject.name),
  }));
  for (const item of DEFAULT_ACTIVITIES) {
    if (!subjects.some((subject) => subject.kind === item.kind)) subjects.push(item);
  }
  return subjects;
}
export function newTimetableDocument(c: Context): TimetableDocument {
  return {
    year: c.year?.year ?? 2027,
    status: "draft",
    classes: c.classes.map((schoolClass) => ({
      id: schoolClass.id, grade: schoolClass.grade,
      label: schoolClass.grade + "학년 " + schoolClass.class_number + "반",
    })),
    subjects: baseSubjects(c),
    teachers: c.members.map((member) => ({ id: member.user_id, label: member.display_name })),
    groups: [], rooms: [], weekly: [], dayRules: officialTimetableDayRules(c),
    overrides: [], targetDays: 190, targets: [], timetableConfigured: false,
    createdAt: new Date().toISOString(),
  };
}
/** Keep archived or manually added fields and teachers; merge new official subjects and classes without deleting data. */
export function mergeTimetableDocument(c: Context, existing: TimetableDocument): TimetableDocument {
  const current = newTimetableDocument(c);
  const classes = [...current.classes];
  for (const old of existing.classes) if (!classes.some((row) => row.id === old.id)) classes.push(old);
  const subjects = [...current.subjects];
  for (const old of existing.subjects) if (!subjects.some((row) => row.id === old.id)) subjects.push(old);
  const teachers = [...current.teachers];
  for (const old of existing.teachers) if (!teachers.some((row) => row.id === old.id)) teachers.push(old);
  return {
    ...existing, year: current.year, classes, subjects, teachers,
    dayRules: current.dayRules,
  };
}
export function legacyTimetableEvents(c: Context): Record<string, unknown>[] {
  if (!c.year) return [];
  const parsed = annualSchema.safeParse(c.annual?.document ?? defaultAnnual(c.grades));
  if (!parsed.success) return [];
  const byEvent = new Map(c.events.map((event) => [event.id, event]));
  return parsed.data.allocations.flatMap((allocation) =>
    Object.entries(allocation.areas).filter(([, area]) => area && area !== "없음").map(([grade, area]) => {
      const original = allocation.eventId ? byEvent.get(allocation.eventId) : undefined;
      return {
        id: allocation.id, date: allocation.date, endDate: allocation.date,
        name: original?.title ?? allocation.title, department: original?.department ?? allocation.department,
        grades: [Number(grade)], gradeAreas: { [grade]: area },
        ...(allocation.classId ? { classIds: [allocation.classId] } : {}),
        periodStart: allocation.start, periodEnd: allocation.end, affectsTimetable: true,
      };
    })
  );
}
/** The old editor reads this shape; the authoritative calendar remains in current EduPlan. */
export function legacyTimetableSpace(c: Context, document: TimetableDocument) {
  const year = c.year?.year ?? document.year;
  const courses = c.subjects.map((subject) => ({
    id: subject.id, name: subject.name,
    group: c.groups.find((group) => group.id === subject.group_id)?.name ?? "기타",
    area: displayKind(subject.name) === "subject" ? "subject" : displayKind(subject.name),
  }));
  const cohorts: Record<string, Record<string, unknown>> = {};
  for (const grade of c.grades) {
    const cohortYear = year - grade + 1;
    const entries: Record<string, Record<string, number>> = {};
    for (const term of [1, 2]) {
      const k = grade + "-" + term;
      entries[k] = {};
      for (const hour of c.hours) {
        const plan = c.plans.find((p) => p.id === hour.plan_id);
        if (plan?.cohort_year !== cohortYear || hour.grade !== grade || hour.semester !== term) continue;
        entries[k][hour.subject_id] = hour.hours;
      }
    }
    cohorts[String(cohortYear)] = {
      year: cohortYear, source: "EduPlan 공식 교육과정",
      terms: entries, baseTerms: {}, targets: {},
      completeGrades: Object.values(entries).some((entry) => Object.keys(entry).length) ? [grade] : [],
      weeks: 16,
    };
  }
  return {
    academics: { [String(year)]: document },
    staffMembers: c.members.map((member) => ({
      id: member.user_id, name: member.display_name, subject: "", status: "재직",
    })),
    events: legacyTimetableEvents(c),
    curricula: { courses, cohorts, standards: {}, staffing: {} },
    workspaceId: c.workspace.id, academicYearId: c.year?.id ?? "",
  };
}
export function timetableJson(document: TimetableDocument): Json {
  return JSON.parse(JSON.stringify(document)) as Json;
}
