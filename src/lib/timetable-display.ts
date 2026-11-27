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
