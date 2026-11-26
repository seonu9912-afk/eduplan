import type { Context } from "./models";
import type { TimetableDocument } from "./timetable-bridge";
import { createLessonResolver, timetableIssues } from "./school-operations";
/** A UI-independent, atomic proposal; final persistence uses the existing timetable CAS writer. */
export function proposeDatedSwap(
  c: Context,
  doc: TimetableDocument,
  classId: string,
  firstDate: string,
  firstPeriod: number,
  secondDate: string,
  secondPeriod: number,
): TimetableDocument {
  if (firstDate === secondDate && firstPeriod === secondPeriod)
    throw Error("서로 다른 두 수업을 선택하세요.");
  const resolve = createLessonResolver(c, doc);
  const pick = (date: string, period: number) => {
    const matches = resolve(date).filter(
      (l) => l.period === period && l.classIds.includes(classId),
    );
    if (matches.length !== 1 || matches[0].blockedBy.length)
      throw Error(
        "두 수업의 운영일·학사일정·수업 시각과 충돌을 먼저 확인하세요.",
      );
    const lesson = matches[0],
      raw =
        doc.overrides.find((o) => o.date === date && o.id === lesson.id) ??
        doc.weekly.find((w) => w.id === lesson.id);
    if (!raw || raw.scope !== "class")
      throw Error("합반·분반 수업은 전체 시간표에서 조정해 주세요.");
    return {
      subjectId: lesson.subjectId,
      teacherId: lesson.teacherId,
      room: String(raw.room ?? ""),
    };
  };
  const first = pick(firstDate, firstPeriod),
    second = pick(secondDate, secondPeriod),
    changes = [
      { date: firstDate, period: firstPeriod, ...second },
      { date: secondDate, period: secondPeriod, ...first },
    ].map((x) => ({
      ...x,
      id: crypto.randomUUID(),
      scope: "class" as const,
      scopeId: classId,
      action: "replace",
      note: "수업 교환",
    }));
  const next = {
    ...doc,
    overrides: [
      ...doc.overrides.filter(
        (o) =>
          !changes.some(
            (x) =>
              x.date === o.date &&
              x.period === o.period &&
              o.scope === "class" &&
              o.scopeId === classId,
          ),
      ),
      ...changes,
    ],
  };
  const problems = timetableIssues(next).filter(
    (i) => !/시작·종료 시각/.test(i),
  );
  if (problems.length) throw Error(problems.join(" · "));
  const result = createLessonResolver(c, next);
  for (const change of changes) {
    const row = result(change.date).find(
      (l) => l.period === change.period && l.classIds.includes(classId),
    );
    if (!row || row.blockedBy.length)
      throw Error(
        row?.blockedBy.join(" · ") || "교환 후 수업을 확인할 수 없습니다.",
      );
  }
  return next;
}
