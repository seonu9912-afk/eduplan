import { test, expect } from "@playwright/test";
for(const width of [320,390,430,1440])test(`school settings navigation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("navigation",{name:"통합 운영 실습 단계"}).getByRole("button",{name:"학교 설정",exact:true}).click();
 const hub=page.locator(".school-settings-hub");
 const nav=hub.getByRole("navigation",{name:"학교 설정 분류"});
 const body=hub.locator(".settings-hub-content");
 await expect(nav).toBeVisible();
 await expect(nav.getByRole("link")).toHaveCount(4);
 if(width<768){
  await expect(body).toBeHidden();
  await expect(nav.getByRole("link")).toHaveCount(4);
  await nav.getByRole("link",{name:/학교 정보/}).click();
  await expect(nav).toBeHidden();
  await expect(body).toBeVisible();
  await expect(hub.getByLabel("학교급",{exact:true})).toBeVisible();
  await hub.getByRole("link",{name:"학교 설정",exact:true}).click();
  await expect(nav).toBeVisible();
  await expect(body).toBeHidden();
  await page.goBack();
  await expect(hub.getByLabel("학교급",{exact:true})).toBeVisible();
  await page.goBack();
  await expect(nav).toBeVisible();
  await nav.getByRole("link",{name:/학교 운영/}).click();
  await expect(body.getByRole("heading",{name:"학교 운영",exact:true})).toBeVisible();
  await expect(hub.getByLabel("1학년 학급 수")).toBeVisible();
  await expect(hub.getByLabel("학교급",{exact:true})).toBeHidden();
  await hub.getByRole("link",{name:"학교 설정",exact:true}).click();
  await nav.getByRole("link",{name:/학교 정보/}).click();
  await expect(body.getByRole("heading",{name:"학교 정보",exact:true})).toBeVisible();
  await expect(hub.locator("#school-information")).toBeVisible();
  await expect(hub.locator("#school-links")).toBeVisible();
 }else{
  await expect(body).toBeVisible();
  await expect(hub.getByLabel("학교급",{exact:true})).toBeVisible();
  await nav.getByRole("link",{name:/학교 운영/}).click();
  await expect(nav).toBeVisible();
  await expect(hub.getByLabel("1학년 학급 수")).toBeVisible();
 }
});

for(const width of [320,390,430,1440])test(`external settings search remains usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("navigation",{name:"통합 운영 실습 단계"}).getByRole("button",{name:"학교 설정",exact:true}).click();
 const hub=page.locator(".school-settings-hub");
 await hub.getByRole("link",{name:/학교 정보/}).click();
 const connection=hub.locator("#school-information");
 const toggle=connection.locator(".school-neis-search-toggle");
 const input=connection.getByLabel("나이스 학교명",{exact:true});
 if(await toggle.count()){
   await expect(input).toBeHidden();
   await toggle.click();
   await expect(input).toBeVisible();
 }else await expect(input).toBeVisible();
 const form=connection.locator(".school-neis-search-form");
 const bounds=await form.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));
 expect(bounds.scroll).toBeLessThanOrEqual(bounds.client+1);
 await expect(connection.getByRole("button",{name:"학교 검색"})).toBeVisible();
 await expect(hub.getByRole("button",{name:"바로가기 추가"})).toBeVisible();
});

for(const width of [390,1440])test(`legacy settings anchors retain correct category at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("navigation",{name:"통합 운영 실습 단계"}).getByRole("button",{name:"학교 설정",exact:true}).click();
 const hub=page.locator(".school-settings-hub");
 for(const [hash,title,target] of [["#school-links","학교 정보","#school-links"],["#school-information","학교 정보","#school-information"],["#settings-connections","학교 정보","#settings-connections"],["#settings-year","학교 운영","#settings-year"],["#settings-overview","시스템 관리","#settings-overview"]]){
  await page.evaluate(hash=>{location.hash=hash},hash);
  await expect(hub.locator(".settings-hub-heading h2")).toHaveText(title);
  await expect(hub.locator(target)).toBeVisible();
 }
});

for(const width of [320,390,1440])test(`academic year management shows the selected year and scoped class settings at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("navigation",{name:"통합 운영 실습 단계"}).getByRole("button",{name:"학교 설정",exact:true}).click();
 const hub=page.locator(".school-settings-hub");
 await hub.getByRole("link",{name:/학교 운영/}).click();
 const selector=hub.getByLabel("관리할 학년도",{exact:true});
 await expect(selector).toBeVisible();
 const year=await selector.inputValue();
 await expect(hub.locator(".academic-year-settings")).toHaveAttribute("data-edit-year",year);
 await expect(hub.locator(".academic-year-range")).toContainText(year+". 3. 1.");
 await expect(hub.getByRole("button",{name:"학급 구성 저장"})).toBeVisible();
 await expect(hub.getByRole("heading",{name:"이전 학년도 자료 가져오기"})).toBeVisible();
 await expect(hub.getByRole("link",{name:/학기·방학·수업일/})).toHaveAttribute("href",new RegExp("year="+year+"&view=manage"));
 const controls=hub.locator(".academic-year-selector");
 expect(await controls.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
});
