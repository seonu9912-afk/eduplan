
import {test,expect} from "@playwright/test";
import {operationsPreviewContext} from "../../src/app/recovery-preview/operations-fixture";
import {defaultAnnual} from "../../src/lib/academic";

for(const theme of ["light","dark"] as const)for(const width of [390,1440])test(`calendar selection highlights only date circle: ${theme} ${width}`,async({page})=>{
 const c=operationsPreviewContext();
 const scope={workspace_id:c.workspace.id,academic_year_id:c.year!.id,published_at:"2027-02-20T00:00:00Z",published_by:c.userId,starts_on:"2027-03-01",source_version:1,change_note:""};
 const doc=defaultAnnual(c.grades);
 doc.vacations=[{start:"2027-03-01",end:"2027-03-07",name:"연속 기간 테스트"}];
 c.schoolPublications=[
 {...scope,id:"calendar-1",domain:"calendar",payload:{document:doc,events:[],semesters:[],classes:[]}},
 {...scope,id:"work-1",domain:"plans",payload:{business:[{id:"work",date:"2027-03-02",department:"교무부",kind:"업무",text:"교육활동 검토"}],workSettings:{dutyEnabled:true}}}
 ];
 await page.clock.setFixedTime(new Date("2027-03-02T01:00:00Z"));
 await page.emulateMedia({colorScheme:theme});
 await page.setViewportSize({width,height:900});
 await page.addInitScript(data=>localStorage.setItem("eduplan-operations-rehearsal-v1",data),JSON.stringify(c));
 await page.goto("/recovery-preview/operations");
 for(const name of ["공개 학사일정","공개 주간계획"]){
  await page.getByRole("button",{name,exact:true}).click();
  const reader=page.locator(".calendar-reader-shell");
  for(const mode of name==="공개 학사일정"?["월간","주간"]:["월중계획","주간계획"]){
   await reader.getByRole("button",{name:mode,exact:true}).click();
   await expect(reader.locator(".schedule-reader-toolbar")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
   if(width>=768){
    const table=reader.locator(".school-reader-calendar");
    await expect(table).toBeVisible();
    await expect(table.locator("td[data-today],td[data-selected]")).toHaveCount(0);
    const today=table.locator('time[aria-current="date"]');
    await expect(today).toHaveCSS("background-color","rgb(36, 82, 142)");
    await expect(today.locator("..").locator("..")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
    await expect(table.getByRole("button",{name:"연속 기간 테스트 상세 보기"}).first()).toBeVisible();
   }else{
    await expect(reader.locator(".mobile-calendar-dates[data-compact-rows]")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
    const day=reader.locator('.mobile-calendar-span-day[aria-current="date"]');
    await expect(day).toBeVisible();
    const neighbor=reader.locator('.mobile-calendar-span-day:not([aria-current="date"]):not([data-adjacent]):not(:disabled)').first();
    expect(await day.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await neighbor.evaluate(el=>getComputedStyle(el).backgroundColor));
    await expect(day.locator("time")).toHaveCSS("background-color","rgb(36, 82, 142)");
   }
  }
 }
});
