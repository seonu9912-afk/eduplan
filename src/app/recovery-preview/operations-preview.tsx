"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { useCallback, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { operationsPreviewContext } from "./operations-fixture";
import { Staffing, type StaffingActions } from "@/components/features/staffing";
import { PersonalDay } from "@/components/features/personal-day";
import {
  AcademicCalendar,
  calendarActions,
} from "@/components/features/academic-calendar";
import { WorkPlans } from "@/components/features/work-plans";
import { TimetableReference } from "@/components/features/teaching/timetable-reference";
import { TeachingModule } from "@/components/features/teaching";
import { Button } from "@/components/ui/button";
import { annualSchema } from "@/lib/academic";
import { calendarChangeSchema } from "@/lib/academic-calendar";
import {
  directoryEntry,
  staffInputSchema,
  scenarioSchema,
  staffingReport,
  type ScenarioRecord,
  type StaffingScenario,
} from "@/lib/staffing";
import { withWeeklyHours, evaluateCell } from "@/lib/curriculum-design";
import type { Context } from "@/lib/models";
const key = "eduplan-operations-rehearsal-v1";
function createStore() {
  let snapshot: Context | null = null;
  const listeners = new Set<() => void>();
  function notify() {
    listeners.forEach((l) => l());
  }
  function read() {
    try {
      const saved = localStorage.getItem(key);
      snapshot = saved ? JSON.parse(saved) : operationsPreviewContext();
    } catch {
      snapshot = operationsPreviewContext();
    }
    notify();
  }
  function save(next: Context) {
    localStorage.setItem(key, JSON.stringify(next));
    snapshot = next;
    notify();
  }
  const staffing: StaffingActions = {
    saveStaff: async (input) => {
      const v = z
        .object({
          id: z.uuid().nullable(),
          version: z.number(),
          staff: staffInputSchema,
        })
        .parse(input);
      const c = structuredClone(snapshot!);
      const old = c.operations!.staff.find((x) => x.id === v.id);
      if (v.id && old?.version !== v.version)
        return { ok: false, error: "다른 창에서 교원 정보가 변경되었습니다." };
      if (
        v.staff.user_id &&
        c.operations!.staff.some(
          (t) => t.id !== v.id && t.user_id === v.staff.user_id,
        )
      )
        return { ok: false, error: "이미 연결된 가입 계정입니다." };
      const row = {
        ...v.staff,
        id: v.id ?? crypto.randomUUID(),
        workspace_id: c.workspace.id,
        academic_year_id: c.year!.id,
        version: v.version + 1,
        updated_at: new Date().toISOString(),
      };
      c.operations!.staff = [
        ...c.operations!.staff.filter((t) => t.id !== row.id),
        row,
      ];
      c.operations!.directory = c.operations!.staff.map(directoryEntry);
      save(c);
      return { ok: true, data: row };
    },
    saveScenario: async (input) => {
      const scenario = scenarioSchema.parse(
          (input as { scenario: StaffingScenario }).scenario,
        ),
        c = structuredClone(snapshot!);
      const row: ScenarioRecord = {
        id: crypto.randomUUID(),
        workspace_id: c.workspace.id,
        academic_year_id: c.year!.id,
        name: scenario.name,
        created_at: new Date().toISOString(),
        document: {
          scenario,
          reports: [1, 2].map((s) => staffingReport(c, s, scenario)),
          sourceVersions: Object.fromEntries(
            c.plans.map((p) => [p.id, p.version]),
          ),
        },
      };
      c.operations!.scenarios.unshift(row);
      save(c);
      return { ok: true, data: row.id };
    },
    previousStaff: async () => ({ ok: true, data: [] }),
  };
  const calendar: typeof calendarActions = {
    loadCalendarState: async () => ({
      ok: true,
      data: { annual: snapshot!.annual, events: snapshot!.events, history: [] },
    }),
    saveCalendarChanges: async (input) => {
      const v = z
          .object({ changes: z.array(calendarChangeSchema) })
          .parse(input),
        c = structuredClone(snapshot!),
        plan = annualSchema.parse(c.annual!.document);
      for (const change of v.changes) {
        if (change.kind === "day") {
          if (change.value) plan.days[change.date] = change.value;
          else delete plan.days[change.date];
        } else if (change.kind === "holidays") plan.holidays = change.value;
        else {
          c.events = c.events.filter((e) => e.id !== change.id);
          if (change.value)
            c.events.push({
              ...change.value,
              id: change.id,
              workspace_id: c.workspace.id,
              academic_year_id: c.year!.id,
              school_id: null,
              version: change.version + 1,
              created_by: c.userId,
              updated_at: new Date().toISOString(),
            });
          plan.allocations = [
            ...plan.allocations.filter((a) => a.eventId !== change.id),
            ...change.allocations,
          ];
        }
      }
      c.annual = {
        ...c.annual!,
        version: c.annual!.version + 1,
        document: plan,
      };
      save(c);
      return {
        ok: true,
        data: {
          ok: true,
          state: { annual: c.annual, events: c.events, history: [] },
        },
      };
    },
    confirmAcademicCalendar: async () => ({
      ok: false,
      error: "실습 자료는 실제 학교 확정본으로 배포되지 않습니다.",
    }),
    previewHolidays: async () => ({
      ok: false,
      error: "실습에서는 외부 공휴일 자료를 가져오지 않습니다.",
    }),
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!snapshot) read();
      const handle = () => read();
      window.addEventListener("storage", handle);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", handle);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => null,
    staffing,
    calendar,
    saveWork: async (input: unknown) => {
      const v = z
          .object({ version: z.number(), document: annualSchema })
          .parse(input),
        c = structuredClone(snapshot!);
      if (v.version !== c.annual?.version)
        return { ok: false as const, error: "자료가 변경되었습니다." };
      c.annual = { ...c.annual!, version: v.version + 1, document: v.document };
      save(c);
      return { ok: true as const, data: c.annual.version };
    },
    changeWeekly: (amount: number) => {
      const c = structuredClone(snapshot!),
        subject = c.subjects.find((s) => s.name === "국어")!;
      for (const p of c.plans) {
        const grade = c.year!.year - p.cohort_year + 1;
        const doc = withWeeklyHours(
          c.operations!.designs[p.id],
          subject.id,
          grade,
          1,
          amount,
        );
        c.operations!.designs[p.id] = doc;
        p.version++;
        c.hours = c.hours.map((h) =>
          h.plan_id === p.id &&
          h.subject_id === subject.id &&
          h.grade === grade &&
          h.semester === 1
            ? {
                ...h,
                hours: evaluateCell(
                  doc,
                  doc.cells.find(
                    (x) =>
                      x.subjectId === h.subject_id &&
                      x.grade === grade &&
                      x.semester === 1,
                  )!,
                ).total,
              }
            : h,
        );
      }
      save(c);
    },
  };
}
export function OperationsPreview() {
  const [store] = useState(createStore),
    c = useSyncExternalStore(
      store.subscribe,
      store.getSnapshot,
      store.getServerSnapshot,
    );
  const [tab, setTab] = useState("오늘"),
    [dirty, setDirty] = useState(false);
  const onDirty = useCallback((v: boolean) => setDirty(v), []);
  if (!c) return <p>통합 운영 실습 자료를 불러오고 있습니다.</p>;
  const tabs = ["오늘", "교원·수급", "학사일정", "월중·주간", "수업 연계"];
  return (
    <div className="operations-module">
      <header>
        <h1>학교 운영 통합 실습</h1>
        <p>
          12학급·19명 교원의 가상 자료입니다. 입력은 이 브라우저에만 저장되며
          운영 데이터·알림 발송에 연결되지 않습니다.
        </p>
      </header>
      <nav aria-label="통합 운영 실습 단계" className="operations-tabs">
        {tabs.map((name) => (
          <Button
            key={name}
            variant={tab === name ? "default" : "outline"}
            onClick={() => {
              if (
                !dirty ||
                window.confirm("저장하지 않은 입력을 버리고 이동할까요?")
              ) {
                setDirty(false);
                setTab(name);
              }
            }}
          >
            {name}
          </Button>
        ))}
      </nav>
      <Disclosure className="panel" label="교육과정 변경 연계 실습">
        <p>
          1학기 국어의 학급당 주당 시수를 모든 학년에 적용합니다. 교원 수급과
          수업 기준은 즉시 갱신되고, 기존 시간표 배정은 유지됩니다.
        </p>
        <label>
          국어 주당 시수{" "}
          <input
            aria-label="연계 실습 국어 주당 시수"
            type="number"
            min={0}
            max={10}
            value={
              c.operations!.designs[c.plans[0].id].cells.find(
                (x) =>
                  x.subjectId ===
                    c.subjects.find((s) => s.name === "국어")!.id &&
                  x.grade === 1 &&
                  x.semester === 1,
              )?.weekly ?? 0
            }
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 10)
                store.changeWeekly(n);
            }}
          />
        </label>
      </Disclosure>
      {tab === "오늘" && (
        <PersonalDay
          context={c}
          today="2027-03-02"
          previewNow="2027-03-02T08:57:00+09:00"
        />
      )}
      {tab === "교원·수급" && (
        <Staffing
          context={c}
          onDirtyChange={onDirty}
          actions={store.staffing}
          onRefresh={() => {}}
        />
      )}
      {tab === "학사일정" && (
        <AcademicCalendar
          context={c}
          today="2027-03-02"
          onDirtyChange={onDirty}
          actions={store.calendar}
        />
      )}
      {tab === "월중·주간" && (
        <WorkPlans
          context={c}
          today="2027-03-02"
          onDirtyChange={onDirty}
          save={store.saveWork}
        />
      )}
      {tab === "수업 연계" && (
        <>
          <TimetableReference context={c} course={c.teaching!.courses[0]} />
          <TeachingModule
            context={{ ...c, role: "viewer" }}
            onDirtyChange={onDirty}
          />
        </>
      )}
    </div>
  );
}
