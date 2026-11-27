import {test,expect} from "@playwright/test";
const widths=[320,375,390,430,1440];
for(const width of widths){
  test(`home calendar geometry at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto("/recovery-preview/operations");
    const agenda=page.locator(".home-weekly-agenda");
    await expect(agenda).toBeVisible();
    const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    expect(layout.scroll).toBeLessThanOrEqual(layout.viewport+1);
    if(width<768){
      const grid=agenda.locator(".mobile-calendar-span-week").first();
      await expect(grid).toBeVisible();
      const geometry=await grid.evaluate(el=>{
        const date=el.querySelector(".mobile-calendar-span-day time")?.getBoundingClientRect();
        const bar=el.querySelector(".mobile-calendar-span-event")?.getBoundingClientRect();
        const first=el.querySelector(".mobile-calendar-span-day")?.getBoundingClientRect();
        return {dateBottom:date?.bottom??0,barTop:bar?.top??Infinity,dayHeight:first?.height??0};
      });
      expect(geometry.dateBottom).toBeLessThanOrEqual(geometry.barTop);
      expect(geometry.dayHeight).toBeGreaterThanOrEqual(44);
      const entries=agenda.locator(".home-week-detail-trigger");
      if(await entries.count()){
        const entry=entries.first();
        const bounds=await entry.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        await entry.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
    }else await expect(agenda.locator(".home-week-grid")).toBeVisible();
  });
}
