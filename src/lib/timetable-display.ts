import type {TimetableCell} from "./timetable-view";
type TimeCell=Pick<TimetableCell,"start"|"end">;
export function lessonTime(cell:TimeCell){
 const {start,end}=cell;
 return start&&end&&/^([01]\d|2[0-3]):[0-5]\d$/.test(start)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(end)&&start<end?{start,end}:null;
}
/** A row time must apply to every teaching column that has this period.
 * Missing or different times are shown only on individual lessons, never guessed. */
export function commonPeriodTime(columns:readonly {teaching:boolean;periodCount:number;allCells:readonly (TimeCell&{period:number})[]}[],period:number){
 let shared:ReturnType<typeof lessonTime>=null;
 for(const day of columns.filter(d=>d.teaching&&d.periodCount>=period)){
  const cells=day.allCells.filter(c=>c.period===period);
  if(!cells.length)return null;
  for(const cell of cells){
   const time=lessonTime(cell);
   if(!time||shared&&(shared.start!==time.start||shared.end!==time.end))return null;
   shared=time;
  }
 }
 return shared;
}

export type LessonBadge = "단축" | "변경" | "보결" | "미실시" | "확인 필요";
export function periodChangeBadge(before: string, after: string): LessonBadge | undefined {
 const minutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})[–~-](\d{2}):(\d{2})$/.exec(value);
  if(!match) return null;
  const [,h,m,eh,em]=match.map(Number);
  const duration=eh*60+em-h*60-m;
  return h<24&&eh<24&&m<60&&em<60&&duration>0?duration:null;
 };
 const original=minutes(before), actual=minutes(after);
 if(original===null || actual===null || before===after) return undefined;
 return actual<original?"단축":"변경";
}
