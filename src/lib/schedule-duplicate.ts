import { calendarDates, type EventDraft } from "./academic-calendar";
import { addDays } from "./domain";

function offsetDays(a:string,b:string) {
  return Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000);
}
export function duplicateEventEnd(source:EventDraft, newStart:string) {
  return addDays(newStart,offsetDays(source.event.start_date,source.event.end_date));
}
/** Make a fresh draft and shift all grade/class period selections by the same calendar-day offset. */
export function duplicateEventDraft(source:EventDraft, newStart:string, year:number, userId:string, newId:string):EventDraft {
  const original=calendarDates(year,source.event.start_date,source.event.end_date);
  if(!original.length)throw Error("원본 행사 기간을 확인하세요.");
  if(!calendarDates(year,newStart,newStart).length)throw Error("새 시작일을 해당 학년도 안에서 선택하세요.");
  const end=duplicateEventEnd(source,newStart);
  if(!calendarDates(year,newStart,end).length)throw Error("복제한 행사 전체 기간이 해당 학년도를 벗어납니다.");
  if(newId===source.event.id)throw Error("새 행사 식별자가 필요합니다.");
  const draft=structuredClone(source), slots:EventDraft["slots"]={};
  for(const [scope,dates] of Object.entries(draft.slots)){
    slots[scope]={};
    for(const [date,periods] of Object.entries(dates)){
      if(!original.includes(date))throw Error("원본 행사 기간 밖에 저장된 운영 교시가 있습니다. 원본 편성을 먼저 확인하세요.");
      slots[scope][addDays(newStart,offsetDays(source.event.start_date,date))]=periods;
    }
  }
  return {event:{...draft.event,id:newId,version:0,created_by:userId,updated_at:"",start_date:newStart,end_date:end},slots};
}
