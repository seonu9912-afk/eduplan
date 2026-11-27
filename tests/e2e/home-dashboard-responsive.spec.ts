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
