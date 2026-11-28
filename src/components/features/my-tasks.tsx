"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Ellipsis, ListTodo, Plus, X } from "lucide-react";
import { changeSchoolTask } from "@/app/school-task-actions";
import { InlineNotice, Modal, useMutation } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import type { Context } from "@/lib/models";
import { seoulClock } from "@/lib/school-operations";
import { resolveSchoolTask, taskDeadlineLabel, taskOverdue, taskPlanSources,
  type SchoolTask, type TaskRecipient, type TaskTeacher } from "@/lib/school-tasks";
import { ResourceLinks } from "./resource-links";
import { SchoolTaskForm, TaskAudiencePicker, useTaskAudience } from "./school-task-form";
import "./my-tasks.css";

type Screen = { kind: "detail"; id: string } | { kind: "manage"; id?: string } |
  { kind: "form"; taskKind: SchoolTask["kind"]; id?: string; source?: string };
type TaskView = ReturnType<typeof resolveSchoolTask>;
type Confirmation = { command: "delete" | "cancel" } | { command: "remove" | "redo"; teacher_id: string };

const completedDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function MyTasks({ context: c, today, compact = false, dashboard = false }: { context: Context; today: string; compact?: boolean; dashboard?: boolean }) {
  const data = c.myTasks;
  const roster = data?.directory ?? [];
  const sender = roster.find((teacher) => teacher.user_id === c.userId);
  const m = useMutation();
  const [clock, setClock] = useState({ date: today, time: "" });
  const [moving, setMoving] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  const [expanded,setExpanded]=useState(false);
  const summarized=compact||dashboard;
  const [screen, setScreen] = useState<Screen | null>(() => {
    if (c.taskFocus?.id && data?.tasks.some((task) => task.id === c.taskFocus?.id))
      return { kind: "detail", id: c.taskFocus.id };
    if (c.taskFocus?.source && sender) return { kind: "form", taskKind: "distributed", source: c.taskFocus.source };
    return null;
  });
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  useEffect(() => {
    const tick = () => { const now = seoulClock(new Date()); setClock({ date: now.date, time: now.time.slice(0, 5) }); };
    const first = setTimeout(tick, 0), timer = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener("focus", tick); };
  }, []);
  if (!c.year || data === undefined) return null;
  const { id: yearId, year } = c.year;
  const workspace = c.workspace.id;
  const sources = taskPlanSources(c.schoolPublications ?? [], year, today);
  const tasks = data?.tasks ?? [];
  const receipts = data?.recipients ?? [];
  const ownReceipts = new Map(receipts.filter((row) => row.user_id === c.userId && !row.removed_at)
    .map((row) => [row.task_id, row]));
  const authored = tasks.filter((task) => task.kind === "distributed" && task.owner_id === c.userId);
  const mine = tasks.filter((task) => task.kind === "personal" || ownReceipts.has(task.id))
    .map((task) => ({
      task,
      detail: resolveSchoolTask(task, sources),
      complete: task.kind === "personal" ? task.completed_at : ownReceipts.get(task.id)?.completed_at,
    })).sort((a, b) =>
      (a.detail.dueDate ?? "9999-12-31").localeCompare(b.detail.dueDate ?? "9999-12-31") ||
      (a.detail.dueTime ?? "24:00").localeCompare(b.detail.dueTime ?? "24:00") ||
      b.task.created_at.localeCompare(a.task.created_at) || a.task.id.localeCompare(b.task.id));
  const pending = mine.filter(({ complete, task }) => !complete && !task.cancelled_at);
  // Keep the just-checked row in its original sorted position during the transition.
  const activeRows = mine.filter(({ complete, task }) => (!complete || task.id === moving) && !task.cancelled_at);
  const finished = mine.filter(({ complete, task }) => complete && !task.cancelled_at && task.id !== moving)
    .sort((a, b) => Date.parse(b.complete!) - Date.parse(a.complete!) || a.task.id.localeCompare(b.task.id));
  const finishedToday = finished.filter(({ complete }) => seoulClock(new Date(complete!)).date === clock.date);
  const finishedEarlier = finished.filter(({ complete }) => seoulClock(new Date(complete!)).date !== clock.date);
  const undoTask = undo && mine.find(({ task, complete }) => task.id === undo.id && !!complete && !task.cancelled_at);
  const cancelled = mine.filter(({ task }) => task.cancelled_at);
  const selected = tasks.find((task) => task.id === screen?.id);
  const editable = selected?.owner_id === c.userId;
  const detail = selected && resolveSchoolTask(selected, sources);
  function open(next: Screen | null) {
    setConfirm(null);
    m.setNotice({ message: "", error: false });
    setScreen(next);
  }
  function completeTask(task: SchoolTask, completed: boolean) {
    if (m.pending || m.isInFlight()) return;
    setUndo(null);
    const animate = completed && !screen && navigator.onLine;
    const started = performance.now();
    if (animate) setMoving(task.id);
    m.execute(async () => {
      try {
        const result = await changeSchoolTask({ workspace, id: task.id, version: task.version, command: "complete", completed });
        if (animate && result.ok) {
          const remaining = 800 - (performance.now() - started);
          if (remaining > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
        }
        return result;
      } finally {
        if (animate) setMoving(null);
      }
    }, () => {
      if (completed && !screen) setUndo({ id: task.id });
    }, completed && !screen ? "" : completed ? "할 일을 완료했습니다." : "미완료 할 일로 되돌렸습니다.");
  }
  function confirmChange(task: SchoolTask, change: Confirmation) {
    m.execute(() => changeSchoolTask({ workspace, id: task.id, version: task.version, ...change }), () => {
      setConfirm(null);
      if (change.command === "delete") setScreen(null);
    }, "변경했습니다.");
  }
  function rows(list: typeof mine, history: "today" | "earlier" | undefined = undefined) {
    return <ul className="task-list" data-task-history={history}>{list.map(({ task, detail, complete }) => {
      const { dueDate, dueTime, title } = detail;
      const deadline = taskDeadlineLabel(dueDate, dueTime, clock.date);
      const transitioning = moving === task.id;
      const checked = !!complete || transitioning;
      const late = !checked && !task.cancelled_at && taskOverdue(dueDate, dueTime, clock.date, clock.time);
      return <li className="task-row" key={task.id} data-complete={checked ? "" : undefined} data-completing={transitioning ? "" : undefined}>
        <label className="task-check">
          <input type="checkbox" aria-label={`${title} 완료`} checked={checked} disabled={m.pending || transitioning || !!task.cancelled_at}
            onChange={(event) => completeTask(task, event.target.checked)} />
        </label>
        <button type="button" className="task-row-detail" onClick={() => open({ kind: "detail", id: task.id })}>
          <strong>{title}</strong>
          {history === "earlier" && complete ? <span><time dateTime={complete}>{completedDate.format(new Date(complete))}</time></span> :
          !history && <span>
            {task.kind === "personal" ? (summarized ? "" : "개인 할 일") : task.department || "배포받은 업무"}
            {deadline && `${task.kind==="personal" && summarized ? "" : " · "}${deadline}`}
            {task.cancelled_at && " · 취소"}
            {late && <b className="task-overdue">기한 경과</b>}
          </span>}
        </button>
      </li>;
    })}</ul>;
  }
  const modalTitle = screen?.kind === "form"
    ? screen.id ? "할 일 수정" : screen.taskKind === "personal" ? "개인 할 일 추가" : "업무 배포"
    : screen?.kind === "manage" ? "배포한 업무 관리" : "할 일 상세";
  return <>
    <details id="my-tasks" className={`my-tasks no-print${compact ? " my-tasks-compact" : ""}`} open>
      <summary><ListTodo size={16} aria-hidden="true" /><h3>나의 할 일</h3>{(pending.length > 0 || (compact || dashboard) && data) && <span>{compact || dashboard ? `미완료 ${pending.length}건` : pending.length}</span>}</summary>
      {data ? <>
        <div className="task-actions task-widget-actions" data-dashboard={dashboard ? "" : undefined}>
          <Button type="button" variant="outline" size="sm" onClick={() => open({ kind: "form", taskKind: "personal" })}><Plus size={16} />할 일 추가</Button>
          <div className="task-direct-actions">          {sender && <Button type="button" variant="outline" size="sm" onClick={() => open({ kind: "form", taskKind: "distributed" })}>업무 배포</Button>}
          {(sender || authored.length > 0) && <Button type="button" variant="ghost" size="sm" onClick={() => open({ kind: "manage" })}>배포한 업무</Button>}</div>
          {dashboard&&(sender||authored.length>0)&&<details className="task-dashboard-more"><summary aria-label="할 일 더보기"><Ellipsis size={18}/></summary><div className="task-dashboard-menu">          {sender && <Button type="button" variant="outline" size="sm" onClick={() => open({ kind: "form", taskKind: "distributed" })}>업무 배포</Button>}
          {(sender || authored.length > 0) && <Button type="button" variant="ghost" size="sm" onClick={() => open({ kind: "manage" })}>배포한 업무</Button>}</div></details>}
        </div>
        <div className={dashboard?"task-dashboard-body":undefined}>
        {activeRows.length ? <>{rows(summarized&&!expanded?activeRows.slice(0,5):activeRows)}{summarized&&activeRows.length>5&&<button type="button" className="task-expand-toggle" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?"접기":`나머지 할 일 ${activeRows.length-5}건 더보기`}</button>}</> : <p className="task-hint">{finishedToday.length ? "모든 할 일을 완료했습니다." : "미완료 할 일이 없습니다."}</p>}
        {finishedToday.length > 0 && <details className="task-history task-history-today" open>
          <summary>오늘 완료 <span>{finishedToday.length}건</span></summary>
          {rows(finishedToday, "today")}
        </details>}
        {finishedEarlier.length > 0 && <details className="task-history">
          <summary>이전에 완료한 할 일 <span>{finishedEarlier.length}건</span></summary>
          {rows(finishedEarlier, "earlier")}
        </details>}
        {cancelled.length > 0 && <Disclosure compact label={`취소된 업무 (${cancelled.length})`}>{rows(cancelled)}</Disclosure>}
        </div>
      </> : <p className="task-hint" role="status">할 일을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>}
      {!screen && undo && <div className="task-undo" role="status">
        <span>할 일을 완료했습니다.</span>
        <button type="button" disabled={m.pending || !undoTask} onClick={() => { if (undoTask) completeTask(undoTask.task, false); }}>실행 취소</button>
        <button type="button" aria-label="완료 알림 닫기" onClick={() => setUndo(null)}><X size={16} /></button>
      </div>}
      {!screen && <InlineNotice mutation={m} />}
    </details>

    <Modal open={!!screen} onOpenChange={(show) => { if (!show) open(null); }} title={modalTitle} wide={screen?.kind === "manage"}>
      {screen?.kind === "form" && <SchoolTaskForm key={selected?.id ?? screen.taskKind}
        workspace={workspace} year={yearId} kind={screen.taskKind} directory={roster}
        authorDepartment={sender?.department ?? ""} item={selected}
        initialSource={screen.source && sources.current.has(screen.source) ? screen.source : undefined}
        sources={sources.current}
        onSaved={() => open(screen.taskKind === "distributed" ? { kind: "manage", id: selected?.id } : null)}
        onBack={() => open(selected ? { kind: screen.taskKind === "distributed" ? "manage" : "detail", id: selected.id } : null)} />}
      {screen?.kind === "detail" && selected && detail && <>
        <TaskInformation task={selected} detail={detail} workspace={workspace} year={year} today={today} />
        <div className="task-actions">
          {!selected.cancelled_at && (selected.kind === "personal" || ownReceipts.has(selected.id)) &&
            <Button type="button" disabled={m.pending} onClick={() => completeTask(selected,
              !(selected.kind === "personal" ? selected.completed_at : ownReceipts.get(selected.id)?.completed_at))}>
              {(selected.kind === "personal" ? selected.completed_at : ownReceipts.get(selected.id)?.completed_at) ? "완료 취소" : "완료 처리"}
            </Button>}
          {editable && selected.kind === "personal" && <>
            <Button type="button" variant="outline" onClick={() => open({ kind: "form", taskKind: "personal", id: selected.id })}>수정</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm({ command: "delete" })}>삭제</Button>
          </>}
          {editable && selected.kind === "distributed" && <Button type="button" variant="outline"
            onClick={() => open({ kind: "manage", id: selected.id })}>진행 현황 관리</Button>}
        </div>
      </>}
      {screen?.kind === "manage" && (selected && detail && editable ? <>
        <Button type="button" variant="ghost" onClick={() => open({ kind: "manage" })}>배포 목록</Button>
        <TaskInformation task={selected} detail={detail} workspace={workspace} year={year} today={today} />
        <TaskProgress key={selected.id} task={selected} recipients={receipts.filter((row) => row.task_id === selected.id)}
          directory={sender ? roster : []} pending={m.pending}
          onRecipientChange={(change) => setConfirm(change)}
          onAdd={(audience) => m.execute(() => changeSchoolTask({
            workspace, id: selected.id, version: selected.version, command: "add", audience,
          }), undefined, "수신자를 추가했습니다.")} />
        {!selected.cancelled_at && <div className="task-actions">
          <Button type="button" variant="outline" onClick={() => open({ kind: "form", taskKind: "distributed", id: selected.id })}>업무 수정</Button>
          <Button type="button" variant="ghost" onClick={() => setConfirm({ command: "cancel" })}>업무 취소</Button>
        </div>}
      </> : authored.length > 0 ? <ul className="task-list task-authored">
        {authored.toSorted((a, b) => b.created_at.localeCompare(a.created_at)).map((task) => {
          const active = receipts.filter((row) => row.task_id === task.id && !row.removed_at);
          return <li key={task.id}><button className="task-row-detail" type="button" onClick={() => open({ kind: "manage", id: task.id })}>
            <strong>{resolveSchoolTask(task, sources).title}</strong>
            <span>{task.cancelled_at ? "취소 · " : ""}완료 {active.filter((row) => row.completed_at).length} / {active.length}명</span>
          </button></li>;
        })}
      </ul> : <p className="task-hint">배포한 업무가 없습니다.</p>)}
      {!!confirm && selected && <div className="task-confirm" role="group" aria-label="변경 확인">
        <p>{{
          delete: "이 개인 할 일을 삭제할까요?",
          cancel: "업무를 취소할까요? 기존 배포와 완료 기록은 보존됩니다.",
          remove: "이 교원을 배포 대상에서 제외할까요?",
          redo: "이 교원에게 재수행을 요청할까요? 해당 교원의 상태가 미완료로 돌아갑니다.",
        }[confirm.command]}</p>
        <div className="task-actions"><Button type="button" variant="outline" onClick={() => setConfirm(null)} disabled={m.pending}>돌아가기</Button>
          <Button type="button" disabled={m.pending} onClick={() => confirmChange(selected, confirm)}>변경 확인</Button></div>
      </div>}
      {screen?.kind !== "form" && <InlineNotice mutation={m} />}
    </Modal>
  </>;
}

function TaskInformation({ task, detail, workspace, year, today }: {
  task: SchoolTask; detail: TaskView; workspace: string; year: number; today: string;
}) {
  const due = taskDeadlineLabel(detail.dueDate, detail.dueTime, today);
  return <div className="task-information">
    <h3>{detail.title}</h3>
    <dl>
      {task.department && <div><dt>담당 부서</dt><dd>{task.department}</dd></div>}
      {task.author_name && <div><dt>배포자</dt><dd>{task.author_name}</dd></div>}
      {due && <div><dt>마감</dt><dd>{due}{task.deadline_from_source && " · 공개 업무계획 날짜 연동"}</dd></div>}
      {task.cancelled_at && <div><dt>상태</dt><dd>취소</dd></div>}
    </dl>
    {task.description && <p className="task-description">{task.description}</p>}
    {task.resources.length > 0 && <section className="task-resources"><h4>관련 자료</h4><ResourceLinks value={task.resources} /></section>}
    {task.submission_url && <ResourceLinks value={[{ name: "제출 링크", url: task.submission_url }]} />}
    {detail.source && <Link className="task-source-link" href={`/app/${workspace}/plans?${new URLSearchParams({
      year: String(year), date: detail.source.date, workItem: detail.source.id,
    })}`}><ArrowUpRight size={15} />원본 업무계획 보기</Link>}
    {detail.sourceMissing && <p className="task-hint" role="status">현재 공개 업무계획에서 원본 일정이 삭제되었거나 취소되었습니다. 이 업무와 수행 기록은 유지됩니다.</p>}
    {task.kind === "distributed" && <p className="task-hint">완료는 교원 본인의 수행 표시입니다. 제출·검토 여부는 제출처에서 확인하세요.</p>}
  </div>;
}

function TaskProgress({ task, recipients, directory, pending, onRecipientChange, onAdd }: {
  task: SchoolTask; recipients: TaskRecipient[]; directory: TaskTeacher[]; pending: boolean;
  onRecipientChange: (change: Confirmation) => void;
  onAdd: (audience: { teacher_id: string; user_id: string }[]) => void;
}) {
  const [incomplete, setIncomplete] = useState(false);
  const active = recipients.filter((row) => !row.removed_at);
  const removed = recipients.filter((row) => !!row.removed_at);
  const existing = new Set(active.map((row) => row.teacher_id));
  const addDirectory = directory.filter((row) => !existing.has(row.teacher_id));
  const selection = useTaskAudience(addDirectory);
  const done = active.filter((row) => row.completed_at).length;
  const percent = active.length ? Math.round(done / active.length * 100) : 0;
  return <section className="task-progress" aria-label="수신자별 진행 현황">
    <strong>완료 {done}명 / 전체 {active.length}명 · 미완료 {active.length - done}명</strong>
    <progress aria-label="완료 비율" value={percent} max={100} /><span>{percent}%</span>
    <label className="task-option"><input type="checkbox" checked={incomplete} onChange={(event) => setIncomplete(event.target.checked)} />미완료만 보기</label>
    <ul className="task-list">
      {active.filter((row) => !incomplete || !row.completed_at).map((row) => <li key={row.teacher_id} className="task-progress-person">
        <div><strong>{row.recipient_name}</strong>
          <span>{row.completed_at ? <>완료 · <time dateTime={row.completed_at}>{completedDate.format(new Date(row.completed_at))}</time></> : "미완료"}</span></div>
        {!task.cancelled_at && <div className="task-actions">
          {row.completed_at && <Button type="button" variant="outline" size="sm" disabled={pending}
            onClick={() => onRecipientChange({ command: "redo", teacher_id: row.teacher_id })}>재수행 요청</Button>}
          <Button type="button" variant="ghost" size="sm" disabled={pending}
            onClick={() => onRecipientChange({ command: "remove", teacher_id: row.teacher_id })}>제외</Button>
        </div>}
      </li>)}
    </ul>
    {removed.length > 0 && <Disclosure compact label={`제외된 수신자 (${removed.length})`}>
      <ul className="task-list">{removed.map((row) => <li key={row.teacher_id}>{row.recipient_name} · {row.completed_at
        ? <>완료 · <time dateTime={row.completed_at}>{completedDate.format(new Date(row.completed_at))}</time></> : "미완료"}</li>)}</ul>
    </Disclosure>}
    {!task.cancelled_at && addDirectory.length > 0 && <Disclosure compact label="수신자 추가">
      <TaskAudiencePicker directory={addDirectory} value={selection.target} onChange={selection.setTarget} />
      <Button type="button" disabled={pending || !selection.audience.length}
        onClick={() => onAdd(selection.audience)}>선택한 수신자 추가</Button>
    </Disclosure>}
  </section>;
}
