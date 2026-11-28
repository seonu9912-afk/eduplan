import { expect, it } from "vitest";
import { operationsPreviewContext } from "../../src/app/recovery-preview/operations-fixture";
import { defaultAnnual } from "../../src/lib/academic";
import { buildAnnualSchedule } from "../../src/lib/annual-schedule-reader";
import type { SchoolPlanPublication } from "../../src/lib/school-publications";
it("counts only effective published days and preserves the academic year and revision boundaries",()=>{
 const context=operationsPreviewContext();
 const make=(v:number, starts_on:string, holidays:Record<string,string>):SchoolPlanPublication=>({
  workspace_id:context.workspace.id,academic_year_id:context.year!.id,published_by:context.userId,published_at:starts_on+"T00:00:00Z",change_note:"",
  id:"annual-"+v,domain:"calendar",source_version:v,starts_on,
  payload:{document:{...defaultAnnual(context.grades),holidays},events:[],classes:[],semesters:[{number:1,start_date:"2027-03-01",end_date:"2027-08-31"},{number:2,start_date:"2027-09-01",end_date:"2028-02-29"}]}
 });
 context.schoolPublications=[make(1,"2027-03-02",{"2027-03-03":"이전 공휴일"}),make(2,"2027-03-04",{"2027-03-03":"소급 금지","2027-03-05":"변경 휴업"})];
 const model=buildAnnualSchedule(context,2027);
 expect(model.months).toHaveLength(12);
 expect(model.dates[0]).toBe("2027-03-01");
 expect(model.dates.at(-1)).toBe("2028-02-29");
 expect(model.publishedDays).toBe(365);
 expect(model.academic.has("2027-03-01")).toBe(false);
 expect(model.academic.get("2027-03-03")?.name).toBe("이전 공휴일");
 expect(model.months[0].occurrences.map(x=>x.entry.title)).toContain("변경 휴업");
 expect(model.months[0].occurrences.map(x=>x.entry.title)).not.toContain("소급 금지");
 expect(model.months.reduce((sum,m)=>sum+m.teachingDays,0)).toBe(model.teachingDays);
 expect(model.semesters.reduce((sum,n)=>sum+n,0)).toBe(model.teachingDays);
 context.schoolPublications=[];
 expect(buildAnnualSchedule(context,2027).publishedDays).toBe(0);
});
