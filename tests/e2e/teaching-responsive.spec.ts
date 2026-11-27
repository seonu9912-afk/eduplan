import {test,expect} from "@playwright/test";
for(const width of [320,375,390,430,1440]){
 test(`teaching responsive surfaces at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto("/recovery-preview/operations");
  await page.getByRole("button",{name:"수업 연계",exact:true}).click();
  const module=page.locator(".teaching-module");
  await expect(module).toBeVisible();
  await module.getByRole("button",{name:"수업 현황",exact:true}).click();
  await expect(module.locator(".course-cards")).toBeVisible();
  const tabs=module.locator(".teaching-tabs");
  const geometry=await tabs.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+1);
  const cards=module.locator(".course-cards");
  const rect=await cards.evaluate(el=>({right:el.getBoundingClientRect().right,viewport:document.documentElement.clientWidth}));
  expect(rect.right).toBeLessThanOrEqual(rect.viewport+1);
  await module.getByRole("button",{name:"계획 열기",exact:true}).first().click();
  await expect(module.locator(".plan-savebar")).toBeVisible();
  if(width<768){
   const nav=module.locator(".teaching-week-navigation");
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
