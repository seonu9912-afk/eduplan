import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
test.use({ actionTimeout: 25_000 });
const fixtures = JSON.parse(readFileSync(".test-secrets.json", "utf8")) as {
  users: { role: string; email: string; password: string }[];
};
const admin = fixtures.users.find((u) => u.role === "admin")!;
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(admin.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(admin.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/[^/]+\/home/);
}
const tab = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "수업·평가 보기" })
    .getByRole("button", { name, exact: true })
    .click();
async function save(page: Page) {
  await page.getByRole("button", { name: "계획 저장", exact: true }).click();
  await expect(page.locator(".plan-savebar")).toContainText("저장 완료");
  await expect(
    page.getByRole("button", { name: "계획 저장", exact: true }),
  ).toBeDisabled();
}
async function openPlan(page: Page) {
  await tab(page, "교수학습계획");
  await expect(page.locator(".plan-savebar")).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("teaching lifecycle: shared classes, standards, weighted/free-semester, history, copy, mobile and separate PDFs", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await login(page);
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("학교명", { exact: true })
    .fill(`수업검증 중학교 ${Date.now()}`);
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/app\/[^/]+\/settings/);
  const schoolId = new URL(page.url()).pathname.split("/")[2];
  await page.getByLabel("개설할 학년도", { exact: true }).fill("2026");
  await page.getByLabel("2학년 학급 수").fill("2");
  await page.getByRole("button", { name: "학년도 설정 저장" }).click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2026");
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await page.getByRole("button", { name: "새 수업 설정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("수업 학년", { exact: true }).selectOption("2");
  await dialog.getByLabel("수업 과목명", { exact: true }).fill("국어");
  await dialog.getByLabel("기준 차시 (선택)", { exact: true }).fill("34");
  await dialog.getByLabel("2학년 1반", { exact: true }).check();
  await dialog.getByLabel("2학년 2반", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "수업 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".course-picker")).toContainText(
    "2학년 1반, 2학년 2반",
  );
  await page.getByRole("button", { name: "첫 수업 추가", exact: true }).click();
  await page.getByLabel("1번 단원명", { exact: true }).fill("의사소통과 표현");
  await page
    .getByLabel("1번 교수학습 내용", { exact: true })
    .fill("검증용 학습 내용: 다양한 관점을 비교하고 자신의 생각을 표현한다.");
  await page.getByLabel("1번 단원 시기", { exact: true }).fill("3~4월");
  await page.getByLabel("1번 배당 차시", { exact: true }).fill("34");
  await page.getByLabel("수업 운영 주당 시수", { exact: true }).fill("4");
  await page.getByLabel("1번 단원 월", { exact: true }).fill("3");
  await page.getByLabel("1번 단원 주", { exact: true }).fill("1");
  await page.getByLabel("1번 단원 일", { exact: true }).fill("2~6");
  await page.getByLabel("1번 평가 방법", { exact: true }).fill("동료평가");
  await page
    .getByRole("button", { name: "1번 단원 성취기준 선택", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "성취기준 직접 등록", exact: true })
    .click();
  await dialog
    .getByLabel("성취기준 코드", { exact: true })
    .fill("TEST-ONLY-2026");
  await dialog
    .getByLabel("성취기준 내용", { exact: true })
    .fill("공식 성취기준이 아닌 저장 검증용 자료입니다.");
  await dialog
    .getByRole("button", { name: "등록 후 연결", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "선택 완료 (1개)", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "선택 완료 (1개)", exact: true })
    .click();
  // Exercise clone/reorder/delete without losing linked standards.
  await page
    .getByRole("button", { name: "1번 단원 복제", exact: true })
    .click();
  await page.getByLabel("2번 단원명", { exact: true }).fill("복제 단원");
  await page
    .getByRole("button", { name: "2번 단원 위로", exact: true })
    .click();
  await expect(page.getByLabel("1번 단원명", { exact: true })).toHaveValue(
    "복제 단원",
  );
  await page
    .getByRole("button", { name: "1번 단원 삭제", exact: true })
    .click();
  await page.getByLabel("수업 학년 필터", { exact: true }).selectOption("2");
  await save(page);
  await tab(page, "평가계획");
  await expect(page.getByLabel("수업 학년 필터", { exact: true })).toHaveValue(
    "2",
  );
  await page
    .getByText("평가 운영 기준 · 학교 제출 항목", { exact: true })
    .click();
  await page
    .getByLabel("평가의 목적", { exact: true })
    .fill("실제 문서 출력 검증 목적");
  await page
    .getByLabel("평가의 기본 방향", { exact: true })
    .fill("과정 중심 평가");
  await page
    .getByLabel("평가 방침 및 유의사항", { exact: true })
    .fill("학교 규정에 따른 평가");
  await page
    .getByLabel("미응시자·학적변동자 처리", { exact: true })
    .fill("별도 평가 기회 제공");
  await page
    .getByRole("button", { name: "기준 성취율 추가", exact: true })
    .click();
  await page.getByLabel("기준 성취율 1 성취도", { exact: true }).fill("A");
  await page
    .getByLabel("기준 성취율 1 성취율 범위", { exact: true })
    .fill("90% 이상");
  await page
    .getByRole("button", { name: "학기 단위 성취수준 추가", exact: true })
    .click();
  await page
    .getByLabel("학기 단위 성취수준 1 수준", { exact: true })
    .fill("상");
  await page
    .getByLabel("학기 단위 성취수준 1 내용", { exact: true })
    .fill("다양한 관점을 논리적으로 비교한다.");
  await page.getByRole("button", { name: "첫 평가 추가", exact: true }).click();
  await page.getByLabel("1번 평가명", { exact: true }).fill("발표 수행평가");
  await page
    .getByText("세부 운영 · 평가 유형·역량·성취수준", { exact: true })
    .click();
  await page.getByLabel("1번 평가 평가 차시", { exact: true }).fill("3");
  await page
    .getByLabel("1번 평가 교과 역량", { exact: true })
    .fill("의사소통·협업");
  await page
    .getByLabel("1번 평가 평가 유형 상세", { exact: true })
    .fill("발표·자기평가");
  await page
    .getByRole("button", {
      name: "1번 평가 성취기준별 성취수준 추가",
      exact: true,
    })
    .click();
  await page
    .getByLabel(
      "1번 평가 성취기준별 성취수준 1 수준 (기존 코드 표기 유지 가능)",
      {
        exact: true,
      },
    )
    .fill("TEST-ONLY-2026 상");
  await page
    .getByLabel("1번 평가 성취기준별 성취수준 1 내용", { exact: true })
    .fill("근거를 들어 발표한다.");
  await page
    .getByLabel("1번 평가 요소", { exact: true })
    .fill("검증용 표현 요소");
  await page.getByLabel("1번 평가 방법", { exact: true }).fill("발표 및 관찰");
  await page.getByLabel("1번 평가 시기", { exact: true }).fill("4월");
  await page.getByLabel("1번 반영비율", { exact: true }).fill("100");
  await page.getByLabel("1번 영역 배점", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "1번 평가 성취기준 선택", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "선택 완료 (1개)", exact: true })
    .click();
  await page
    .getByLabel("1번 평가 성취기준별 성취수준 1 연결 기준", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "평가 요소 추가", exact: true })
    .click();
  await page
    .getByLabel("1번 평가 1번 평가 요소명", { exact: true })
    .fill("표현");
  await page.getByLabel("1번 평가 1번 요소 배점", { exact: true }).fill("100");
  for (let n = 1; n <= 2; n++) {
    await page
      .getByRole("button", { name: "+ 평정수준 추가", exact: true })
      .click();
    await page
      .getByLabel(`1번 평가 요소1 단계${n} 수준`, { exact: true })
      .fill(n === 1 ? "충족" : "보완");
    await page
      .getByLabel(`1번 평가 요소1 단계${n} 기준`, { exact: true })
      .fill(n === 1 ? "검증용 기준을 충족한다." : "피드백에 따라 보완한다.");
    await page
      .getByLabel(`1번 평가 요소1 단계${n} 점수`, { exact: true })
      .fill(n === 1 ? "100" : "60");
  }
  await save(page);
  await tab(page, "검토·출력");
  await expect(page.locator(".review-issues")).toContainText(
    "연결된 수업이 없습니다",
  );
  await page.getByText("학교별 출력 서식 설정", { exact: true }).click();
  await page.getByLabel("서식 이름", { exact: true }).fill("검증 학교 서식");

  await page
    .getByLabel("content 열 이름", { exact: true })
    .fill("우리 학교 평가요소");
  await page
    .getByLabel("purpose 항목 제목", { exact: true })
    .fill("Ⅰ. 우리 학교 평가 목적");
  await save(page);
  await page.reload();
  await tab(page, "검토·출력");
  await page.getByText("학교별 출력 서식 설정", { exact: true }).click();
  await expect(page.getByLabel("서식 이름", { exact: true })).toHaveValue(
    "검증 학교 서식",
  );
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "HWPX 다운로드", exact: true })
    .click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toMatch(/\.hwpx$/);
  await downloaded.saveAs(".artifacts/teaching-browser-export.hwpx");
  const archive = await JSZip.loadAsync(
    readFileSync(".artifacts/teaching-browser-export.hwpx"),
  );
  const exportedText = await archive
    .file("Preview/PrvText.txt")!
    .async("string");
  for (const expected of [
    "우리 학교 평가요소",
    "Ⅰ. 우리 학교 평가 목적",
    "실제 문서 출력 검증 목적",
    "별도 평가 기회 제공",
    "근거를 들어 발표한다.",
    "의사소통·협업",
    "최하점 합계: 60점",
  ])
    expect(exportedText).toContain(expected);
  expect(exportedText).not.toContain("미저장 초안");
  await page.screenshot({
    path: ".artifacts/teaching-review-desktop.png",
    fullPage: true,
  });
  // Browser print hook retains the real print-mode selection; PDF uses print CSS.
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page
    .getByRole("button", { name: "교수학습계획 인쇄", exact: true })
    .click();
  await page.pdf({
    path: ".artifacts/teaching-lesson.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page
    .getByRole("button", { name: "평가계획 인쇄", exact: true })
    .click();
  await page.pdf({
    path: ".artifacts/teaching-assessment.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.evaluate(() => dispatchEvent(new Event("afterprint")));
  await tab(page, "평가계획");
  await page
    .getByRole("button", { name: "1번 평가 복제", exact: true })
    .click();
  await page
    .getByLabel("2번 평가 유형", { exact: true })
    .selectOption("정기시험");
  await page.getByLabel("2번 평가명", { exact: true }).fill("정기시험");
  await page.getByLabel("1번 반영비율", { exact: true }).fill("60");
  await page.getByLabel("2번 반영비율", { exact: true }).fill("40");
  await save(page);
  await expect(page.locator(".ratio-summary")).toContainText("합계 100%");
  await page.getByLabel("2번 반영비율", { exact: true }).fill("30");
  await save(page);
  await tab(page, "검토·출력");
  await expect(page.locator(".review-issues")).toContainText(
    "반영비율 합계 90%",
  );
  await tab(page, "평가계획");
  await page
    .getByLabel("평가 운영 방식", { exact: true })
    .selectOption("descriptive");
  await expect(page.getByLabel("1번 반영비율", { exact: true })).toHaveCount(0);
  await save(page);
  await page.reload();
  await openPlan(page);
  await expect(page.getByLabel("1번 단원명", { exact: true })).toHaveValue(
    "의사소통과 표현",
  );
  await tab(page, "평가계획");
  await expect(page.getByLabel("평가의 목적", { exact: true })).toHaveValue(
    "실제 문서 출력 검증 목적",
  );
  await expect(page.getByLabel("평가 운영 방식", { exact: true })).toHaveValue(
    "descriptive",
  );
  await expect(
    page.getByLabel("1번 평가 요소1 단계2 기준", { exact: true }),
  ).toHaveValue("피드백에 따라 보완한다.");
  await tab(page, "교수학습계획");
  await page
    .getByLabel("교수학습계획 상태", { exact: true })
    .selectOption("확정");
  await save(page);
  const revision = (await page.locator(".plan-savebar").innerText()).match(
    /v(\d+)/,
  )![1];
  await page.getByLabel("1번 단원명", { exact: true }).fill("수정된 단원");
  await expect(
    page.getByLabel("교수학습계획 상태", { exact: true }),
  ).toHaveValue("작성 중");
  await save(page);
  await tab(page, "검토·출력");
  await page
    .getByRole("button", { name: "변경 이력 불러오기", exact: true })
    .click();
  const row = page
    .locator(".teaching-history li")
    .filter({ hasText: `v${revision} ·` });
  await row
    .getByRole("button", { name: `v${revision} 복원`, exact: true })
    .click();
  await expect(page.locator(".plan-savebar")).toContainText("저장 완료");
  await tab(page, "교수학습계획");
  await expect(page.getByLabel("1번 단원명", { exact: true })).toHaveValue(
    "의사소통과 표현",
  );
  await expect(
    page.getByLabel("교수학습계획 상태", { exact: true }),
  ).toHaveValue("작성 중");
  // Reload/re-login exercises actual Supabase persistence, not client state.
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await login(page);
  await page.getByLabel("작업공간 선택").selectOption(schoolId);
  await expect(
    page.getByRole("link", { name: "수업·평가", exact: true }),
  ).toHaveAttribute("href", new RegExp(`/app/${schoolId}/teaching`));
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await openPlan(page);
  await expect(page.getByLabel("1번 배당 차시", { exact: true })).toHaveValue(
    "34",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({
    path: ".artifacts/teaching-lesson-mobile.png",
    fullPage: true,
  });
  await tab(page, "평가계획");
  await noOverflow(page);
  const summaryBox = await page.locator(".ratio-summary").boundingBox();
  expect(summaryBox!.width).toBeGreaterThan(260);
  expect(summaryBox!.height).toBeLessThan(150);
  await page.screenshot({
    path: ".artifacts/teaching-assessment-mobile.png",
    fullPage: true,
  });
  await tab(page, "검토·출력");
  await page.getByText("학교별 출력 서식 설정", { exact: true }).click();
  await noOverflow(page);
  await page.screenshot({
    path: ".artifacts/teaching-format-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "새 수업 설정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("수업 학년", { exact: true }).selectOption("2");
  await dialog.getByLabel("수업 과목명", { exact: true }).fill("국어 복사");
  const copyId = await dialog
    .getByLabel("기존 계획 복사 (선택)", { exact: true })
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await dialog
    .getByLabel("기존 계획 복사 (선택)", { exact: true })
    .selectOption(copyId!);
  await dialog
    .getByRole("button", { name: "수업 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("1번 단원명", { exact: true })).toHaveValue(
    "의사소통과 표현",
  );
  await tab(page, "수업 현황");
  await expect(page.locator(".course-card")).toHaveCount(2);
  await page.screenshot({
    path: ".artifacts/teaching-overview-desktop.png",
    fullPage: true,
  });
  writeFileSync(
    ".artifacts/teaching-context.json",
    JSON.stringify({ schoolId, subject: "국어", revision }),
  );
  await page.getByRole("link", { name: "학사운영", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "행사 일정", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "교과군·과목 설정", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("curriculum references require acknowledgement; annual semesters, failed saves, conflicts and workspace/year isolation", async ({
  page,
  context,
}) => {
  test.setTimeout(360_000);
  page.on("dialog", (d) => d.accept());
  await login(page);
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("학교명", { exact: true })
    .fill(`연동 검증 학교 ${Date.now()}`);
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/app\/[^/]+\/settings/);
  const schoolId = new URL(page.url()).pathname.split("/")[2];
  await page.getByLabel("개설할 학년도", { exact: true }).fill("2026");
  await page.getByLabel("2학년 학급 수").fill("2");
  await page.getByRole("button", { name: "학년도 설정 저장" }).click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2026");
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  await page
    .getByRole("tab", { name: "교과군·과목 설정", exact: true })
    .click();
  await page.getByLabel("교과군 이름").fill("연동 검증군");
  await page.getByRole("button", { name: "추가", exact: true }).first().click();
  await expect(page.getByLabel("교과군", { exact: true })).toContainText(
    "연동 검증군",
  );
  await page
    .getByLabel("교과군", { exact: true })
    .selectOption({ label: "연동 검증군" });
  await page.getByLabel("과목명", { exact: true }).fill("연동 국어");
  await page.getByRole("button", { name: "추가", exact: true }).last().click();
  await expect(
    page.getByRole("button", { name: "연동 국어 과목 삭제", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "편성표 만들기", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("입학년도", { exact: true }).fill("2025");
  await dialog
    .getByRole("button", { name: "편성표 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByLabel("연동 국어 2학년 1학기 시수", { exact: true })
    .fill("68");
  await page
    .getByLabel("연동 국어 2학년 2학기 시수", { exact: true })
    .fill("68");
  await page.getByRole("button", { name: "편성표 저장", exact: true }).click();
  await expect(page.getByText("모든 변경사항 저장됨")).toBeVisible();
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await page.getByRole("button", { name: "새 수업 설정", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("수업 학년", { exact: true }).selectOption("2");
  await dialog.getByLabel("수업 기간", { exact: true }).selectOption("0");
  await dialog
    .getByLabel("연결 과목", { exact: true })
    .selectOption({ label: "연동 국어" });
  await expect(dialog).toContainText("편성 기준 136시간");
  await expect(
    dialog.getByLabel("기준 차시 (선택)", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel("2학년 1반", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "수업 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "첫 수업 추가", exact: true }).click();
  await page.getByLabel("1번 단원명", { exact: true }).fill("연간 공통 단원");
  await page
    .getByLabel("1번 교수학습 내용", { exact: true })
    .fill("교사 작성 내용 보존");
  await page.getByLabel("1번 배당 차시", { exact: true }).fill("34");
  await save(page);
  await tab(page, "평가계획");
  await page.getByRole("button", { name: "첫 평가 추가", exact: true }).click();
  await page.getByLabel("1번 평가명", { exact: true }).fill("1학기 평가");
  await page
    .getByLabel("평가 운영 방식", { exact: true })
    .selectOption("descriptive");
  await page.getByLabel("평가 학기", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "첫 평가 추가", exact: true }).click();
  await page.getByLabel("1번 평가명", { exact: true }).fill("2학기 평가");
  await page
    .getByLabel("평가 운영 방식", { exact: true })
    .selectOption("descriptive");
  await save(page);
  await expect(page.getByLabel("평가 학기", { exact: true })).toHaveValue("2");
  await page.getByLabel("평가 학기", { exact: true }).selectOption("1");
  await expect(page.getByLabel("1번 평가명", { exact: true })).toHaveValue(
    "1학기 평가",
  );
  // Edit the source through its existing UI; the teaching document stays intact.
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  await page.getByLabel("입학년도", { exact: true }).selectOption("2025");
  await page
    .getByLabel("연동 국어 2학년 1학기 시수", { exact: true })
    .fill("70");
  await page.getByRole("button", { name: "편성표 저장", exact: true }).click();
  await expect(page.getByText("모든 변경사항 저장됨")).toBeVisible();
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await openPlan(page);
  await expect(page.locator(".teaching-reference summary")).toContainText(
    "원본 변경 확인 필요",
  );
  await page.locator(".teaching-reference summary").click();
  await expect(page.locator(".reference-content")).toContainText("136 → 138");
  await page
    .getByRole("button", { name: "변경 확인 후 기준 갱신", exact: true })
    .click();
  await expect(page.locator(".reference-content")).toContainText(
    "적용한 기준: 138차시",
  );
  await expect(page.getByLabel("1번 배당 차시", { exact: true })).toHaveValue(
    "34",
  );
  // Network failure must retain unsaved values and allow retry.
  await page
    .getByLabel("1번 비고", { exact: true })
    .fill("연결 실패 후에도 유지");
  await page.route("**/teaching*", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await page.getByRole("button", { name: "계획 저장", exact: true }).click();
  await expect(page.locator(".plan-savebar")).toContainText("저장 실패");
  await expect(page.getByLabel("1번 비고", { exact: true })).toHaveValue(
    "연결 실패 후에도 유지",
  );
  await page.unroute("**/teaching*");
  await save(page);
  // Same plan in two tabs: a stale editor may not overwrite a newer revision.
  const other = await context.newPage();
  other.on("dialog", (d) => d.accept());
  await other.goto(page.url());
  await openPlan(other);
  await page
    .getByLabel("1번 비고", { exact: true })
    .fill("이 탭의 미저장 입력");
  await other
    .getByLabel("1번 비고", { exact: true })
    .fill("다른 탭의 최신 저장");
  await save(other);
  await page.getByRole("button", { name: "계획 저장", exact: true }).click();
  await expect(page.locator(".plan-savebar")).toContainText("저장 실패");
  await expect(page.getByLabel("1번 비고", { exact: true })).toHaveValue(
    "이 탭의 미저장 입력",
  );
  await page.reload();
  await openPlan(page);
  await expect(page.getByLabel("1번 비고", { exact: true })).toHaveValue(
    "다른 탭의 최신 저장",
  );
  await other.close();
  // A different academic year and the personal workspace start without this course.
  await page.goto(`/app/${schoolId}/settings?year=2026`);
  await page
    .getByRole("button", { name: "새 학년도 개설", exact: true })
    .click();
  await page.getByLabel("개설할 학년도", { exact: true }).fill("2027");
  await page.getByRole("button", { name: "학년도 설정 저장" }).click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2027");
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await expect(page.locator(".course-card")).toHaveCount(0);
  await page.getByLabel("수업 학년도", { exact: true }).selectOption("2026");
  await expect(page.locator(".course-card")).toHaveCount(1);
  const personal = page
    .getByLabel("작업공간 선택")
    .locator("option")
    .filter({ hasText: "내 작업공간" });
  const personalId = await personal.getAttribute("value");
  await page.getByLabel("작업공간 선택").selectOption(personalId!);
  await expect(
    page.getByRole("link", { name: "수업·평가", exact: true }),
  ).toHaveAttribute("href", new RegExp(`/app/${personalId}/teaching`));
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await expect(page.locator(".course-card")).toHaveCount(0);
});
