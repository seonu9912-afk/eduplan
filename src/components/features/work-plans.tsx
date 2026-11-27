"use client";
import { WorkBatch } from "./work-batch";
import { Disclosure } from "@/components/ui/disclosure";
import "./schedule-surfaces.css";
import { useEditGuard } from "@/lib/device-session";
import { canPlan } from "@/lib/planning-completion";
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PrintButton,
  SaveStatus,
  InlineNotice,
  Empty,
  Modal,
  useMutation,
} from "@/components/common";
import { mergeAnnualPlans } from "@/lib/academic-revisions";
import { annualSchema, defaultAnnual, type AnnualPlan } from "@/lib/academic";
import {
  addDays,
  calendarDays,
  weekRange,
  monthRange,
} from "@/lib/domain";
import { previousWorkPlan, publishWorkPlan, saveAnnual } from "@/app/actions";
import type { Context } from "@/lib/models";
import { MobileCalendarDates, type CalendarCellItem } from "./mobile-calendar-dates";
import { shiftScheduleDate } from "@/lib/schedule-dates";
import { ResourceLinkEditor, ResourceLinks } from "./resource-links";
import { DepartmentBadge } from "./department-badge";
import { PlanPublicationPreview } from "./plan-publication-preview";
import { scheduleDepartmentColor } from "@/lib/department-badge";
import { operationNames, operationName, visibleWorkItem, workItemChoice } from "@/lib/work-operation-items";
type Business = AnnualPlan["business"][number];
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const weekday = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
export function WorkPlans({
  context: c,
  today,
  initialDate,
  initialQuickAdd = false,
  onDirtyChange,
  save = saveAnnual,
}: {
  context: Context;
  today: string;
  initialDate?: string;
  initialQuickAdd?: boolean;
  onDirtyChange: (v: boolean) => void;
  save?: typeof saveAnnual;
}) {
  const start = `${c.year?.year ?? 2026}-03-01`,
    end = monthRange(`${(c.year?.year ?? 2026) + 1}-02`).end;
  const clamp = (d: string) => (d < start ? start : d > end ? end : d);
  const [plan, setPlan] = useState<AnnualPlan>(() =>
    c.annual ? annualSchema.parse(c.annual.document) : defaultAnnual(),
  );
  const [savedPlan, setSavedPlan] = useState(plan);
  const [version, setVersion] = useState(c.annual?.version ?? 0),
    [date, setDate] = useState(clamp(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && Number.isFinite(Date.parse(initialDate)) ? initialDate : today)),
    [view, setView] = useState<"week" | "month">("week"),
    [monthList, setMonthList] = useState(false),
    [departmentFilter, setDepartmentFilter] = useState(""),
    [dirty, setDirty] = useState(false);
  const [batch, setBatch] = useState(false);
  const [batchDirty,setBatchDirty]=useState(false);
  const [editing, setEditing] = useState<Partial<Business> | null>(()=>initialQuickAdd && canPlan(c,"plans") ? {date,kind:"업무"} : null),
    [error, setError] = useState("");
  const m = useMutation();
  const publication = useMutation();
  const importState = useMutation();
  const [publishing, setPublishing] = useState(false);
  const [previous, setPrevious] = useState<Business[] | null>(null);
  const [copyIds, setCopyIds] = useState<string[]>([]);
  useEditGuard("work-plan-form", !!editing || batchDirty);
  const revision = useRef(0);
  const latestVersion = c.annual?.version ?? 0;
  const latestPlan = useMemo(
    () => (c.annual ? annualSchema.parse(c.annual.document) : defaultAnnual()),
    [c.annual],
  );
  const needsSync = latestVersion > version;
  const reconciled = useMemo(
    () =>
      needsSync && dirty ? mergeAnnualPlans(savedPlan, plan, latestPlan) : null,
    [needsSync, dirty, savedPlan, plan, latestPlan],
  );
  const versionConflict = !!reconciled?.conflicts.length;
  if (!dirty && !editing && !batch && !m.pending && needsSync) {
    setPlan(latestPlan);
    setSavedPlan(latestPlan);
    setVersion(latestVersion);
  }
  if (!c.year)
    return (
      <Empty
        title="학년도를 먼저 설정해 주세요"
        description="상단에서 학년도를 선택한 뒤 업무계획을 작성합니다."
      />
    );
  const editable = canPlan(c, "plans");
  const operations = operationNames(plan);
  const range =
    view === "week"
      ? { start: weekRange(date).start, end: addDays(weekRange(date).start, 6) }
      : monthRange(date.slice(0, 7));
  const dates =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(range.start, i))
      : calendarDays(date.slice(0, 7)).slice(
          0,
          Math.ceil((weekday(range.start) + Number(range.end.slice(-2))) / 7) *
            7,
        );
  const change = (next: AnnualPlan) => {
    revision.current++;
    setPlan(next);
    setDirty(true);
    onDirtyChange(true);
  };
  const shiftedDate = (source: string) => {
    const month = `${Number(source.slice(0, 4)) + 1}${source.slice(4, 7)}`;
    const value = month + source.slice(7);
    return value > monthRange(month).end ? monthRange(month).end : value;
  };
  const matching = (item: Business) => plan.business.some((current) =>
    current.date === shiftedDate(item.date) && current.department === item.department &&
    current.kind === item.kind && operationName(current) === operationName(item) && current.text === item.text,
  );
  const open = (d: string, kind: Business["kind"] = "업무", name?: string) => {
    setError("");
    setEditing({ date: clamp(d), kind, operationName: name });
  };
  const navigate = (direction: number) => {
    if (direction < 0 ? range.start <= start : range.end >= end) return;
    setDate(clamp(shiftScheduleDate(date, view, direction)));
  };
  const deptTag = (department: string) => <DepartmentBadge department={department} />;
  const businessCard = (b: Business) => (
    <article className="work-card" key={b.id} data-department-color={scheduleDepartmentColor(b.department)}>
      {deptTag(b.department)}
      <div>
        {editable ? (
          <button
            className="work-card-title"
            onClick={() => {
              setError("");
              setEditing(b);
            }}
            aria-label={`${b.text} 수정`}
          >
            {b.text}
          </button>
        ) : (
          <strong>{b.text}</strong>
        )}
        {(b.time || b.location || b.participants) && (
          <small>
            {[b.time, b.location, b.participants].filter(Boolean).join(" · ")}
          </small>
        )}
        <ResourceLinks value={b.resources} compact />
      </div>
    </article>
  );
  const dayContent = (d: string) => {
    const inYear = d >= start && d <= end;
    return (
      <>
        <div className="work-day-events">
          {plan.holidays[d] && (
            <p className="work-holiday">{plan.holidays[d]}</p>
          )}
          {plan.vacations
            .filter((v) => d >= v.start && d <= v.end)
            .map((v, i) => (
              <p className="work-vacation" key={i}>
                {v.name}
              </p>
            ))}
          {c.events
            .filter(
              (e) =>
                e.start_date <= d &&
                e.end_date >= d &&
                (!departmentFilter || e.department === departmentFilter),
            )
            .map((e) => (
              <article key={e.id} className="work-card academic-work-card" data-department-color={scheduleDepartmentColor(e.department)}>
                {deptTag(e.department)}
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    학사일정
                    {e.activity_area !== "없음" ? ` · ${e.activity_area}` : ""}
                  </small>
                  <ResourceLinks value={e.resources} compact />
                </div>
              </article>
            ))}
          {plan.allocations
            .filter(
              (a) =>
                a.date === d &&
                (!departmentFilter || a.department === departmentFilter) &&
                !c.events.some((e) => e.id === a.eventId),
            )
            .map((a) => (
              <article key={a.id} className="work-card academic-work-card" data-department-color={scheduleDepartmentColor(a.department)}>
                {deptTag(a.department)}
                <div>
                  <strong>{a.title}</strong>
                  <small>
                    {a.start}~{a.end}교시 ·{" "}
                    {[...new Set(Object.values(a.areas))].join(", ")}
                  </small>
                </div>
              </article>
            ))}
          {plan.business
            .filter(
              (b) =>
                b.date === d &&
                b.kind === "업무" &&
                (!departmentFilter || b.department === departmentFilter),
            )
            .map(businessCard)}
          {editable && inYear && (
            <button
              className="add-work no-print"
              aria-label={`${d} 일정 추가`}
              onClick={() => open(d)}
            >
              <Plus size={15} /> 일정 추가
            </button>
          )}
        </div>
        <div className="work-day-extras">
          {[...operations.map((name) => ({ name, kind: "운영업무" as const })),
            { name: "출장", kind: "출장" as const }].map(({ name, kind }) => {
              const rows = plan.business.filter((b) => b.date === d &&
                (kind === "출장" ? b.kind === "출장" : operationName(b) === name) &&
                (!departmentFilter || b.department === departmentFilter));
              if (view !== "week" && !rows.length) return null;
              return <section key={name}>
                <div className="work-extra-heading">
                  <b>{name}</b>
                  {editable && inYear && <button className="no-print"
                    aria-label={`${d} ${name} 추가`}
                    onClick={() => open(d, kind, kind === "운영업무" ? name : undefined)}>+ 추가</button>}
                </div>
                {rows.map(businessCard)}
                {!rows.length && <small className="muted">없음</small>}
              </section>;
            })}
        </div>
      </>
    );
  };
  const notices = plan.business.filter(
    (b) =>
      b.kind === "협의사항" &&
      b.date >= range.start &&
      b.date <= range.end &&
      (!departmentFilter || b.department === departmentFilter),
  );
  return (
    <>
      <div className="page-heading schedule-management-heading">
        <div>
          <h1>월중·주간 업무계획</h1>
        </div>
        <div className="heading-actions">
          <PrintButton />
          {editable && <Button variant="outline" disabled={!!editing||batch||m.pending} onClick={()=>open(date)}>+ 일정 등록</Button>}
          {editable && <Button variant="outline" disabled={!!editing||m.pending} onClick={()=>{if(batchDirty&&!window.confirm("초안에 추가하지 않은 입력을 버릴까요?"))return;setBatchDirty(false);onDirtyChange(dirty);setBatch(v=>!v);}}>{batch?"달력으로 돌아가기":"일괄 입력"}</Button>}
          {editable && c.years.some((item) => item.year === c.year!.year - 1) &&
            <Button variant="outline" disabled={importState.pending || !!editing} onClick={() => {
              importState.execute(() => previousWorkPlan(c.workspace.id, c.year!.year), (rows) => {
                setCopyIds([]);
                setPrevious(rows);
              });
            }}>전년도 자료 불러오기</Button>}
          {editable && <Button variant="outline" disabled={!version || dirty || batchDirty || !!editing || versionConflict}
            onClick={() => setPublishing(true)}>확정·공개</Button>}
          {editable && (
            <Button
              disabled={!dirty || batchDirty || !!editing || m.pending || versionConflict}
              onClick={() => {
                const submittedRevision = revision.current;
                const submittedPlan = reconciled?.plan ?? plan;
                const expectedVersion = reconciled ? latestVersion : version;
                if (reconciled) {
                  setPlan(submittedPlan);
                  setSavedPlan(latestPlan);
                  setVersion(latestVersion);
                }
                m.execute(
                  () =>
                    save({
                      workPlans: true,
                      workspaceId: c.workspace.id,
                      yearId: c.year!.id,
                      version: expectedVersion,
                      document: submittedPlan,
                    }),
                  (v) => {
                    setVersion(v);
                    setSavedPlan(submittedPlan);
                    if (revision.current === submittedRevision) {
                      setDirty(false);
                      onDirtyChange(false);
                    }
                  },
                );
              }}
            >
              업무계획 저장
            </Button>
          )}
        </div>
      </div>
      <InlineNotice mutation={importState} />
      <Modal open={previous !== null} onOpenChange={(open) => !open && setPrevious(null)}
        title="전년도 업무 일정 선택"
        description="선택한 일정을 같은 월·일의 새 항목으로 추가합니다. 이미 있는 일정은 건너뜁니다." wide>
        {!previous?.length ? <p>전년도 업무 일정이 없습니다.</p> : (
          <div className="operations-scroll">
            <table aria-label="전년도 업무 일정">
              <thead><tr><th>선택</th><th>일정</th><th>가져올 날짜</th></tr></thead>
              <tbody>{previous.map((item) => <tr key={item.id}>
                <td><input type="checkbox" aria-label={`${item.date} ${item.text}`} disabled={matching(item)}
                  checked={copyIds.includes(item.id)} onChange={(event) => {
                    setCopyIds((old) => event.target.checked ? [...old, item.id] : old.filter((id) => id !== item.id));
                  }} /></td>
                <td>{item.department} · {item.text}</td>
                <td>{shiftedDate(item.date)}{matching(item) && " · 이미 있음"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        <Button disabled={!copyIds.length} onClick={() => {
          const rows = (previous ?? []).filter((item) => copyIds.includes(item.id) && !matching(item));
          const departments = [...new Set([...plan.departments, ...rows.map((item) => item.department).filter(Boolean)])];
          if (departments.length > 20 || plan.business.length + rows.length > 3000) {
            setError("부서 또는 업무 일정 수가 허용 범위를 초과합니다. 가져올 자료를 줄여 주세요.");
            return;
          }
          const names = [...new Set([...operations, ...rows.map(operationName).filter((name): name is string => !!name)])];
          if (names.length > 20) { setError("운영 항목은 20개 이내입니다."); return; }
          change({ ...plan, departments, workSettings: { ...plan.workSettings, dutyEnabled: names.includes("당직"), operationNames: names }, business: [...plan.business,
            ...rows.map((item) => ({ ...item, id: crypto.randomUUID(), date: shiftedDate(item.date) })),
          ] });
          setPrevious(null);
        }}>선택 일정 추가</Button>
      </Modal>
      <Modal open={publishing} onOpenChange={setPublishing} title="월중·주간계획 공개"
        description="저장한 업무 일정을 지정한 날짜부터 공개합니다. 학사일정은 학사일정 공개본에서 가져옵니다.">
        <form className="form-stack" onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          publication.execute(() => publishWorkPlan({
            workspaceId: c.workspace.id, yearId: c.year!.id, version,
            startsOn: fields.get("startsOn"), note: fields.get("note"),
          }), () => {
            setPublishing(false);
            publication.refresh();
          });
        }}>
          <PlanPublicationPreview context={c} domain="plans" savedPlan={savedPlan} version={version} start={start} end={end} initialDate={clamp(today)} disabled={publication.pending || dirty || versionConflict || needsSync}>
            <InlineNotice mutation={publication} />
          </PlanPublicationPreview>
        </form>
      </Modal>
      {editable && (
        <div className="annual-status no-print">
          <SaveStatus
            state={
              m.pending
                ? "saving"
                : versionConflict
                  ? "conflict"
                  : m.notice.error
                    ? "error"
                    : dirty
                      ? "dirty"
                      : version
                        ? "saved"
                        : "draft"
            }
          >
            {m.pending
              ? "저장 중…"
              : versionConflict
                ? "충돌 · 입력을 복사한 뒤 최신 저장본을 확인해 주세요."
                : m.notice.error
                  ? "저장 실패 · 입력 내용 유지"
                  : dirty
                    ? "저장하지 않은 변경사항이 있습니다."
                    : version
                      ? `저장 완료 · v${version}`
                      : "초안"}
          </SaveStatus>
        </div>
      )}
      <InlineNotice mutation={m} />
      {editable && dirty && m.notice.error && !versionConflict && (
        <Button variant="outline" className="no-print" onClick={m.refresh}>
          최신 저장본 확인
        </Button>
      )}
      {batch && editable && <WorkBatch plan={plan} start={start} end={end} date={date} disabled={m.pending||versionConflict} onDraftChange={v=>{setBatchDirty(v);if(v)onDirtyChange(true);}} onApply={rows=>change({...plan,business:[...plan.business,...rows]})}/>}
      <div hidden={batch}>
      <div className="work-toolbar schedule-management-toolbar no-print">
        <div className="work-view-tabs">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === "week" ? "주간계획" : "월중계획"}
            </button>
          ))}
        </div>
        <div className="work-date-controls">
          <Button
            variant="ghost"
            size="icon"
            aria-label={view === "week" ? "이전 주" : "이전 달"}
            disabled={range.start <= start}
            onClick={() => navigate(-1)}
          >
            <ChevronLeft />
          </Button>
          <label>
            <span className="sr-only">업무계획 기준 날짜</span>
            <input
              type="date"
              value={date}
              min={start}
              max={end}
              onChange={(e) => {
                if (e.target.value) setDate(clamp(e.target.value));
              }}
            />
          </label>
          <Button
            variant="ghost"
            size="icon"
            aria-label={view === "week" ? "다음 주" : "다음 달"}
            disabled={range.end >= end}
            onClick={() => navigate(1)}
          >
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => setDate(clamp(today))}>
            오늘
          </Button>
        </div>
        {view === "month" && (
          <div className="work-view-tabs">
            <button
              aria-pressed={!monthList}
              onClick={() => setMonthList(false)}
            >
              달력
            </button>
            <button aria-pressed={monthList} onClick={() => setMonthList(true)}>
              목록
            </button>
          </div>
        )}
        <label className="work-department-filter">
          조회 부서
          <select
            aria-label="학교업무 조회 부서"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="">학교 전체</option>
            {plan.departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>
      <div
        className={`work-layout ${view === "month" ? "work-layout-month" : ""}`}
      >
        <aside className="panel work-sidebar">
          <div className="work-mini-calendar no-print">
            <h2>
              {date.slice(0, 4)}년 {Number(date.slice(5, 7))}월
            </h2>
            <div>
              {weekdays.map((w) => (
                <b key={w}>{w}</b>
              ))}
              {calendarDays(date.slice(0, 7)).map((d) => (
                <button
                  key={d}
                  disabled={d < start || d > end}
                  className={`${d >= range.start && d <= range.end ? "in-range" : ""} ${d === date ? "selected" : ""} ${!d.startsWith(date.slice(0, 7)) ? "muted" : ""}`}
                  aria-label={`${d} 선택`}
                  aria-pressed={d === date}
                  onClick={() => setDate(d)}
                >
                  {Number(d.slice(-2))}
                </button>
              ))}
            </div>
          </div>
          <section className="work-notices">
            <h2>{view === "week" ? "주간" : "월중"} 공지·협의사항</h2>
            <p className="muted">
              {range.start} ~ {range.end}
            </p>
            {notices.length ? (
              notices.map(businessCard)
            ) : (
              <p className="muted">등록된 공지·협의사항이 없습니다.</p>
            )}
            {editable && (
              <button
                className="add-work no-print"
                onClick={() => open(range.start, "협의사항")}
              >
                + 공지·협의사항 추가
              </button>
            )}
          </section>
        </aside>
        <section className="panel work-board-panel">
          <h2>
            {c.year.year}학년도{" "}
            {view === "week"
              ? `${range.start} ~ ${range.end} 주간계획`
              : `${Number(date.slice(5, 7))}월 월중계획`}
          </h2>
          {!(view === "month" && monthList) && <div className="mobile-only work-mobile-date-picker no-print">
            <MobileCalendarDates date={date} today={today} start={start} end={end} period={view}
              items={(day) => {
                const matchesDepartment = (department: string) => !departmentFilter || departmentFilter === department;
                const entries: CalendarCellItem[] = [];
                const closure = plan.holidays[day] || plan.vacations.find((item) => item.start <= day && item.end >= day)?.name;
                if (closure) entries.push({ title: closure, tone: "break" });
                for (const event of c.events) {
                  if (event.start_date <= day && event.end_date >= day && matchesDepartment(event.department)) entries.push({ title: event.title, tone: "event", department: event.department });
                }
                for (const allocation of plan.allocations) {
                  if (allocation.date === day && matchesDepartment(allocation.department) && !c.events.some((e) => e.id === allocation.eventId)) entries.push({ title: allocation.title, tone: "event", department: allocation.department });
                }
                for (const item of plan.business) {
                  if (item.date === day && matchesDepartment(item.department) && visibleWorkItem(plan, item)) entries.push({ title: item.text, tone: "work", department: item.department });
                }
                return entries;
              }} onNavigate={navigate} onSelect={(day) => {
                setDate(day);
                if (view === "week") requestAnimationFrame(() => document.getElementById(`work-day-${day}`)?.scrollIntoView({ block: "nearest" }));
              }} />
          </div>}
          <div
            className="work-board-scroll"
            tabIndex={0}
            role="region"
            aria-label={view === "week" ? "요일별 주간계획" : "월중계획 달력"}
          >
            <div
              className={`work-plan-table ${view === "week" ? "work-week-board" : monthList ? "work-month-list" : "work-month-board"}`}
            >
              {view === "month" &&
                !monthList &&
                weekdays.map((w) => (
                  <div className="work-weekday" key={w}>
                    {w}요일
                  </div>
                ))}
              {dates
                .filter(
                  (d) =>
                    view !== "month" ||
                    !monthList ||
                    d.startsWith(date.slice(0, 7)),
                )
                .map((d) => (
                  <section
                    key={d}
                    id={`work-day-${d}`}
                    data-selected={d === date ? "" : undefined}
                    className={`work-day ${weekday(d) === 0 || weekday(d) === 6 ? "work-weekend" : ""} ${view === "month" && !d.startsWith(date.slice(0, 7)) ? "outside-month" : ""} ${d === today ? "work-today" : ""}`}
                  >
                    <h3>
                      <span>
                        {view === "week"
                          ? `${weekdays[weekday(d)]}요일`
                          : Number(d.slice(-2))}
                      </span>
                      <span>
                        {view === "week"
                          ? `${Number(d.slice(5, 7))}.${Number(d.slice(-2))}`
                          : weekdays[weekday(d)]}
                      </span>
                    </h3>
                    {dayContent(d)}
                  </section>
                ))}
            </div>
          </div>
        </section>
      </div>
      {editable && (
        <Disclosure className="panel work-options no-print" label="업무계획 설정">
          <form onSubmit={(e) => {
            e.preventDefault();
            const names = [...new Set(String(new FormData(e.currentTarget).get("operationNames") ?? "").split("\n").map((name) => name.trim()).filter(Boolean))];
            const checked = annualSchema.safeParse({ ...plan, workSettings: {
              ...plan.workSettings, dutyEnabled: names.includes("당직"), operationNames: names,
            } });
            if (!checked.success) { setError(checked.error.issues[0].message); return; }
            change(checked.data);
            setError("");
          }}>
            <label>학교 운영 항목 (한 줄에 하나)
              <textarea key={operations.join("\n")} name="operationNames" defaultValue={operations.join("\n")} rows={4}
                placeholder={"등교 지도\n급식 지도\n기숙사 당직"} />
            </label>
            <p className="muted">학교에 필요한 항목만 등록하세요. 항목을 목록에서 제거해도 기존 배정 기록은 보존되며, 같은 이름을 다시 등록하면 표시됩니다. 출장은 항상 제공됩니다.</p>
            <Button variant="outline">운영 항목 적용</Button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const departments = [
                ...new Set(
                  String(new FormData(e.currentTarget).get("departments"))
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                ),
              ];
              if (
                plan.business.some((b) => !departments.includes(b.department))
              ) {
                setError(
                  "업무가 있는 부서는 먼저 업무를 옮긴 뒤 삭제해 주세요.",
                );
                return;
              }
              const v = annualSchema.safeParse({ ...plan, departments });
              if (v.success) {
                change(v.data);
                setError("");
              } else setError(v.error.issues[0].message);
            }}
          >
            <label>
              한 줄에 한 부서
              <textarea
                name="departments"
                defaultValue={plan.departments.join("\n")}
                rows={6}
              />
            </label>
            <Button variant="outline">부서 목록 적용</Button>
          </form>
          {error && !editing && <p role="alert">{error}</p>}
        </Disclosure>
      )}
      </div>
      {editable && editing && (
        <Modal
          title={editing.id ? "업무 수정" : "업무 추가"}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <form
            key={editing.id ?? "new-work"}
            className="annual-form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const choice = String(f.get("kind"));
              const custom = choice.startsWith("operation:") ? choice.slice("operation:".length) : undefined;
              const row = {
                id: editing.id ?? crypto.randomUUID(),
                date: String(f.get("date")),
                department: String(f.get("department")),
                kind: custom ? (editing.kind === "당직" && custom === "당직" ? "당직" : "운영업무") : choice,
                operationName: custom && !(editing.kind === "당직" && custom === "당직") ? custom : undefined,
                text: String(f.get("text")).trim(),
                time: String(f.get("time")),
                location: String(f.get("location")),
                participants: String(f.get("participants")),
                resources: editing.resources,
              };
              const checked = annualSchema.safeParse({
                ...plan,
                business: [
                  ...plan.business.filter((b) => b.id !== editing.id),
                  row,
                ],
              });
              if (checked.success) {
                change(checked.data);
                setEditing(null);
                setError("");
              } else setError(checked.error.issues[0].message);
            }}
          >
            <label>
              업무 날짜
              <input
                name="date"
                type="date"
                min={start}
                max={end}
                defaultValue={editing.date ?? date}
                required
              />
            </label>
            <label>
              부서
              <select
                name="department"
                defaultValue={editing.department ?? plan.departments[0]}
              >
                {plan.departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              업무 구분
              <select name="kind" defaultValue={workItemChoice(editing)}>
                {["업무", "출장", "협의사항"].map((k) => <option key={k}>{k}</option>)}
                {[...new Set([...operations, ...(editing.kind === "당직" ? ["당직"] : editing.operationName ? [editing.operationName] : [])])].map((name) =>
                  <option key={name} value={`operation:${name}`}>{name}</option>)}
              </select>
            </label>
            <label>
              시간
              <input
                name="time"
                defaultValue={editing.time}
                maxLength={120}
                placeholder="예: 13:20~15:00"
              />
            </label>
            <label>
              장소
              <input
                name="location"
                defaultValue={editing.location}
                maxLength={120}
              />
            </label>
            <label>
              대상·참석자
              <input
                name="participants"
                defaultValue={editing.participants}
                maxLength={120}
              />
            </label>
            <label className="annual-wide">
              {editing.kind === "운영업무" || editing.kind === "당직" ? "담당자·배정 내용" : "내용"}
              <textarea
                name="text"
                defaultValue={editing.text}
                maxLength={2000}
                required
                rows={4}
              />
            </label>
            <ResourceLinkEditor value={editing.resources ?? []}
              onChange={(resources) => setEditing({ ...editing, resources })} />
            {error && <p role="alert">{error}</p>}
            <Button>{editing.id ? "수정 적용" : "업무 추가"}</Button>
            {editing.id && (
              <Button type="button" variant="outline" onClick={(event) => {
                const form = event.currentTarget.form;
                if (!form) return;
                const f = new FormData(form), choice = String(f.get("kind"));
                const custom = choice.startsWith("operation:") ? choice.slice("operation:".length) : undefined;
                const kind = custom ? (editing.kind === "당직" && custom === "당직" ? "당직" : "운영업무") : choice as Business["kind"];
                setEditing({ date: clamp(addDays(String(f.get("date") || editing.date || date), 1)),
                  department: String(f.get("department")), kind, operationName: kind === "운영업무" ? custom : undefined,
                  text: String(f.get("text")), time: String(f.get("time")), location: String(f.get("location")),
                  participants: String(f.get("participants")), resources: structuredClone(editing.resources ?? []) });
                setError("");
              }}>복제 후 새 업무 작성</Button>
            )}
            {editing.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "이 업무를 삭제할까요? 저장하면 삭제가 반영됩니다.",
                    )
                  ) {
                    change({
                      ...plan,
                      business: plan.business.filter(
                        (b) => b.id !== editing.id,
                      ),
                    });
                    setEditing(null);
                  }
                }}
              >
                이 업무 삭제
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              취소
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
