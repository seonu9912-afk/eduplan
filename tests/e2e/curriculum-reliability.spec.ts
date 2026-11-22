import { test, expect } from "@playwright/test";

// This route only exists in Preview/local rehearsal mode and uses synthetic
// browser storage. Never authenticate against or write to a school backend.
test.beforeEach(async({page})=>{
  await page.goto("/recovery-preview/curriculum");
  await expect(page.getByRole("heading",{name:"교육과정 편성 실습"})).toBeVisible();
});
test("term weeks, direct totals, clipboard and reload keep the same values",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  const first=page.getByRole("textbox",{name:"국어 1학년 1학기 주당 시수",exact:true});
  await first.fill("3");await first.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.locator(".cv2-weeks label").first().locator("select").first().selectOption("17");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"학기시수 보기·조정",exact:true}).click();
  const total=page.getByRole("textbox",{name:"국어 1학년 1학기 최종 시수",exact:true});
  await expect(total).toHaveValue("51");
  await total.fill("55");await total.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.reload();
  await expect(first).toHaveValue("3");
  await page.getByRole("button",{name:"학기시수 보기·조정",exact:true}).click();
  await expect(total).toHaveValue("55");
  await total.fill("99");await total.press("Escape");
  await expect(total).toHaveValue("55");
  await total.focus();
  await total.evaluate(element=>{
    const data=new DataTransfer();data.setData("text/plain","60\t");
    element.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));
  });
  await expect(total).toHaveValue("60");
  await expect(page.getByRole("textbox",{name:"국어 1학년 2학기 최종 시수",exact:true})).toHaveValue("0");
  await total.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:"학기시수 보기·조정",exact:true}).click();
  await expect(total).toHaveValue("60");
  expect(errors).toEqual([]);
});
test("failed saves retain edits and allow retry",async({page})=>{
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key.startsWith("eduplan-curriculum-rehearsal")){
        Storage.prototype.setItem=original;
        throw new Error("simulated storage failure");
      }
      return original.call(this,key,value);
    };
  });
  const input=page.getByRole("textbox",{name:"국어 1학년 1학기 주당 시수",exact:true});
  await input.fill("4");await input.press("Tab");
  await expect(page.locator(".cv2-errors")).toContainText("입력 내용은 유지됩니다");
  await expect(input).toHaveValue("4");
  await page.getByRole("button",{name:"저장",exact:true}).click();
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.reload();await expect(input).toHaveValue("4");
});
test("edits made while saving are saved in the next revision",async({page})=>{
  const one=page.getByRole("textbox",{name:"국어 1학년 1학기 주당 시수",exact:true});
  const two=page.getByRole("textbox",{name:"국어 1학년 2학기 주당 시수",exact:true});
  await one.fill("3");await one.press("Tab");
  await page.getByRole("button",{name:"저장",exact:true}).click();
  await two.fill("4");await two.press("Tab");
  await expect.poll(()=>page.evaluate(()=>{
    const doc=JSON.parse(localStorage.getItem("eduplan-curriculum-rehearsal-v1:중학교")||"{}").document;
    return doc?.cells.filter((c:{grade:number;semester:number;weekly:number})=>c.grade===1).map((c:{weekly:number})=>c.weekly);
  })).toEqual([3,4,0,0]);
  await page.reload();await expect(one).toHaveValue("3");await expect(two).toHaveValue("4");
});
test("elementary grade six and high-school credits remain editable without middle-school checks",async({page})=>{
  await page.getByLabel("실습 학교급").selectOption("초등학교");
  const sixth=page.getByRole("textbox",{name:"국어 6학년 2학기 주당 시수",exact:true});
  await sixth.fill("2");await sixth.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await expect(page.getByRole("button",{name:"국가 기준 비교",exact:true})).toHaveCount(0);
  await expect(page.getByText("6개년 총 32시간",{exact:true})).toBeVisible();
  await page.getByLabel("실습 학교급").selectOption("고등학교");
  const credits=page.getByRole("textbox",{name:"국어 1학년 1학기 학점",exact:true});
  await credits.fill("4");await credits.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await expect(page.getByText("3개년 총 4학점",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"주당시수 편집",exact:true})).toHaveCount(0);
  await expect(page.locator(".cv5-weeks-settings")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"국가 기준 비교",exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(credits).toBeVisible();
  await page.screenshot({path:".artifacts/curriculum-high-mobile.png",fullPage:true});
});

test("a stale tab retains its edits and requires consent before discarding them",async({page,context})=>{
  const second=await context.newPage();
  await second.goto("/recovery-preview/curriculum");
  const name="국어 1학년 1학기 주당 시수";
  await expect(second.getByRole("textbox",{name,exact:true})).toHaveValue("0");
  await page.getByRole("textbox",{name,exact:true}).fill("3");
  await page.getByRole("textbox",{name,exact:true}).press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await second.getByRole("textbox",{name,exact:true}).fill("4");
  await second.getByRole("textbox",{name,exact:true}).press("Tab");
  await expect(second.locator(".cv2-errors")).toContainText("다른 창");
  await expect(second.getByRole("textbox",{name,exact:true})).toHaveValue("4");
  second.once("dialog",dialog=>dialog.dismiss());
  await second.getByRole("button",{name:"최신 저장본 다시 불러오기",exact:true}).click();
  await expect(second.getByRole("textbox",{name,exact:true})).toHaveValue("4");
  second.once("dialog",dialog=>dialog.accept());
  await second.getByRole("button",{name:"최신 저장본 다시 불러오기",exact:true}).click();
  await expect(second.getByRole("textbox",{name,exact:true})).toHaveValue("3");
  await second.close();
});
