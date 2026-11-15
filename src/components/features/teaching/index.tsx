"use client";
import {
  assessmentChoices,
  reconcileAssessmentLinks,
  reviewAuthoring,
} from "@/lib/teaching-authoring";
import { defaultReportFormat } from "@/lib/teaching-format";
import { TeachingConnections } from "./teaching-connections";
import { ReportFormatEditor } from "./report-format-editor";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import {
  BookOpen,
  Plus,
  Save,
  Settings2,
  Archive,
  LockKeyhole,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, InlineNotice, Modal, useMutation } from "@/components/common";
import {
  saveTeachingPlan,
  archiveTeachingCourse,
} from "@/app/teaching-actions";
import {
  teachingDocumentSchema,
  planStatuses,
  reviewTeaching,
  type TeachingDocument,
} from "@/lib/teaching";
import type { Context, Row } from "@/lib/models";
import { CourseForm } from "./course-form";
import { LessonEditor } from "./lesson-editor";
import { AssessmentEditor } from "./assessment-editor";
import { ReferencePanel } from "./reference-panel";
import { TeachingReview } from "./review";
import { TeachingPrint } from "./teaching-print";
type Tab = "overview" | "lesson" | "assessment" | "review";
const tabs: [Tab, string][] = [
  ["overview", "수업 현황"],
  ["lesson", "교수학습계획"],
  ["assessment", "평가계획"],
  ["review", "검토·출력"],
];
const period = (s: number) => (s ? `${s}학기` : "연간");
export function TeachingModule({
  context: c,
  onDirtyChange,
}: {
  context: Context;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter(),
    [tab, setTab] = useState<Tab>("overview"),
    [selected, setSelected] = useState<string | null>(null),
    [dirty, setDirty] = useState(false),
    [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({
    semester: "",
    grade: "",
    subject: "",
    classId: "",
    ownership: c.role === "viewer" ? "all" : "mine",
    archived: false,
  });
  const changed = (value: boolean) => {
    setDirty(value);
    onDirtyChange(value);
  };
  const canLeave = () =>
    !dirty ||
    window.confirm(
      "저장하지 않은 계획이 있습니다. 변경 내용을 버리고 이동할까요?",
    );
  if (!c.year || !c.teaching)
    return (
      <Empty
        title="학년도를 먼저 설정해 주세요"
        description="작업공간 설정에서 학년도를 개설하면 수업·평가 계획을 작성할 수 있습니다."
      />
    );
  const data = c.teaching;
  const matches = (p: Row<"teaching_courses">, f: typeof filters) =>
    p.archived === f.archived &&
    (!f.semester || String(p.semester) === f.semester) &&
    (!f.grade || String(p.grade) === f.grade) &&
    (!f.subject || p.subject_name === f.subject) &&
    (!f.classId ||
      data.classes.some(
        (l) => l.course_id === p.id && l.class_id === f.classId,
      )) &&
    (f.ownership === "all" || p.owner_id === c.userId);
  const courses = data.courses.filter((p) => matches(p, filters)),
    course = data.courses.find((p) => p.id === selected);
  const select = (id: string, nextTab: Tab = "lesson") => {
    if (id !== selected && !canLeave()) return;
    if (id !== selected) changed(false);
    setSelected(id);
    setTab(nextTab);
  };
  const filter = (next: Partial<typeof filters>) => {
    const f = { ...filters, ...next },
      available = data.courses.filter((p) => matches(p, f)),
      id = available.some((p) => p.id === selected)
        ? selected
        : (available[0]?.id ?? null);
    if (id !== selected && !canLeave()) return;
    if (id !== selected) changed(false);
    setFilters(f);
    setSelected(id);
  };
  const classNames = (id: string) =>
    c.classes
      .filter((cl) =>
        data.classes.some((l) => l.course_id === id && l.class_id === cl.id),
      )
      .map((cl) => `${cl.grade}학년 ${cl.class_number}반`)
      .join(", ") || "학급 미연결";
  return (
    <div className="teaching-module">
      <div className="teaching-screen">
        <div className="page-heading">
          <div>
            <span className="eyebrow">TEACHING & ASSESSMENT</span>
            <h1>수업·평가</h1>
            <p>수업의 흐름과 평가를 하나의 계획으로 연결하세요.</p>
          </div>
          {c.role !== "viewer" && (
            <Button
              onClick={() => {
                if (canLeave()) {
                  changed(false);
                  setSelected(null);
                  setTab("overview");
                  setCreating(true);
                }
              }}
            >
              <Plus /> 새 수업 설정
            </Button>
          )}
        </div>
        <section className="panel teaching-filters" aria-label="수업 선택 조건">
          <label>
            학년도
            <select
              aria-label="수업 학년도"
              value={c.year.year}
              onChange={(e) => {
                if (canLeave()) {
                  changed(false);
                  router.push(
                    `/app/${c.workspace.id}/teaching?year=${e.target.value}`,
                  );
                }
              }}
            >
              {c.years.map((y) => (
                <option key={y.id} value={y.year}>
                  {y.year}학년도
                </option>
              ))}
            </select>
          </label>
          <label>
            학기
            <select
              aria-label="수업 학기 필터"
              value={filters.semester}
              onChange={(e) => filter({ semester: e.target.value })}
            >
              <option value="">전체</option>
              <option value="1">1학기</option>
              <option value="2">2학기</option>
              <option value="0">연간</option>
            </select>
          </label>
          <label>
            학년
            <select
              aria-label="수업 학년 필터"
              value={filters.grade}
              onChange={(e) => filter({ grade: e.target.value, classId: "" })}
            >
              <option value="">전체</option>
              {c.grades.map((g) => (
                <option key={g} value={g}>
                  {g}학년
                </option>
              ))}
            </select>
          </label>
          <label>
            과목
            <select
              aria-label="수업 과목 필터"
              value={filters.subject}
              onChange={(e) => filter({ subject: e.target.value })}
            >
              <option value="">전체</option>
              {[...new Set(data.courses.map((p) => p.subject_name))]
                .sort()
                .map((n) => (
                  <option key={n}>{n}</option>
                ))}
            </select>
          </label>
          <label>
            학급
            <select
              aria-label="수업 학급 필터"
              value={filters.classId}
              onChange={(e) => filter({ classId: e.target.value })}
            >
              <option value="">공통 계획 전체</option>
              {c.classes
                .filter(
                  (cl) => !filters.grade || cl.grade === Number(filters.grade),
                )
                .map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.grade}학년 {cl.class_number}반
                  </option>
                ))}
            </select>
          </label>
          <label>
            열람 범위
            <select
              aria-label="수업 열람 범위"
              value={filters.ownership}
              onChange={(e) => filter({ ownership: e.target.value })}
            >
              <option value="mine">내 담당 수업</option>
              <option value="all">학교 공유 포함</option>
            </select>
          </label>
        </section>
        <nav className="teaching-tabs" aria-label="수업·평가 보기">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => {
                if (!selected && courses[0]) setSelected(courses[0].id);
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === "overview" ? (
          <section className="teaching-overview">
            <div className="section-title">
              <div>
                <h2>
                  담당 수업 <span>{courses.length}</span>
                </h2>
                <p>여러 학급에 하나의 공통 계획을 연결할 수 있습니다.</p>
              </div>
              <label className="archive-toggle">
                <input
                  type="checkbox"
                  checked={filters.archived}
                  onChange={(e) => filter({ archived: e.target.checked })}
                />{" "}
                보관된 수업
              </label>
            </div>
            {!courses.length ? (
              <div className="panel teaching-empty">
                <BookOpen size={32} />
                <h3>
                  {data.courses.length
                    ? "선택 조건에 맞는 수업이 없습니다"
                    : "첫 수업을 설정하세요"}
                </h3>
                <p>편성 과목을 불러오거나 직접 등록할 수 있습니다.</p>
                {c.role !== "viewer" && (
                  <Button onClick={() => setCreating(true)}>
                    첫 수업 만들기
                  </Button>
                )}
              </div>
            ) : (
              <div className="course-cards">
                {courses.map((p) => {
                  const doc = teachingDocumentSchema.parse(
                    data.plans.find((d) => d.course_id === p.id)!.document,
                  );
                  return (
                    <article className="panel course-card" key={p.id}>
                      <div className="course-card-meta">
                        <span>
                          {p.grade}학년 · {period(p.semester)}
                        </span>
                        <span>
                          {p.visibility === "private" ? (
                            <LockKeyhole size={13} />
                          ) : (
                            <Users size={13} />
                          )}{" "}
                          {p.visibility === "private"
                            ? "나만 보기"
                            : "학교 공유"}
                        </span>
                      </div>
                      <h3>{p.subject_name}</h3>
                      <p className="course-teacher">
                        {p.teacher_name} ·{" "}
                        {p.owner_id === c.userId ? "내 계획" : "공유 계획"}
                      </p>
                      <p className="course-class-list">{classNames(p.id)}</p>
                      <div className="course-hours">
                        <b>
                          {doc.units.reduce((n, u) => n + (u.lessons ?? 0), 0)}
                          <small>차시 계획</small>
                        </b>
                        <span>
                          기준 {p.expected_hours ?? "미설정"}
                          {p.expected_hours !== null ? "차시" : ""}
                        </span>
                      </div>
                      <dl>
                        <div>
                          <dt>교수학습계획</dt>
                          <dd>
                            {doc.lesson_status} · {doc.units.length}개 수업
                          </dd>
                        </div>
                        {doc.evaluations.map((ev) => (
                          <div key={ev.semester}>
                            <dt>{ev.semester}학기 평가</dt>
                            <dd>
                              {ev.status} · {ev.items.length}항목
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <Button variant="outline" onClick={() => select(p.id)}>
                        계획 열기
                      </Button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <div className="course-picker">
            <label>
              편집할 수업
              <select
                aria-label="편집할 수업"
                value={selected ?? ""}
                onChange={(e) => select(e.target.value, tab)}
              >
                <option value="" disabled>
                  수업 선택
                </option>
                {courses.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.grade}학년 {p.subject_name} · {period(p.semester)} ·{" "}
                    {p.teacher_name}
                  </option>
                ))}
              </select>
            </label>
            {course && <p>{classNames(course.id)} · 공통 계획</p>}
          </div>
        )}
      </div>
      {course ? (
        <CourseEditor
          key={course.id}
          context={c}
          course={course}
          tab={tab}
          onNavigate={setTab}
          onDirtyChange={changed}
        />
      ) : (
        tab !== "overview" && (
          <Empty
            title="수업을 선택해 주세요"
            description="수업 현황에서 계획을 열거나 새 수업을 설정하세요."
          />
        )
      )}
      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="새 수업 설정"
        description="같은 학년·과목의 여러 학급에 공통 계획을 연결합니다."
        wide
      >
        <CourseForm
          context={c}
          onDone={(id) => {
            setCreating(false);
            setFilters({
              ...filters,
              semester: "",
              grade: "",
              subject: "",
              classId: "",
              archived: false,
              ownership: "mine",
            });
            setSelected(id);
            setTab("lesson");
          }}
        />
      </Modal>
    </div>
  );
}
function CourseEditor({
  context: c,
  course: serverCourse,
  tab,
  onDirtyChange,
  onNavigate,
}: {
  context: Context;
  course: Row<"teaching_courses">;
  tab: Tab;
  onNavigate: (tab: Tab) => void;
  onDirtyChange: (v: boolean) => void;
}) {
  const [course, setCourse] = useState(serverCourse);
  const [doc, setDoc] = useState<TeachingDocument>(() =>
      teachingDocumentSchema.parse(
        c.teaching!.plans.find((p) => p.course_id === course.id)!.document,
      ),
    ),
    [dirty, setDirty] = useState(false),
    [editing, setEditing] = useState(false),
    [referencePending, setReferencePending] = useState(false),
    [restorePending, setRestorePending] = useState(false),
    [evaluation, setEvaluation] = useState(course.semester || 1),
    [printMode, setPrintMode] = useState<"lesson" | "assessment" | "both">(
      "both",
    );
  const m = useMutation(),
    editable =
      c.role !== "viewer" &&
      (course.owner_id === c.userId ||
        (course.visibility === "workspace" && c.role === "admin")) &&
      !course.archived;
  // Revalidation must never replace unsaved teacher input. Keep the loaded
  // version for CAS until a successful save or an explicit navigation.
  if (serverCourse.version !== course.version && !dirty && !m.pending) {
    setCourse(serverCourse);
    setDoc(
      teachingDocumentSchema.parse(
        c.teaching!.plans.find((p) => p.course_id === serverCourse.id)!
          .document,
      ),
    );
  }
  useEffect(() => {
    const reset = () => setPrintMode("both");
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);
  const change = (next: TeachingDocument) => {
    const normalized = reconcileAssessmentLinks(next);
    if (JSON.stringify(normalized.units) !== JSON.stringify(doc.units)) {
      if (doc.lesson_status === "확정") normalized.lesson_status = "작성 중";
      normalized.evaluations = normalized.evaluations.map((e) => ({
        ...e,
        status: e.status === "확정" ? "작성 중" : e.status,
      }));
    }
    setDoc(normalized);
    setDirty(true);
    onDirtyChange(true);
  };
  const saved = () => {
    setDirty(false);
    onDirtyChange(false);
  };
  const busy = m.pending || referencePending || restorePending;
  const ev =
    doc.evaluations.find((v) => v.semester === evaluation) ??
    doc.evaluations[0];
  const issues = reviewTeaching(
    doc,
    course,
    c.year!.year,
    c.semesters,
    c.teaching!.standards,
    c.schoolType,
  );
  issues.push(...reviewAuthoring(doc, c.teaching!.standards));
  if (!c.teaching!.classes.some((l) => l.course_id === course.id))
    issues.push({
      section: "수업 설정",
      level: "확인 필요",
      message: "담당 학급이 연결되지 않았습니다.",
    });
  if (course.expected_hours === null)
    issues.push({
      section: "수업 설정",
      level: "확인 필요",
      message:
        "편성·수동 기준 차시가 없습니다. 차시 합계를 비교할 수 없습니다.",
    });
  const save = () => {
    const confirm =
      doc.lesson_status === "확정" ||
      doc.evaluations.some((v) => v.status === "확정");
    if (
      confirm &&
      !window.confirm(
        `확정은 EduPlan 내부 관리 상태이며 학교의 공식 심의·결재를 대체하지 않습니다. 현재 점검 ${issues.length}건을 확인하고 저장할까요?`,
      )
    )
      return;
    m.execute(
      () => saveTeachingPlan(course.id, course.version, doc, confirm),
      saved,
      "계획을 저장했습니다.",
    );
  };
  const print = (mode: "lesson" | "assessment") => {
    flushSync(() => setPrintMode(mode));
    window.print();
  };
  const openLesson = (id: string) => {
    flushSync(() => onNavigate("lesson"));
    document.getElementById(`lesson-${id}`)?.focus();
  };
  const openAssessment = (id: string, semester: number) => {
    flushSync(() => {
      setEvaluation(semester);
      onNavigate("assessment");
    });
    document.getElementById(`assessment-${id}`)?.focus();
  };
  return (
    <>
      <div
        className={`teaching-screen ${tab === "overview" ? "teaching-editor-hidden" : ""}`}
      >
        <div className="plan-savebar">
          <div>
            <strong>
              {course.grade}학년 {course.subject_name} ·{" "}
              {period(course.semester)}
            </strong>
            <span aria-live="polite">
              {m.pending
                ? "저장 중…"
                : m.notice.error
                  ? "저장 실패 · 입력 내용 유지"
                  : dirty
                    ? "저장하지 않은 변경사항"
                    : `저장 완료 · v${course.version}`}
            </span>
            <small>
              {new Date(course.updated_at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </small>
          </div>
          <div className="teaching-actions">
            {editable && (
              <>
                <Button
                  variant="outline"
                  disabled={dirty || busy}
                  onClick={() => setEditing(true)}
                >
                  <Settings2 /> 수업 설정
                </Button>
                <Button disabled={!dirty || busy} onClick={save}>
                  <Save />
                  {m.pending ? "저장 중…" : "계획 저장"}
                </Button>
              </>
            )}
            {!editable && (
              <span className="scope-tag">
                {course.archived ? "보관된 계획" : "조회 전용"}
              </span>
            )}
          </div>
        </div>
        <InlineNotice mutation={m} />
        {dirty && serverCourse.version !== course.version && (
          <p role="alert" className="notice notice-error">
            다른 곳에서 이 계획이 변경되었습니다. 현재 입력은 유지했습니다.
            필요한 내용을 복사해 둔 뒤 새로고침하여 최신 계획과 비교하세요.
          </p>
        )}
        <ReferencePanel
          context={c}
          course={course}
          editable={editable && !busy}
          dirty={dirty}
          onSaved={saved}
          onBusyChange={setReferencePending}
        />
        {tab === "lesson" && (
          <>
            <label className="plan-status-control">
              교수학습계획 상태
              <select
                aria-label="교수학습계획 상태"
                value={doc.lesson_status}
                disabled={!editable || busy}
                onChange={(e) =>
                  change({
                    ...doc,
                    lesson_status: e.target
                      .value as TeachingDocument["lesson_status"],
                  })
                }
              >
                {planStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="teaching-operating-settings">
              <label>
                주당 시수
                <input
                  aria-label="수업 운영 주당 시수"
                  type="number"
                  min={0}
                  max={10000}
                  step={0.5}
                  disabled={!editable || busy}
                  value={doc.report?.weekly_hours ?? ""}
                  onChange={(e) =>
                    change({
                      ...doc,
                      report: {
                        format: doc.report?.format ?? defaultReportFormat(),
                        weekly_hours:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <p>
                학사일정은 참고 자료입니다. 실제 과목 차시는 수업 요일과
                시간표를 확인해 배당하세요.
              </p>
            </div>
            <LessonEditor
              context={c}
              course={course}
              units={doc.units}
              choices={assessmentChoices(doc)}
              onOpenAssessment={openAssessment}
              editable={editable && !busy}
              onChange={(units) =>
                change({
                  ...doc,
                  units,
                  lesson_status:
                    doc.lesson_status === "확정"
                      ? "작성 중"
                      : doc.lesson_status,
                })
              }
            />
          </>
        )}
        {tab === "assessment" && (
          <>
            <div className="assessment-status-row">
              {course.semester === 0 && (
                <label>
                  평가 학기
                  <select
                    aria-label="평가 학기"
                    value={evaluation}
                    onChange={(e) => setEvaluation(Number(e.target.value))}
                  >
                    <option value={1}>1학기</option>
                    <option value={2}>2학기</option>
                  </select>
                </label>
              )}
              <label className="plan-status-control">
                평가계획 상태
                <select
                  aria-label="평가계획 상태"
                  value={ev.status}
                  disabled={!editable || busy}
                  onChange={(e) =>
                    change({
                      ...doc,
                      evaluations: doc.evaluations.map((v) =>
                        v.semester === ev.semester
                          ? { ...v, status: e.target.value as typeof v.status }
                          : v,
                      ),
                    })
                  }
                >
                  {planStatuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <AssessmentEditor
              context={c}
              course={course}
              value={ev}
              units={doc.units}
              onChangeUnits={(units) => change({ ...doc, units })}
              onOpenLesson={openLesson}
              editable={editable && !busy}
              onChange={(next) =>
                change({
                  ...doc,
                  evaluations: doc.evaluations.map((v) =>
                    v.semester === next.semester
                      ? {
                          ...next,
                          status: v.status === "확정" ? "작성 중" : next.status,
                        }
                      : v,
                  ),
                })
              }
            />
          </>
        )}
        {tab === "review" && (
          <>
            <TeachingConnections
              doc={doc}
              standards={c.teaching!.standards}
              onOpenLesson={openLesson}
              onOpenAssessment={openAssessment}
            />
            <TeachingReview
              course={course}
              issues={issues}
              editable={editable && !busy}
              dirty={dirty}
              onRestored={saved}
              onBusyChange={setRestorePending}
              onPrint={print}
              onLocate={(issue) => {
                if (issue.assessment_id)
                  openAssessment(
                    issue.assessment_id,
                    issue.semester ?? evaluation,
                  );
                else if (issue.unit_id) openLesson(issue.unit_id);
              }}
            />
            <ReportFormatEditor
              context={c}
              course={course}
              document={doc}
              dirty={dirty}
              editable={editable && !busy}
              onChange={(report) =>
                change({
                  ...doc,
                  report,
                  lesson_status:
                    doc.lesson_status === "확정"
                      ? "작성 중"
                      : doc.lesson_status,
                  evaluations: doc.evaluations.map((e) => ({
                    ...e,
                    status: e.status === "확정" ? "작성 중" : e.status,
                  })),
                })
              }
            />
          </>
        )}
        <footer className="teaching-plan-footer">
          <p>
            확정은 내부 관리 상태입니다. 학생별 채점·시간표 자동 배정·공식 결재
            연동은 제공하지 않습니다.
          </p>
          {c.role !== "viewer" &&
            (course.owner_id === c.userId ||
              (course.visibility === "workspace" && c.role === "admin")) && (
              <Button
                variant="ghost"
                disabled={dirty || busy}
                onClick={() => {
                  if (
                    window.confirm(
                      course.archived
                        ? "보관을 해제할까요?"
                        : "수업을 보관할까요? 내용과 이력은 유지됩니다.",
                    )
                  )
                    m.execute(
                      () =>
                        archiveTeachingCourse(
                          course.id,
                          course.version,
                          !course.archived,
                        ),
                      saved,
                      "수업 보관 상태를 변경했습니다.",
                    );
                }}
              >
                <Archive />
                {course.archived ? "보관 해제" : "수업 보관"}
              </Button>
            )}
        </footer>
        <Modal
          open={editing}
          onOpenChange={setEditing}
          title="수업 설정 수정"
          wide
        >
          <CourseForm
            context={c}
            course={course}
            onDone={() => {
              setEditing(false);
              saved();
            }}
          />
        </Modal>
      </div>
      <TeachingPrint
        context={c}
        course={course}
        document={doc}
        dirty={dirty}
        mode={printMode}
      />
    </>
  );
}
