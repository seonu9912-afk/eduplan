import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const fixtureFile = process.env.EDUPLAN_SCHOOL_REFORM_FIXTURES;
test.skip(!fixtureFile, "이 검증은 격리된 Supabase에 등록한 가상 계정이 필요합니다.");

type Fixture = { role: string; email: string; password: string };

async function login(page: Page, account: Fixture) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(account.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
}

test("school-only onboarding and independently granted calendar publication", async ({ page, browser }) => {
  const fixtures = JSON.parse(readFileSync(fixtureFile!, "utf8")).users as Fixture[];
  const administrator = fixtures.find((worker) => worker.role === "admin")!;
  const teacher = fixtures.find((worker) => worker.role === "invitee")!;
  const school = `학교 공개 검증 ${Date.now()}`;
  const nextContext = await browser.newContext();
  const reader = await nextContext.newPage();
  try {
    await login(page, administrator);
    const onboarding = page.getByRole("heading", { name: "학교 시작하기" });
    const createSchool = page.getByRole("button", { name: "학교 만들기", exact: true });
    await expect(onboarding.or(createSchool).first()).toBeVisible();
    const schoolName = page.getByLabel("학교명", { exact: true });
    if (!(await onboarding.isVisible())) {
      await expect(async () => {
        if (!(await schoolName.isVisible())) await createSchool.click({ timeout: 2_000 });
        await expect(schoolName).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });
    }
    await schoolName.fill(school);
    await page.getByLabel("지역", { exact: true }).fill("가상 검증 지역");
    await page.getByRole("button", { name: "학교 작업공간 만들기" }).click();
    await expect(page).toHaveURL(/\/app\/[\da-f-]+\/settings/);
    const schoolPath = new URL(page.url()).pathname.replace(/\/settings$/, "");
    const picker = page.getByLabel("학년도 선택");
    const current = Number(await picker.inputValue());
    await picker.selectOption(String(current + 1));
    await expect(page).toHaveURL(new RegExp(`year=${current + 1}$`));
    await expect(page.getByLabel("1학년 학급 수")).toHaveValue("0");
    await page.getByLabel("1학년 학급 수").fill("2");
    const yearSave = page.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().includes("/settings"));
    await page.getByRole("button", { name: "학년도 설정 저장" }).click();
    expect((await yearSave).ok()).toBe(true);
    await expect(page.getByRole("button", { name: "학년도 설정 저장" })).toBeEnabled();
    await page.reload();
    await expect(page.getByLabel("1학년 학급 수")).toHaveValue("2");
    await picker.selectOption(String(current));
    await expect(page).toHaveURL(new RegExp(`year=${current}$`));
    await expect(page.getByLabel("1학년 학급 수")).toHaveValue("0");

    await login(reader, teacher);
    await reader.goto(`${schoolPath}/calendar?year=${current}`);
    await expect(reader.getByRole("heading", { name: "접근할 수 없는 페이지입니다" })).toBeVisible();

    await page.goto(`${schoolPath}/people?year=${current}`);
    await page.getByText("업무별 편집 권한", { exact: true }).click();
    const permission = page.getByRole("checkbox", { name: /가상 테스트 관리자 학사일정·행사 승인/ });
    await expect(permission).not.toBeChecked();
    await permission.click();
    await expect(permission).toBeChecked();
    await page.getByRole("button", { name: "구성원 초대" }).click();
    await page.getByLabel("초대할 이메일").fill(teacher.email);
    await page.getByRole("button", { name: "초대 링크 만들기" }).click();
    const invite = page.locator("#invite-url");
    await expect(invite).toHaveValue(/\/invite\/[a-f0-9]{64}$/);
    await reader.goto(await invite.inputValue());
    await reader.getByRole("button", { name: "초대 수락하고 참여하기" }).click();
    await expect(reader).toHaveURL(new RegExp(`${schoolPath}/home`));

    const calendar = `${schoolPath}/calendar?year=${current}`;
    await reader.goto(`${calendar}&view=manage`);
    await expect(reader.getByRole("heading", { name: "접근할 수 없는 페이지입니다" })).toBeVisible();
    await reader.goto(calendar);
    await expect(reader.getByText("선택한 날짜에 적용되는 공개 계획이 없습니다.")).toBeVisible();
    await expect(reader.getByRole("link", { name: /학사운영 관리/ })).toHaveCount(0);

    await page.goto(`${calendar}&view=manage`);
    const eventDate = `${current}-12-14`;
    const editDate = async (name: string) => {
      await page.getByRole("button", { name: new RegExp(`^${eventDate} `) }).click();
      const edit = page.getByRole("dialog", { name: "날짜 편집" });
      await edit.getByLabel("날짜 유형").selectOption("discretionary");
      await edit.getByLabel("날짜 설명").fill(name);
      await edit.getByRole("button", { name: "저장", exact: true }).click();
      await expect(page.getByText("서버에 저장했습니다.", { exact: true })).toBeVisible();
    };
    await editDate("검증 공개 휴업");
    await page.getByRole("button", { name: "확정·공개", exact: true }).click();
    const publication = page.getByRole("dialog", { name: "학사일정 공개" });
    await publication.getByLabel("적용 시작일").fill(`${current}-03-01`);
    await publication.getByRole("button", { name: "확정·공개", exact: true }).click();
    await expect(page.getByText("학사일정 공개본을 저장했습니다.")).toBeVisible();
    await editDate("검증 미공개 수정");
    await reader.reload();
    await reader.getByLabel("기준일").fill(eventDate);
    const table = reader.getByRole("table", { name: "공개 일정표" });
    await expect(table.getByText("검증 공개 휴업", { exact: true })).toBeVisible();
    await expect(table.getByText("검증 미공개 수정", { exact: true })).toHaveCount(0);
  } finally {
    await nextContext.close();
  }
});
