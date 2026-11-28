"use client";
import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, InlineNotice, Modal, useMutation } from "@/components/common";
import { registerStandard } from "@/app/teaching-actions";
import type { Context, Row } from "@/lib/models";
export function StandardPicker({
  context: c,
  value,
  onChange,
  subject,
  grade,
  label,
  disabled = false,
  showDescriptions = false,
}: {
  context: Context;
  value: string[];
  onChange: (ids: string[]) => void;
  subject: string;
  grade: number;
  label: string;
  disabled?: boolean;
  showDescriptions?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [version, setVersion] = useState(""),
    [register, setRegister] = useState(false),
    [extra, setExtra] = useState<Row<"achievement_standards">[]>([]);
  const m = useMutation();
  const standards = [
    ...c.teaching!.standards,
    ...extra.filter((s) => !c.teaching!.standards.some((t) => t.id === s.id)),
  ];
  const found = standards.filter(
    (s) =>
      (!version || s.curriculum_version === version) &&
      (!query ||
        `${s.code} ${s.content} ${s.subject} ${s.grade_band}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  return (
    <div className="standard-control">
      <div className={showDescriptions ? "standard-chips standard-chips-detailed" : "standard-chips"}>
        {value.map((id) => (
          <span key={id} title={standards.find((s) => s.id === id)?.content}>
            {standards.find((s) => s.id === id)?.code ?? "연결 확인 필요"}
            {showDescriptions && <small>{standards.find((s) => s.id === id)?.content}</small>}
          </span>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={label}
      >
        <Search size={13} /> 성취기준{" "}
        {value.length ? `${value.length}개` : "선택"}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="성취기준 선택"
        description="사용자가 직접 등록한 자료입니다. 공식 성취기준과 일치하는지 원문을 확인하세요."
        wide
      >
        <div className="standard-filters">
          <input
            aria-label="성취기준 검색"
            placeholder="코드·내용·과목·학년군 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="교육과정 버전 필터"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value="">모든 버전</option>
            {["2022 개정", "2015 개정", "기타"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="standards-list">
          {found.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={value.includes(s.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, s.id]
                      : value.filter((id) => id !== s.id),
                  )
                }
              />
              <div>
                <strong>{s.code}</strong>
                <small>
                  {s.curriculum_version} · {s.school_type} · {s.subject} ·{" "}
                  {s.grade_band}
                </small>
                <p>{s.content}</p>
              </div>
            </label>
          ))}
          {!found.length && (
            <p className="muted">
              검색 결과가 없습니다. 확인한 성취기준을 직접 등록하세요.
            </p>
          )}
        </div>
        <div className="teaching-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setRegister(!register)}
          >
            <Plus size={15} /> 성취기준 직접 등록
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            선택 완료 ({value.length}개)
          </Button>
        </div>
        {register && (
          <form
            className="standard-registration"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              m.execute(
                () =>
                  registerStandard({
                    workspace_id: c.workspace.id,
                    curriculum_version: f.get("curriculum_version"),
                    school_type: f.get("school_type"),
                    subject: f.get("subject"),
                    grade_band: f.get("grade_band"),
                    code: f.get("code"),
                    content: f.get("content"),
                  }),
                (s) => {
                  setExtra((prev) => [...prev, s]);
                  onChange([...value, s.id]);
                  setRegister(false);
                  setQuery("");
                  setVersion("");
                },
                "성취기준을 등록하고 연결했습니다.",
              );
            }}
          >
            <div className="form-two">
              <Field label="교육과정 버전" id="standard-version">
                <select id="standard-version" name="curriculum_version">
                  {["2022 개정", "2015 개정", "기타"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="성취기준 학교급" id="standard-school">
                <select
                  id="standard-school"
                  name="school_type"
                  defaultValue={c.schoolType}
                >
                  {["초등학교", "중학교", "고등학교"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="성취기준 과목" id="standard-subject">
                <input
                  id="standard-subject"
                  name="subject"
                  defaultValue={subject}
                  required
                  maxLength={120}
                />
              </Field>
              <Field label="성취기준 학년·학년군" id="standard-grade">
                <input
                  id="standard-grade"
                  name="grade_band"
                  defaultValue={`${grade}학년`}
                  required
                  maxLength={60}
                />
              </Field>
            </div>
            <Field label="성취기준 코드" id="standard-code">
              <input id="standard-code" name="code" required maxLength={80} />
            </Field>
            <Field label="성취기준 내용" id="standard-content">
              <textarea
                id="standard-content"
                name="content"
                required
                maxLength={5000}
                rows={4}
              />
            </Field>
            <Button disabled={m.pending}>등록 후 연결</Button>
          </form>
        )}
        <InlineNotice mutation={m} />
      </Modal>
    </div>
  );
}
