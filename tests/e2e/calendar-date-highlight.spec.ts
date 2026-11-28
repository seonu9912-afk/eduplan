
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
   const labels=width>=768?reader.locator(".school-reader-calendar thead th"):reader.locator(".mobile-calendar-weekdays span");
   await expect(labels).toHaveText(["일","월","화","수","목","금","토"]);
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

for(const width of [390,1440])test(`annual calendar selects months rather than individual dates: ${width}`,async({page})=>{
 const c=operationsPreviewContext();
 const scope={workspace_id:c.workspace.id,academic_year_id:c.year!.id,published_at:"2027-02-20T00:00:00Z",published_by:c.userId,starts_on:"2027-03-01",source_version:1,change_note:""};
 const doc=defaultAnnual(c.grades);
 doc.holidays={"2027-04-03":"연간 검증 일정 A","2027-04-17":"연간 검증 일정 B"};
 c.schoolPublications=[{...scope,id:"calendar-annual",domain:"calendar",payload:{document:doc,events:[],semesters:[],classes:[]}}];
 await page.clock.setFixedTime(new Date("2027-03-02T01:00:00Z"));
 await page.setViewportSize({width,height:900});
 await page.addInitScript(data=>localStorage.setItem("eduplan-operations-rehearsal-v1",data),JSON.stringify(c));
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"공개 학사일정",exact:true}).click();
 await page.locator(".calendar-reader-shell").getByRole("button",{name:"연간",exact:true}).click();
 const annual=page.locator(".annual-reader");
 await expect(annual.locator("button.annual-reader-month")).toHaveCount(12);
 await expect(annual.locator("button.annual-reader-day")).toHaveCount(0);
 const april=annual.getByRole("button",{name:"2027-04 월별 일정",exact:true});
 await april.locator("time[datetime='2027-04-03']").click();
 await expect(april).toHaveAttribute("aria-pressed","true");
 const agenda=annual.locator(".annual-reader-agenda");
 await expect(agenda.getByRole("heading",{name:"4월 학사일정",exact:true})).toBeVisible();
 await expect(agenda.getByText("연간 검증 일정 A",{exact:true})).toBeVisible();
 await expect(agenda.getByText("연간 검증 일정 B",{exact:true})).toBeVisible();
});


test("mobile weekly agenda shows people beside operation labels and retains all trip details", async({page})=>{
 const c=operationsPreviewContext();
 const scope={workspace_id:c.workspace.id,academic_year_id:c.year!.id,published_at:"2027-02-20T00:00:00Z",published_by:c.userId,starts_on:"2027-03-01",source_version:1,change_note:""};
 c.schoolPublications=[{...scope,id:"work-people",domain:"plans",payload:{workSettings:{dutyEnabled:true},business:[
  {id:"duty",date:"2027-03-02",department:"교무부",kind:"당직",text:"김 교사"},
  {id:"trip1",date:"2027-03-02",department:"교무부",kind:"출장",text:"교육과정 연수",participants:"이 교사, 박 교사",time:"13:00",location:"교육지원청"},
  {id:"trip2",date:"2027-03-02",department:"교무부",kind:"출장",text:"생활지도 협의",participants:"이 교사",time:"15:00"}
 ]}}];
 await page.clock.setFixedTime(new Date("2027-03-02T01:00:00Z"));
 await page.setViewportSize({width:390,height:900});
 await page.addInitScript(data=>localStorage.setItem("eduplan-operations-rehearsal-v1",data),JSON.stringify(c));
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"공개 주간계획",exact:true}).click();
 const agenda=page.locator(".calendar-reader-mobile-agenda");
 const trip=agenda.locator('[data-operation="출장"]');
 await expect(trip.locator(".weekly-mobile-person button")).toHaveText(["이 교사","박 교사"]);
 await expect(trip.getByText("교육과정 연수",{exact:true})).toHaveCount(0);
 const horizontal=await trip.evaluate(el=>el.querySelector(".weekly-mobile-people")!.getBoundingClientRect().left>=el.querySelector("h4")!.getBoundingClientRect().right);
 expect(horizontal).toBe(true);
 await trip.getByRole("button",{name:"이 교사 출장 상세 보기"}).click();
 const detail=page.getByRole("dialog",{name:"출장 상세"});
 await expect(detail.getByText("교육과정 연수",{exact:true})).toBeVisible();
 await expect(detail.getByText("생활지도 협의",{exact:true})).toBeVisible();
 await detail.getByRole("button",{name:"닫기",exact:true}).click();
 await trip.getByRole("button",{name:"박 교사 출장 상세 보기"}).click();
 await expect(page.getByRole("dialog",{name:"일정 상세"}).getByRole("heading",{name:"교육과정 연수"})).toBeVisible();
 await page.getByRole("dialog",{name:"일정 상세"}).getByRole("button",{name:"닫기",exact:true}).click();
 await page.setViewportSize({width:1440,height:900});
 await expect(page.locator(".school-calendar-desktop .weekly-operation-description").getByText("교육과정 연수",{exact:true})).toBeVisible();
});
