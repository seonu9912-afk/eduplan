export type PlanState="empty"|"draft"|"published"|"changed"|"partial"|"unknown";
export type PlanSection="curriculum"|"calendar"|"plans"|"timetable"|"teaching";
export type PlanOverviewRow={section:PlanSection;state:PlanState;detail:string;updatedAt?:string;publishedAt?:string;effectiveDate?:string;owners:string[]};
export type PlanUnit={state:PlanState;updatedAt?:string;publishedAt?:string};
export function versionState(draft:number|undefined,published:number|undefined):PlanState{
  if(draft===undefined)return published===undefined?"empty":"unknown";
  if(published===undefined)return "draft";
  return draft===published?"published":draft>published?"changed":"unknown";
}
export function aggregatePlanUnits(units:PlanUnit[]):PlanState{
  if(!units.length||units.every(x=>x.state==="empty"))return "empty";
  if(units.some(x=>x.state==="unknown"))return "unknown";
  if(units.every(x=>x.state==="published"))return "published";
  if(units.some(x=>x.state==="changed"))return "changed";
  if(units.some(x=>x.state==="published"||x.state==="partial"))return "partial";
  return "draft";
}
export function latestTimestamp(values:(string|undefined|null)[]){return values.filter((x):x is string=>!!x).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];}
