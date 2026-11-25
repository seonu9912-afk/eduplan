import { z } from "zod";
import type { Context } from "./models";
import type { TimetableDocument } from "./timetable-bridge";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const bellRowSchema = z.object({
  type: z.enum(["lesson", "lunch", "break", "other"]),
  period: z.number().int().min(1).max(12).nullable().optional(),
  label: z.string().max(100),
  start: clock,
  end: clock,
});
export type BellRow = z.infer<typeof bellRowSchema>;
export const resourcesSchema = z.object({
  rooms: z.array(z.object({ id: z.uuid(), name: z.string() })),
  links: z.array(
    z.object({
      kind: z.enum(["subject", "teacher", "room"]),
      legacy_id: z.string(),
      subject_id: z.uuid().nullable(),
      teacher_id: z.uuid().nullable(),
      room_id: z.uuid().nullable(),
    }),
  ),
  bells: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.string(),
      rows: z.array(bellRowSchema),
    }),
  ),
  applications: z.array(
    z.object({
      id: z.uuid(),
      schedule_id: z.uuid(),
      starts_on: z.iso.date(),
      ends_on: z.iso.date(),
      reason: z.string(),
    }),
  ),
});
export type PlanningResources = z.infer<typeof resourcesSchema>;
export const emptyResources = (): PlanningResources => ({
  rooms: [],
  links: [],
  bells: [],
  applications: [],
});
export type ReferenceLink = {
  kind: "subject" | "teacher" | "room";
  legacyId: string;
  targetId: string;
};
export function unresolvedReferences(c: Context, doc: TimetableDocument) {
  const entries = [
    ...doc.weekly,
    ...doc.overrides,
    ...(doc.timetableConfig?.lessons ?? []),
  ];
  const used = {
    subject: new Set(
      entries.map((r) => String(r.subjectId ?? "")).filter(Boolean),
    ),
    teacher: new Set(
      [...entries, ...(doc.timetableConfig?.unavailable ?? [])]
        .map((r) => String(r.teacherId ?? ""))
        .filter(Boolean),
    ),
    room: new Set(entries.map((r) => String(r.room ?? "")).filter(Boolean)),
  };
  const resources = c.operations?.resources ?? emptyResources();
  const catalogs = {
    subject: c.subjects.map((s) => ({ id: s.id, label: s.name })),
    teacher: (c.operations?.directory ?? []).map((t) => ({
      id: t.id,
      label: t.display_name,
    })),
    room: resources.rooms.map((r) => ({ id: r.id, label: r.name })),
  };
  return (["subject", "teacher", "room"] as const).flatMap((kind) =>
    [...used[kind]]
      .filter(
        (id) =>
          !catalogs[kind].some((x) => x.id === id) &&
          !resources.links.some((l) => l.kind === kind && l.legacy_id === id),
      )
      .map((id) => ({
        kind,
        id,
        label:
          kind === "subject"
            ? (doc.subjects.find((s) => s.id === id)?.label ?? id)
            : kind === "teacher"
              ? (doc.teachers.find((t) => t.id === id)?.label ?? id)
              : id,
        choices: catalogs[kind],
      })),
  );
}
export const shortenedSchema = z.object({
  start: clock,
  lessonEnd: clock,
  dismissal: clock,
  periods: z.number().int().min(1).max(12),
  lesson: z.number().int().min(1).max(120),
  minLesson: z.number().int().min(1).max(120),
  break: z.number().int().min(0).max(60),
  minBreak: z.number().int().min(0).max(60),
  lunchAfter: z.number().int().min(0).max(12),
  lunch: z.number().int().min(0).max(180),
  closing: z.number().int().min(0).max(120),
  step: z.number().int().min(1).max(15),
});
export type ShortenedInput = z.infer<typeof shortenedSchema>;
const minute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const time = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
/** Operating minutes only: deliberately does not infer legal recognized curriculum hours. */
export function shortenedSchedules(input: ShortenedInput): {
  error: string;
  options: {
    priority: string;
    lesson: number;
    break: number;
    rows: BellRow[];
    dismissal: string;
  }[];
} {
  const parsed = shortenedSchema.safeParse(input);
  if (!parsed.success)
    return { error: "입력 시각과 운영 조건을 확인하세요.", options: [] };
  const v = parsed.data;
  if (
    v.minLesson > v.lesson ||
    v.minBreak > v.break ||
    (v.lunchAfter >= v.periods && v.lunchAfter !== 0)
  )
    return { error: "최소 시간과 점심 교시를 확인하세요.", options: [] };
  const available =
    Math.min(minute(v.lessonEnd), minute(v.dismissal) - v.closing) -
    minute(v.start);
  const candidates: { lesson: number; break: number }[] = [];
  for (let lesson = v.lesson; lesson >= v.minLesson; lesson -= v.step)
    for (let rest = v.break; rest >= v.minBreak; rest--) {
      const duration =
        v.periods * lesson +
        (v.periods - 1 - (v.lunchAfter ? 1 : 0)) * rest +
        (v.lunchAfter ? v.lunch : 0);
      if (duration <= available) candidates.push({ lesson, break: rest });
    }
  if (!candidates.length)
    return {
      error:
        "최소 수업·쉬는 시간과 고정 점심·종례를 확보하면 목표 종료 시각에 맞출 수 없습니다.",
      options: [],
    };
  const choices = [
    {
      priority: "수업 시간 우선",
      ...candidates.sort((a, b) => b.lesson - a.lesson || b.break - a.break)[0],
    },
    {
      priority: "쉬는 시간 우선",
      ...candidates.sort((a, b) => b.break - a.break || b.lesson - a.lesson)[0],
    },
  ];
  return {
    error: "",
    options: choices
      .filter(
        (c, i) =>
          i === 0 ||
          c.lesson !== choices[0].lesson ||
          c.break !== choices[0].break,
      )
      .map((choice) => {
        let cursor = minute(v.start);
        const rows: BellRow[] = [];
        const add = (
          type: BellRow["type"],
          label: string,
          duration: number,
          period?: number,
        ) => {
          if (duration > 0) {
            rows.push({
              type,
              label,
              period,
              start: time(cursor),
              end: time(cursor + duration),
            });
            cursor += duration;
          }
        };
        for (let p = 1; p <= v.periods; p++) {
          add("lesson", `${p}교시`, choice.lesson, p);
          if (p < v.periods) {
            if (p === v.lunchAfter) add("lunch", "점심", v.lunch);
            else add("break", "쉬는 시간", choice.break);
          }
        }
        add("other", "종례 및 귀가 준비", v.closing);
        return { ...choice, rows, dismissal: time(cursor) };
      }),
  };
}
