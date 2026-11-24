"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, InlineNotice, useMutation } from "@/components/common";
import { saveTeachingCourse } from "@/app/teaching-actions";
import { curriculumReference } from "@/lib/teaching";
import type { Context, Row } from "@/lib/models";
export function CourseForm({
  context: c,
  course,
  initial,
  onDone,
}: {
  context: Context;
  course?: Row<"teaching_courses">;
  initial?:import("@/lib/teaching-targets").TeachingTarget;
  onDone: (id: string) => void;
}) {
  const [grade, setGrade] = useState(course?.grade ?? initial?.grade ?? 1),
    [semester, setSemester] = useState(course?.semester ?? initial?.semester ?? 1),
    [subject, setSubject] = useState(course?.subject_id ?? initial?.subjectId ?? ""),
    [copy, setCopy] = useState(""),
    [copyScope, setCopyScope] = useState<"all" | "lesson" | "assessment">("all");
  const m = useMutation(),
    data = c.teaching!;
  const ref = curriculumReference(c, grade, semester, subject || null),
    linked = ref.amount !== null;
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        m.execute(
          () =>
            saveTeachingCourse(
              {
                workspace_id: c.workspace.id,
                academic_year_id: c.year!.id,
                grade,
                semester,
                subject_id: subject || null,
                subject_name: subject
                  ? c.subjects.find((s) => s.id === subject)?.name
                  : String(f.get("subject_name")),
                teacher_name: f.get("teacher_name"),
                visibility: f.get("visibility"),
                class_ids: f.getAll("class_ids"),
                copy_scope: copy ? copyScope : undefined,
                manual_hours: linked
                  ? (course?.manual_hours ?? null)
                  : f.get("manual_hours") === ""
                    ? null
                    : Number(f.get("manual_hours")),
              },
              course?.id ?? null,
              course?.version ?? 0,
              copy || null,
            ),
          onDone,
        );
      }}
    >
      <fieldset disabled={m.pending} className="form-stack">
        <div className="form-two">
          <Field label="수업 학년" id="course-grade">
            <select
              id="course-grade"
              value={grade}
              disabled={!!course}
              onChange={(e) => setGrade(Number(e.target.value))}
            >
              {c.grades.map((g) => (
                <option key={g} value={g}>
                  {g}학년
                </option>
              ))}
            </select>
          </Field>
          <Field label="수업 기간" id="course-semester">
            <select
              id="course-semester"
              value={semester}
              disabled={!!course}
              onChange={(e) => {
                setSemester(Number(e.target.value));
                setCopy("");
              }}
            >
              <option value={1}>1학기</option>
              <option value={2}>2학기</option>
              <option value={0}>연간 (평가는 학기별)</option>
            </select>
          </Field>
        </div>
        <Field label="연결 과목" id="course-subject">
          <select
            id="course-subject"
            value={subject}
            disabled={!!course}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">직접 등록</option>
            {c.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {!subject && (
          <Field label="수업 과목명" id="course-name">
            <input
              id="course-name"
              name="subject_name"
              defaultValue={course?.subject_name ?? ""}
              required
              maxLength={120}
            />
          </Field>
        )}
        <div className="info-box">
          {linked
            ? `편성 기준 ${ref.amount}${ref.unit === "credits" ? "학점" : "시간"}${ref.unit === "credits" ? ` · ${ref.amount! * 16}차시 환산 (1학점=16회)` : ""}. 실제 날짜별 수업 차시는 시간표 연동 후 계산할 수 있습니다.`
            : "연결된 편성 시수가 없어 기준 차시를 직접 입력할 수 있습니다."}
        </div>
        {!linked && (
          <Field label="기준 차시 (선택)" id="course-hours">
            <input
              id="course-hours"
              name="manual_hours"
              type="number"
              min={0}
              max={10000}
              step="0.5"
              defaultValue={
                course?.manual_hours ?? course?.expected_hours ?? ""
              }
            />
          </Field>
        )}
        <Field label="담당교사" id="course-teacher">
          <input
            id="course-teacher"
            name="teacher_name"
            maxLength={80}
            defaultValue={course?.teacher_name ?? (initial?.teacherName || c.profile.display_name)}
            required
          />
        </Field>
        <fieldset className="course-classes">
          <legend>담당 학급 · 여러 학급이 하나의 공통 계획을 사용합니다</legend>
          {c.classes
            .filter((cl) => cl.grade === grade)
            .map((cl) => (
              <label key={cl.id}>
                <input
                  type="checkbox"
                  name="class_ids"
                  value={cl.id}
                  defaultChecked={initial?.classIds.includes(cl.id) || data.classes.some(
                    (a) => a.course_id === course?.id && a.class_id === cl.id,
                  )}
                />
                {cl.grade}학년 {cl.class_number}반
              </label>
            ))}
          {!c.classes.some((cl) => cl.grade === grade) && (
            <p className="muted">
              등록된 학급이 없습니다. 학급 없이 초안을 만든 뒤 학교 설정에서
              학급을 추가하고 연결할 수 있습니다.
            </p>
          )}
        </fieldset>
        <Field label="계획 공개 범위" id="course-visibility">
          <select
            id="course-visibility"
            name="visibility"
            defaultValue={course?.visibility ?? "private"}
          >
            <option value="private">나만 보기</option>
            {c.workspace.kind === "school" && (
              <option value="workspace">학교 공유</option>
            )}
          </select>
        </Field>
        <p className="field-hint">
          학교 공유 계획은 구성원이 열람합니다. 소유자와 관리자는 공동작성 담당자를 지정할 수 있습니다.
        </p>
        {!course && <>
          <Field label="기존 계획 복사 (선택)" id="course-copy">
            <select
              id="course-copy"
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
            >
              <option value="">빈 계획으로 시작</option>
              {data.copies
                .filter((p) => p.semester === semester)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {c.years.find((y) => y.id === p.academic_year_id)?.year}
                    학년도 · {p.grade}학년 {p.subject_name} · {p.teacher_name}
                  </option>
                ))}
            </select>
          </Field>
          {copy && <Field label="복사 범위" id="course-copy-scope">
            <select id="course-copy-scope" value={copyScope}
              onChange={(e) => setCopyScope(e.target.value as typeof copyScope)}>
              <option value="all">교수학습·평가계획 전체</option>
              <option value="lesson">교수학습계획만</option>
              <option value="assessment">평가계획만</option>
            </select>
            <p className="field-hint">복사한 날짜와 차시를 새 학년도에 맞게 확인하세요. 복사본은 작성 중으로 시작합니다.</p>
          </Field>}
        </>}
      </fieldset>
      <InlineNotice mutation={m} />
      <Button disabled={m.pending}>
        {m.pending ? "저장 중…" : course ? "수업 설정 저장" : "수업 만들기"}
      </Button>
    </form>
  );
}
