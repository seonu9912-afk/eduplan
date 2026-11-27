import { z } from "zod";
import { addDays } from "./domain";
import { createHash } from "node:crypto";

export const calendarFeedSchema=z.object({name:z.string(),items:z.array(z.object({id:z.string(),title:z.string(),start:z.iso.date(),end:z.iso.date()}).refine(e=>e.start<=e.end))});
export type CalendarFeed=z.infer<typeof calendarFeedSchema>;
export function escapeIcs(s:string) {return s.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"");}
export function foldIcs(line:string) {
  const lines:string[]=[];let current="",bytes=0;
  for(const char of line){const n=Buffer.byteLength(char,"utf8");if(bytes+n>75){lines.push(current);current=" ";bytes=1;}current+=char;bytes+=n;}
  lines.push(current);return lines.join("\r\n");
}
export function mergeFeedItems(items:CalendarFeed["items"]) {
  const groups=new Map<string,CalendarFeed["items"]>();
  for(const item of items){const key=JSON.stringify([item.id,item.title]);const group=groups.get(key)??[];group.push({...item});groups.set(key,group);}
  const out:CalendarFeed["items"]=[];
  for(const group of groups.values()){
    const merged:CalendarFeed["items"]=[];
    for(const item of group.sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end))){
      const last=merged.at(-1);
      if(last&&item.start<=addDays(last.end,1)){if(item.end>last.end)last.end=item.end;}
      else merged.push(item);
    }
    out.push(...merged);
  }
  return out.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id)||a.title.localeCompare(b.title));
}
export function calendarFeedIcs(feed:CalendarFeed,stamp:Date) {
  const date=(s:string)=>s.replaceAll("-","");
  const dtstamp=stamp.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//EduPlan//School Calendar//KO","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:"+escapeIcs(feed.name)];
  const counts=new Map<string,number>();
  for(const e of mergeFeedItems(feed.items)){
    const index=counts.get(e.id)??0;counts.set(e.id,index+1);
    const uid=createHash("sha256").update(JSON.stringify([feed.name,e.id,index])).digest("hex")+"@eduplan";
    lines.push("BEGIN:VEVENT","UID:"+uid,"DTSTAMP:"+dtstamp,"DTSTART;VALUE=DATE:"+date(e.start),"DTEND;VALUE=DATE:"+date(addDays(e.end,1)),"SUMMARY:"+escapeIcs(e.title),"CLASS:PRIVATE","TRANSP:TRANSPARENT","END:VEVENT");
  }
  lines.push("END:VCALENDAR");return lines.map(foldIcs).join("\r\n")+"\r\n";
}
