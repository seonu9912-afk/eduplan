"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineNotice, useMutation } from "@/components/common";
import { Disclosure } from "@/components/ui/disclosure";
import { dateLabel } from "@/lib/domain";
import { taskAudience, type SchoolTask, type TaskSource, type TaskTarget, type TaskTeacher } from "@/lib/school-tasks";
import { saveSchoolTask } from "@/app/school-task-actions";
import { ResourceLinkEditor } from "./resource-links";

const emptyTarget: TaskTarget = { all: false, homerooms: false, departments: [], grades: [], teachers: [] };

export function TaskAudiencePicker({ directory, value, onChange }: {
  directory: TaskTeacher[]; value: TaskTarget; onChange: (value: TaskTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const departments = [...new Set(directory.map((entry) => entry.department).filter(Boolean))].sort();
  const grades = [...new Set(directory.flatMap(({ grade }) => grade === null ? [] : [grade]))].sort();
  const names = directory.filter(({ display_name, department }) =>
    `${display_name} ${department}`.includes(query.trim()));
  const audience = taskAudience(directory, value);
  const toggle = <T,>(values: T[], item: T) => values.includes(item)
    ? values.filter((entry) => entry !== item) : [...values, item];
  return <fieldset className="task-audience">
    <legend>배포 대상</legend>
    {!directory.length && <p role="status">추가할 수 있는 재직 교원이 없습니다.</p>}
    <div className="task-target-options">
      <label><input type="checkbox" checked={value.all} onChange={(event) => onChange({ ...value, all: event.target.checked })} />전체 교원</label>
      {grades.length > 0 && <label><input type="checkbox" checked={value.homerooms}
        onChange={(event) => onChange({ ...value, homerooms: event.target.checked })} />전체 담임교사</label>}
    </div>
    {(departments.length > 0 || grades.length > 0) && <Disclosure compact label="부서·학년 담임 선택">
      <div className="task-target-options">
        {departments.map((department) => <label key={department}>
          <input type="checkbox" checked={value.departments.includes(department)}
            onChange={() => onChange({ ...value, departments: toggle(value.departments, department) })} />{department}
        </label>)}
        {grades.map((grade) => <label key={grade}>
          <input type="checkbox" checked={value.grades.includes(grade)}
            onChange={() => onChange({ ...value, grades: toggle(value.grades, grade) })} />{grade}학년 담임
        </label>)}
      </div>
    </Disclosure>}
    {directory.length > 0 && <Disclosure compact label="개별 교원 선택">
      <label>교원 검색<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="task-teacher-options task-target-options">
        {names.map((teacher) => <label key={teacher.teacher_id}>
          <input type="checkbox" checked={value.teachers.includes(teacher.teacher_id)}
            onChange={() => onChange({ ...value, teachers: toggle(value.teachers, teacher.teacher_id) })} />
          {teacher.display_name}{teacher.department && ` · ${teacher.department}`}
        </label>)}
      </div>
    </Disclosure>}
    <div className="task-audience-preview" aria-live="polite">
      <strong>수신자 미리보기 · {audience.length}명</strong>
      {!!audience.length && <ul>{audience.map(({ teacher_id, display_name, department }) =>
        <li key={teacher_id}>{display_name}{department && ` · ${department}`}</li>)}</ul>}
    </div>
  </fieldset>;
}

export function SchoolTaskForm({ workspace, year, kind, directory, authorDepartment, item, initialSource, sources, onSaved, onBack }: {
  workspace: string; year: string; kind: SchoolTask["kind"]; directory: TaskTeacher[];
  authorDepartment: string; item?: SchoolTask; initialSource?: string;
  sources: Map<string, TaskSource>; onSaved: () => void; onBack: () => void;
}) {
  const m = useMutation();
  const listId = useId();
  const distributed = kind === "distributed";
  const edit = !!item;
  const [id, setId] = useState(item?.id);
  const [sourceId, setSourceId] = useState(item?.source_business_id ?? initialSource ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [followDate, setFollowDate] = useState(item?.deadline_from_source ?? false);
  const [resources, setResources] = useState(item?.resources ?? []);
  const [target, setTarget] = useState(emptyTarget);
  const source = sources.get(sourceId);
  const audience = taskAudience(directory, target);
  const departments = [...new Set(directory.map((teacher) => teacher.department).filter(Boolean))].sort();
  return <form className="form-stack task-edit-form" onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (name: string) => String(fields.get(name) ?? "");
    const taskId = id ?? crypto.randomUUID();
    if (!id) setId(taskId);
    m.execute(() => saveSchoolTask({
      workspace, year, id: taskId, version: item?.version ?? 0, kind, title,
      description: value("description"), department: distributed ? value("department") : "",
      due_date: followDate ? null : value("due_date") || null,
      due_time: value("due_time") || null, resources,
      submission_url: distributed ? value("submission_url") || null : null,
      source_business_id: sourceId || null, deadline_from_source: followDate,
      ...(distributed && !edit ? { audience: audience.map(({ teacher_id, user_id }) => ({ teacher_id, user_id })) } : {}),
    }), onSaved, distributed && !edit ? "업무를 배포했습니다." : "할 일을 저장했습니다.");
  }}>
    {distributed && !edit && sources.size > 0 && <label>관련 공개 업무계획
      <select value={sourceId} onChange={(event) => {
        setSourceId(event.target.value);
        if (!event.target.value) setFollowDate(false);
      }}>
        <option value="">독립 업무</option>
        {[...sources.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) =>
          <option key={row.id} value={row.id}>{dateLabel(row.date)} · {row.text}</option>)}
      </select>
    </label>}
    <label>제목<input name="title" value={sourceId ? (source?.text ?? title) : title} readOnly={!!sourceId}
      onChange={(event) => setTitle(event.target.value)} required={!sourceId} maxLength={200} /></label>
    {sourceId && <p className="task-hint">{source ? "제목은 적용 중인 공개 업무계획을 사용합니다." : "공개 업무계획에서 이 항목을 찾을 수 없습니다. 배포 업무와 완료 기록은 보존됩니다."}</p>}
    {distributed && <label>담당 부서
      <input name="department" maxLength={60} list={listId} defaultValue={item?.department ?? authorDepartment} />
      <datalist id={listId}>{departments.map((name) => <option key={name} value={name} />)}</datalist>
    </label>}
    {sourceId && <label className="task-option"><input type="checkbox" checked={followDate}
      onChange={(event) => setFollowDate(event.target.checked)} />공개 업무계획 날짜를 마감일로 사용</label>}
    <div className="form-two">
      <label>마감일<input name="due_date" type="date" disabled={followDate}
        key={followDate ? "linked" : "fixed"} defaultValue={followDate ? source?.date : item?.due_date ?? undefined} /></label>
      <label>마감 시각<input name="due_time" type="time" defaultValue={item?.due_time?.slice(0, 5)} /></label>
    </div>
    <label>{distributed ? "상세 안내" : "상세 내용"}<textarea name="description" maxLength={4000} rows={3} defaultValue={item?.description} /></label>
    <ResourceLinkEditor value={resources} onChange={setResources} disabled={m.pending} />
    {distributed && <label>제출 링크<input name="submission_url" type="url" maxLength={2048}
      placeholder="https://" defaultValue={item?.submission_url ?? undefined} /></label>}
    {distributed && !edit && <TaskAudiencePicker directory={directory} value={target} onChange={setTarget} />}
    <InlineNotice mutation={m} />
    <div className="task-actions">
      <Button type="button" variant="outline" onClick={onBack} disabled={m.pending}>돌아가기</Button>
      <Button type="submit" disabled={m.pending || (distributed && !edit && !audience.length)}>
        {m.pending ? "저장 중…" : distributed && !edit ? "업무 배포" : "저장"}
      </Button>
    </div>
  </form>;
}

export function useTaskAudience(directory: TaskTeacher[]) {
  const [target, setTarget] = useState(emptyTarget);
  return {
    target,
    setTarget,
    audience: taskAudience(directory, target).map(({ teacher_id, user_id }) => ({ teacher_id, user_id })),
  };
}
