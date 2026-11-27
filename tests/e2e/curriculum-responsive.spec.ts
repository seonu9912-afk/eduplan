import {test,expect} from "@playwright/test";
for(const width of [320,375,390,430,1440]){
 test(`curriculum stage controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto("/recovery-preview/curriculum");
  const stages=page.getByRole("navigation",{name:"교육과정 편성 단계"});
  await expect(stages).toBeVisible();
  const geometry=await stages.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+1);
  const selector=page.locator(".c5-year-control");
  await expect(selector).toBeVisible();
  const g=await selector.evaluate(el=>({right:el.getBoundingClientRect().right,viewport:document.documentElement.clientWidth}));
  expect(g.right).toBeLessThanOrEqual(g.viewport+1);
 });
}
