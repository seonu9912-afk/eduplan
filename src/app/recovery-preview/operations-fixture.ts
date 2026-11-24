import { curriculumPreviewContext } from "./curriculum-fixture";
import { initializeDesign, evaluateCell } from "../../lib/curriculum-design";
import { newTimetableDocument } from "../../lib/timetable-bridge";
import {
  directoryEntry,
  emptyOperations,
  type StaffAppointment,
} from "../../lib/staffing";
import type { Context } from "../../lib/models";
const id = (n: number) =>
  `e2400000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function operationsPreviewContext(): Context {
  const c = curriculumPreviewContext("중학교");
  c.role = "admin";
  c.workspace = { ...c.workspace, name: "통합 운영 실습 중학교" };
  c.workspaces = [c.workspace];
  c.classes = c.grades.flatMap((grade) =>
    [1, 2, 3, 4].map((class_number) => ({
      ...c.classes[0],
      id: id(grade * 10 + class_number),
      grade,
      class_number,
    })),
  );
  c.members = [
    {
      user_id: c.userId,
      display_name: "김국어",
      email: "teacher@example.invalid",
      role: "admin",
    },
  ];
  c.profile = { ...c.profile, display_name: "김국어" };
  const subjects = c.subjects.filter((x) =>
    [
      "국어",
      "수학",
      "영어",
      "과학",
      "사회",
      "체육",
      "음악",
      "미술",
      "정보",
    ].includes(x.name),
  );
  c.plans = c.grades.map((grade) => ({
    ...c.plans[0],
    id: id(100 + grade),
    cohort_year: 2028 - grade,
  }));
  const operations = emptyOperations();
  c.hours = [];
  for (const p of c.plans) {
    const doc = initializeDesign(c, p);
    doc.cells = doc.cells.map((cell) => ({
      ...cell,
      weekly: subjects.some((s) => s.id === cell.subjectId)
        ? c.subjects.find((s) => s.id === cell.subjectId)?.name === "국어"
          ? 4
          : 2
        : 0,
      manual: 0,
      adjustments: [],
    }));
    operations.designs[p.id] = doc;
    c.hours.push(
      ...doc.cells.map((cell) => ({
        plan_id: p.id,
        workspace_id: c.workspace.id,
        school_id: null,
        subject_id: cell.subjectId,
        grade: cell.grade,
        semester: cell.semester,
        hours: evaluateCell(doc, cell).total,
      })),
    );
  }
  const teachers: StaffAppointment[] = subjects.flatMap((subject, index) =>
    Array.from({ length: subject.name === "국어" ? 3 : 2 }, (_, n) => ({
      id: id(200 + index * 10 + n),
      workspace_id: c.workspace.id,
      academic_year_id: c.year!.id,
      user_id: index === 0 && n === 0 ? c.userId : null,
      display_name:
        index === 0 && n === 0 ? "김국어" : `${subject.name} 교사 ${n + 1}`,
      subject_ids: [subject.id],
      primary_subject_id: subject.id,
      department: index < 3 ? "교육과정부" : "학생활동부",
      duties: n === 0 ? "교과 대표" : "",
      homeroom_class_id: null,
      employment: "정규",
      status: "재직",
      target_hours: 18,
      reduction_hours: subject.name === "국어" && n === 0 ? 6 : 0,
      version: 1,
      updated_at: "2027-02-01T00:00:00Z",
    })),
  );
  // Ensure the signed-in fixture account is the first Korean teacher regardless of catalog ordering.
  teachers.forEach((t) => {
    t.user_id = null;
  });
  const korean = teachers.find(
    (t) =>
      c.subjects.find((s) => s.id === t.primary_subject_id)?.name === "국어",
  )!;
  korean.user_id = c.userId;
  korean.display_name = "김국어";
  operations.staff = teachers;
  operations.directory = teachers.map(directoryEntry);
  c.operations = operations;
  const table = newTimetableDocument(c);
  table.timetableConfig = {
    periods: { "1": 6, "2": 6, "3": 6, "4": 6, "5": 6 },
    lessons: [],
    unavailable: [],
    bell: Array.from({ length: 6 }, (_, i) => ({
      id: `bell${i}`,
      type: "lesson",
      period: i + 1,
      start: `${String(9 + i).padStart(2, "0")}:00`,
      end: `${String(9 + i).padStart(2, "0")}:45`,
    })),
  };
  // 12 classes, separate teacher/period allocations across four weekdays.
  table.weekly = c.classes.flatMap((cls, i) =>
    [1, 2, 3, 4].map((weekday) => ({
      id: `lesson-${cls.id}-${weekday}`,
      scope: "class" as const,
      scopeId: cls.id,
      weekday,
      period: Math.floor(i / 3) + 1,
      subjectId: korean.primary_subject_id!,
      teacherId: teachers.filter(
        (t) => t.primary_subject_id === korean.primary_subject_id,
      )[i % 3].id,
      room: "",
    })),
  );
  operations.timetable = {
    version: 1,
    updated_at: "2027-02-20T00:00:00Z",
    document: table,
  };
  operations.publication = {
    id: id(500),
    workspace_id: c.workspace.id,
    academic_year_id: c.year!.id,
    source_version: 1,
    published_at: "2027-02-20T00:00:00Z",
    document: structuredClone(table),
  };
  if (c.teaching) {
    c.teaching.courses = c.teaching.courses.map((course) => ({
      ...course,
      subject_id: korean.primary_subject_id,
      subject_name: "국어",
      teacher_name: "김국어",
    }));
    c.teaching.classes = c.teaching.courses.flatMap((course) =>
      c.classes
        .filter((cls) => cls.grade === course.grade)
        .map((cls) => ({
          workspace_id: c.workspace.id,
          academic_year_id: c.year!.id,
          course_id: course.id,
          class_id: cls.id,
          grade: cls.grade,
        })),
    );
  }
  return c;
}
