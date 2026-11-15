import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({ actionTimeout: 25_000 });
const fixtures = JSON.parse(readFileSync(".test-secrets.json", "utf8")) as {
  users: { role: string; email: string; password: string }[];
};
const admin = fixtures.users.find((u) => u.role === "admin")!;
const tab = (p: Page, name: string) =>
  p
    .getByRole("navigation", { name: "수업·평가 보기" })
    .getByRole("button", { name, exact: true })
    .click();
async function save(p: Page) {
  await p.getByRole("button", { name: "계획 저장", exact: true }).click();
  await expect(p.locator(".plan-savebar")).toContainText("저장 완료");
  await expect(
    p.getByRole("button", { name: "계획 저장", exact: true }),
  ).toBeDisabled();
}
async function fits(p: Page) {
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
}

test("authoring a multiweek reading task: stages, independent criteria, evidence, navigation, history and copy", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(admin.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(admin.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  let modal = page.getByRole("dialog");
  await modal
    .getByLabel("학교명", { exact: true })
    .fill(`작성 흐름 검증 ${Date.now()}`);
  await modal
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await page.getByLabel("개설할 학년도", { exact: true }).fill("2026");
  await page
    .getByRole("button", { name: "학년도 설정 저장", exact: true })
    .click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2026");
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await page.getByRole("button", { name: "새 수업 설정", exact: true }).click();
  modal = page.getByRole("dialog");
  await modal.getByLabel("수업 과목명", { exact: true }).fill("국어 작성 검증");
  await modal.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(modal).not.toBeVisible();
  await page.getByRole("button", { name: "첫 수업 추가", exact: true }).click();
  await page
    .getByRole("button", { name: "1번 단원 성취기준 선택", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal
    .getByRole("button", { name: "성취기준 직접 등록", exact: true })
    .click();
  await modal.getByLabel("성취기준 코드", { exact: true }).fill("TEST-READING");
  await modal
    .getByLabel("성취기준 내용", { exact: true })
    .fill("검증용 기준: 자료의 근거를 비교하고 해석한다. 공식 기준 아님.");
  await modal
    .getByRole("button", { name: "등록 후 연결", exact: true })
    .click();
  await modal
    .getByRole("button", { name: "선택 완료 (1개)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "1번 단원 복제", exact: true })
    .click();
  await page
    .getByRole("button", { name: "2번 단원 복제", exact: true })
    .click();
  for (let n = 1; n <= 3; n++) {
    await page.getByLabel(`${n}번 단원명`, { exact: true }).fill(`독서 ${n}주`);
    await page
      .getByLabel(`${n}번 단원 시기`, { exact: true })
      .fill(`3월 ${n}주`);
    await page
      .getByLabel(`${n}번 교수학습 내용`, { exact: true })
      .fill(
        [
          "자료를 읽고 질문을 만든다.",
          "근거를 비교하여 발표한다.",
          "피드백을 반영해 해석을 수정한다.",
        ][n - 1],
      );
    await page.getByLabel(`${n}번 배당 차시`, { exact: true }).fill("4");
  }
  await page.getByLabel("수업 운영 주당 시수", { exact: true }).fill("4");
  await save(page);
  await tab(page, "평가계획");
  await page.getByRole("button", { name: "첫 평가 추가", exact: true }).click();
  await page.getByLabel("1번 평가명", { exact: true }).fill("독서 프로젝트");
  await page
    .getByLabel("1번 평가 요소", { exact: true })
    .fill("근거 분석과 표현");
  await page
    .getByLabel("1번 평가 방법", { exact: true })
    .fill("기록장·발표·관찰");
  await page.getByLabel("1번 평가 시기", { exact: true }).fill("3월");
  await page.getByLabel("1번 반영비율", { exact: true }).fill("100");
  await page.getByLabel("1번 영역 배점", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "1번 평가 성취기준 선택", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await modal.getByRole("checkbox").check();
  await modal
    .getByRole("button", { name: "선택 완료 (1개)", exact: true })
    .click();
  await page
    .getByLabel("1번 평가 학생 수행 과제", { exact: true })
    .fill("책 속 갈등을 분석하여 대안을 제시하고 친구의 피드백을 반영한다.");
  await page
    .getByLabel("1번 평가 확인할 증거", { exact: true })
    .fill("독서 기록장, 활동지, 발표와 수정 기록");
  const stageNames = ["독서", "활동지", "프로젝트"];
  for (let n = 1; n <= 3; n++) {
    await page
      .getByRole("button", { name: "진행 단계 추가", exact: true })
      .click();
    await page
      .getByLabel(`1번 평가 진행 단계 ${n} 이름`, { exact: true })
      .fill(stageNames[n - 1]);
    await page
      .getByLabel(`1번 평가 진행 단계 ${n} 활동`, { exact: true })
      .fill(`${stageNames[n - 1]}의 근거를 기록한다.`);
  }
  for (let n = 1; n <= 4; n++) {
    await page
      .getByRole("button", { name: "평가 요소 추가", exact: true })
      .click();
    await page
      .getByLabel(`1번 평가 ${n}번 평가 요소명`, { exact: true })
      .fill(["독서 기록", "근거 분석", "참여도", "표현력"][n - 1]);
    await page
      .getByLabel(`1번 평가 ${n}번 요소 배점`, { exact: true })
      .fill("25");
    await page
      .getByLabel(`1번 평가 ${n}번 요소 진행 단계`, { exact: true })
      .selectOption({
        label: `${Math.min(n, 3)}. ${stageNames[Math.min(n - 1, 2)]}`,
      });
    await page
      .getByLabel(`1번 평가 ${n}번 요소 TEST-READING`, { exact: true })
      .check();
    await page
      .getByLabel(`1번 평가 ${n}번 요소 확인할 증거`, { exact: true })
      .fill(`요소 ${n}: 주장과 근거의 연결, 수정 흔적`);
    const criterion = page.locator(".rubric-element").filter({
      has: page.getByLabel(`1번 평가 ${n}번 평가 요소명`, { exact: true }),
    });
    for (let level = 1; level <= 2; level++) {
      await criterion
        .getByRole("button", { name: "+ 평정수준 추가", exact: true })
        .click();
      await page
        .getByLabel(`1번 평가 요소${n} 단계${level} 수준`, { exact: true })
        .fill(level === 1 ? "충족" : "보완");
      await page
        .getByLabel(`1번 평가 요소${n} 단계${level} 기준`, { exact: true })
        .fill(
          level === 1
            ? "두 근거를 비교하여 해석을 설명한다."
            : "근거를 제시했으나 해석과의 연결이 부족하다.",
        );
      await page
        .getByLabel(`1번 평가 요소${n} 단계${level} 점수`, { exact: true })
        .fill(level === 1 ? "25" : "10");
    }
  }
  await expect(page.locator(".stage-row").nth(2)).toContainText(
    "채점 요소 2개",
  );
  for (let n = 1; n <= 3; n++) {
    await page
      .getByLabel("독서 프로젝트 연결할 수업", { exact: true })
      .selectOption({ index: n });
    await page
      .getByLabel("독서 프로젝트 연결할 역할", { exact: true })
      .selectOption(["준비", "실시", "피드백"][n - 1]);
    await page
      .getByLabel("독서 프로젝트 연결할 단계", { exact: true })
      .selectOption({ label: stageNames[n - 1] });
    await page.getByRole("button", { name: "수업 연결", exact: true }).click();
  }
  await expect(page.locator(".assessment-schedule li")).toHaveCount(3);
  await save(page);
  const revision = (await page.locator(".plan-savebar").innerText()).match(
    /v(\d+)/,
  )![1];
  await tab(page, "검토·출력");
  await expect(page.locator(".connection-overview")).toContainText(
    "진행 단계 3개 · 채점 요소 4개 · 연결 수업 3개",
  );
  await expect(page.locator(".standard-evidence")).toContainText("참여도");
  await expect(page.locator(".standard-evidence")).toContainText("표현력");
  await expect(page.locator(".review-issues")).not.toContainText(
    "연결된 수업이 없습니다",
  );
  await page
    .locator(".teaching-connections")
    .screenshot({ path: ".artifacts/teaching-authoring-map-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await fits(page);
  await page
    .locator(".teaching-connections")
    .screenshot({ path: ".artifacts/teaching-authoring-map-mobile.png" });
  await page
    .getByRole("button", { name: "과제 설계 열기", exact: true })
    .click();
  await expect(page.locator("article[id^=assessment-]")).toBeFocused();
  await fits(page);
  await page
    .locator(".assessment-schedule")
    .getByRole("button", { name: "3월 1주 · 독서 1주", exact: true })
    .click();
  await expect(page.locator("tr[id^=lesson-]").first()).toBeFocused();
  await page
    .locator(".lesson-assessment-links")
    .first()
    .getByRole("button", { name: "연결 편집", exact: true })
    .click();
  modal = page.getByRole("dialog");
  await expect(modal.getByLabel("1번 연결 역할", { exact: true })).toHaveValue(
    "준비",
  );
  await modal.getByLabel("1번 연결 역할", { exact: true }).selectOption("실시");
  await modal.getByRole("button", { name: "연결 확인", exact: true }).click();
  await save(page);
  await page.reload();
  await tab(page, "교수학습계획");
  await expect(page.locator(".lesson-assessment-links").first()).toContainText(
    "실시 · 독서 프로젝트",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await tab(page, "평가계획");
  await page
    .getByRole("button", { name: "1번 평가 진행 단계 3 삭제", exact: true })
    .click();
  await expect(page.locator(".rubric-element")).toHaveCount(4);
  await expect(
    page.getByLabel("1번 평가 4번 요소 진행 단계", { exact: true }),
  ).toHaveValue("");
  await save(page);
  await tab(page, "검토·출력");
  await page
    .getByRole("button", { name: "변경 이력 불러오기", exact: true })
    .click();
  await page
    .getByRole("button", { name: `v${revision} 복원`, exact: true })
    .click();
  await expect(page.locator(".plan-savebar")).toContainText("저장 완료");
  await expect(page.locator(".connection-overview")).toContainText(
    "진행 단계 3개 · 채점 요소 4개 · 연결 수업 3개",
  );
  await tab(page, "평가계획");
  await page
    .getByRole("button", { name: "1번 평가 복제", exact: true })
    .click();
  await page.getByLabel("2번 평가명", { exact: true }).fill("독서 복사 과제");
  await expect(
    page.locator(".assessment-schedule").nth(1).locator("li"),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("2번 평가 4번 요소 진행 단계", { exact: true }),
  ).not.toHaveValue(
    await page
      .getByLabel("1번 평가 4번 요소 진행 단계", { exact: true })
      .inputValue(),
  );
  await page
    .getByLabel("독서 복사 과제 연결할 수업", { exact: true })
    .selectOption({ index: 1 });
  await page
    .locator(".assessment-schedule")
    .nth(1)
    .getByRole("button", { name: "수업 연결", exact: true })
    .click();
  await save(page);
  await tab(page, "교수학습계획");
  await expect(
    page
      .locator(".lesson-assessment-links")
      .first()
      .locator(".connection-chip"),
  ).toHaveCount(2);
  await tab(page, "평가계획");
  await page
    .getByRole("button", { name: "2번 평가 삭제", exact: true })
    .click();
  await save(page);
  await tab(page, "교수학습계획");
  await expect(
    page
      .locator(".lesson-assessment-links")
      .first()
      .locator(".connection-chip"),
  ).toHaveCount(1);
  await expect(page.getByLabel("1번 단원명", { exact: true })).toHaveValue(
    "독서 1주",
  );
  // Whole-plan copy preserves the internal relationships; task-only copy intentionally has no lessons.
  await page.getByRole("button", { name: "새 수업 설정", exact: true }).click();
  modal = page.getByRole("dialog");
  await modal.getByLabel("수업 과목명", { exact: true }).fill("독서 운영 복사");
  await modal
    .getByLabel("기존 계획 복사 (선택)", { exact: true })
    .selectOption({ index: 1 });
  await modal.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(modal).not.toBeVisible();
  await tab(page, "검토·출력");
  await expect(page.locator(".connection-overview")).toContainText(
    "연결 수업 3개",
  );
  await tab(page, "교수학습계획");
  await page
    .getByRole("button", { name: "학사일정으로 주차 초안", exact: true })
    .click();
  modal = page.getByRole("dialog");
  expect(await modal.locator(".week-draft-list p").count()).toBeGreaterThan(10);
  await modal
    .getByRole("button", { name: "주차 초안 추가", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByLabel("4번 배당 차시", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("1번 교수학습 내용", { exact: true }),
  ).toHaveValue("자료를 읽고 질문을 만든다.");
  await save(page);
  await page.reload();
  await tab(page, "교수학습계획");
  await expect(page.getByLabel("4번 배당 차시", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page
      .locator(".lesson-assessment-links")
      .first()
      .locator(".connection-chip"),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});
