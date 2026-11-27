import { test, expect } from "@playwright/test";

test("theme follows system, saves manual selection, and prints in light mode", async ({page}) => {
  await page.emulateMedia({colorScheme:"light"});
  await page.goto("/recovery-preview/operations");
  const root=page.locator("html");
  const theme=page.getByRole("group",{name:"화면 테마 선택"});
  await expect(theme.getByRole("button",{name:"시스템"})).toHaveAttribute("aria-pressed","true");
  await expect(root).toHaveAttribute("data-theme","light");
  await page.emulateMedia({colorScheme:"dark"});
  await expect(root).toHaveAttribute("data-theme","dark");
  await theme.getByRole("button",{name:"밝게"}).click();
  await expect(root).toHaveAttribute("data-theme","light");
  await theme.getByRole("button",{name:"어둡게"}).click();
  await expect(root).toHaveAttribute("data-theme","dark");
  await expect(page.locator("body")).toHaveCSS("background-color","rgb(17, 24, 32)");
  await page.reload();
  await expect(theme.getByRole("button",{name:"어둡게"})).toHaveAttribute("aria-pressed","true");
  await expect(root).toHaveAttribute("data-theme","dark");
  for (const name of ["공개 학사일정","공개 주간계획","시간표 조회"]) {
    await page.getByRole("button",{name,exact:true}).click();
    const surface=page.locator(name==="시간표 조회"?".official-timetable":".schedule-surface");
    await expect(surface).toBeVisible();
    const color=await surface.evaluate(el=>getComputedStyle(el).color);
    expect(color).not.toBe("rgb(35, 42, 52)");
  }
  await page.emulateMedia({media:"print",colorScheme:"dark"});
  await expect(page.locator("body")).toHaveCSS("background-color","rgb(255, 255, 255)");
  await page.emulateMedia({media:"screen",colorScheme:"light"});
  await expect(root).toHaveAttribute("data-theme","dark");
  await theme.getByRole("button",{name:"시스템"}).click();
  await expect(root).toHaveAttribute("data-theme","light");
});
for (const width of [390,1440]) test(`theme control fits at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 const theme=page.getByRole("group",{name:"화면 테마 선택"});
 await theme.getByRole("button",{name:"어둡게"}).click();
 await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
 const box=await theme.boundingBox();
 expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);
});
