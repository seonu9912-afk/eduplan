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
