import {test,expect} from "@playwright/test";
for(const width of [320,390,430,1440]){
 test(`schedule management controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto("/recovery-preview/operations");
  const nav=page.getByRole("navigation",{name:"통합 운영 실습 단계"});
  await nav.getByRole("button",{name:"학사일정",exact:true}).click();
  await expect(page.locator(".schedule-management")).toBeVisible();
  if(width<768) await expect(page.locator(".mobile-calendar-management-nav")).toBeVisible();
  await nav.getByRole("button",{name:"월중·주간",exact:true}).click();
  const toolbar=page.locator(".schedule-management-toolbar");
  await expect(toolbar).toBeVisible();
  const geometry=await toolbar.evaluate(el=>({right:el.getBoundingClientRect().right,width:document.documentElement.clientWidth,scroll:el.scrollWidth,client:el.clientWidth}));
  expect(geometry.right).toBeLessThanOrEqual(geometry.width+1);
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);
  await toolbar.getByRole("button",{name:"월중계획",exact:true}).click();
  await expect(toolbar.getByRole("button",{name:"월중계획",exact:true})).toHaveAttribute("aria-pressed","true");
 });
}

for(const width of [320,390,430,1440])test(`public calendar compact controls at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"공개 학사일정",exact:true}).click();
 const reader=page.locator(".schedule-surface[data-calendar-view]");
 await expect(reader).toBeVisible();
 const toolbar=reader.locator(".schedule-reader-toolbar");
 const date=toolbar.locator('input[type="date"]');
 if(width<768){
  await expect(date).toBeHidden();
  await expect(toolbar.getByRole("button",{name:"학사일정 관리"})).toBeHidden();
  await expect(toolbar.getByRole("button",{name:"일정 검색"})).toBeVisible();
  const more=toolbar.getByRole("button",{name:"일정 더보기"});
  await more.click();
  await expect(date).toBeVisible();
  await expect(toolbar.getByRole("button",{name:"학사일정 관리"})).toBeVisible();
  await more.click();
  const geometry=await toolbar.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,right:el.getBoundingClientRect().right,viewport:document.documentElement.clientWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport+1);
  const emptyWeek=reader.locator('.mobile-calendar-span-week[data-lanes="0"]').first();
  await expect(emptyWeek).toBeVisible();
  expect((await emptyWeek.boundingBox())!.height).toBeLessThanOrEqual(48);
 }else{
  await expect(date).toBeVisible();
  await expect(toolbar.getByRole("button",{name:"일정 더보기"})).toBeHidden();
 }
});

for(const width of [320,390,430,1440])test(`weekly reader controls and task placement at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"공개 주간계획",exact:true}).click();
 const reader=page.locator(".schedule-surface[data-work-plan]");
 const toolbar=reader.locator(".schedule-reader-toolbar");
 const tasks=reader.locator(".my-tasks");
 await expect(tasks).toBeVisible();
 const main=reader.locator(".official-schedule-main");
 if(width<768){
   await expect(toolbar.getByRole("group",{name:"일정 표시 방식"})).toBeHidden();
   await expect(toolbar.getByRole("button",{name:"주말 표시"})).toBeHidden();
   await expect(toolbar.locator('input[type="date"]')).toBeHidden();
   await expect(toolbar.getByRole("button",{name:"업무계획 관리"})).toBeHidden();
   expect((await main.boundingBox())!.y).toBeLessThan((await tasks.boundingBox())!.y);
   await toolbar.getByRole("button",{name:"일정 더보기"}).click();
   await expect(toolbar.getByRole("group",{name:"일정 표시 방식"})).toBeVisible();
   await expect(toolbar.getByRole("button",{name:"주말 표시"})).toBeVisible();
   await expect(toolbar.locator('input[type="date"]')).toBeVisible();
   await expect(toolbar.getByRole("button",{name:"업무계획 관리"})).toBeVisible();
   await toolbar.getByRole("button",{name:"일정 더보기"}).click();
 }else{
   expect((await tasks.boundingBox())!.x).toBeLessThan((await main.boundingBox())!.x);
   await expect(toolbar.getByRole("group",{name:"일정 표시 방식"})).toBeVisible();
 }
 const geometry=await toolbar.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));
 expect(geometry.scroll).toBeLessThanOrEqual(geometry.client+1);
});
