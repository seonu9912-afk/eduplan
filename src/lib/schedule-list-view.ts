import { addDays } from "./domain";
import type { ScheduleEntry } from "./school-schedule";

export type ScheduleListRow = { entry:ScheduleEntry; from:string; to:string };
/** Group effective occurrences, not separate daily copies of a multi-day event. */
export function scheduleListGroups(dates:string[], days:ReadonlyMap<string,{entries:ScheduleEntry[]}>) {
  const rows:ScheduleListRow[]=[];
  const latest=new Map<string,ScheduleListRow>();
  for(const date of [...new Set(dates)].sort()) {
    for(const entry of days.get(date)?.entries??[]) {
      const key=JSON.stringify([entry.id,entry.date,entry.end,entry.title,entry.tone,entry.department,entry.time,entry.location,entry.resources,entry.operationGroup,entry.assignmentText,entry.participants,entry.targetGrades]);
      const previous=latest.get(key);
      if(previous?.to===date) continue;
      if(previous && addDays(previous.to,1)===date) previous.to=date;
      else {const row={entry,from:date,to:date};rows.push(row);latest.set(key,row);}
    }
  }
  const groups=new Map<string,ScheduleListRow[]>();
  for(const row of rows) {
    const list=groups.get(row.from)??[];
    list.push(row);groups.set(row.from,list);
  }
  return [...groups].map(([date,rows])=>({date,rows:rows.sort((a,b)=>Number(!!a.entry.operationGroup)-Number(!!b.entry.operationGroup)||(a.entry.time??"").localeCompare(b.entry.time??"")||a.entry.title.localeCompare(b.entry.title,"ko"))}));
}
