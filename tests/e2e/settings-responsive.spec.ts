import { test, expect } from "@playwright/test";
for(const width of [320,390,430,1440])test(`school settings navigation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("navigation",{name:"통합 운영 실습 단계"}).getByRole("button",{name:"학교 설정",exact:true}).click();
 const hub=page.locator(".school-settings-hub");
 const nav=hub.getByRole("navigation",{name:"학교 설정 분류"});
 const body=hub.locator(".settings-hub-content");
 await expect(nav).toBeVisible();
 if(width<768){
  await expect(body).toBeHidden();
  await expect(nav.getByRole("link")).toHaveCount(7);
  await nav.getByRole("link",{name:/학교 기본 정보/}).click();
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
  await nav.getByRole("link",{name:/학년도 관리/}).click();
  await expect(body.getByRole("heading",{name:"학년도 관리",exact:true})).toBeVisible();
  await expect(hub.getByLabel("1학년 학급 수")).toBeVisible();
  await expect(hub.getByLabel("학교급",{exact:true})).toBeHidden();
  await hub.getByRole("link",{name:"학교 설정",exact:true}).click();
  await nav.getByRole("link",{name:/외부 서비스 연동/}).click();
  await expect(body.getByRole("heading",{name:"외부 서비스 연동",exact:true})).toBeVisible();
 }else{
  await expect(body).toBeVisible();
  await expect(hub.getByLabel("학교급",{exact:true})).toBeVisible();
  await nav.getByRole("link",{name:/학년도 관리/}).click();
  await expect(nav).toBeVisible();
  await expect(hub.getByLabel("1학년 학급 수")).toBeVisible();
 }
});

for(const width of [320,390,430,1440])test(`external settings search remains usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("navigation",{name:"통합 운영 실습 단계"}).getByRole("button",{name:"학교 설정",exact:true}).click();
 const hub=page.locator(".school-settings-hub");
 await hub.getByRole("link",{name:/외부 서비스 연동/}).click();
 const connection=hub.locator("#school-information");
 const toggle=connection.locator(".school-neis-search-toggle");
 const input=connection.getByLabel("나이스 학교명",{exact:true});
 if(width<768 && await toggle.count()){
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
