import { ListTodo } from "lucide-react";
import "./my-tasks.css";

// Shared integration point for assigned and private tasks in every view.
export function MyTasks() {
  return <details className="my-tasks no-print" open>
    <summary><ListTodo size={16} aria-hidden="true" /><h3>나의 할 일</h3></summary>
    <p>할 일 기능은 아직 연결되지 않았습니다.</p>
    <small>배포받은 업무와 개인이 추가한 할 일을 이곳에서 확인할 수 있도록 준비 중입니다.</small>
  </details>;
}
