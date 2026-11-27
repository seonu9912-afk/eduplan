import {test,expect} from "@playwright/test";
for(const width of [320,375,390,430,1440]){
 test(`teaching responsive surfaces at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto("/recovery-preview/operations");
  await page.getByRole("button",{name:"수업 연계",exact:true}).click();
  const teaching=page.locator(".teaching-teaching");
  await expect(teaching).toBeVisible();
  await teaching.getByRole("button",{name:"수업 현황",exact:true}).click();
  await expect(teaching.locator(".course-cards")).toBeVisible();
  const tabs=teaching.locator(".teaching-tabs");
  const geometry=await tabs.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+1);
  const cards=teaching.locator(".course-cards");
  const rect=await cards.evaluate(el=>({right:el.getBoundingClientRect().right,viewport:document.documentElement.clientWidth}));
  expect(rect.right).toBeLessThanOrEqual(rect.viewport+1);
  await teaching.getByRole("button",{name:"계획 열기",exact:true}).first().click();
  await expect(teaching.locator(".plan-savebar")).toBeVisible();
  if(width<768){
   const nav=teaching.locator(".teaching-week-navigation");
   if(await nav.isVisible()){
    const select=nav.locator("select");const before=await select.inputValue();
    if(await nav.getByRole("button",{name:"다음 주차"}).isEnabled()){
     await nav.getByRole("button",{name:"다음 주차"}).click();
     await expect(select).not.toHaveValue(before);
    }
   }
  }
 });
}

test("weekly sheet keeps content and connection buttons inside their cells",async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"수업 연계",exact:true}).click();
 const grid=page.getByRole("table",{name:"주차별 교수학습계획"});
 await expect(grid).toBeVisible();
 const row=grid.locator("tbody tr").first();
 await expect(row.locator("td")).toHaveCount(10);
 const geometry=await row.evaluate(el=>{
  const cells=Array.from(el.querySelectorAll("td"));
  const rects=cells.map(c=>c.getBoundingClientRect());
  return {widths:rects.map(r=>r.width),overflow:cells.flatMap((c,i)=>Array.from(c.querySelectorAll("textarea,.standard-control > button,.lesson-assessment-links > button")).filter(x=>x.getBoundingClientRect().right>rects[i].right+1).map(x=>x.textContent))};
 });
 expect(geometry.widths[0]).toBeLessThanOrEqual(34);
 expect(geometry.widths[1]).toBeLessThanOrEqual(34);
 expect(geometry.widths[2]).toBeLessThanOrEqual(80);
 expect(geometry.widths[4]).toBeGreaterThanOrEqual(155);
 expect(geometry.widths[5]).toBeGreaterThanOrEqual(245);
 expect(geometry.overflow).toEqual([]);
});
