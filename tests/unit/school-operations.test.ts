import { describe, it, expect } from "vitest";
import { operationsPreviewContext } from "../../src/app/recovery-preview/operations-fixture";
import { annualSchema } from "../../src/lib/academic";
import {
  calendarImpact,
  createLessonResolver,
  currentAndNext,
  dailyLessonStatus,
  myTeacherIds,
  publishedTimetable,
  seoulClock,
  timetableIssues,
  unifiedSchedule,
} from "../../src/lib/school-operations";
describe("one source across daily operation, work plans and teaching", () => {
  it("resolves published Korean lessons and Korean local clock without using the draft", () => {
    const c = operationsPreviewContext(),
      doc = publishedTimetable(c)!;
    c.operations!.timetable!.document.weekly = [];
    const ids = myTeacherIds(c),
      lessons = createLessonResolver(
        c,
        doc,
      )("2027-03-02").filter((l) => ids.has(l.teacherId));
    expect(lessons.length).toBe(4);
    expect(currentAndNext(lessons, 8 * 60 + 57).remaining).toBe(3);
    expect(seoulClock(new Date("2027-03-01T23:57:00Z")).date).toBe(
      "2027-03-02",
    );
    expect(seoulClock(new Date("2027-03-01T23:57:00Z")).time).toBe("08:57:00");
  });
  it("applies grade ranges, class-specific event overrides, holidays and cancellations", () => {
    const c = operationsPreviewContext(),
      doc = publishedTimetable(c)!,
      annual = annualSchema.parse(c.annual!.document),
      cls = c.classes[0];
    annual.allocations = [
      {
        id: "a",
        eventId: "e",
        date: "2027-03-02",
        title: "학년 행사",
        department: "교무",
        start: 1,
        end: 1,
        areas: { "1": "진로" },
      },
      {
        id: "b",
        eventId: "e",
        classId: cls.id,
        date: "2027-03-02",
        title: "학급 예외",
        department: "교무",
        start: 1,
        end: 1,
        areas: { "1": "교과" },
      },
    ];
    const rows = createLessonResolver(c, doc, annual)("2027-03-02");
    expect(rows.find((x) => x.classIds.includes(cls.id))!.blockedBy).toEqual(
      [],
    );
    expect(
      rows.find((x) => x.classIds.includes(c.classes[1].id))!.blockedBy,
    ).toContain("학년 행사");
    expect(
      createLessonResolver(
        c,
        doc,
      )("2027-03-01").every((x) => x.blockedBy.length > 0),
    ).toBe(true);
    doc.overrides = [
      {
        date: "2027-03-02",
        scope: "class",
        scopeId: cls.id,
        period: 1,
        action: "cancel",
      },
    ];
    expect(
      createLessonResolver(
        c,
        doc,
      )("2027-03-02").find((x) => x.classIds.includes(cls.id))!.blockedBy,
    ).toContain("수업 취소·교환 또는 보결 변경");
  });
  it("shows before/after lesson losses while preserving recurring lessons and source snapshots", () => {
    const c = operationsPreviewContext(),
      before = annualSchema.parse(c.annual!.document),
      after = structuredClone(before),
      original = JSON.stringify(c.operations!.publication);
    after.days["2027-03-02"] = {
      type: "discretionary",
      name: "휴업 검토",
      enabled: true,
      weekday: 2,
    };
    const result = calendarImpact(c, before, after, "2027-03-02", "2027-03-02");
    expect(result.dayDelta).toBe(-1);
    expect(result.affected.length).toBe(12);
    expect(JSON.stringify(c.operations!.publication)).toBe(original);
  });
  it("shows each shared school event once and includes Sunday business", () => {
    const c = operationsPreviewContext(),
      plan = annualSchema.parse(c.annual!.document);
    plan.business.push({
      id: "sunday",
      date: "2027-03-07",
      department: "교무",
      kind: "업무",
      text: "제출 기한",
    });
    c.annual!.document = plan;
    const rows = unifiedSchedule(c, "2027-03-01", "2027-03-07");
    expect(rows.filter((x) => x.title === "진로 체험의 날")).toHaveLength(1);
    expect(rows.some((x) => x.title === "제출 기한")).toBe(true);
  });
  it("blocks duplicate teachers and missing bell schedules before publication", () => {
    const c = operationsPreviewContext(),
      doc = publishedTimetable(c)!;
    expect(timetableIssues(doc)).toEqual([]);
    doc.weekly.push({
      ...doc.weekly[0],
      id: "duplicate",
      scopeId: c.classes[1].id,
    });
    expect(timetableIssues(doc).join()).toContain("중복");
    delete doc.timetableConfig;
    expect(timetableIssues(doc).join()).toContain("일과표");
  });
  it("validates dated replacements against other lessons and accepts a valid replacement", () => {
    const c = operationsPreviewContext(),
      doc = publishedTimetable(c)!,
      a = doc.weekly.find((s) => s.weekday === 2)!,
      b = doc.weekly.find(
        (s) =>
          s.weekday === 2 &&
          s.period === a.period &&
          s.teacherId !== a.teacherId,
      )!;
    doc.overrides = [
      {
        date: "2027-03-02",
        scope: a.scope,
        scopeId: a.scopeId,
        period: a.period,
        action: "replace",
        subjectId: a.subjectId,
        teacherId: b.teacherId,
        room: "",
      },
    ];
    expect(timetableIssues(doc).join()).toContain("중복");
    doc.overrides[0].teacherId = a.teacherId;
    expect(timetableIssues(doc)).toEqual([]);
    doc.overrides[0].action = "unknown";
    expect(timetableIssues(doc).join()).toContain("작업");
  });
});

it("maps approved account aliases consistently without mutating saved timetable references", async () => {
  const { mergeTimetableDocument } = await import(
    "../../src/lib/timetable-bridge"
  );
  const c = operationsPreviewContext(),
    doc = publishedTimetable(c)!,
    teacher = c.operations!.directory.find((x) => x.user_id === c.userId)!;
  doc.teachers = [{ id: c.userId, label: "옛 계정 교원", custom: "보존" }];
  doc.weekly = [{ ...doc.weekly[0], teacherId: c.userId }];
  doc.timetableConfig!.unavailable = [
    { teacherId: c.userId, weekday: 2, period: 3 },
  ];
  const original = JSON.stringify(doc);
  const merged = mergeTimetableDocument(c, doc);
  expect(merged.weekly[0].teacherId).toBe(teacher.id);
  expect(merged.timetableConfig!.unavailable[0].teacherId).toBe(teacher.id);
  expect(merged.teachers.filter((x) => x.id === teacher.id)).toHaveLength(1);
  expect(merged.teachers.find((x) => x.id === teacher.id)!.custom).toBe("보존");
  expect(JSON.stringify(doc)).toBe(original);
});

it("classifies scheduled lesson times at exact boundaries, without claiming attendance or treating cancellations as completed", () => {
  const lesson = { start: "09:00", end: "09:45", blockedBy: [] };
  expect(dailyLessonStatus(lesson, 539.99)).toBe("upcoming");
  expect(dailyLessonStatus(lesson, 540)).toBe("current");
  expect(dailyLessonStatus(lesson, 584.99)).toBe("current");
  expect(dailyLessonStatus(lesson, 585)).toBe("finished");
  expect(dailyLessonStatus({ ...lesson, blockedBy: ["휴업"] }, 585)).toBe("cancelled");
  expect(dailyLessonStatus({ ...lesson, start: null }, 540)).toBe("unknown");
  expect(dailyLessonStatus({ ...lesson, end: "08:00" }, 540)).toBe("unknown");
  expect(dailyLessonStatus(lesson, null)).toBe("unknown");
});
