"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { canPlan } from "@/lib/planning-completion";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common";
import {
  saveStaff,
  saveStaffingScenario,
  previousStaff,
} from "@/app/operations-actions";
import {
  directoryEntry,
  demandKey,
  emptyScenario,
  scenarioSchema,
  staffInputSchema,
  staffingReport,
  type StaffAppointment,
  type StaffInput,
  type StaffingScenario,
} from "@/lib/staffing";
import type { Context } from "@/lib/models";
import "./school-operations.css";
export const staffingActions = {
  saveStaff,
  saveScenario: saveStaffingScenario,
  previousStaff,
};
export type StaffingActions = typeof staffingActions;
const round = (n: number | null) =>
  n === null ? "—" : Number(n.toFixed(2)).toLocaleString();
const freshStaff = (): StaffInput => ({
  display_name: "",
  user_id: null,
  subject_ids: [],
  primary_subject_id: null,
  department: "",
  duties: "",
  homeroom_class_id: null,
  employment: "정규",
  status: "재직",
  target_hours: 18,
  reduction_hours: 0,
});
export function Staffing({
  context: c,
  onDirtyChange,
  actions = staffingActions,
  onRefresh,
}: {
  context: Context;
  onDirtyChange: (v: boolean) => void;
  actions?: StaffingActions;
  onRefresh?: () => void;
}) {
  const router = useRouter(),
    [tab, setTab] = useState("명부"),
    [term, setTerm] = useState(1),
    [edit, setEdit] = useState<StaffAppointment | null | undefined>(undefined);
  const [scenario, setScenario] = useState<StaffingScenario>(emptyScenario),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [comparison, setComparison] = useState("");
  const [copyYear, setCopyYear] = useState(""),
    [templates, setTemplates] = useState<StaffAppointment[]>([]);
  useEffect(
    () => onDirtyChange(dirty || edit !== undefined),
    [dirty, edit, onDirtyChange],
  );
  const refresh = () => (onRefresh ? onRefresh() : router.refresh());
  const manager = canPlan(c, "staffing"),
    staff = c.operations?.staff ?? [],
    directory = c.operations?.directory ?? [];
  const baseline = staffingReport(c, term),
    report = staffingReport(c, term, scenario);
  const saved = c.operations?.scenarios.find((x) => x.id === comparison),
    previous = saved?.document.reports.find((x) => x.semester === term);
  function update(next: StaffingScenario) {
    setScenario(next);
    setDirty(true);
    setMessage("");
  }
  if (!c.year)
    return (
      <section className="panel">
        <h1>교원 관리</h1>
        <p>작업공간 설정에서 학년도와 학급을 먼저 등록하세요.</p>
      </section>
    );
  return (
    <div className="operations-module">
      <header className="page-heading">
        <div>
          <span className="eyebrow">STAFF & CURRICULUM</span>
          <h1>교원 관리·수급 분석</h1>
          <p>
            {c.year.year}학년도 공통 명부를 시간표와 개인 일정에 연결합니다.
            회원가입 전 교원도 등록할 수 있습니다.
          </p>
        </div>
        {c.role === "admin" && (
          <Button onClick={() => setEdit(null)}>교원 등록</Button>
        )}
      </header>
      <nav className="operations-tabs" aria-label="교원 관리 보기">
        {["명부", ...(manager ? ["수급 분석·가상 편성"] : [])].map((name) => (
          <Button
            key={name}
            variant={tab === name ? "default" : "outline"}
            onClick={() => setTab(name)}
          >
            {name}
          </Button>
        ))}
      </nav>
      {message && (
        <p role="status" className="info-box">
          {message}
        </p>
      )}
      {tab === "명부" ? (
        <section className="panel">
          <h2>학년도별 교원 명부</h2>
          <p>
            계정 연결은 관리자가 승인합니다. 휴직·전출 처리 후에도 과거 수업과
            학년도 기록은 보존됩니다.
          </p>
          {c.role === "admin" && (
            <Disclosure compact label="이전 학년도 명부에서 가져오기">
              <p>
                과거 명부를 보존하고 선택한 교원의 새 학년도 등록안을 만듭니다.
                담임과 근무 상태는 새 학년도에 맞게 검토하세요.
              </p>
              <select
                aria-label="명부를 가져올 학년도"
                value={copyYear}
                onChange={(e) => {
                  setCopyYear(e.target.value);
                  setTemplates([]);
                }}
              >
                <option value="">학년도 선택</option>
                {c.years
                  .filter((y) => y.year < c.year!.year)
                  .map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.year}학년도
                    </option>
                  ))}
              </select>
              <Button
                variant="outline"
                disabled={!copyYear || pending}
                onClick={async () => {
                  setPending(true);
                  try {
                    const r = await actions.previousStaff({
                      workspaceId: c.workspace.id,
                      yearId: copyYear,
                    });
                    if (r.ok) setTemplates(r.data);
                    else setMessage(r.error);
                  } catch {
                    setMessage("이전 명부를 불러오지 못했습니다.");
                  } finally {
                    setPending(false);
                  }
                }}
              >
                명부 조회
              </Button>
              {templates.map((t) => (
                <p key={t.id}>
                  {t.display_name} · {t.status}{" "}
                  <Button
                    variant="outline"
                    disabled={
                      !!t.user_id && staff.some((x) => x.user_id === t.user_id)
                    }
                    onClick={() =>
                      setEdit({
                        ...t,
                        id: "",
                        version: 0,
                        academic_year_id: c.year!.id,
                        homeroom_class_id: null,
                        user_id: c.members.some((m) => m.user_id === t.user_id)
                          ? t.user_id
                          : null,
                      })
                    }
                  >
                    신학년도 등록안 만들기
                  </Button>
                </p>
              ))}
            </Disclosure>
          )}
          <div className="operations-scroll">
            <table className="operations-table">
              <thead>
                <tr>
                  <th>성명</th>
                  <th>담당 교과</th>
                  <th>부서·업무</th>
                  <th>담임</th>
                  <th>계정 연결</th>
                  {manager && (
                    <>
                      <th>재직·근무 형태</th>
                      <th>목표 / 경감 / 가용 주당 시수</th>
                      <th>실제 배정</th>
                    </>
                  )}
                  {c.role === "admin" && <th>관리</th>}
                </tr>
              </thead>
              <tbody>
                {(manager
                  ? staff.map((x) => directoryEntry(x))
                  : directory
                ).map((person) => {
                  const item = staff.find((x) => x.id === person.id),
                    home = c.classes.find(
                      (x) => x.id === person.homeroom_class_id,
                    ),
                    assigned = (
                      c.operations?.timetable?.document.weekly ?? []
                    ).filter(
                      (x) =>
                        x.teacherId === person.id ||
                        (!!person.user_id && x.teacherId === person.user_id),
                    ).length;
                  return (
                    <tr key={person.id}>
                      <th>{person.display_name}</th>
                      <td>
                        {person.subject_ids
                          .map(
                            (id) =>
                              c.subjects.find((s) => s.id === id)?.name ??
                              "보관 과목",
                          )
                          .join(", ") || "미지정"}
                      </td>
                      <td>
                        {person.department}
                        <small>{person.duties}</small>
                      </td>
                      <td>
                        {home ? `${home.grade}-${home.class_number}` : "—"}
                      </td>
                      <td>{person.user_id ? "연결됨" : "가입 전·미연결"}</td>
                      {manager && (
                        <>
                          <td>
                            {item?.status} · {item?.employment}
                          </td>
                          <td>
                            {item &&
                              `${item.target_hours} / ${item.reduction_hours} / ${item.target_hours - item.reduction_hours}`}
                          </td>
                          <td>
                            {assigned}시간
                            {item &&
                              assigned >
                                item.target_hours - item.reduction_hours && (
                                <strong className="operations-warning">
                                  {" "}
                                  목표 초과
                                </strong>
                              )}
                          </td>
                        </>
                      )}
                      {c.role === "admin" && (
                        <td>
                          <Button
                            variant="outline"
                            onClick={() => setEdit(item!)}
                            aria-label={`${person.display_name} 교원 수정`}
                          >
                            수정
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!directory.length && (
            <p>
              등록된 교원이 없습니다. 임시 이름과 근무 형태 ‘미정’으로 사전
              편성을 시작할 수 있습니다.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="heading-actions">
              <h2>교육과정 기반 교원 수급</h2>
              <label>
                분석 학기{" "}
                <select
                  aria-label="분석 학기"
                  value={term}
                  onChange={(e) => setTerm(Number(e.target.value))}
                >
                  <option value={1}>1학기</option>
                  <option value={2}>2학기</option>
                </select>
              </label>
              <Button variant="outline" onClick={() => window.print()}>
                분석표 인쇄
              </Button>
            </div>
            <p>
              학급 수 × 학급당 주당 시수로 계산합니다. 학교가 정하는 목표이며
              교육청 정원·법정 배치 기준이 아닙니다. 평균과 실제 시간표 배정을
              구분합니다.
            </p>
            {report.issues.map((x) => (
              <p key={x} className="operations-warning">
                {x}
              </p>
            ))}
            <div className="mobile-only no-print">
              <div className="mobile-card-list">
                {report.rows.map((row) => (
                  <article key={row.subjectId} className="mobile-edit-card">
                    <h3>
                      {row.name}
                      {row.creative && " · 창체"}
                    </h3>
                    <p>
                      주당 총시수 {round(row.totalWeekly)}
                      {row.incomplete && " + 미정"} · 배치 {row.staffCount}명
                    </p>
                    <p>
                      1인 평균 {round(row.average)} · 목표 기준 필요{" "}
                      {row.needed ?? "검토 필요"}명
                    </p>
                    <p>
                      가용 {round(row.capacity)} · 초과(+)/여유(-){" "}
                      {round(row.shortage)}
                    </p>
                    <p>실제 배정 {row.assigned}시간</p>
                    {row.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </article>
                ))}
              </div>
            </div>
            <details className="mobile-comparison" open>
              <summary className="mobile-only no-print">
                전체 수급 비교표
              </summary>
              <div className="operations-scroll">
                <table
                  className="operations-table"
                  aria-label="교과별 교원 수급 분석"
                >
                  <thead>
                    <tr>
                      <th>교과·활동</th>
                      <th>현재 → 가상 주당 총시수</th>
                      <th>배치 인원</th>
                      <th>1인 평균</th>
                      <th>가용 시수</th>
                      <th>초과(+)/여유(-)</th>
                      <th>목표 기준 필요 인원</th>
                      <th>실제 시간표 배정</th>
                      {previous && <th>저장안 주당 총시수</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.subjectId}>
                        <th>
                          {row.name}
                          {row.creative && <small>창체</small>}
                          {row.estimated && <small>개설 규모 가정 확인</small>}
                        </th>
                        <td>
                          {round(
                            baseline.rows.find(
                              (x) => x.subjectId === row.subjectId,
                            )?.totalWeekly ?? 0,
                          )}{" "}
                          →{" "}
                          <strong>
                            {round(row.totalWeekly)}
                            {row.incomplete ? " + 미정" : ""}
                          </strong>
                        </td>
                        <td>{row.staffCount}명</td>
                        <td>{round(row.average)}</td>
                        <td>{round(row.capacity)}</td>
                        <td
                          className={
                            row.shortage !== null && row.shortage > 0
                              ? "operations-warning"
                              : ""
                          }
                        >
                          {round(row.shortage)}
                        </td>
                        <td>
                          {row.needed === null
                            ? "검토 필요"
                            : `${row.needed}명`}
                        </td>
                        <td>{row.assigned}시간</td>
                        {previous && (
                          <td>
                            {round(
                              previous.rows.find(
                                (x) => x.subjectId === row.subjectId,
                              )?.totalWeekly ?? 0,
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {[...new Set(report.rows.flatMap((r) => r.warnings))].map((x) => (
              <p key={x} className="muted-small">
                {x}
              </p>
            ))}
          </section>
          <section className="panel">
            <h2>가상 편성안</h2>
            <p>
              아래 변경은 검토용입니다. 교육과정·학급·교원·시간표 원본과
              확정본은 변경되지 않습니다. 여러 지도 가능 과목이 있어도 교원
              인원과 경감 시수는 주 담당 과목에 한 번만 반영합니다.
            </p>
            <div className="operations-controls">
              <label>
                편성안 이름
                <input
                  aria-label="편성안 이름"
                  maxLength={100}
                  value={scenario.name}
                  onChange={(e) =>
                    update({ ...scenario, name: e.target.value })
                  }
                />
              </label>
              {c.grades.map((g) => (
                <label key={g}>
                  {g}학년 학급 수
                  <input
                    type="number"
                    min={0}
                    max={40}
                    step={1}
                    aria-label={`${g}학년 가상 학급 수`}
                    value={
                      scenario.classCounts[g] ??
                      c.classes.filter((x) => x.grade === g).length
                    }
                    onChange={(e) =>
                      update({
                        ...scenario,
                        classCounts: {
                          ...scenario.classCounts,
                          [g]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="operations-scroll">
              <table className="operations-table">
                <thead>
                  <tr>
                    <th>과목</th>
                    {c.grades.map((g) => (
                      <th key={g}>{g}학년 주당</th>
                    ))}
                    <th>가상 인원</th>
                    <th>가상 1인 가용 시수</th>
                  </tr>
                </thead>
                <tbody>
                  {c.subjects.map((s) => (
                    <tr key={s.id}>
                      <th>{s.name}</th>
                      {c.grades.map((g) => {
                        const d = report.details.find(
                          (x) => x.subjectId === s.id && x.grade === g,
                        );
                        return (
                          <td key={g}>
                            <input
                              aria-label={`${s.name} ${g}학년 ${term}학기 가상 주당 시수`}
                              title={d?.source}
                              type="number"
                              min={0}
                              max={40}
                              step="0.5"
                              value={d?.weekly ?? ""}
                              placeholder="주당 미정"
                              onChange={(e) =>
                                update({
                                  ...scenario,
                                  weekly: {
                                    ...scenario.weekly,
                                    [demandKey(s.id, g, term)]: Number(
                                      e.target.value,
                                    ),
                                  },
                                })
                              }
                            />
                          </td>
                        );
                      })}
                      <td>
                        <input
                          aria-label={`${s.name} 가상 교원 수`}
                          type="number"
                          min={0}
                          max={150}
                          value={
                            scenario.staffCounts[s.id] ??
                            baseline.rows.find((x) => x.subjectId === s.id)
                              ?.staffCount ??
                            0
                          }
                          onChange={(e) =>
                            update({
                              ...scenario,
                              staffCounts: {
                                ...scenario.staffCounts,
                                [s.id]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${s.name} 가상 교원 목표 시수`}
                          type="number"
                          min={1}
                          max={40}
                          step="0.5"
                          value={
                            scenario.targetHours[s.id] ??
                            baseline.rows.find((x) => x.subjectId === s.id)
                              ?.target ??
                            18
                          }
                          onChange={(e) =>
                            update({
                              ...scenario,
                              targetHours: {
                                ...scenario.targetHours,
                                [s.id]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted-small">
              가상 인원·가용 시수를 직접 바꾸면 경감을 반영한 값을 입력하세요.
              학기 총시수만 있는 자료와 학점은 주당 횟수를 별도로 검토해야
              합니다.
            </p>
            <div className="heading-actions">
              <Button
                disabled={pending || !dirty}
                onClick={async () => {
                  const parsed = scenarioSchema.safeParse(scenario);
                  if (!parsed.success) {
                    setMessage(parsed.error.issues[0].message);
                    return;
                  }
                  setPending(true);
                  try {
                    const result = await actions.saveScenario({
                      workspaceId: c.workspace.id,
                      yearId: c.year!.id,
                      scenario: parsed.data,
                    });
                    if (!result.ok) setMessage(result.error);
                    else {
                      setDirty(false);
                      setMessage(
                        "가상 편성안과 계산 결과를 저장했습니다. 원본 자료는 유지됩니다.",
                      );
                      refresh();
                    }
                  } catch {
                    setMessage(
                      "저장하지 못했습니다. 가상안 입력은 유지됩니다.",
                    );
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? "저장 중…" : "가상안 저장"}
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm(
                      "가상안 입력을 초기화하고 원본 기준으로 돌아갈까요?",
                    )
                  ) {
                    setScenario(emptyScenario());
                    setDirty(false);
                  }
                }}
              >
                원본 기준으로 초기화
              </Button>
              <label>
                저장안 비교{" "}
                <select
                  aria-label="저장안 비교"
                  value={comparison}
                  onChange={(e) => setComparison(e.target.value)}
                >
                  <option value="">선택</option>
                  {c.operations?.scenarios.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              {saved && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm(
                        "현재 가상안 입력을 바꾸고 저장한 안을 불러올까요?",
                      )
                    )
                      update(saved.document.scenario);
                  }}
                >
                  저장안으로 검토 시작
                </Button>
              )}
            </div>
            {saved && (
              <p>
                저장안은 저장 당시 계산값입니다. 현재 원본의 변경은 새 검토를
                시작하면 반영됩니다.
              </p>
            )}
          </section>
        </>
      )}
      <Modal
        open={edit !== undefined}
        onOpenChange={(open) => {
          if (!open && window.confirm("입력 중인 교원 정보를 닫을까요?"))
            setEdit(undefined);
        }}
        title={edit ? "교원 정보 수정" : "교원 등록"}
        description="교원 등록은 계정을 만들거나 접근 권한을 부여하지 않습니다."
      >
        {edit !== undefined && (
          <StaffForm
            key={edit?.id ?? "new"}
            context={c}
            staff={edit}
            save={actions.saveStaff}
            onDone={() => {
              setEdit(undefined);
              refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
function StaffForm({
  context: c,
  staff,
  save,
  onDone,
}: {
  context: Context;
  staff: StaffAppointment | null;
  save: StaffingActions["saveStaff"];
  onDone: () => void;
}) {
  const [v, setV] = useState<StaffInput>(staff ?? freshStaff),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const text = (
    key: "display_name" | "department" | "duties",
    label: string,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={v[key]}
        maxLength={key === "duties" ? 300 : key === "department" ? 60 : 80}
        required={key === "display_name"}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <form
      className="form-stack operations-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = staffInputSchema.safeParse(v);
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        setPending(true);
        try {
          const result = await save({
            workspaceId: c.workspace.id,
            yearId: c.year!.id,
            id: staff?.id || null,
            version: staff?.id ? staff.version : 0,
            staff: parsed.data,
          });
          if (result.ok) onDone();
          else setError(result.error);
        } catch {
          setError("저장하지 못했습니다. 입력은 유지됩니다.");
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="form-stack">
        {text("display_name", "성명 또는 임시 교원명")}
        <div className="form-two">
          {text("department", "소속 부서")}
          {text("duties", "담당 업무")}
        </div>
        <label>
          연결할 가입 계정
          <select
            aria-label="연결할 가입 계정"
            value={v.user_id ?? ""}
            onChange={(e) => setV({ ...v, user_id: e.target.value || null })}
          >
            <option value="">가입 전·미연결</option>
            {c.members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name} · {m.email}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>지도 가능 과목</legend>
          <div className="operations-checks">
            {c.subjects.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={v.subject_ids.includes(s.id)}
                  onChange={(e) =>
                    setV({
                      ...v,
                      subject_ids: e.target.checked
                        ? [...v.subject_ids, s.id]
                        : v.subject_ids.filter((id) => id !== s.id),
                      primary_subject_id:
                        !e.target.checked && v.primary_subject_id === s.id
                          ? null
                          : v.primary_subject_id,
                    })
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          수급 분석 주 담당 과목
          <select
            aria-label="수급 분석 주 담당 과목"
            value={v.primary_subject_id ?? ""}
            onChange={(e) =>
              setV({ ...v, primary_subject_id: e.target.value || null })
            }
          >
            <option value="">미지정</option>
            {c.subjects
              .filter((s) => v.subject_ids.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          담임 학급
          <select
            value={v.homeroom_class_id ?? ""}
            onChange={(e) =>
              setV({ ...v, homeroom_class_id: e.target.value || null })
            }
          >
            <option value="">비담임</option>
            {c.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.grade}학년 {cls.class_number}반
              </option>
            ))}
          </select>
        </label>
        <div className="form-two">
          <label>
            근무 형태
            <select
              aria-label="근무 형태"
              value={v.employment}
              onChange={(e) =>
                setV({
                  ...v,
                  employment: e.target.value as StaffInput["employment"],
                })
              }
            >
              {["정규", "기간제", "시간강사", "순회", "미정"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            재직 상태
            <select
              aria-label="재직 상태"
              value={v.status}
              onChange={(e) =>
                setV({ ...v, status: e.target.value as StaffInput["status"] })
              }
            >
              {["재직", "휴직", "전출", "퇴직", "배치 예정"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-two">
          <label>
            목표 주당 시수
            <input
              type="number"
              min={0}
              max={40}
              step="0.5"
              value={v.target_hours}
              onChange={(e) =>
                setV({ ...v, target_hours: Number(e.target.value) })
              }
            />
          </label>
          <label>
            경감 시수
            <input
              type="number"
              min={0}
              max={40}
              step="0.5"
              value={v.reduction_hours}
              onChange={(e) =>
                setV({ ...v, reduction_hours: Number(e.target.value) })
              }
            />
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        <Button type="submit">{pending ? "저장 중…" : "교원 정보 저장"}</Button>
      </fieldset>
    </form>
  );
}
