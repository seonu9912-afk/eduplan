import { test, expect, type Page } from "@playwright/test";
import { Workbook } from "exceljs";
import { curriculumPreviewContext, readCurriculumPreview } from "../../src/app/recovery-preview/curriculum-fixture";

async function openHours(page:Page){
  await page.getByRole("button",{name:/^2\. 시수 배당/}).click();
  await expect(page.getByRole("textbox",{name:/국어 1학년 1학기/,exact:false})).toBeVisible();
}

// This route only exists in Preview/local rehearsal mode and uses synthetic
// browser storage. Never authenticate against or write to a school backend.
test.beforeEach(async({page,context})=>{
  const saved=Object.fromEntries((["초등학교","중학교","고등학교"] as const).map(school=>{
    const c=curriculumPreviewContext(school);
    return [school,{...readCurriculumPreview(c,null),planVersion:3,documentVersion:2}];
  }));
  await context.addInitScript(seeds=>{
    for(const [school,document] of Object.entries(seeds)){
      const key="eduplan-curriculum-rehearsal-v1:"+school;
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(document));
    }
  },saved);
  await page.goto("/recovery-preview/curriculum");
  await expect(page.getByRole("heading",{name:"교육과정 편성 실습"})).toBeVisible();
  await openHours(page);
});
test("term weeks, direct totals, clipboard and reload keep the same values",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  const first=page.getByRole("textbox",{name:"국어 1학년 1학기 주당 시수",exact:true});
  await first.fill("4");await first.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"학기별 수업 주수 변경 (필요할 때만)",exact:true}).click();
  await page.locator(".cv2-weeks label").first().locator("select").first().selectOption("17");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"학기시수 보기·조정",exact:true}).click();
  const total=page.getByRole("textbox",{name:"국어 1학년 1학기 최종 시수",exact:true});
  await expect(total).toHaveValue("68");
  await total.fill("55");await total.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.reload();await openHours(page);
  await expect(first).toHaveValue("4");
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
  await page.reload();await openHours(page);
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
  await input.fill("5");await input.press("Tab");
  await expect(page.locator(".cv2-errors")).toContainText("입력 내용은 유지됩니다");
  await expect(input).toHaveValue("5");
  await page.getByRole("button",{name:"저장",exact:true}).click();
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.reload();await openHours(page);await expect(input).toHaveValue("5");
});
test("edits made while saving are saved in the next revision",async({page})=>{
  const one=page.getByRole("textbox",{name:"국어 1학년 1학기 주당 시수",exact:true});
  const two=page.getByRole("textbox",{name:"국어 1학년 2학기 주당 시수",exact:true});
  await one.fill("4");await one.press("Tab");
  await page.getByRole("button",{name:"저장",exact:true}).click();
  await two.fill("5");await two.press("Tab");
  await expect.poll(()=>page.evaluate(()=>{
    const doc=JSON.parse(localStorage.getItem("eduplan-curriculum-rehearsal-v1:중학교")||"{}").document;
    return doc?.cells.filter((c:{subjectId:string;grade:number})=>c.grade===1&&c.subjectId==="d1500000-0000-4000-8000-000000000033").map((c:{weekly:number})=>c.weekly);
  })).toEqual([4,5]);
  await page.reload();await openHours(page);await expect(one).toHaveValue("4");await expect(two).toHaveValue("5");
});
test("elementary grade six and high-school credits remain editable without middle-school checks",async({page})=>{
  await page.getByLabel("실습 학교급").selectOption("초등학교");await openHours(page);
  const sixth=page.getByRole("textbox",{name:"국어 6학년 2학기 주당 시수",exact:true});
  await sixth.fill("2");await sixth.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await expect(page.getByRole("button",{name:"국가 기준 비교",exact:true})).toHaveCount(0);
  await expect(sixth).toHaveValue("2");
  await expect(page.getByRole("textbox",{name:"실과 6학년 2학기 주당 시수",exact:true})).toBeVisible();
  await page.getByLabel("실습 학교급").selectOption("고등학교");await openHours(page);
  const credits=page.getByRole("textbox",{name:"국어 1학년 1학기 학점",exact:true});
  await credits.fill("5");await credits.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await expect(credits).toHaveValue("5");
  await expect(page.getByRole("textbox",{name:"통합과학 1학년 1학기 학점",exact:true})).toHaveValue("4");
  await expect(page.getByRole("button",{name:"주당시수 편집",exact:true})).toHaveCount(0);
  await expect(page.locator(".cv5-weeks-settings")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"국가 기준 비교",exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(credits).toBeVisible();
  await page.screenshot({path:".artifacts/curriculum-high-mobile.png",fullPage:true});
});

test("a stale tab retains its edits and requires consent before discarding them",async({page,context})=>{
  const second=await context.newPage();
  await second.goto("/recovery-preview/curriculum");await openHours(second);
  const name="국어 1학년 1학기 주당 시수";
  await expect(second.getByRole("textbox",{name,exact:true})).toHaveValue("3");
  await page.getByRole("textbox",{name,exact:true}).fill("4");
  await page.getByRole("textbox",{name,exact:true}).press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await second.getByRole("textbox",{name,exact:true}).fill("5");
  await second.getByRole("textbox",{name,exact:true}).press("Tab");
  await expect(second.locator(".cv2-errors")).toContainText("다른 창");
  await expect(second.getByRole("textbox",{name,exact:true})).toHaveValue("5");
  second.once("dialog",dialog=>dialog.dismiss());
  await second.getByRole("button",{name:"최신 저장본 다시 불러오기",exact:true}).click();
  await expect(second.getByRole("textbox",{name,exact:true})).toHaveValue("5");
  second.once("dialog",dialog=>dialog.accept());
  await second.getByRole("button",{name:"최신 저장본 다시 불러오기",exact:true}).click();
  await expect(second.getByRole("textbox",{name,exact:true})).toHaveValue("4");
  await second.close();
});

test("the full school curriculum remains editable and appears in the Excel download",async({page})=>{
  for(const subject of ["국어","사회","역사","도덕","수학","과학","기술·가정","정보","체육","음악","미술","영어","합창실기","노작원예"]){
    await expect(page.getByRole("textbox",{name:subject+" 1학년 1학기 주당 시수",exact:true})).toBeVisible();
  }
  await expect(page.getByRole("textbox",{name:"학교스포츠클럽 1학년 1학기 주당 시수",exact:true})).toHaveValue("1");
  const science=page.getByRole("textbox",{name:"과학 2학년 1학기 주당 시수",exact:true});
  await science.fill("5");await science.press("Tab");
  await expect(page.getByText("자동 저장 완료",{exact:false})).toBeVisible();
  await page.reload();await openHours(page);await expect(science).toHaveValue("5");
  await page.getByRole("button",{name:"교육과정표 보기",exact:true}).click();
  const downloaded=page.waitForEvent("download");
  await page.getByRole("button",{name:"현대화 엑셀",exact:true}).click();
  const path=await (await downloaded).path();
  const workbook=new Workbook();await workbook.xlsx.readFile(path!);
  const sheet=workbook.getWorksheet("학기별 시수")!;
  const names=sheet.getColumn(2).values;
  for(const name of ["사회","과학","체육","영어","합창실기","학교스포츠클럽"])
    expect(names).toContain(name);
  const scienceRow=names.indexOf("과학");
  expect(sheet.getCell(scienceRow,11).value).toBe(5);
  expect(sheet.getCell(scienceRow,14).value).toBe(80);
});
