import {test,expect} from "@playwright/test";
for(const width of [1280,1600]) test(`desktop home cards stay bounded at ${width}px`,async({page})=>{
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
 expect(heights.every(h=>h===64)).toBe(true);
 await expect(home.locator(".personal-lesson-list")).toBeHidden();
 const first=grid.locator("button.home-period-card").first();
 if(await first.count()){
  await first.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
 }
 expect(await lessonCard.evaluate(el=>el.getBoundingClientRect().height)).toBe(before);
});

for (const width of [800,1024,1280,1440,1600,1920]) test(`home weekly calendar cannot overlap day detail at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 const home=page.locator(".personal-day");
 const agenda=home.locator(".home-weekly-agenda");
 const grid=agenda.locator(".home-week-grid");
 const detail=agenda.locator(".home-week-detail");
 await expect(grid).toBeVisible();
 const check=async()=>{
  const geometry=await grid.evaluate(el=>{
   const bounds=el.getBoundingClientRect();
   const section=el.closest(".home-weekly-agenda")!;
   const detail=section.querySelector(".home-week-detail")!.getBoundingClientRect();
   const columns=Array.from(el.querySelectorAll(".home-week-column")).map(col=>col.getBoundingClientRect().bottom);
   const events=Array.from(el.querySelectorAll(".home-week-event")).map(event=>{const title=event.querySelector(".schedule-department-title")!;return {bottom:event.getBoundingClientRect().bottom,wrap:getComputedStyle(title).flexWrap}});
   return {height:bounds.height,bottom:bounds.bottom,detailTop:detail.top,columns,events};
  });
  expect(geometry.height).toBe(180);
  expect(geometry.detailTop).toBeGreaterThanOrEqual(geometry.bottom);
  expect(geometry.columns.every(y=>y<=geometry.bottom+1)).toBe(true);
  expect(geometry.events.every(event=>event.bottom<=geometry.bottom+1&&event.wrap==="nowrap")).toBe(true);
 };
 await check();
 await agenda.getByRole("button",{name:"다음 주",exact:true}).click();
 await check();
 await agenda.getByRole("button",{name:"이전 주",exact:true}).click();
 await check();
 if(width>=1024) {
  expect(await home.locator(".home-lessons-widget").evaluate(el=>el.getBoundingClientRect().height)).toBe(224);
 }
});
