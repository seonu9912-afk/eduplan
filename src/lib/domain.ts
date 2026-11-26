import { z } from "zod";

export const schoolTypes = ["초등학교", "중학교", "고등학교"] as const;
export const schoolTypeSchema = z.enum(schoolTypes);
export type SchoolType = z.infer<typeof schoolTypeSchema>;
export function gradesForSchoolType(type: SchoolType): number[] {
  return Array.from({ length: type === "초등학교" ? 6 : 3 }, (_, i) => i + 1);
}

export const roles = {
  admin: "학교 관리자",
  editor: "교사(기존)",
  viewer: "교사",
} as const;
export const eventTypes = {
  school: "학교 행사",
  exam: "평가",
  holiday: "휴업·방학",
  department: "부서 업무",
  other: "기타",
} as const;
export const uuid = z.uuid("올바른 항목을 선택해 주세요.");
export const schoolYearSchema = z.number().int().min(2000).max(2100);
export const hourSchema = z
  .number()
  .int("시수는 정수로 입력해 주세요.")
  .min(0, "음수 시수는 입력할 수 없습니다.")
  .max(2000, "시수는 2,000 이하로 입력해 주세요.");
export const isoDate = z.iso.date("유효한 날짜를 입력해 주세요.");
export const activityAreas = [
  "없음",
  "교과",
  "자율·자치",
  "동아리",
  "진로",
  "학교자율시간",
  "자율",
  "봉사",
] as const;
export const eventSchema = z
  .object({
    id: uuid.optional(),
    workspace_id: uuid,
    academic_year_id: uuid,
    title: z.string().trim().min(1, "일정 제목을 입력해 주세요.").max(120),
    start_date: isoDate,
    end_date: isoDate,
    activity_area: z.enum(activityAreas).default("없음"),
    event_type: z.enum(["school", "exam", "holiday", "department", "other"]),
    target_grades: z
      .array(z.number().int().min(1).max(6))
      .min(1, "대상 학년을 선택해 주세요.")
      .max(6)
      .refine(
        (v) => new Set(v).size === v.length,
        "대상 학년을 중복 없이 선택해 주세요.",
      ),
    department: z.string().trim().max(60),
    description: z.string().trim().max(2000),
    version: z.number().int().min(1).optional(),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "종료일은 시작일 이후여야 합니다.",
    path: ["end_date"],
  });
export const academicSchema = z
  .object({
    target: uuid,
    school_year: schoolYearSchema,
    expected_version: z.number().int().min(0),
    terms: z
      .array(z.object({ start_date: isoDate, end_date: isoDate }))
      .length(2),
    class_counts: z
      .array(z.number().int().min(0).max(30))
      .refine(
        (v) => v.length === 3 || v.length === 6,
        "학교급에 맞는 학급 수를 입력해 주세요.",
      ),
  })
  .superRefine((v, ctx) => {
    const [a, b] = v.terms;
    if (
      a.start_date > a.end_date ||
      a.end_date >= b.start_date ||
      b.start_date > b.end_date ||
      a.start_date < `${v.school_year}-03-01` ||
      b.end_date >= `${v.school_year + 1}-03-01`
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "학기는 겹칠 수 없으며 학년도 3월~다음 해 2월 안에 있어야 합니다.",
      });
    }
  });
export function seoulToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function academicYearOf(date: string): number {
  return Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 3 ? 1 : 0);
}
export function cohortFor(operatingYear: number, grade: number): number {
  return operatingYear - grade + 1;
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function monthRange(month: string) {
  const [year, m] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10),
  };
}
export function moveMonth(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function weekRange(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const start = addDays(date, -(day + 6) % 7);
  return { start, end: addDays(start, 6) };
}
export function calendarDays(month: string): string[] {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - weekday));
}
export function overlaps(
  event: { start_date: string; end_date: string },
  start: string,
  end: string,
) {
  return event.start_date <= end && event.end_date >= start;
}
export function dateLabel(date: string) {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}
export function parseHours(value: string): number {
  if (value.trim() === "") return 0;
  if (!/^\d+$/.test(value.trim()))
    throw new Error("시수는 0 이상의 정수로 입력해 주세요.");
  return hourSchema.parse(Number(value));
}
export function parseGridPaste(
  text: string,
  remainingRows: number,
  remainingColumns: number,
): number[][] {
  const rows = text
    .replace(/\r/g, "")
    .trimEnd()
    .split("\n")
    .map((row) => row.split("\t").map(parseHours));
  if (
    rows.length > remainingRows ||
    rows.some((row) => row.length > remainingColumns)
  )
    throw new Error("붙여넣을 범위가 편성표를 벗어납니다.");
  return rows;
}
export function safeNext(next: string | null | undefined) {
  return next &&
    (next === "/app" ||
      next === "/reset-password" ||
      /^\/invite\/[a-f0-9]{64}$/.test(next))
    ? next
    : "/app";
}
