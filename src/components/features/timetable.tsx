"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Upload, Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Context } from "@/lib/models";
import {
  newTimetableDocument, mergeTimetableDocument, legacyTimetableSpace,
  officialTimetableDayRules, timetableDocumentSchema, type TimetableDocument,
} from "@/lib/timetable-bridge";
import { loadTimetableDocument, saveTimetableDocument } from "@/app/timetable-actions";
import AcademicPlanner from "../../../legacy/workspace/components/AcademicPlanner";
import "../../../legacy/workspace/app/academic.css";
import "../../../legacy/workspace/app/timetable.css";
import "../../../legacy/workspace/app/academic-rebuild.css";
import "./timetable.css";

type Space = ReturnType<typeof legacyTimetableSpace>;
type DocumentMessage = { text: string; error?: boolean };
export function Timetable({ context: c, onDirtyChange }: {
  context: Context; onDirtyChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const year = c.year?.year ?? 2027;
  const [space, setSpace] = useState<Space>(() => legacyTimetableSpace(c, newTimetableDocument(c)));
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, startTransition] = useTransition();
  const [message, setMessage] = useState<DocumentMessage>({ text: "" });
  const revision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const canWrite = c.role === "admin" || c.role === "editor";
  const document = space.academics[String(year)];
  const updateSpace = useCallback((updater: (previous: Space) => Space) => {
    if (!canWrite) { setMessage({ text: "조회 권한으로는 시간표를 수정할 수 없습니다.", error: true }); return; }
    setSpace((previous) => updater(previous));
    revision.current += 1;
    setDirty(true);
  }, [canWrite]);
  useEffect(() => { onDirtyChange(dirty || matrixDirty); }, [dirty, matrixDirty, onDirtyChange]);
  useEffect(() => {
    if (!c.year) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    void loadTimetableDocument({ workspaceId: c.workspace.id, yearId: c.year.id }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setMessage({ text: result.error, error: true });
        setLoading(false); return;
      }
      const existing = result.data?.document as TimetableDocument | undefined;
      const plan = existing ? mergeTimetableDocument(c, existing) : newTimetableDocument(c);
      setSpace(legacyTimetableSpace(c, plan));
      setVersion(result.data?.version ?? 0);
      setDirty(false); setMatrixDirty(false);
      revision.current = 0;
      setLoading(false);
    });
    return () => { active = false; };
    // The active workspace/year identifies the saved document. Refreshing context
    // does not discard a locally edited timetable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.workspace.id, c.year?.id]);

  async function save() {
    if (!c.year || !document || !canWrite || saving || !dirty) return;
    if (matrixDirty) {
      setMessage({ text: "교사별 시수표의 미적용 변경 내용을 먼저 '적용'해 주세요.", error: true }); return;
    }
    const parsed = timetableDocumentSchema.safeParse({ ...document, year,
      dayRules: officialTimetableDayRules(c) });
    if (!parsed.success) {
      setMessage({ text: "시간표 입력 확인: " + (parsed.error.issues[0]?.message ?? "형식을 확인해 주세요."), error: true });
      return;
    }
    const savedRevision = revision.current;
    startTransition(async () => {
      const result = await saveTimetableDocument({
        workspaceId: c.workspace.id, yearId: c.year!.id,
        expectedVersion: version, document: parsed.data,
      });
      if (!result.ok) { setMessage({ text: result.error, error: true }); return; }
      if (!result.data.ok) {
        setMessage({ text: "다른 교사가 먼저 시간표를 저장했습니다. 현재 수정 내용은 유지했으니 JSON으로 백업한 뒤, 최신 자료를 다시 불러와 비교해 주세요.", error: true });
        return;
      }
      setVersion(result.data.version);
      if (revision.current === savedRevision) setDirty(false);
      setMessage({ text: "시간표를 학교 작업공간에 저장했습니다. (버전 " + result.data.version + ")" });
      router.refresh();
    });
  }
  async function reload() {
    if (!c.year || loading || saving) return;
    if ((dirty || matrixDirty) && !window.confirm("저장하지 않은 시간표를 버리고 학교의 최신 저장본을 불러올까요?")) return;
    setLoading(true);
    const response = await loadTimetableDocument({ workspaceId: c.workspace.id, yearId: c.year.id });
    if (response.ok) {
      setSpace(legacyTimetableSpace(c,
        response.data?.document ? mergeTimetableDocument(c, response.data.document as TimetableDocument) : newTimetableDocument(c)));
      setVersion(response.data?.version ?? 0);
      setDirty(false); setMatrixDirty(false); revision.current = 0;
      setMessage({ text: "학교에 저장된 최신 시간표를 다시 불러왔습니다." });
    } else setMessage({ text: response.error, error: true });
    setLoading(false);
  }
  function downloadBackup() {
    const content = JSON.stringify({ format: "eduplan-timetable-v1", year, plan: document,
      exportedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
    const anchor = window.document.createElement("a");
    anchor.href = url; anchor.download = "EduPlan_" + year + "_시간표백업.json";
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file: File | undefined) {
    if (!file || !canWrite) return;
    if (file.size > 2400000) { setMessage({ text: "2.4MB 이하의 시간표 JSON 파일만 가져올 수 있습니다.", error: true }); return; }
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const candidate = raw.plan ?? (raw.academics as Record<string, unknown> | undefined)?.[String(year)] ??
        raw.document ?? raw;
      const result = timetableDocumentSchema.safeParse(candidate);
      if (!result.success || result.data.year !== year) throw Error("현재 학년도와 맞는 EduPlan 시간표 백업이 아닙니다.");
      const doc = result.data;
      // Old local-only IDs (g1c1) must never be silently assigned to the wrong
      // official class. Match only if grade+class number can be verified.
      const classIdMap = new Map<string, string>();
      for (const item of doc.classes) {
        const matched = c.classes.find((schoolClass) => schoolClass.id === item.id) ??
          c.classes.find((schoolClass) => {
            const name = item.label.match(/(\d+)\s*학년\s*(\d+)\s*반/);
            const old = item.id.match(/^g(\d+)c(\d+)$/);
            const g = Number(name?.[1] ?? old?.[1]), no = Number(name?.[2] ?? old?.[2]);
            return schoolClass.grade === g && schoolClass.class_number === no;
          });
        if (matched) classIdMap.set(item.id, matched.id);
      }
      const usedClassIds = new Set([
        ...doc.weekly.filter((row) => row.scope === "class").map((row) => row.scopeId),
        ...doc.overrides.filter((row) => row.scope === "class").map((row) => row.scopeId),
        ...doc.groups.flatMap((group) => group.classIds),
        ...(doc.timetableConfig?.lessons ?? []).filter((row) => row.scope === "class").map((row) => row.scopeId),
      ]);
      const unresolved = [...usedClassIds].filter((id) => !classIdMap.has(id));
      if (unresolved.length) throw Error("공식 학교 학급과 연결되지 않은 과거 학급 " + unresolved.length + "개가 있습니다. 원본 자료는 유지했습니다.");
      const remap = (scope: string, id: string) => scope === "class" ? classIdMap.get(id) ?? id : id;
      const normalized: TimetableDocument = {
        ...doc,
        classes: doc.classes.map((item) => ({ ...item, id: classIdMap.get(item.id) ?? item.id })),
        weekly: doc.weekly.map((row) => ({ ...row, scopeId: remap(row.scope, row.scopeId) })),
        overrides: doc.overrides.map((row) => ({ ...row, scopeId: remap(row.scope, row.scopeId) })),
        groups: doc.groups.map((group) => ({ ...group, classIds: group.classIds.map((id) => classIdMap.get(id) ?? id) })),
        ...(doc.timetableConfig ? { timetableConfig: {
          ...doc.timetableConfig,
          lessons: doc.timetableConfig.lessons.map((row) => ({ ...row, scopeId: remap(row.scope, row.scopeId) })),
        } } : {}),
      };
      if (!window.confirm("가져온 시간표로 현재 편집 내용을 바꿀까요? 실제 학교 DB에는 '학교에 저장'을 눌러야 반영됩니다.")) return;
      setSpace(legacyTimetableSpace(c, mergeTimetableDocument(c, normalized)));
      revision.current += 1; setDirty(true);
      setMessage({ text: "시간표 백업을 불러왔습니다. 내용을 확인한 다음 학교에 저장해 주세요." });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "JSON 백업 파일을 읽지 못했습니다.", error: true });
    } finally { if (fileInput.current) fileInput.current.value = ""; }
  }
  if (!c.year) return <section className="panel"><h2>시간표</h2><p>작업공간 설정에서 학년도를 먼저 생성해 주세요.</p></section>;
  return <div className="timetable-module">
    <header className="page-heading">
      <div>
        <span className="eyebrow">TIMETABLE PLANNING</span>
        <h1>시간표 편성</h1>
        <p>{year}학년도 · 수업 배정, 자동편성, 일과표, 수업 교환과 보강을 하나의 시간표로 관리합니다.</p>
      </div>
      <div className="heading-actions tt-primary-actions">
        <Button variant="outline" onClick={downloadBackup} disabled={loading || !document}>
          <Download size={15}/> JSON 백업
        </Button>
        {canWrite && <><input ref={fileInput} type="file" accept=".json,application/json" className="sr-only"
          aria-label="기존 시간표 JSON 백업 가져오기"
          onChange={(event) => void importBackup(event.target.files?.[0])}/>
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={saving || loading}>
            <Upload size={15}/> 이전 시간표 가져오기
          </Button></>}
        <Button variant="outline" onClick={() => void reload()} disabled={loading || saving}>
          <RefreshCcw size={15}/> 다시 불러오기
        </Button>
        {canWrite && <Button onClick={() => void save()} disabled={loading || saving || !dirty || matrixDirty}>
          <Save size={15}/>{saving ? "저장 중…" : "학교에 저장"}
        </Button>}
      </div>
    </header>
    <div className="tt-status-row">
      <span className="tt-version">{loading ? "학교 시간표 불러오는 중…" :
        "공동 저장 버전 " + version + (dirty ? " · 저장하지 않은 변경" : " · 저장됨")}</span>
      {!canWrite && <span className="tt-readonly">조회 전용</span>}
      {matrixDirty && <span className="tt-unsaved">교사별 시수표 미적용 수정 있음</span>}
    </div>
    {!!message.text && <p className={message.error ? "tt-server-error" : "tt-server-notice"} role="status">{message.text}</p>}
    {loading ? <section className="panel">시간표 자료를 불러오고 있습니다.</section>
      : <div className={saving ? "tt-save-locked" : ""}>
        <AcademicPlanner key={year} mode="timetable" schoolName={c.workspace.name} space={space}
          updateSpace={updateSpace} notify={(text: string) => setMessage({ text })}
          onOpenCalendar={() => router.push("/app/" + c.workspace.id + "/calendar?year=" + year)}
          onOpenCurriculum={() => router.push("/app/" + c.workspace.id + "/curriculum?year=" + year)}
          onDirtyChange={setMatrixDirty}/>
      </div>}
  </div>;
}
