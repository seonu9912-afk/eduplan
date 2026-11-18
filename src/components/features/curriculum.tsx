"use client";
import { CurriculumDraft } from "./curriculum-draft";
import { CurriculumEnhanced } from "./curriculum-enhanced";
import "./curriculum-enhanced.css";
import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Plus,
  Save,
  Settings2,
  Table2,
  Info,
  Clipboard,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  Confirm,
  Field,
  InlineNotice,
  Modal,
  PrintButton,
  SaveStatus,
  SubmitButton,
  useMutation,
} from "@/components/common";
import {
  addGroup,
  addSubject,
  deleteSubject,
  createPlan,
  saveCurriculum,
} from "@/app/actions";
import { cohortFor, parseGridPaste, parseHours } from "@/lib/domain";
import type { Context, Row } from "@/lib/models";
export function Curriculum({
  context: c,
  initialCohort,
  onDirtyChange,
}: {
  context: Context;
  initialCohort?: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<"cohort" | "operating" | "subjects" | "draft" | "legacy">(
    "cohort",
  );
  const [cohort, setCohort] = useState(
    Number(initialCohort) || c.year?.year || c.plans[0]?.cohort_year || 2026,
  );
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const m = useMutation();
  const plan = c.plans.find((p) => p.cohort_year === cohort);
  const editable = c.role !== "viewer";
  const setChanged = (value: boolean) => {
    setDirty(value);
    onDirtyChange(value);
  };
  function changeTab(next: typeof tab) {
    if (
      !dirty ||
      window.confirm(
        "저장하지 않은 시수가 있습니다. 변경 내용을 버리고 이동할까요?",
      )
    ) {
      setChanged(false);
      setTab(next);
    }
  }
  function selectCohort(next: number) {
    if (
      !dirty ||
      window.confirm(
        "저장하지 않은 시수가 있습니다. 변경 내용을 버리고 이동할까요?",
      )
    ) {
      setChanged(false);
      setCohort(next);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CURRICULUM DESIGN</span>
          <h1>교육과정 편성</h1>
          <p>
            입학부터 졸업까지, {c.grades.length}개년 교육과정을 한눈에
            설계하세요.
          </p>
        </div>
        <div className="heading-actions">
          <PrintButton />
          {editable ? (
            <Button
              variant="outline"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm("저장하지 않은 편성표가 있습니다. 계속할까요?")
                )
                  setOpen(true);
              }}
              className="no-print"
            >
              <Plus />
              편성표 만들기
            </Button>
          ) : null}
        </div>
      </div>
      <section className="panel curriculum-panel">
        <div
          className="tabs-row no-print"
          role="tablist"
          aria-label="교육과정 보기"
        >
          {(
            [
              {
                id: "cohort",
                label: `입학년도별 ${c.grades.length}개년 편성표`,
                icon: BookOpen,
              },
              { id: "operating", label: "학년도 운영표", icon: Table2 },
              { id: "draft", label: "총론 기반 초안", icon: BookOpen },
              { id: "subjects", label: "교과군·과목 설정", icon: Settings2 },
              { id: "legacy", label: "기존 편성표 조회", icon: Clipboard },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => changeTab(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <InlineNotice mutation={m} />
        {tab === "draft" ? (
          <CurriculumDraft
            context={c}
            onCreated={(y) => {
              setCohort(y);
              setTab("cohort");
            }}
          />
        ) : tab === "subjects" ? (
          <SubjectSettings context={c} />
        ) : tab === "operating" ? (
          <CurriculumEnhanced key={c.year?.id ?? "no-year"} context={c} view="operating"
            cohort={c.year?.year ?? cohort} onDirtyChange={setChanged}/>
        ) : tab === "legacy" ? (
          <div>
            <p className="notice">이전 편성표를 읽기 전용으로 확인합니다. 실제 편집은 입학년도별 3개년 편성표 또는 당해연도 편성표에서 진행해 주세요.</p>
            <OperatingTable context={c}/>
            {plan && <GridEditor context={{...c,role:"viewer"}} plan={plan} onDirtyChange={()=>{}}/>}
          </div>
        ) : (
          <>
            <div className="curriculum-toolbar">
              <div>
                <h2>{cohort}학년도 입학생 교육과정</h2>
                <p>
                  입력 단위: {plan?.unit === "credits" ? "학점" : "시수"}
                  {plan?.source ? ` · ${plan.source} 기반 배분 초안` : ""}
                </p>
                <p>
                  {cohort}학년도 – {cohort + c.grades.length - 1}학년도 ·{" "}
                  {c.schoolType} {c.grades.length}개년
                </p>
              </div>
              <div className="cohort-picker no-print">
                <label htmlFor="cohort-select">입학년도</label>
                <select
                  id="cohort-select"
                  value={cohort}
                  onChange={(e) => selectCohort(Number(e.target.value))}
                >
                  {Array.from(
                    new Set([cohort, ...c.plans.map((p) => p.cohort_year)]),
                  )
                    .sort((a, b) => b - a)
                    .map((y) => (
                      <option key={y} value={y}>
                        {y}학년도
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="print-only print-context">
              {c.workspace.name} · {cohort}학년도 입학생 {c.grades.length}개년
              편성표
            </div>
            {!plan ? (
              <Empty
                icon={<BookOpen />}
                title="아직 편성표가 없어요"
                description={`입학년도를 기준으로 1~${c.grades.length}학년의 학기별 시수를 관리합니다.`}
                action={
                  editable ? (
                    <Button onClick={() => setOpen(true)}>
                      <Plus />첫 편성표 만들기
                    </Button>
                  ) : undefined
                }
              />
            ) : !c.subjects.length && !dirty ? (
              <Empty
                icon={<Settings2 />}
                title="편성할 과목을 등록해 주세요"
                description="교과군과 과목을 먼저 등록하면 시수를 입력할 수 있어요."
                action={
                  <Button
                    variant="outline"
                    onClick={() => changeTab("subjects")}
                  >
                    교과군·과목 설정
                  </Button>
                }
              />
            ) : (
              <CurriculumEnhanced
                key={plan.id}
                context={c}
                view="cohort"
                cohort={cohort}
                onDirtyChange={setChanged}
              />
            )}
          </>
        )}
      </section>
      <div className="curriculum-note">
        <Info size={18} />
        <p>
          표 편성값과 국가 기준을 비교할 수 있지만, 특례 적용 여부와 최신 고시·교육청 지침에 따른 적합성을 자동 확정하지 않습니다.
          학교 자체 교육과정과 과거 입학년도 자료는 임의로 수정하지 않습니다.
        </p>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`${c.grades.length}개년 교육과정 편성표 만들기`}
        description={`입학년도를 기준으로 1학년 1학기부터 ${c.grades.length}학년 2학기까지 관리합니다.`}
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(new FormData(e.currentTarget).get("cohort"));
            m.execute(
              () => createPlan(c.workspace.id, value),
              () => {
                setChanged(false);
                setCohort(value);
                setTab("cohort");
                setOpen(false);
              },
              "편성표가 생성되었습니다.",
            );
          }}
        >
          <Field label="입학년도" id="new-cohort">
            <input
              id="new-cohort"
              name="cohort"
              type="number"
              min={2000}
              max={2100}
              defaultValue={c.year?.year ?? cohort}
              required
            />
          </Field>
          <InlineNotice mutation={m} />
          <SubmitButton pending={m.pending}>편성표 만들기</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
function GridEditor({
  context: c,
  plan,
  onDirtyChange,
}: {
  context: Context;
  plan: Row<"curriculum_plans">;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const scope = JSON.stringify([c.grades, c.subjects.map((subject) => subject.id)]);
  const createGrid = () =>
    Object.fromEntries(
      c.subjects.map((s) => [
        s.id,
        Array.from({ length: c.grades.length * 2 }, (_, i) =>
          String(
            c.hours.find(
              (h) =>
                h.plan_id === plan.id &&
                h.subject_id === s.id &&
                h.grade === Math.floor(i / 2) + 1 &&
                h.semester === (i % 2) + 1,
            )?.hours ?? 0,
          ),
        ),
      ]),
    );
  const [grid, setGrid] = useState(createGrid);
  const [source, setSource] = useState(() => ({
    version: plan.version, scope, grades: c.grades, subjects: c.subjects,
  }));
  const [dirty, setDirty] = useState(false);
  const m = useMutation();
  const editable = c.role !== "viewer";
  const scopeChanged = scope !== source.scope;
  const sourceChanged = plan.version > source.version || scopeChanged;
  const versionConflict = dirty && sourceChanged && !m.pending;
  if (!dirty && !m.pending && sourceChanged) {
    setGrid(createGrid());
    setSource({ version: plan.version, scope, grades: c.grades, subjects: c.subjects });
  }
  const { grades, subjects } = source;
  const invalid = Object.values(grid)
    .flat()
    .filter((value) => {
      try {
        parseHours(value);
        return false;
      } catch {
        return true;
      }
    }).length;
  const valueOf = (value: string) => {
    try {
      return parseHours(value);
    } catch {
      return 0;
    }
  };
  const totals = Array.from({ length: grades.length * 2 }, (_, i) =>
    subjects.reduce((sum, s) => sum + valueOf(grid[s.id][i]), 0),
  );
  function change(id: string, index: number, value: string) {
    setGrid((prev) => ({
      ...prev,
      [id]: prev[id].map((old, i) => (i === index ? value : old)),
    }));
    setDirty(true);
    onDirtyChange(true);
  }
  function save() {
    if (invalid) {
      m.setNotice({
        message: "잘못된 시수가 있습니다. 0~2,000 사이의 정수로 수정해 주세요.",
        error: true,
      });
      return;
    }
    m.execute(
      () =>
        saveCurriculum({
          workspaceId: c.workspace.id,
          target_plan: plan.id,
          expected_version: source.version,
          entries: subjects.flatMap((s) =>
            grid[s.id].map((v, i) => ({
              subject_id: s.id,
              grade: Math.floor(i / 2) + 1,
              semester: (i % 2) + 1,
              hours: parseHours(v),
            })),
          ),
        }),
      (version) => {
        setSource((previous) => ({ ...previous, version }));
        setDirty(false);
        onDirtyChange(false);
      },
      "편성표가 저장되었습니다.",
    );
  }
  return (
    <>
      <div className="grid-tools no-print">
        <SaveStatus state={m.pending ? "saving" : versionConflict ? "conflict" : invalid || m.notice.error ? "error" : dirty ? "dirty" : "saved"}>
          {m.pending ? "저장 중…" : versionConflict ? "충돌 · 최신 저장본 확인 필요" :
            invalid ? `${invalid}개 입력값 확인 필요` : m.notice.error ? "저장 실패 · 입력 내용 유지" :
            dirty ? "저장하지 않은 변경사항" : "모든 변경사항 저장됨"}
        </SaveStatus>
        <span className="grid-help">
          <Clipboard size={14} />
          엑셀에서 복사한 셀을 붙여넣을 수 있어요.
        </span>
        {editable ? (
          <Button disabled={m.pending || !dirty || versionConflict} onClick={save}>
            <Save />
            {m.pending ? "저장 중…" : "편성표 저장"}
          </Button>
        ) : (
          <span className="scope-tag">조회 전용</span>
        )}
      </div>
      <InlineNotice mutation={m} />
      {versionConflict && <p className="notice notice-error" role="alert">
        최신 편성표가 변경되었습니다. 현재 입력은 표에 남아 있습니다. 필요한 시수를 복사한 뒤 최신 편성표를 열어 주세요.
      </p>}
      {dirty && m.notice.error && !versionConflict && <Button variant="outline" onClick={m.refresh}>
        최신 저장본 확인
      </Button>}
      <div className="table-scroll curriculum-grid">
        <table
          className={grades.length === 6 ? "six-grade-table" : undefined}
        >
          <caption className="sr-only">
            {plan.cohort_year}학년도 입학생의 학년·학기별 교과{" "}
            {plan.unit === "credits" ? "학점" : "시수"}
          </caption>
          <thead>
            <tr>
              <th rowSpan={2} className="group-column">
                교과군
              </th>
              <th rowSpan={2} className="subject-column">
                과목
              </th>
              {grades.map((g) => (
                <th key={g} colSpan={2} className="grade-heading">
                  {g}학년 <small>{plan.cohort_year + g - 1}학년도</small>
                </th>
              ))}
              <th rowSpan={2} className="total-column">
                {grades.length}개년 합계
              </th>
            </tr>
            <tr>
              {grades.flatMap((g) =>
                [1, 2].map((s) => <th key={`${g}-${s}`}>{s}학기</th>),
              )}
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject, row) => (
              <tr key={subject.id}>
                <td className="group-column">
                  {c.groups.find((g) => g.id === subject.group_id)?.name}
                </td>
                <th scope="row" className="subject-column">
                  {subject.name}
                </th>
                {grid[subject.id].map((value, col) => {
                  let isInvalid = false;
                  try {
                    parseHours(value);
                  } catch {
                    isInvalid = true;
                  }
                  return (
                    <td
                      key={col}
                      className={`hour-cell ${isInvalid ? "invalid" : ""}`}
                    >
                      <input
                        aria-label={`${subject.name} ${Math.floor(col / 2) + 1}학년 ${(col % 2) + 1}학기 ${plan.unit === "credits" ? "학점" : "시수"}`}
                        aria-invalid={isInvalid}
                        inputMode="numeric"
                        maxLength={5}
                        value={value}
                        disabled={!editable || m.pending}
                        onChange={(e) =>
                          change(subject.id, col, e.target.value)
                        }
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          const directions: Record<string, [number, number]> = {
                            ArrowUp: [-1, 0],
                            ArrowDown: [1, 0],
                            ArrowLeft: [0, -1],
                            ArrowRight: [0, 1],
                          };
                          const direction = directions[e.key];
                          if (!direction) return;
                          const element =
                            document.querySelector<HTMLInputElement>(
                              `[data-cell="${row + direction[0]}-${col + direction[1]}"]`,
                            );
                          if (element) {
                            e.preventDefault();
                            element.focus();
                          }
                        }}
                        data-cell={`${row}-${col}`}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData("text");
                          if (!/[\t\n]/.test(text)) return;
                          e.preventDefault();
                          try {
                            const pasted = parseGridPaste(
                              text,
                              subjects.length - row,
                              grades.length * 2 - col,
                            );
                            setGrid((prev) => {
                              const next = Object.fromEntries(
                                Object.entries(prev).map(([id, cells]) => [
                                  id,
                                  [...cells],
                                ]),
                              );
                              pasted.forEach((cells, r) =>
                                cells.forEach((v, index) => {
                                  next[subjects[row + r].id][col + index] =
                                    String(v);
                                }),
                              );
                              return next;
                            });
                            setDirty(true);
                            onDirtyChange(true);
                          } catch (error) {
                            m.setNotice({
                              message:
                                error instanceof Error
                                  ? error.message
                                  : "붙여넣기 형식을 확인해 주세요.",
                              error: true,
                            });
                          }
                        }}
                      />
                    </td>
                  );
                })}
                <td className="total-column">
                  {grid[subject.id]
                    .reduce((sum, v) => sum + valueOf(v), 0)
                    .toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>학기별 합계</th>
              {totals.map((v, i) => (
                <td key={i}>{v.toLocaleString()}</td>
              ))}
              <td className="total-column">
                {totals.reduce((s, v) => s + v, 0).toLocaleString()}
              </td>
            </tr>
            <tr>
              <th colSpan={2}>학년별 합계</th>
              {grades
                .map((g) => (g - 1) * 2)
                .map((i) => (
                  <td colSpan={2} key={i}>
                    {(totals[i] + totals[i + 1]).toLocaleString()}
                  </td>
                ))}
              <td>{totals.reduce((s, v) => s + v, 0).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="grid-summary">
        <span>
          <CheckCircle2 size={17} />
          입력값 검사
        </span>
        <strong>
          {invalid ? `${invalid}개 셀 확인 필요` : "정수·범위 검사 정상"}
        </strong>
        <span>
          교과군 {new Set(subjects.map((s) => s.group_id)).size}개 · 과목{" "}
          {subjects.length}개 · 법정 기준 판정 제외
        </span>
      </div>
    </>
  );
}
function SubjectSettings({ context: c }: { context: Context }) {
  const m = useMutation();
  const [deleting, setDeleting] = useState<Row<"subjects"> | null>(null);
  const editable = c.role !== "viewer";
  const linkedHours = c.hours.filter((h) => h.subject_id === deleting?.id);
  const linkedPlans = c.plans.filter((p) =>
    linkedHours.some((h) => h.plan_id === p.id),
  );
  const linkedAmounts = (["hours", "credits"] as const)
    .filter((unit) => linkedPlans.some((p) => p.unit === unit))
    .map(
      (unit) =>
        `${linkedHours.filter((h) => linkedPlans.some((p) => p.id === h.plan_id && p.unit === unit)).reduce((sum, h) => sum + h.hours, 0)}${unit === "credits" ? "학점" : "시간"}`,
    )
    .join(" · ");
  return (
    <div className="subject-settings">
      <div className="curriculum-toolbar">
        <div>
          <h2>교과군·과목 설정</h2>
          <p>이 작업공간의 모든 입학년도 편성표에서 함께 사용합니다.</p>
        </div>
      </div>
      <InlineNotice mutation={m} />
      {editable ? (
        <div className="subject-forms">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              m.execute(
                () => addGroup(c.workspace.id, String(f.get("name"))),
                () => form.reset(),
              );
            }}
          >
            <h3>교과군 추가</h3>
            <div className="inline-form">
              <Field label="교과군 이름" id="group-name">
                <input
                  id="group-name"
                  name="name"
                  placeholder="예: 사회(역사 포함)/도덕"
                  maxLength={60}
                  required
                />
              </Field>
              <SubmitButton pending={m.pending}>
                <Plus />
                추가
              </SubmitButton>
            </div>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              m.execute(
                () =>
                  addSubject({
                    workspace_id: c.workspace.id,
                    group_id: f.get("group_id"),
                    name: f.get("name"),
                  }),
                () => form.reset(),
              );
            }}
          >
            <h3>과목 추가</h3>
            <div className="inline-form">
              <Field label="교과군" id="subject-group">
                <select
                  id="subject-group"
                  name="group_id"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    교과군 선택
                  </option>
                  {c.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="과목명" id="subject-name">
                <input
                  id="subject-name"
                  name="name"
                  placeholder="예: 역사"
                  maxLength={60}
                  required
                />
              </Field>
              <SubmitButton pending={m.pending}>
                <Plus />
                추가
              </SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>교과군</th>
              <th>등록 과목</th>
              <th>과목 수</th>
            </tr>
          </thead>
          <tbody>
            {c.groups.map((g) => {
              const subjects = c.subjects.filter((s) => s.group_id === g.id);
              return (
                <tr key={g.id}>
                  <th scope="row">{g.name}</th>
                  <td>
                    {subjects.length ? (
                      subjects.map((s) => (
                        <span className="subject-tag" key={s.id}>
                          {s.name}
                          {editable && (
                            <button
                              type="button"
                              aria-label={`${s.name} 과목 삭제`}
                              disabled={m.pending}
                              onClick={() => setDeleting(s)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </span>
                      ))
                    ) : (
                      <span className="muted">아직 과목이 없습니다.</span>
                    )}
                  </td>
                  <td>{subjects.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!c.groups.length ? (
        <Empty
          icon={<BookOpen />}
          title="첫 교과군을 등록해 주세요"
          description="학교에서 편성하는 교과군을 직접 추가할 수 있습니다."
        />
      ) : null}
      <Confirm
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !m.pending) setDeleting(null);
        }}
        title={`${deleting?.name ?? ""} 과목을 삭제할까요?`}
        description={
          linkedPlans.length
            ? `이 작업공간의 모든 편성표에서 과목이 삭제됩니다. ${linkedPlans.map((p) => `${p.cohort_year}학년도 입학생`).join(", ")} 편성표 ${linkedPlans.length}개의 연결된 시수·학점 ${linkedAmounts}도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`
            : "이 작업공간의 모든 편성표에서 과목이 삭제됩니다. 연결된 저장 시수는 없습니다. 이 작업은 되돌릴 수 없습니다."
        }
        pending={m.pending}
        onConfirm={() =>
          deleting &&
          m.execute(
            () =>
              deleteSubject({
                target: c.workspace.id,
                target_subject: deleting.id,
                expected_plans: c.plans.map(({ id, version }) => ({
                  id,
                  version,
                })),
              }),
            () => setDeleting(null),
            "과목과 연결된 시수·학점을 삭제했습니다.",
          )
        }
      />
    </div>
  );
}
function OperatingTable({ context: c }: { context: Context }) {
  if (!c.year)
    return (
      <Empty
        icon={<Table2 />}
        title="운영 학년도를 먼저 설정해 주세요"
        description="상단 설정에서 학년도를 개설해 주세요."
      />
    );
  const year = c.year.year;
  const plans = c.grades.map((g) =>
    c.plans.find((p) => p.cohort_year === cohortFor(year, g)),
  );
  const value = (subjectId: string, grade: number, semester: number) => {
    const p = plans[grade - 1];
    return p
      ? (c.hours.find(
          (h) =>
            h.plan_id === p.id &&
            h.subject_id === subjectId &&
            h.grade === grade &&
            h.semester === semester,
        )?.hours ?? 0)
      : null;
  };
  return (
    <>
      <div className="curriculum-toolbar">
        <div>
          <h2>{year}학년도 운영 교육과정</h2>
          <p>
            각 학년의 입학년도 편성표에서 가져옵니다. 학년별 입력 단위를
            확인하세요.
          </p>
        </div>
        <span className="scope-tag">원본 편성표와 자동 연결</span>
      </div>
      <div className="cohort-mapping">
        {c.grades.map((g) => (
          <div key={g}>
            <strong>{g}학년</strong>
            <span>{cohortFor(year, g)}학년도 입학생</span>
            <small>{plans[g - 1] ? "편성표 연결됨" : "편성표 미등록"}</small>
          </div>
        ))}
      </div>
      {plans.some((p) => !p) ? (
        <div className="info-box">
          <Info size={18} />
          <p>
            일부 입학년도 편성표가 없습니다. 미등록 학년의 시수는 ‘—’로
            표시됩니다.
          </p>
        </div>
      ) : null}
      <div className="print-only print-context">
        {c.workspace.name} · {year}학년도 운영 교육과정
      </div>
      <div className="table-scroll curriculum-grid">
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>교과군</th>
              <th rowSpan={2}>과목</th>
              {c.grades.map((g) => (
                <th key={g} colSpan={2}>
                  {g}학년 ({plans[g - 1]?.unit === "credits" ? "학점" : "시수"})
                </th>
              ))}
            </tr>
            <tr>
              {c.grades.flatMap((g) =>
                [1, 2].map((s) => <th key={`${g}-${s}`}>{s}학기</th>),
              )}
            </tr>
          </thead>
          <tbody>
            {c.subjects.map((s) => (
              <tr key={s.id}>
                <td>{c.groups.find((g) => g.id === s.group_id)?.name}</td>
                <th scope="row">{s.name}</th>
                {c.grades.flatMap((g) =>
                  [1, 2].map((sem) => (
                    <td key={`${g}-${sem}`}>
                      {value(s.id, g, sem)?.toLocaleString() ?? "—"}
                    </td>
                  )),
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>학기별 합계</th>
              {c.grades.flatMap((g) =>
                [1, 2].map((sem) => (
                  <td key={`${g}-${sem}`}>
                    {plans[g - 1]
                      ? c.subjects
                          .reduce(
                            (sum, s) => sum + (value(s.id, g, sem) ?? 0),
                            0,
                          )
                          .toLocaleString()
                      : "—"}
                  </td>
                )),
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
