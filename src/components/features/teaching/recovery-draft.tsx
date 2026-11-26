"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common";
import {
  readDraft,
  writeDraft,
  removeDraft,
  type LocalDraft,
} from "@/lib/draft-storage";
import { teachingDocumentSchema, type TeachingDocument } from "@/lib/teaching";
export function RecoveryDraft({
  userId,
  workspaceId,
  courseId,
  version,
  document,
  dirty,
  editable,
  onRestore,
}: {
  userId: string;
  workspaceId: string;
  courseId: string;
  version: number;
  document: TeachingDocument;
  dirty: boolean;
  editable: boolean;
  onRestore: (doc: TeachingDocument) => void;
}) {
  const key = `${userId}:${workspaceId}:${courseId}`,
    [recovery, setRecovery] = useState<LocalDraft<TeachingDocument> | null>(
      null,
    ),
    [message, setMessage] = useState(""),
    [compare, setCompare] = useState(false),
    loaded = useRef(false),
    chain = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    loaded.current = false;
    void readDraft<TeachingDocument>(key, userId)
      .then((d) => {
        if (!active) return;
        if (d && teachingDocumentSchema.safeParse(d.document).success)
          setRecovery(d);
        loaded.current = true;
      })
      .catch(() => {
        if (active) {
          loaded.current = true;
          setMessage(
            "기기 임시 보존을 사용할 수 없습니다. 연결 중에 서버 저장을 이용하세요.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [key, userId]);
  useEffect(() => {
    if (!dirty || !editable) return;
    let active = true;
    const timer = setTimeout(() => {
      chain.current = chain.current
        .then(() =>
          writeDraft({
            key,
            userId,
            workspaceId,
            baseVersion: version,
            document,
          }),
        )
        .then(() => {
          if (active)
            setMessage("기기에 임시 보존됨 · 서버 저장과 별도 · 최대 4시간");
        })
        .catch(() => {
          if (active)
            setMessage(
              "임시 보존 실패 · 화면을 닫기 전에 서버에 저장해 주세요.",
            );
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, userId, workspaceId, version, document, dirty, editable]);
  const wasDirty = useRef(dirty);
  useEffect(() => {
    if (wasDirty.current && !dirty && loaded.current) {
      chain.current = chain.current
        .then(() => removeDraft(key))
        .catch(() => {});
    }
    wasDirty.current = dirty;
  }, [dirty, key]);
  if (!recovery && !dirty) return null;
  const conflict = recovery && recovery.baseVersion !== version;
  return (
    <aside className="mobile-draft-notice no-print" role="status">
      {dirty && <p>{message || "기기 임시 보존 준비 중…"}</p>}
      {recovery && (
        <>
          <p>
            {new Date(recovery.savedAt).toLocaleString("ko-KR")}의 미저장 초안이
            있습니다.{" "}
            {conflict
              ? "서버 버전이 달라 자동 복원하지 않습니다. 비교 화면에서 필요한 내용을 복사하세요."
              : "복원은 이 편집 화면에만 적용됩니다."}
          </p>
          <div className="mobile-view-toolbar">
            <Button variant="outline" onClick={() => setCompare(true)}>
              현재 계획과 비교
            </Button>
            <Button
              disabled={!editable || !!conflict || dirty}
              onClick={() => {
                onRestore(teachingDocumentSchema.parse(recovery.document));
                setRecovery(null);
              }}
            >
              초안 복원
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void removeDraft(key)
                  .then(() => setRecovery(null))
                  .catch(() => setMessage("임시 초안을 정리하지 못했습니다."))
              }
            >
              임시 초안 버리기
            </Button>
          </div>
        </>
      )}
      <Modal
        open={compare}
        onOpenChange={setCompare}
        title="미저장 초안 비교"
        wide
      >
        <p>
          초안의 내용을 복사해 현재 주차·평가 항목에 입력하세요. 공식 확정
          상태는 복원하지 않습니다.
        </p>
        <div className="mobile-recovery-diff">
          <section>
            <h3>현재 편집본 · v{version}</h3>
            <pre>{JSON.stringify(document, null, 2)}</pre>
          </section>
          <section>
            <h3>기기 초안 · 기준 v{recovery?.baseVersion}</h3>
            <pre>{JSON.stringify(recovery?.document, null, 2)}</pre>
          </section>
        </div>
      </Modal>
    </aside>
  );
}
