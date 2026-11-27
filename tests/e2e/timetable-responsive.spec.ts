import {test,expect} from "@playwright/test";
for(const width of [320,375,390,430,1440]){
 test(`official timetable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto("/recovery-preview/operations");
  await page.getByRole("button",{name:"시간표 조회",exact:true}).click();
  const sheet=page.locator(".official-timetable");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button",{name:"학급별",exact:true}).click();
  const table=sheet.locator(".official-timetable-grid");
  await expect(table).toBeVisible();
  const size=await table.evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement!.clientWidth}));
  expect(size.width).toBeLessThanOrEqual(size.parent+2);
  const tabs=sheet.locator(".official-timetable-tabs");
  const geometry=await tabs.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+1);
  await sheet.getByRole("button",{name:"전체 시간표",exact:true}).click();
  await expect(table).toHaveAttribute("data-audience","all");
  await expect(sheet.locator(".official-timetable-scroll")).toBeVisible();
 });
}

for(const width of [320,390,430]) test(`shared reader controls at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 const metrics: {height:number;radius:string;segmentHeight:number}[]=[];
 for(const tab of ["공개 학사일정","공개 주간계획","시간표 조회"]){
  await page.getByRole("button",{name:tab,exact:true}).click();
  const reader=page.locator(".reader-surface");
  const nav=reader.locator(".reader-period-nav");
  await expect(nav).toBeVisible();
  metrics.push(await nav.getByRole("button",{name:"오늘",exact:true}).evaluate(el=>({height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius,segmentHeight:el.closest(".reader-surface")!.querySelector(".reader-segments")!.getBoundingClientRect().height})));
  const box=await nav.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));
  expect(box.scroll).toBeLessThanOrEqual(box.width+1);
 }
 expect(metrics[1]).toEqual(metrics[0]);
 expect(metrics[2]).toEqual(metrics[0]);
 const sheet=page.locator(".official-timetable");
 await sheet.getByRole("button",{name:"시간표 더보기"}).click();
 await expect(sheet.getByLabel("기준 날짜")).toBeVisible();
 await sheet.getByRole("button",{name:"시간표 더보기"}).click();
 await expect(sheet.getByLabel("기준 날짜")).toHaveCount(0);
});
