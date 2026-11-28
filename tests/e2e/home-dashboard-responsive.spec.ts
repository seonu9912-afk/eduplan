import {test,expect} from "@playwright/test";
for(const width of [1280,1600]) test(`desktop home lesson cards keep equal heights at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.goto("/recovery-preview/operations");
 const home=page.locator(".personal-day");
 await expect(home).toBeVisible();
 const lessonCard=home.locator(".home-lessons-widget");
 const grid=home.locator(".home-period-grid");
 await expect(grid).toBeVisible();
 const before=await lessonCard.evaluate(el=>el.getBoundingClientRect().height);
 const cards=grid.locator(".home-period-card");
 expect(await cards.count()).toBeGreaterThan(0);
 const heights=await cards.evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
 expect(heights.every(h=>h===76)).toBe(true);
 await expect(home.locator(".personal-lesson-list")).toBeHidden();
 const first=grid.locator("button.home-period-card").first();
 if(await first.count()){
  await first.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
 }
 expect(await lessonCard.evaluate(el=>el.getBoundingClientRect().height)).toBe(before);
});

for (const width of [800,1024,1280,1440,1588,1600,1920]) test(`home weekly calendar cannot overlap day detail at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 const home=page.locator(".personal-day");
 const agenda=home.locator(".home-weekly-agenda");
 const grid=agenda.locator(".home-week-grid");
 const detail=home.locator(".home-week-detail");
 await expect(grid).toBeVisible();
 const check=async()=>{
  const geometry=await grid.evaluate(el=>{
   const bounds=el.getBoundingClientRect();
   const section=el.closest(".home-calendar-stack")!;
   const detail=section.querySelector(".home-week-detail")!.getBoundingClientRect();
   const columns=Array.from(el.querySelectorAll(".home-week-column")).map(col=>col.getBoundingClientRect().bottom);
   const events=Array.from(el.querySelectorAll(".home-week-event")).map(event=>{const title=event.querySelector(".schedule-department-title")!;return {bottom:event.getBoundingClientRect().bottom,wrap:getComputedStyle(title).flexWrap}});
   return {height:bounds.height,bottom:bounds.bottom,detailTop:detail.top,columns,events};
  });
  expect(geometry.height).toBeGreaterThanOrEqual(174);
  expect(geometry.height).toBeLessThan(210);
  expect(geometry.detailTop).toBeGreaterThanOrEqual(geometry.bottom);
  expect(geometry.columns.every(y=>y<=geometry.bottom+1)).toBe(true);
  expect(geometry.events.every(event=>event.bottom<=geometry.bottom+1&&event.wrap==="nowrap")).toBe(true);
 };
 await check();
 await agenda.getByRole("button",{name:"다음 주",exact:true}).click();
 await check();
 await agenda.getByRole("button",{name:"이전 주",exact:true}).click();
 await check();
 const containers=home.locator(".home-weekly-agenda,.home-week-detail-list,.home-dashboard-side > .my-tasks,.home-week-and-tasks .task-dashboard-body,.home-today-grid > .personal-widget");
 const measurements=await containers.evaluateAll(elements=>elements.filter(el=>el.getBoundingClientRect().height>0).map(el=>({name:el.className,overflow:getComputedStyle(el).overflowY,scroll:el.scrollHeight,client:el.clientHeight})));
 for(const metric of measurements){
  expect(["scroll","auto","hidden","clip"],String(metric.name)).not.toContain(metric.overflow);
  expect(metric.scroll,String(metric.name)).toBeLessThanOrEqual(metric.client+2);
 }
 const last=detail.locator(".home-week-detail-list > li").last();
 if(await last.count()){
  const sectionBox=await detail.boundingBox();
  const lastBox=await last.boundingBox();
  expect(lastBox!.y+lastBox!.height).toBeLessThanOrEqual(sectionBox!.y+sectionBox!.height);
 }
});

test("home separates agenda, personal tasks, and shortcuts at desktop and mobile widths",async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto("/recovery-preview/operations");
 const home=page.locator(".personal-day");
 const calendar=home.locator(".home-weekly-agenda");
 const detail=home.locator(".home-week-detail");
 const tasks=home.locator(".home-dashboard-side > .my-tasks");
 const shortcuts=home.locator(".home-shortcuts");
 await expect(calendar).toBeVisible();
 await expect(calendar).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
 await expect(calendar).toHaveCSS("border-left-width","0px");
 await expect(tasks).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
 await expect(detail).toBeVisible();
 const taskMore=tasks.locator(".task-dashboard-more > summary");
 if(await taskMore.isVisible()){
  const before=await tasks.boundingBox();
  await taskMore.click();
  const menu=tasks.locator(".task-dashboard-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("position","absolute");
  expect((await tasks.boundingBox())!.height).toBe(before!.height);
  await taskMore.click();
 }
 await expect(calendar.locator(".home-week-detail")).toHaveCount(0);
 await expect(home.locator(".home-today-grid > .personal-widget")).toHaveCount(3);
 await expect(shortcuts).toBeVisible();
 const cal=await calendar.boundingBox(), day=await detail.boundingBox(), task=await tasks.boundingBox(), links=await shortcuts.boundingBox();
 expect(day!.y).toBeGreaterThanOrEqual(cal!.y+cal!.height);
 expect(task!.x).toBeGreaterThanOrEqual(cal!.x+cal!.width);
 expect(links!.y).toBeGreaterThanOrEqual(task!.y+task!.height);
 await calendar.getByRole("button",{name:"다음 주",exact:true}).click();
 await expect(detail.getByRole("heading")).toContainText("선택한 날짜 일정");
 await calendar.getByRole("button",{name:"오늘",exact:true}).click();
 await expect(detail.getByRole("heading")).toContainText("오늘의 일정");
 await page.setViewportSize({width:390,height:844});
 await expect(home.locator(".home-week-mobile-grid")).toBeVisible();
 const dayButtons=home.locator(".home-week-mobile-grid .mobile-calendar-span-day");
 await expect(dayButtons.first()).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
 await expect(calendar).toHaveCSS("border-left-width","0px");
 await expect(tasks).toHaveCSS("border-left-width","0px");
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 const smallCal=await calendar.boundingBox(), smallDay=await detail.boundingBox(), smallTasks=await tasks.boundingBox();
 expect(smallDay!.y).toBeGreaterThanOrEqual(smallCal!.y+smallCal!.height);
 expect(smallTasks!.y).toBeGreaterThanOrEqual(smallDay!.y+smallDay!.height);
});
