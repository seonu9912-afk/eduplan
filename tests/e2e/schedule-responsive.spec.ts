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
