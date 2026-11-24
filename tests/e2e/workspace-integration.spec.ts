import { test, expect } from "@playwright/test";
const route = "/recovery-preview/operations";
test("curriculum changes recalculate staffing; saved simulations preserve originals", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(route);
  await page.getByRole("button", { name: "교원·수급", exact: true }).click();
  await page
    .getByRole("button", { name: "수급 분석·가상 편성", exact: true })
    .click();
  const table = page.getByRole("table", { name: "교과별 교원 수급 분석" });
  const row = table
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", { name: "국어", exact: true }),
    });
  await expect(row).toContainText("48 → 48");
  await expect(row).toContainText("3명");
  await page.getByText("교육과정 변경 연계 실습", { exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "연계 실습 국어 주당 시수" })
    .fill("5");
  await expect(row).toContainText("60 → 60");
  await page
    .getByRole("spinbutton", { name: "국어 가상 교원 수", exact: true })
    .fill("4");
  await page
    .getByRole("textbox", { name: "편성안 이름" })
    .fill("국어 4명 검토안");
  await page.getByRole("button", { name: "가상안 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("저장했습니다");
  await page.reload();
  await page.getByRole("button", { name: "교원·수급", exact: true }).click();
  await page
    .getByRole("button", { name: "수급 분석·가상 편성", exact: true })
    .click();
  await expect(row).toContainText("60 → 60");
  await expect(row).toContainText("3명");
  await page
    .getByRole("combobox", { name: "저장안 비교" })
    .selectOption({ label: "국어 4명 검토안" });
  await page.getByRole("button", { name: "저장안으로 검토 시작" }).click();
  await expect(row).toContainText("4명");
  expect(errors).toEqual([]);
});
test("unregistered teachers join the common roster and capacity without creating an account", async ({
  page,
}) => {
  const serverActions: string[] = [];
  page.on("request", (r) => {
    if (r.headers()["next-action"]) serverActions.push(r.url());
  });
  await page.goto(route);
  await page.getByRole("button", { name: "교원·수급", exact: true }).click();
  await page.getByRole("button", { name: "교원 등록", exact: true }).click();
  const form = page.getByRole("dialog");
  await form
    .getByRole("textbox", { name: "성명 또는 임시 교원명" })
    .fill("국어 신규 임시교원");
  await form.getByRole("checkbox", { name: "국어", exact: true }).check();
  await form
    .getByRole("combobox", { name: "수급 분석 주 담당 과목" })
    .selectOption({ label: "국어" });
  await form.getByRole("combobox", { name: "근무 형태" }).selectOption("미정");
  await form
    .getByRole("combobox", { name: "재직 상태" })
    .selectOption("배치 예정");
  await form.getByRole("button", { name: "교원 정보 저장" }).click();
  await expect(form).toBeHidden();
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", { name: "국어 신규 임시교원" }),
      }),
  ).toContainText("가입 전·미연결");
  await page
    .getByRole("button", { name: "수급 분석·가상 편성", exact: true })
    .click();
  await expect(
    page
      .getByRole("table", { name: "교과별 교원 수급 분석" })
      .getByRole("row")
      .filter({
        has: page.getByRole("rowheader", { name: "국어", exact: true }),
      }),
  ).toContainText("4명");
  expect(serverActions).toEqual([]);
});
test("calendar closure previews lesson losses and updates personal lessons without rescheduling", async ({
  page,
}) => {
  await page.goto(route);
  await expect(
    page.getByText("다음 수업 국어", { exact: false }),
  ).toContainText("3분 후");
  await page.getByRole("button", { name: "학사일정", exact: true }).click();
  await page
    .getByRole("button", { name: "2027-03-02 수업일", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "날짜 편집" });
  await edit.getByLabel("날짜 유형").selectOption("discretionary");
  await edit.getByLabel("날짜 설명").fill("학교 휴업 검토");
  await expect(edit.getByRole("status")).toContainText("기존 수업 영향 12건");
  await edit.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("서버에 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "오늘", exact: true }).click();
  await expect(
    page.getByText("오늘 남은 수업이 없습니다.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".daily-lesson.cancelled")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".daily-lesson.cancelled")).toHaveCount(4);
});
test("one school event update is reflected in work plans and teaching calendar", async ({
  page,
}) => {
  await page.goto(route);
  await page.getByRole("button", { name: "학사일정", exact: true }).click();
  await page.getByRole("button", { name: "행사 편성", exact: true }).click();
  await page
    .locator(".ar-event-line")
    .filter({ hasText: "진로 체험의 날" })
    .click();
  await page.getByLabel("행사명", { exact: true }).fill("통합 연계 진로 행사");
  await page
    .getByRole("button", { name: "행사·교시 편성 저장", exact: true })
    .click();
  await expect(
    page.getByText("서버에 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "월중·주간", exact: true }).click();
  await expect(
    page.getByText("통합 연계 진로 행사", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "월중계획", exact: true }).click();
  await expect(
    page.getByText("통합 연계 진로 행사", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "수업 연계", exact: true }).click();
  await expect(
    page
      .getByRole("table", { name: "주차별 교수학습계획" })
      .getByText("통합 연계 진로 행사", { exact: false }),
  ).toBeVisible();
});
test("mobile personal day and persisted notification preference stay usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);
  await page
    .getByRole("combobox", { name: "수업 전 안내 시간" })
    .selectOption("10");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "수업 전 안내 시간" }),
  ).toHaveValue("10");
  await expect(
    page.getByRole("heading", { name: "오늘의 나의 수업" }),
  ).toBeVisible();
  await expect(
    page.getByText("다음 수업 국어", { exact: false }),
  ).toBeVisible();
});
