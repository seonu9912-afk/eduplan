import {test,expect} from "@playwright/test";
import {operationsPreviewContext} from "../../src/app/recovery-preview/operations-fixture";
import {defaultAnnual} from "../../src/lib/academic";
import {scheduleDates} from "../../src/lib/schedule-dates";

for (const width of [1024,1440,1920]) test(`weekly reader shows all dense events at ${width}px`,async({page})=>{
 const c=operationsPreviewContext();
 const week=scheduleDates("2027-03-02","week");
 const scope={workspace_id:c.workspace.id,academic_year_id:c.year!.id,published_at:"2027-02-20T00:00:00Z",published_by:c.userId,starts_on:"2027-03-01",source_version:1,change_note:""};
 const doc=defaultAnnual(c.grades);
 doc.vacations=[{start:week[0],end:"2027-03-09",name:"기간형 테스트 방학"}];
 const work=Array.from({length:12},(_,i)=>({id:"dense-"+i,date:week[1],department:"교무부",kind:"업무",text:`밀집 업무 ${i+1} · 다음 주 교육과정 운영과 학급별 학생 참여 활동에 관한 자료 취합 및 세부 일정 확인`,time:"14:00",location:"협의실"}));
 c.schoolPublications=[
  {...scope,id:"density-calendar",domain:"calendar",payload:{document:doc,events:[],semesters:[],classes:[]}},
  {...scope,id:"density-work",domain:"plans",payload:{business:[...work,{id:"duty",date:week[1],department:"교무부",kind:"당직",text:"테스트 교사",time:"16:00"},{id:"trip",date:week[1],department:"교무부",kind:"출장",text:"테스트 출장",time:"13:00",participants:"테스트 교사"}],workSettings:{dutyEnabled:true}}},
 ];
 await page.addInitScript(data=>localStorage.setItem("eduplan-operations-rehearsal-v1",data),JSON.stringify(c));
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"공개 주간계획",exact:true}).click();
 const table=page.locator(".school-reader-calendar[data-week-grid]");
 await expect(table).toBeVisible();
 await expect(table.locator("thead th")).toHaveCount(7);
 await expect(table.locator(".work-week-row-label")).toHaveCount(0);
 await expect(table.locator(".weekly-operation-row").first().locator("td h4")).toHaveCount(7);
 await expect(table.locator(".calendar-desktop-day time").first()).toHaveCSS("font-size","25px");
 const day=table.locator('.weekly-daily-list[data-date="2027-03-02"]');
 await expect(day.locator(".weekly-daily-event")).toHaveCount(12);
 await expect(table.locator(".calendar-desktop-overflow")).toHaveCount(0);
 await expect(table.locator("[data-week-period] .school-reader-event")).toHaveCount(1);
 await expect(table.locator("[data-week-period] .school-calendar-span-cell")).toHaveAttribute("colspan", "7");
 await expect(table.locator(".weekly-operation-row")).toHaveCount(2);
 const geometry=await day.evaluate(el=>{
  const bounds=el.getBoundingClientRect();
  return [...el.querySelectorAll(".schedule-detail-trigger")].map(node=>{
   const r=node.getBoundingClientRect();
   return {wrap:getComputedStyle(node).whiteSpace,inside:r.bottom<=bounds.bottom+1,scroll:node.scrollWidth,client:node.clientWidth};
  });
 });
 for(const metric of geometry){expect(metric.wrap).toBe("normal");expect(metric.inside).toBe(true);expect(metric.scroll).toBeLessThanOrEqual(metric.client+1);}
 await page.emulateMedia({media:"print"});
 await expect(day.locator(".weekly-daily-event").last()).toBeVisible();
});
