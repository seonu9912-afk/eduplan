import {planningDomains,type Permission,type PlanningDomain} from "./planning-completion";
import type {Member} from "./models";
export const permissionDomains = ["curriculum","calendar","plans","timetable","assessment","staffing"] as const satisfies readonly PlanningDomain[];
export const permissionLabels: Record<PlanningDomain,string> = {curriculum:"교육과정",calendar:"학사일정",plans:"업무계획",timetable:"시간표",assessment:"수업·평가",staffing:"교원 수급"};
export function permissionMatrix(members:Member[],permissions:Permission[]){
  const byKey=new Map(permissions.map(p=>[`${p.user_id}:${p.domain}`,p]));
  const rows=members.map(member=>({member,cells:permissionDomains.map(domain=>{
    const permission=byKey.get(`${member.user_id}:${domain}`);
    return {domain,allowed:permission?.can_edit===true,version:permission?.version??0};
  })}));
  return {rows,counts:permissionDomains.map(domain=>({domain,count:rows.filter(row=>row.cells.some(c=>c.domain===domain&&c.allowed)).length}))};
}
export function filterPermissionRows(rows:ReturnType<typeof permissionMatrix>["rows"],query:string,filter:"all"|"assigned"|"unassigned"|PlanningDomain){
  const norm=(s:string)=>s.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/g,"");
  const q=norm(query);
  return rows.filter(({member,cells})=>(!q||norm(member.display_name).includes(q)||norm(member.email).includes(q))&&
    (filter==="all"|| (filter==="assigned"?cells.some(c=>c.allowed):filter==="unassigned"?!cells.some(c=>c.allowed):cells.some(c=>c.domain===filter&&c.allowed))));
}
export {planningDomains};
