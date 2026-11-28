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
  await expect(sheet.getByRole("button",{name:"전체 시간표",exact:true})).toHaveCount(0);
  await expect(table.locator("[data-cancelled]")).toHaveCount(0);
  await sheet.getByRole("button",{name:"교사별",exact:true}).click();
  await expect(table).toHaveAttribute("data-audience","teacher");
  await sheet.getByRole("button",{name:"기본",exact:true}).click();
  await expect(sheet.locator(".official-timetable-caption")).toBeHidden();
  if(width>=768) { const period=table.locator("thead th").first(); expect((await period.boundingBox())!.width).toBeLessThanOrEqual(80); }
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
 await expect(sheet.locator(".reader-secondary-controls").getByLabel("기준 날짜")).toBeHidden();
 await sheet.getByRole("button",{name:"시간표 더보기"}).click();
 await expect(sheet.getByLabel("기준 날짜")).toHaveCount(0);
});

for (const width of [320,390,430,1440]) test(`lesson card geometry stays uniform and centered in both modes at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await page.goto("/recovery-preview/operations");
  await page.getByRole("button",{name:"시간표 조회",exact:true}).click();
  const sheet=page.locator(".official-timetable");
  await sheet.getByRole("button",{name:"학급별",exact:true}).click();
  for (const mode of ["기본","주간"]) {
    await sheet.getByRole("button",{name:mode,exact:true}).click();
    const cards=sheet.locator("button.official-lesson");
    await expect(cards.first()).toBeVisible();
    const sizes=await cards.evaluateAll(elements=>elements.map(el=>{
      const card=el.getBoundingClientRect();
      const children=Array.from(el.children).filter(child=>child.getBoundingClientRect().height>0);
      const rects=children.map(child=>child.getBoundingClientRect());
      const slot=el.querySelector(".timetable-badges");
      return {height:card.height,centerOffset:Math.abs((Math.min(...rects.map(r=>r.top))+Math.max(...rects.map(r=>r.bottom)))/2-(card.top+card.height/2)),slotPresent:!!slot,slotHeight:slot?.getBoundingClientRect().height,hasBadge:!!slot?.querySelector(".timetable-status-badge")};
    }));
    expect(sizes.every(s=>s.height===sizes[0].height&&s.centerOffset<=1&&s.slotPresent===s.hasBadge&&(!s.slotPresent||s.slotHeight===15))).toBe(true);
    expect(sizes.some(s=>!s.slotPresent)).toBe(true);
    expect(sizes[0].height).toBe(width<768?58:60);
    await expect(sheet.locator("thead .timetable-day-badge")).toHaveCount(0);
    const heading=sheet.locator(".official-timetable-grid thead th");
    if(mode==="주간"){
      const times=heading.locator("time");
      await expect(times).toHaveCount(5);
      const labels=await times.allTextContents();
      const dates=await times.evaluateAll(elements=>elements.map(el=>el.getAttribute("datetime")!));
      expect(labels).toEqual(dates.map((date,index)=>Number(date.slice(8))+"("+["월","화","수","목","금"][index]+")"));
      await expect(heading.locator(".timetable-weekday-label")).toHaveCount(0);
      const geometry=await times.evaluateAll(elements=>elements.map(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,cellWidth:el.closest("th")!.getBoundingClientRect().width})));
      expect(geometry.every(x=>x.height<=28&&x.width<=x.cellWidth)).toBe(true);
      const notice=heading.locator("button.timetable-date-detail").first();
      if(await notice.count()){
        await notice.click();
        await expect(page.getByRole("dialog",{name:"일과 운영 안내"})).toBeVisible();
        await expect(page.getByRole("dialog",{name:"일과 운영 안내"}).locator(".timetable-detail-notice")).toBeVisible();
        await page.keyboard.press("Escape");
      }
    }else{
      await expect(heading.locator(".timetable-weekday-label")).toHaveText(["월","화","수","목","금"]);
      await expect(heading.locator("time")).toHaveCount(0);
    }
  }
});

for (const width of [390,1440]) test(`class timetable uses neutral ordinary lessons at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"시간표 조회",exact:true}).click();
 const sheet=page.locator(".official-timetable");
 const table=sheet.locator(".official-timetable-grid");
 await sheet.getByRole("button",{name:"학급별",exact:true}).click();
 for(const mode of ["기본","주간"]){
  await sheet.getByRole("button",{name:mode,exact:true}).click();
  await expect(table).toHaveAttribute("data-audience","class");
  const ordinary=table.locator('button.official-lesson[data-kind="subject"]:not([data-changed]):not([data-blocked]):not([data-cancelled])');
  await expect(ordinary.first()).toBeVisible();
  await expect(ordinary.first()).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
  await expect(ordinary.first()).toHaveCSS("border-radius","0px");
  const exceptions=table.locator('button.official-lesson:is(:not([data-kind="subject"]),[data-changed],[data-blocked],[data-cancelled])');
  for(const item of await exceptions.all()) await expect(item).not.toHaveCSS("background-color","rgba(0, 0, 0, 0)");
 }
 await sheet.getByRole("button",{name:"교사별",exact:true}).click();
 await expect(table).toHaveAttribute("data-audience","teacher");
 const teacherLesson=table.locator('button.official-lesson[data-kind="subject"]').first();
 if(await teacherLesson.count()) await expect(teacherLesson).not.toHaveCSS("background-color","rgba(0, 0, 0, 0)");
});


for(const width of [320,375,390,430]) test(`timetable dates are separated from menu actions at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"시간표 조회",exact:true}).click();
 const sheet=page.locator(".official-timetable");
 const more=sheet.getByRole("button",{name:"시간표 더보기"});
 await more.click();
 const controls=sheet.locator(".reader-secondary-controls");
 await expect(controls.getByLabel("기준 날짜")).toBeHidden();
 await expect(controls.getByRole("button",{name:"인쇄·PDF 저장"})).toBeVisible();
 await sheet.locator(".reader-period-picker").click();
 const dialog=page.getByRole("dialog",{name:"날짜 이동"});
 await expect(dialog).toBeVisible();
 const input=dialog.getByLabel("기준 날짜");
 await expect(input).toBeVisible();
 const bounds=await input.evaluate(el=>({field:el.getBoundingClientRect().width,parent:el.parentElement!.clientWidth}));
 expect(bounds.field).toBeLessThanOrEqual(bounds.parent+1);
 await input.fill((await input.getAttribute("min"))!);
 await expect(dialog).toBeHidden();
 await expect(more).toHaveAttribute("aria-expanded","false");
});
