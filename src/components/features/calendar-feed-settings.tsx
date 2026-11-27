"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/common";
import { manageCalendarFeed } from "@/app/calendar-feed-actions";

type Status={enabled:boolean;active:boolean;admin:boolean};
export function CalendarFeedSettings({workspaceId,yearId,year}:{workspaceId:string;yearId:string;year:number}){
  const [open,setOpen]=useState(false),[pending,setPending]=useState(false),[status,setStatus]=useState<Status|null>(null);
  const [calendar,setCalendar]=useState(true),[plans,setPlans]=useState(false),[url,setUrl]=useState(""),[message,setMessage]=useState("");
  async function run(op:"status"|"issue"|"revoke"|"enable"|"disable"){
    setPending(true);setMessage("");
    try{
      const result=await manageCalendarFeed({workspaceId,yearId,op,calendar,plans});
      if(!result.ok){setMessage(result.error);return;}
      setStatus(result.data);
      if(result.token)setUrl(new URL("/api/calendar-feed?token="+result.token,window.location.origin).href);
      else if(op==="revoke"||op==="disable"||op==="status")setUrl("");
      if(op==="issue")setMessage("새 주소를 발급했습니다. 이전 주소는 더 이상 작동하지 않습니다.");
      if(op==="revoke")setMessage("구독 주소를 폐기했습니다.");
    }catch{setMessage("요청에 실패했습니다. 잠시 후 다시 시도하세요.");}
    finally{setPending(false);}
  }
  return <>
    <Button type="button" variant="outline" size="sm" onClick={()=>{setOpen(true);setStatus(null);setUrl("");void run("status");}}><CalendarDays size={16}/>캘린더 연동</Button>
    <Modal open={open} onOpenChange={v=>{if(!pending){setOpen(v);if(!v)setUrl("");}}} title="외부 캘린더 연동" description={year+"학년도 공개 일정을 외부 캘린더에서 읽기 전용으로 구독합니다."}>
      <div className="form-stack">
        <p>학교 외부 서비스에 일정 제목과 날짜가 저장될 수 있습니다. 주소를 다른 사람에게 공유하지 마세요. 폐기 후에도 외부 서비스에 이미 복사된 정보는 남을 수 있습니다.</p>
        {status?.admin&&<Button type="button" variant="outline" disabled={pending} onClick={()=>{if(!status.enabled||window.confirm("학교의 모든 구독 주소를 폐기하고 외부 연동을 끌까요?"))void run(status.enabled?"disable":"enable");}}>{status.enabled?"학교 외부 연동 중지":"학교 외부 연동 허용"}</Button>}
        {status&&!status.enabled&&<p>학교 관리자가 외부 연동을 허용해야 합니다.</p>}
        {status?.enabled&&<>
          <fieldset disabled={pending}><legend>구독할 일정</legend>
            <label><input type="checkbox" checked={calendar} onChange={e=>setCalendar(e.target.checked)}/> 학사일정</label>
            <label><input type="checkbox" checked={plans} onChange={e=>setPlans(e.target.checked)}/> 일반 업무계획</label>
          </fieldset>
          <p>개인 할 일, 출장·운영업무, 참석자, 내부 링크 및 시간표는 제외합니다. 일정은 종일 일정으로 표시됩니다.</p>
          <Button type="button" disabled={pending||(!calendar&&!plans)} onClick={()=>{if(!status.active||window.confirm("새 주소를 발급하면 기존 구독 주소가 폐기됩니다. 계속할까요?"))void run("issue");}}>{status.active?"새 구독 주소 발급":"구독 주소 발급"}</Button>
          {status.active&&<Button type="button" variant="outline" disabled={pending} onClick={()=>{if(window.confirm("구독 주소를 폐기할까요?"))void run("revoke");}}>구독 주소 폐기</Button>}
          {url&&<><label className="field">비공개 구독 주소 (이 화면에서만 확인 가능)<input value={url} readOnly onFocus={e=>e.currentTarget.select()}/></label>
            <Button type="button" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(url);setMessage("주소를 복사했습니다.");}catch{setMessage("주소를 선택해 직접 복사하세요.");}}}>주소 복사</Button>
            <p>Apple 캘린더의 구독 캘린더 추가 또는 Google Calendar의 URL로 추가에 붙여 넣으세요. 자동 갱신 주기는 외부 서비스가 결정합니다.</p></>}
        </>}
        {pending&&<p role="status">처리 중…</p>}{message&&<p role="status">{message}</p>}
      </div>
    </Modal>
  </>;
}
