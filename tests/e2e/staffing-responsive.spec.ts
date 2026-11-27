import {test,expect} from "@playwright/test";
for(const width of [390,1440])test(`staff directory at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto("/recovery-preview/operations");
 await page.getByRole("button",{name:"교원·수급",exact:true}).click();
 const directory=page.locator(".staffing-directory");
 await expect(directory).toBeVisible();
 const search=directory.getByRole("textbox",{name:"교원 검색"});
 await search.fill("없는이름123");
 await expect(directory.getByText("조건에 맞는 교원이 없습니다.")).toBeVisible();
 await directory.getByRole("button",{name:"초기화",exact:true}).click();
 await expect(search).toHaveValue("");
 if(width<768)await expect(directory.locator(".staffing-person").first()).toBeVisible();
 else await expect(directory.getByRole("table",{name:"학년도별 교원 명부"})).toBeVisible();
});
