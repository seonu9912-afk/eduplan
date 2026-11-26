"use client";
import { TimetableTouch } from "./timetable-touch";
import { canPlan } from "@/lib/planning-completion";
import { PlanningResources } from "./planning-resources";
import { publishTimetable } from "@/app/operations-actions";

import { commonTimetableView, seoulClock } from "@/lib/school-operations";
import {
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Save, Upload, Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Context } from "@/lib/models";
import {
  newTimetableDocument,
  mergeTimetableDocument,
  legacyTimetableSpace,
  officialTimetableDayRules,
  timetableDocumentSchema,
  type TimetableDocument,
} from "@/lib/timetable-bridge";
import {
  loadTimetableDocument,
  saveTimetableDocument,
} from "@/app/timetable-actions";
import AcademicPlanner from "../../../legacy/workspace/components/AcademicPlanner";
import "../../../legacy/workspace/app/academic.css";
import "../../../legacy/workspace/app/timetable.css";
import "../../../legacy/workspace/app/academic-rebuild.css";
import "./timetable.css";

type Space = ReturnType<typeof legacyTimetableSpace>;
type DocumentMessage = { text: string; error?: boolean };
export function Timetable({
  context: c,
  onDirtyChange,
}: {
  context: Context;
  onDirtyChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const year = c.year?.year ?? 2027;
  const [space, setSpace] = useState<Space>(() =>
    legacyTimetableSpace(c, newTimetableDocument(c)),
  );
  const [version, setVersion] = useState(0);
  const [effectiveDate, setEffectiveDate] = useState(() => {
    const today = seoulClock(new Date()).date;
    return today >= `${year}-03-01` && today < `${year + 1}-03-01`
      ? today
      : `${year}-03-01`;
  });
  const [dirty, setDirty] = useState(false);
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [wideMobile, setWideMobile] = useState(false);
  const [loading, setLoading] = useState(!!c.year);
  const [saving, startTransition] = useTransition();
  const [message, setMessage] = useState<DocumentMessage>({ text: "" });
  const revision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const canWrite = canPlan(c, "timetable");
  const document = useMemo(
    () => mergeTimetableDocument(c, space.academics[String(year)]),
    [c, space, year],
  );
  const liveSpace = useMemo(
    () => legacyTimetableSpace(c, document),
    [c, document],
  );
  const commonView = useMemo(
    () => commonTimetableView(c, document),
    [c, document],
  );
  const updateSpace = useCallback(
    (updater: (previous: Space) => Space) => {
      if (!canWrite) {
        setMessage({
          text: "조회 권한으로는 시간표를 수정할 수 없습니다.",
          error: true,
        });
        return;
      }
      setSpace((previous) =>
        updater(
          legacyTimetableSpace(
            c,
            mergeTimetableDocument(c, previous.academics[String(year)]),
          ),
        ),
      );
      revision.current += 1;
      setDirty(true);
    },
    [canWrite, c, year],
  );
  useEffect(() => {
    onDirtyChange(dirty || matrixDirty);
  }, [dirty, matrixDirty, onDirtyChange]);
  useEffect(() => {
    if (!c.year) return;
    let active = true;
    void loadTimetableDocument({
      workspaceId: c.workspace.id,
      yearId: c.year.id,
    })
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setMessage({ text: result.error, error: true });
          setLoading(false);
          return;
        }
        const existing = result.data?.document as TimetableDocument | undefined;
        const plan = existing
          ? mergeTimetableDocument(c, existing)
          : newTimetableDocument(c);
        setSpace(legacyTimetableSpace(c, plan));
        setVersion(result.data?.version ?? 0);
        setDirty(false);
        setMatrixDirty(false);
        revision.current = 0;
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setMessage({
            text: "시간표를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.",
            error: true,
          });
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
    // The active workspace/year identifies the saved document. Refreshing context
    // does not discard a locally edited timetable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.workspace.id, c.year?.id]);

  async function save() {
    if (!c.year || !document || !canWrite || saving || !dirty) return;
    if (matrixDirty) {
      setMessage({
        text: "교사별 시수표의 미적용 변경 내용을 먼저 '적용'해 주세요.",
        error: true,
      });
      return;
    }
    const parsed = timetableDocumentSchema.safeParse({
      ...document,
      year,
      dayRules: officialTimetableDayRules(c),
    });
    if (!parsed.success) {
      setMessage({
        text:
          "시간표 입력 확인: " +
          (parsed.error.issues[0]?.message ?? "형식을 확인해 주세요."),
        error: true,
      });
      return;
    }
    const savedRevision = revision.current;
    startTransition(async () => {
      try {
        const result = await saveTimetableDocument({
          workspaceId: c.workspace.id,
          yearId: c.year!.id,
          expectedVersion: version,
          document: parsed.data,
        });
        if (!result.ok) {
          setMessage({ text: result.error, error: true });
          return;
        }
        if (!result.data.ok) {
          setMessage({
            text: "다른 교사가 먼저 시간표를 저장했습니다. 현재 수정 내용은 유지했으니 JSON으로 백업한 뒤, 최신 자료를 다시 불러와 비교해 주세요.",
            error: true,
          });
          return;
        }
        const refreshed = await loadTimetableDocument({
          workspaceId: c.workspace.id,
          yearId: c.year!.id,
        });
        if (
          refreshed.ok &&
          refreshed.data &&
          revision.current === savedRevision
        )
          setSpace(
            legacyTimetableSpace(
              c,
              mergeTimetableDocument(
                c,
                refreshed.data.document as TimetableDocument,
              ),
            ),
          );
        setVersion(result.data.version);
        if (revision.current === savedRevision) setDirty(false);
        setMessage({
          text:
            "시간표를 학교 작업공간에 저장했습니다. (버전 " +
            result.data.version +
            ")",
        });
        router.refresh();
      } catch {
        setMessage({
          text: "시간표를 저장하지 못했습니다. 현재 입력은 유지됩니다. 다시 시도해 주세요.",
          error: true,
        });
      }
    });
  }
  async function reload() {
    if (!c.year || loading || saving) return;
    if (
      (dirty || matrixDirty) &&
      !window.confirm(
        "저장하지 않은 시간표를 버리고 학교의 최신 저장본을 불러올까요?",
      )
    )
      return;
    setLoading(true);
    try {
      const response = await loadTimetableDocument({
        workspaceId: c.workspace.id,
        yearId: c.year.id,
      });
      if (response.ok) {
        setSpace(
          legacyTimetableSpace(
            c,
            response.data?.document
              ? mergeTimetableDocument(
                  c,
                  response.data.document as TimetableDocument,
                )
              : newTimetableDocument(c),
          ),
        );
        setVersion(response.data?.version ?? 0);
        setDirty(false);
        setMatrixDirty(false);
        revision.current = 0;
        setMessage({ text: "학교에 저장된 최신 시간표를 다시 불러왔습니다." });
      } else setMessage({ text: response.error, error: true });
    } catch {
      setMessage({
        text: "다시 불러오지 못했습니다. 기존 편집 내용을 유지했습니다.",
        error: true,
      });
    } finally {
      setLoading(false);
    }
  }
  function downloadBackup() {
    const content = JSON.stringify(
      {
        format: "eduplan-timetable-v1",
        year,
        plan: document,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json;charset=utf-8" }),
    );
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = "EduPlan_" + year + "_시간표백업.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file: File | undefined) {
    if (!file || !canWrite) return;
    if (file.size > 2400000) {
      setMessage({
        text: "2.4MB 이하의 시간표 JSON 파일만 가져올 수 있습니다.",
        error: true,
      });
      return;
    }
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const candidate =
        raw.plan ??
        (raw.academics as Record<string, unknown> | undefined)?.[
          String(year)
        ] ??
        raw.document ??
        raw;
      const result = timetableDocumentSchema.safeParse(candidate);
      if (!result.success || result.data.year !== year)
        throw Error("현재 학년도와 맞는 EduPlan 시간표 백업이 아닙니다.");
      const doc = result.data;
      // Old local-only IDs (g1c1) must never be silently assigned to the wrong
      // official class. Match only if grade+class number can be verified.
      const classIdMap = new Map<string, string>();
      for (const item of doc.classes) {
        const matched =
          c.classes.find((schoolClass) => schoolClass.id === item.id) ??
          c.classes.find((schoolClass) => {
            const name = item.label.match(/(\d+)\s*학년\s*(\d+)\s*반/);
            const old = item.id.match(/^g(\d+)c(\d+)$/);
            const g = Number(name?.[1] ?? old?.[1]),
              no = Number(name?.[2] ?? old?.[2]);
            return schoolClass.grade === g && schoolClass.class_number === no;
          });
        if (matched) classIdMap.set(item.id, matched.id);
      }
      const usedClassIds = new Set([
        ...doc.weekly
          .filter((row) => row.scope === "class")
          .map((row) => row.scopeId),
        ...doc.overrides
          .filter((row) => row.scope === "class")
          .map((row) => row.scopeId),
        ...doc.groups.flatMap((group) => group.classIds),
        ...(doc.timetableConfig?.lessons ?? [])
          .filter((row) => row.scope === "class")
          .map((row) => row.scopeId),
      ]);
      const unresolved = [...usedClassIds].filter((id) => !classIdMap.has(id));
      if (unresolved.length)
        throw Error(
          "공식 학교 학급과 연결되지 않은 과거 학급 " +
            unresolved.length +
            "개가 있습니다. 원본 자료는 유지했습니다.",
        );
      const remap = (scope: string, id: string) =>
        scope === "class" ? (classIdMap.get(id) ?? id) : id;
      const normalized: TimetableDocument = {
        ...doc,
        classes: doc.classes.map((item) => ({
          ...item,
          id: classIdMap.get(item.id) ?? item.id,
        })),
        weekly: doc.weekly.map((row) => ({
          ...row,
          scopeId: remap(row.scope, row.scopeId),
        })),
        overrides: doc.overrides.map((row) => ({
          ...row,
          scopeId: remap(row.scope, row.scopeId),
        })),
        groups: doc.groups.map((group) => ({
          ...group,
          classIds: group.classIds.map((id) => classIdMap.get(id) ?? id),
        })),
        ...(doc.timetableConfig
          ? {
              timetableConfig: {
                ...doc.timetableConfig,
                lessons: doc.timetableConfig.lessons.map((row) => ({
                  ...row,
                  scopeId: remap(row.scope, row.scopeId),
                })),
              },
            }
          : {}),
      };
      if (
        !window.confirm(
          "가져온 시간표로 현재 편집 내용을 바꿀까요? 실제 학교 DB에는 '학교에 저장'을 눌러야 반영됩니다.",
        )
      )
        return;
      setSpace(legacyTimetableSpace(c, mergeTimetableDocument(c, normalized)));
      revision.current += 1;
      setDirty(true);
      setMessage({
        text: "시간표 백업을 불러왔습니다. 내용을 확인한 다음 학교에 저장해 주세요.",
      });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "JSON 백업 파일을 읽지 못했습니다.",
        error: true,
      });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  if (!c.year)
    return (
      <section className="panel">
        <h2>시간표</h2>
        <p>작업공간 설정에서 학년도를 먼저 생성해 주세요.</p>
      </section>
    );
  return (
    <div className="timetable-module">
      <header className="page-heading">
        <div>
          <span className="eyebrow">TIMETABLE PLANNING</span>
          <h1>시간표 편성</h1>
          <p>
            {year}학년도 · 수업 배정, 자동편성, 일과표, 수업 교환과 보강을
            하나의 시간표로 관리합니다.
          </p>
        </div>
        <div className="heading-actions tt-primary-actions">
          <Button
            variant="outline"
            onClick={downloadBackup}
            disabled={loading || !document}
          >
            <Download size={15} /> JSON 백업
          </Button>
          {canWrite && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                aria-label="기존 시간표 JSON 백업 가져오기"
                onChange={(event) => void importBackup(event.target.files?.[0])}
              />
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={saving || loading}
              >
                <Upload size={15} /> 이전 시간표 가져오기
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => void reload()}
            disabled={loading || saving}
          >
            <RefreshCcw size={15} /> 다시 불러오기
          </Button>
          {canWrite && (
            <label>
              확정 시간표 적용 시작일{" "}
              <input
                type="date"
                min={`${year}-03-01`}
                max={new Date(Date.UTC(year + 1, 2, 0))
                  .toISOString()
                  .slice(0, 10)}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </label>
          )}
          {canWrite && (
            <Button
              variant="outline"
              disabled={
                loading || saving || dirty || matrixDirty || version === 0
              }
              onClick={() => {
                if (
                  !window.confirm(
                    "저장된 시간표를 검토한 뒤 교원에게 배포할까요? 현재 저장본을 확정본으로 보존하고 내부 알림함에 안내합니다.",
                  )
                )
                  return;
                startTransition(async () => {
                  try {
                    const result = await publishTimetable({
                      workspaceId: c.workspace.id,
                      yearId: c.year!.id,
                      version,
                      effectiveDate,
                    });
                    setMessage({
                      text: result.ok
                        ? "시간표를 확정·배포했습니다. 개인 시간표와 알림함에 반영됩니다."
                        : result.error,
                      error: !result.ok,
                    });
                    if (result.ok) router.refresh();
                  } catch {
                    setMessage({
                      text: "배포하지 못했습니다. 저장한 시간표는 유지됩니다.",
                      error: true,
                    });
                  }
                });
              }}
            >
              검토 후 확정·배포
            </Button>
          )}
          {canWrite && (
            <Button
              onClick={() => void save()}
              disabled={loading || saving || !dirty || matrixDirty}
            >
              <Save size={15} />
              {saving ? "저장 중…" : "학교에 저장"}
            </Button>
          )}
        </div>
      </header>
      <div className="tt-status-row">
        <span className="tt-version">
          {loading
            ? "학교 시간표 불러오는 중…"
            : "공동 저장 버전 " +
              version +
              (dirty ? " · 저장하지 않은 변경" : " · 저장됨")}
        </span>
        {!canWrite && <span className="tt-readonly">조회 전용</span>}
        {matrixDirty && (
          <span className="tt-unsaved">교사별 시수표 미적용 수정 있음</span>
        )}
      </div>
      {!!message.text && (
        <p
          className={message.error ? "tt-server-error" : "tt-server-notice"}
          role="status"
        >
          {message.text}
        </p>
      )}
      {!loading && document && (
        <PlanningResources
          key={year}
          context={c}
          document={document}
          onLinks={(links) => {
            updateSpace((previous) => ({
              ...previous,
              academics: {
                ...previous.academics,
                [String(year)]: {
                  ...previous.academics[String(year)],
                  referenceLinks: links,
                },
              },
            }));
          }}
        />
      )}
      {!loading && document && (
        <div className="mobile-only">
          <TimetableTouch
            context={c}
            document={document}
            editable={canWrite && !saving}
            onChange={(doc) =>
              updateSpace((previous) => ({
                ...previous,
                academics: { ...previous.academics, [String(year)]: doc },
              }))
            }
          />
        </div>
      )}
      {!loading && (
        <Button
          className="mobile-only no-print"
          variant="outline"
          onClick={() => setWideMobile(!wideMobile)}
        >
          {wideMobile ? "전체 시간표 접기" : "자동편성·전체 시간표 열기"}
        </Button>
      )}
      {loading ? (
        <section className="panel">시간표 자료를 불러오고 있습니다.</section>
      ) : (
        <div
          className={`${saving ? "tt-save-locked" : ""} ${wideMobile ? "" : "desktop-only"}`}
        >
          <AcademicPlanner
            key={year}
            mode="timetable"
            unified
            commonView={commonView}
            schoolName={c.workspace.name}
            space={liveSpace}
            updateSpace={updateSpace}
            notify={(text: string) => setMessage({ text })}
            onOpenCalendar={() =>
              router.push("/app/" + c.workspace.id + "/calendar?year=" + year)
            }
            onOpenCurriculum={() =>
              router.push("/app/" + c.workspace.id + "/curriculum?year=" + year)
            }
            onDirtyChange={setMatrixDirty}
          />
        </div>
      )}
    </div>
  );
}
