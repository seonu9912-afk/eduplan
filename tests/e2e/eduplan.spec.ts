import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const fixtures = JSON.parse(readFileSync(".test-secrets.json", "utf8")) as {
  users: { role: string; id: string; email: string; password: string }[];
};
const admin = fixtures.users.find((u) => u.role === "admin")!;
const invitee = fixtures.users.find((u) => u.role === "invitee")!;
async function loginAs(page: Page, user: typeof admin) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/[^/]+\/home/);
}
test("subject deletion cleans all linked cohort hours and survives reload", async ({
  page,
}) => {
  await loginAs(page, admin);
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("학교명", { exact: true })
    .fill(`과목 삭제 검증 ${Date.now()}`);
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const deletionSchoolId = new URL(page.url()).pathname.split("/")[2];
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  await page
    .getByRole("tab", { name: "교과군·과목 설정", exact: true })
    .click();
  await page.getByLabel("교과군 이름").fill("검증 교과군");
  await page.getByRole("button", { name: "추가", exact: true }).first().click();
  await expect(page.getByLabel("교과군", { exact: true })).toContainText(
    "검증 교과군",
  );
  for (const name of ["삭제할과목", "유지과목", "미사용과목"]) {
    await page
      .getByLabel("교과군", { exact: true })
      .selectOption({ label: "검증 교과군" });
    await page.getByLabel("과목명", { exact: true }).fill(name);
    await page
      .getByRole("button", { name: "추가", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("button", { name: `${name} 과목 삭제`, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "미사용과목 과목 삭제", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "연결된 저장 시수는 없습니다",
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "미사용과목 과목 삭제", exact: true }),
  ).toHaveCount(0);
  for (const [year, hours] of [
    [2026, 68],
    [2027, 34],
  ]) {
    await page
      .getByRole("button", { name: "편성표 만들기", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("입학년도", { exact: true }).fill(String(year));
    await dialog
      .getByRole("button", { name: "편성표 만들기", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: `${year}학년도 입학생 교육과정`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("삭제할과목 1학년 1학기 시수", { exact: true })
      .fill(String(hours));
    await page
      .getByLabel("유지과목 1학년 1학기 시수", { exact: true })
      .fill("10");
    await page
      .getByRole("button", { name: "편성표 저장", exact: true })
      .click();
    await expect(page.getByText("모든 변경사항 저장됨")).toBeVisible();
  }
  await page
    .getByRole("tab", { name: "교과군·과목 설정", exact: true })
    .click();
  await page
    .getByRole("button", { name: "삭제할과목 과목 삭제", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("102시간");
  await expect(confirmation).toContainText("2026학년도 입학생");
  await expect(confirmation).toContainText("2027학년도 입학생");
  await confirmation.getByRole("button", { name: "취소", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "삭제할과목 과목 삭제", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "삭제할과목 과목 삭제", exact: true })
    .click();
  await confirmation.getByRole("button", { name: "확인", exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "삭제할과목 과목 삭제", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await loginAs(page, admin);
  await page.getByLabel("작업공간 선택").selectOption(deletionSchoolId);
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  for (const year of [2026, 2027]) {
    await page
      .getByLabel("입학년도", { exact: true })
      .selectOption(String(year));
    await expect(
      page.getByLabel("삭제할과목 1학년 1학기 시수", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("유지과목 1학년 1학기 시수", { exact: true }),
    ).toHaveValue("10");
  }
});
test("public desktop and mobile entry points", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /교육의 큰 그림/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/landing-desktop.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "회원가입", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText("무료로 시작하기", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "회원가입", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "함께 만드는 교육의 시작" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByLabel("이메일", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: ".artifacts/login-mobile.png",
    fullPage: true,
  });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});
test("real auth, school setup, shared calendar, curriculum persistence, invitation and revocation", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAs(page, admin);
  await page.goto("/");
  await expect(page).toHaveURL(/\/app\/[^/]+\/home/);
  await expect(page.getByLabel("작업공간 선택")).toContainText("내 작업공간");
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  let dialog = page.getByRole("dialog");
  const schoolName = `가상 에듀중학교 ${Date.now().toString().slice(-6)}`;
  await dialog.getByLabel("학교명", { exact: true }).fill(schoolName);
  await dialog.getByLabel("지역", { exact: true }).fill("서울특별시");
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings/);
  const schoolId = new URL(page.url()).pathname.split("/")[2];
  writeFileSync(
    ".artifacts/e2e-context.json",
    JSON.stringify({ schoolId, schoolName }),
  );
  await page.getByLabel("개설할 학년도", { exact: true }).fill("2026");
  await page.getByLabel("1학년 학급 수").fill("2");
  await page.getByLabel("2학년 학급 수").fill("3");
  await page.getByLabel("3학년 학급 수").fill("4");
  await page.getByRole("button", { name: "학년도 설정 저장" }).click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2026");
  await page.reload();
  await expect(page.getByLabel("2학년 학급 수")).toHaveValue("3");
  await page.getByRole("link", { name: "학사운영", exact: true }).click();
  await page.getByRole("button", { name: "행사 일정", exact: true }).click();
  await page.getByLabel("기간 선택").fill("2026-11");
  await page.getByRole("button", { name: "일정 등록", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("일정명", { exact: true }).fill("가상 공개수업");
  await dialog.getByLabel("시작일", { exact: true }).fill("2026-11-09");
  await dialog.getByLabel("종료일", { exact: true }).fill("2026-11-10");
  await dialog.getByLabel("담당 부서", { exact: true }).fill("교무기획부");
  await dialog
    .getByLabel("상세 내용", { exact: true })
    .fill("E2E 검증용 일정입니다.");
  await dialog.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTitle("가상 공개수업").first()).toBeVisible();
  await page.getByRole("tab", { name: "월별 행사", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "가상 공개수업" }),
  ).toContainText("교무기획부");
  await page.getByRole("tab", { name: "주별 행사", exact: true }).click();
  await page.getByLabel("기간 선택").fill("2026-11-09");
  await page.getByRole("button", { name: "가상 공개수업 상세 보기" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("일정명", { exact: true }).fill("가상 공개수업 수정");
  await dialog.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "가상 공개수업 수정" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "월별 행사", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "가상 공개수업 수정" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "행사 일정", exact: true }).click();
  await page.getByLabel("기간 선택").fill("2026-11");
  await expect(page.getByTitle("가상 공개수업 수정").first()).toBeVisible();
  await page.screenshot({
    path: ".artifacts/calendar-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  await page
    .getByRole("tab", { name: "교과군·과목 설정", exact: true })
    .click();
  await page.getByLabel("교과군 이름").fill("국어");
  await page.getByRole("button", { name: "추가", exact: true }).first().click();
  await expect(page.getByLabel("교과군", { exact: true })).toContainText(
    "국어",
  );
  await page
    .getByLabel("교과군", { exact: true })
    .selectOption({ label: "국어" });
  await page.getByLabel("과목명", { exact: true }).fill("국어");
  await page.getByRole("button", { name: "추가", exact: true }).last().click();
  await expect(
    page.locator(".subject-tag").filter({ hasText: "국어" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "편성표 만들기", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("입학년도", { exact: true }).fill("2026");
  await dialog
    .getByRole("button", { name: "편성표 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const firstCell = page.getByLabel("국어 1학년 1학기 시수", { exact: true });
  await expect(firstCell).toBeVisible();
  await firstCell.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", "68\t68\t51\t51\t34\t34");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByLabel("국어 3학년 2학기 시수")).toHaveValue("34");
  await page.getByRole("button", { name: "편성표 저장", exact: true }).click();
  await expect(page.getByText("모든 변경사항 저장됨")).toBeVisible();
  await page.reload();
  await expect(firstCell).toHaveValue("68");
  await expect(
    page.locator("tfoot").getByText("306", { exact: true }).first(),
  ).toBeVisible();
  await firstCell.fill("-1");
  await expect(firstCell).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "편성표 저장", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "잘못된 시수" }),
  ).toBeVisible();
  await firstCell.fill("68");
  await page.getByRole("button", { name: "편성표 저장", exact: true }).click();
  await expect(page.getByText("모든 변경사항 저장됨")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "편성표 저장", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".artifacts/curriculum-desktop.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "학년도 운영표", exact: true }).click();
  await expect(
    page.getByText("2025학년도 입학생", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("일부 입학년도 편성표가 없습니다.", { exact: false }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: ".artifacts/curriculum.pdf", printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "구성원", exact: true }).click();
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("초대할 이메일").fill(invitee.email);
  await dialog.getByLabel("참여 권한").selectOption("viewer");
  await dialog.getByRole("button", { name: "초대 링크 만들기" }).click();
  await expect(dialog.getByLabel("초대 링크 (지금 복사해 주세요)")).toHaveValue(
    /\/invite\/[a-f0-9]{64}/,
  );
  const inviteLink = await dialog
    .getByLabel("초대 링크 (지금 복사해 주세요)")
    .inputValue();
  await dialog.getByRole("button", { name: /닫기|Close/ }).click();
  const secondContext = await browser.newContext({
    baseURL: process.env.BASE_URL || "http://localhost:3000",
  });
  const second = await secondContext.newPage();
  await second.goto(new URL(inviteLink).pathname);
  await expect(second).toHaveURL(/\/\?next=/);
  await second.getByLabel("이메일", { exact: true }).fill(invitee.email);
  await second.getByLabel("비밀번호", { exact: true }).fill(invitee.password);
  await second.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(second).toHaveURL(/\/invite\/[a-f0-9]{64}$/);
  await second.getByRole("button", { name: "초대 수락하고 참여하기" }).click();
  await expect(second).toHaveURL(new RegExp(`/app/${schoolId}/home`));
  await second.getByRole("link", { name: "학사운영", exact: true }).click();
  await second.getByRole("button", { name: "행사 일정", exact: true }).click();
  await expect(
    second.getByRole("button", { name: "일정 등록", exact: true }),
  ).toHaveCount(0);
  await second.getByRole("link", { name: "교육과정", exact: true }).click();
  await second
    .getByRole("tab", { name: "교과군·과목 설정", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "국어 과목 삭제", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "접근 권한 회수" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await second.reload();
  await expect(
    second.getByRole("heading", { name: "접근할 수 없는 페이지입니다" }),
  ).toBeVisible();
  await secondContext.close();
  await page.getByRole("link", { name: "홈", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /^안녕하세요,/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: ".artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await loginAs(page, admin);
  await page.getByLabel("작업공간 선택").selectOption(schoolId);
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  await expect(page.getByLabel("국어 1학년 1학기 시수")).toHaveValue("68");
  await page.getByRole("link", { name: "학사운영", exact: true }).click();
  await page.getByRole("button", { name: "행사 일정", exact: true }).click();
  await page.getByLabel("기간 선택").fill("2026-11");
  await page.getByTitle("가상 공개수업 수정").first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("tab", { name: "월별 행사", exact: true }).click();
  await expect(page.getByText("해당 기간에 일정이 없어요")).toBeVisible();
  await page.locator(".profile-trigger").click();
  dialog = page.getByRole("dialog");
  const originalName = await dialog
    .getByLabel("이름", { exact: true })
    .inputValue();
  const originalWorkspace = await dialog
    .getByLabel("기본 작업공간")
    .inputValue();
  await dialog.getByLabel("이름", { exact: true }).fill("가상 프로필 검증");
  await dialog.getByLabel("기본 작업공간").selectOption(schoolId);
  await dialog.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("저장되었습니다");
  await dialog.getByRole("button", { name: /닫기|Close/ }).click();
  await page.goto("/app");
  await expect(page).toHaveURL(new RegExp(`/app/${schoolId}/home`));
  await expect(
    page.getByRole("heading", { name: /가상 프로필 검증/ }),
  ).toBeVisible();
  await page.locator(".profile-trigger").click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("이름", { exact: true }).fill(originalName);
  await dialog.getByLabel("기본 작업공간").selectOption(originalWorkspace);
  await dialog.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("저장되었습니다");
  await dialog.getByRole("button", { name: /닫기|Close/ }).click();
  expect(errors).toEqual([]);
});

test("school levels persist across settings, events and six-year curriculum", async ({
  page,
}) => {
  await loginAs(page, admin);
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("학교명", { exact: true })
    .fill(`가상 초등학교 ${Date.now()}`);
  await dialog.getByLabel("학교급", { exact: true }).selectOption("초등학교");
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByLabel("학교급", { exact: true })).toHaveValue(
    "초등학교",
  );
  await page.getByLabel("개설할 학년도", { exact: true }).fill("2026");
  for (let g = 1; g <= 6; g++)
    await page.getByLabel(`${g}학년 학급 수`, { exact: true }).fill(String(g));
  await page
    .getByRole("button", { name: "학년도 설정 저장", exact: true })
    .click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2026");
  await page.reload();
  await expect(page.getByLabel("6학년 학급 수", { exact: true })).toHaveValue(
    "6",
  );
  await page.getByRole("link", { name: "학사운영", exact: true }).click();
  await page.getByRole("button", { name: "행사 일정", exact: true }).click();
  await page.getByLabel("기간 선택").fill("2026-11");
  await page.getByRole("button", { name: "일정 등록", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("일정명", { exact: true }).fill("6학년 체험학습");
  await dialog.getByLabel("시작일", { exact: true }).fill("2026-11-16");
  await dialog.getByLabel("종료일", { exact: true }).fill("2026-11-16");
  for (let g = 1; g <= 5; g++)
    await dialog
      .getByRole("checkbox", { name: `${g}학년`, exact: true })
      .uncheck();
  await dialog.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("tab", { name: "월별 행사", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "6학년 체험학습" }),
  ).toContainText("6학년");
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "입학년도별 6개년 편성표", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "교과군·과목 설정", exact: true })
    .click();
  await page.getByLabel("교과군 이름").fill("수학");
  await page.getByRole("button", { name: "추가", exact: true }).first().click();
  await expect(page.getByLabel("교과군", { exact: true })).toContainText(
    "수학",
  );
  await page
    .getByLabel("교과군", { exact: true })
    .selectOption({ label: "수학" });
  await page.getByLabel("과목명", { exact: true }).fill("수학");
  await page.getByRole("button", { name: "추가", exact: true }).last().click();
  await expect(
    page.locator(".subject-tag").filter({ hasText: "수학" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "편성표 만들기", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("입학년도", { exact: true }).fill("2026");
  await dialog
    .getByRole("button", { name: "편성표 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByLabel("수학 1학년 1학기 시수", { exact: true })
    .evaluate((element) => {
      const data = new DataTransfer();
      data.setData("text/plain", Array(12).fill("10").join("\t"));
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  await expect(
    page.getByLabel("수학 6학년 2학기 시수", { exact: true }),
  ).toHaveValue("10");
  await page.getByRole("button", { name: "편성표 저장", exact: true }).click();
  await expect(page.getByText("모든 변경사항 저장됨")).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("수학 6학년 2학기 시수", { exact: true }),
  ).toHaveValue("10");
  await expect(
    page.locator("tfoot").getByText("120", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/elementary-curriculum.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "작업공간 설정", exact: true })
    .click();
  await page.getByLabel("학교급", { exact: true }).selectOption("고등학교");
  await page.getByRole("button", { name: "학교급 저장", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "4~6학년 자료" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("학교급", { exact: true })).toHaveValue(
    "초등학교",
  );
  await page.screenshot({
    path: ".artifacts/elementary-settings.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("학교명", { exact: true })
    .fill(`가상 고등학교 ${Date.now()}`);
  await dialog.getByLabel("학교급", { exact: true }).selectOption("고등학교");
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("학교급", { exact: true })).toHaveValue(
    "고등학교",
  );
  await expect(page.getByLabel("3학년 학급 수", { exact: true })).toBeVisible();
  await expect(page.getByLabel("4학년 학급 수", { exact: true })).toHaveCount(
    0,
  );
});

test("annual plan editing, export, restore and department work plans", async ({
  page,
}) => {
  await loginAs(page, admin);
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("학교명", { exact: true })
    .fill(`연간 검증 학교 ${Date.now()}`);
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(page.locator("#term-start-1")).toHaveCount(0);
  await page.getByRole("button", { name: "학년도 설정 저장" }).click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2026");
  await page.reload();
  await page.getByRole("link", { name: "학사운영", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "2026학년도 학사일정", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2026-03-01 삼일절", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".annual-matrix thead th")).toHaveCount(13);
  await expect(page.locator(".annual-matrix tbody tr")).toHaveCount(31);
  await expect(
    page.getByRole("button", { name: "공휴일 불러오기", exact: true }),
  ).toHaveCount(1);
  const totalDays = page
    .locator(".teaching-counts > div")
    .first()
    .locator("strong");
  const initialDays = Number((await totalDays.innerText()).replace("일", ""));
  expect(initialDays).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "월별 달력", exact: true }),
  ).toHaveCount(0);
  await page.locator("summary").filter({ hasText: "학기 설정" }).click();
  await expect(page.locator("#term-start-1")).toHaveValue("2026-03-01");
  await page
    .getByRole("button", { name: "연간 계획 저장", exact: true })
    .click();
  await expect(page.getByText("저장본 v1", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "2026-03-02 수업일", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "사용", exact: true }).uncheck();
  await page
    .getByRole("button", { name: "선택 기간 적용", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연간 계획 저장", exact: true })
    .click();
  await expect(page.getByText("저장본 v2", { exact: true })).toBeVisible();
  await expect(totalDays).toHaveText(`${initialDays - 1}일`);
  await page.reload();
  await page
    .getByRole("button", { name: "2026-03-02 수업일", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "사용", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.screenshot({
    path: ".artifacts/annual-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "자료·이력", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "학사일정 Excel 내보내기", exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs(".artifacts/annual-export.xlsx");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(".artifacts/annual-export.xlsx");
  const sheet = workbook.getWorksheet("날짜별 시수")!;
  let disabledDayHours = -1;
  sheet.eachRow((row) => {
    if (row.getCell(1).text === "2026-03-02" && row.getCell(2).value === 1)
      disabledDayHours = Number(row.getCell(5).value);
  });
  expect(disabledDayHours).toBe(0);
  expect(workbook.getWorksheet("수업일수 요약")!.getCell("B2").value).toBe(
    initialDays - 1,
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "이 저장본 복원", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연간 계획 저장", exact: true })
    .click();
  await expect(page.getByText("저장본 v3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "연간 기본안", exact: true }).click();
  await page
    .getByRole("button", { name: "2026-03-02 수업일", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "사용", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/annual-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const id = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`/app/${id}/plans`);
  await page.getByLabel("업무계획 기준 날짜").fill("2026-11-09");
  await page
    .getByRole("button", { name: "2026-11-09 일정 추가", exact: true })
    .click();
  await page.getByLabel("업무 날짜", { exact: true }).fill("2026-11-09");
  await page
    .getByLabel("내용", { exact: true })
    .fill("정보공시4차 제출 마감 확인");
  await page.getByRole("button", { name: "업무 추가", exact: true }).click();
  await page
    .getByRole("button", { name: "업무계획 저장", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장되었습니다" }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("업무계획 기준 날짜").fill("2026-11-09");
  await expect(page.locator(".work-plan-table")).toContainText(
    "정보공시4차 제출 마감 확인",
  );
  await page.screenshot({
    path: ".artifacts/work-plans-desktop.png",
    fullPage: true,
  });
  await page.goto(`/app/${id}/calendar`);
  await page.getByRole("button", { name: "자료·이력", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "이 저장본 복원", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "연간 계획 저장", exact: true })
    .click();
  await expect(page.getByText("저장본 v5", { exact: true })).toBeVisible();
  await page.goto(`/app/${id}/plans`);
  await page.getByLabel("업무계획 기준 날짜").fill("2026-11-09");
  await expect(page.locator(".work-plan-table")).toContainText(
    "정보공시4차 제출 마감 확인",
  );
  await page.goto(`/app/${id}/calendar`);
  const schoolDays = page
    .locator(".teaching-counts > div")
    .first()
    .locator("strong");
  const beforeVacation = Number(
    (await schoolDays.innerText()).replace("일", ""),
  );
  await page.getByLabel("방학명", { exact: true }).fill("검증 방학");
  await page.getByLabel("방학 시작일", { exact: true }).fill("2026-03-09");
  await page.getByLabel("방학 종료일", { exact: true }).fill("2026-03-13");
  await page.getByRole("button", { name: "방학 추가", exact: true }).click();
  await expect(schoolDays).toHaveText(`${beforeVacation - 5}일`);
  await page
    .locator(".vacation-settings > summary")
    .filter({ hasText: "방학 설정" })
    .click();
  await page
    .getByRole("button", { name: "검증 방학 수정", exact: true })
    .click();
  await page.getByLabel("방학 종료일", { exact: true }).fill("2026-03-12");
  await page
    .getByRole("button", { name: "방학 수정 적용", exact: true })
    .click();
  await expect(schoolDays).toHaveText(`${beforeVacation - 4}일`);
  await page
    .getByRole("button", { name: "검증 방학 삭제", exact: true })
    .click();
  await expect(schoolDays).toHaveText(`${beforeVacation}일`);
  await page
    .getByRole("button", { name: "연간 계획 저장", exact: true })
    .click();
  await expect(page.getByText("저장본 v6", { exact: true })).toBeVisible();
});

test("guideline draft, semester operations, activity areas and optional duty boards", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loginAs(page, admin);
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("학교명", { exact: true })
    .fill(`개선 검증 학교 ${Date.now()}`);
  await dialog.getByLabel("학교급", { exact: true }).selectOption("중학교");
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("1학년 학급 수").fill("2");
  await expect(page.locator("#term-start-1")).toHaveCount(0);
  await page.getByRole("button", { name: "학년도 설정 저장" }).click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2026");
  const id = new URL(page.url()).pathname.split("/")[2];
  writeFileSync(
    ".artifacts/refinement-context.json",
    JSON.stringify({ schoolId: id }),
  );
  await page.goto(`/app/${id}/calendar`);
  const total = page.locator(".teaching-counts>div").first().locator("strong");
  const before = Number((await total.innerText()).replace("일", ""));
  await page.locator("summary").filter({ hasText: "학기 설정" }).click();
  await page.getByLabel("2학기 시작일", { exact: true }).fill("2026-08-24");
  await page
    .getByRole("button", { name: "학기 기간 저장", exact: true })
    .click();
  await expect(total).toHaveText(`${before - 5}일`);
  await page.reload();
  await expect(total).toHaveText(`${before - 5}일`);
  await page.goto(`/app/${id}/settings`);
  await expect(page.getByLabel("1학년 학급 수")).toHaveValue("2");
  await page.getByRole("button", { name: "학년도 설정 저장" }).click();
  await page.goto(`/app/${id}/calendar`);
  await page.locator("summary").filter({ hasText: "학기 설정" }).click();
  await expect(page.getByLabel("2학기 시작일", { exact: true })).toHaveValue(
    "2026-08-24",
  );
  await page.getByRole("button", { name: "행사 일정", exact: true }).click();
  await page.getByLabel("기간 선택").fill("2026-11");
  await page.getByRole("button", { name: "일정 등록", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("일정명", { exact: true }).fill("가상 진로 탐색");
  await dialog.getByLabel("시작일", { exact: true }).fill("2026-11-09");
  await dialog.getByLabel("종료일", { exact: true }).fill("2026-11-09");
  await dialog
    .getByLabel("교육활동 영역", { exact: true })
    .selectOption("진로");
  await dialog.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "수업·창체", exact: true }).click();
  await page
    .getByLabel("등록 행사에서 가져오기")
    .selectOption({ label: "2026-11-09 · 가상 진로 탐색 · 진로" });
  await expect(page.getByLabel("1학년 행사 영역")).toHaveValue("진로");
  await page
    .getByRole("button", { name: "교시 행사 적용", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연간 계획 저장", exact: true })
    .click();
  await expect(page.getByText("저장본 v1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "연간 기본안", exact: true }).click();
  if (process.env.BASE_URL?.startsWith("https://")) {
    await page
      .getByRole("button", { name: "공휴일 불러오기", exact: true })
      .click();
    await expect(page.locator(".annual-api summary")).toContainText(
      /공휴일 \d+일 반영/,
      { timeout: 60000 },
    );
  } else {
    const { defaultAnnual } = await import("../../src/lib/academic");
    const p = defaultAnnual([1, 2, 3]);
    p.holidays["2026-05-05"] = "어린이날및대체공휴일긴이름줄바꿈검증".repeat(3);
    await page.getByRole("button", { name: "자료·이력", exact: true }).click();
    await page.getByLabel("백업 JSON 가져오기 (미리보기)").setInputFiles({
      name: "test.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ year: 2026, document: p })),
    });
    await page
      .getByRole("button", { name: "미리보기 적용", exact: true })
      .click();
    await page
      .getByRole("button", { name: "연간 기본안", exact: true })
      .click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".annual-matrix")
      .evaluate((t) =>
        [...t.querySelectorAll("tbody td")].every(
          (cell) => cell.scrollWidth <= cell.clientWidth + 1,
        ),
      ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/refined-annual-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "연간 계획 저장", exact: true })
    .click();
  await expect(page.getByText("저장본 v2", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/app/${id}/curriculum`);
  await page.getByRole("tab", { name: "총론 기반 초안" }).click();
  await expect(page.locator("tfoot")).toContainText("3366");
  await page.getByRole("button", { name: "이 초안으로 편성표 만들기" }).click();
  await expect(
    page.getByLabel("[초안] 국어 1학년 1학기 시수", { exact: true }),
  ).toHaveValue("74");
  await page.reload();
  await expect(
    page.getByLabel("[초안] 국어 1학년 1학기 시수", { exact: true }),
  ).toHaveValue("74");
  await page.getByRole("tab", { name: "총론 기반 초안" }).click();
  await expect(
    page.getByRole("button", { name: "이 초안으로 편성표 만들기" }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".artifacts/curriculum-draft.png",
    fullPage: true,
  });
  await page.goto(`/app/${id}/plans`);
  await page.getByLabel("업무계획 기준 날짜").fill("2026-11-09");
  await expect(page.locator(".work-week-board>.work-day")).toHaveCount(6);
  await expect(page.locator(".work-plan-table")).toContainText(
    "가상 진로 탐색",
  );
  await expect(
    page.getByRole("button", { name: "2026-11-09 당직 추가", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "2026-11-09 일정 추가", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("내용", { exact: true }).fill("가상 교직원 협의회");
  await dialog.getByLabel("시간", { exact: true }).fill("13:20~15:00");
  await dialog.getByLabel("장소", { exact: true }).fill("회의실");
  await dialog.getByLabel("대상·참석자", { exact: true }).fill("희망 교직원");
  await dialog.getByRole("button", { name: "업무 추가", exact: true }).click();
  await page.locator("summary").filter({ hasText: "업무계획 설정" }).click();
  await page.getByLabel("당직 사용", { exact: true }).check();
  await page
    .getByRole("button", { name: "2026-11-09 당직 추가", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("내용", { exact: true })
    .fill("가상 당직 담당자");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "업무 추가", exact: true })
    .click();
  await page.getByLabel("당직 사용", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "업무계획 저장", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장되었습니다" }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("업무계획 기준 날짜").fill("2026-11-09");
  await expect(page.locator(".work-plan-table")).toContainText(
    "13:20~15:00 · 회의실 · 희망 교직원",
  );
  await expect(page.locator(".work-plan-table")).not.toContainText(
    "가상 당직 담당자",
  );
  await page.locator("summary").filter({ hasText: "업무계획 설정" }).click();
  await page.getByLabel("당직 사용", { exact: true }).check();
  await expect(page.locator(".work-plan-table")).toContainText(
    "가상 당직 담당자",
  );
  await page
    .getByRole("button", { name: "업무계획 저장", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장되었습니다" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/refined-weekly.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "월중계획", exact: true }).click();
  await expect(page.locator(".work-month-board>.work-weekday")).toHaveCount(7);
  await page.screenshot({
    path: ".artifacts/refined-monthly.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: ".artifacts/work-monthly.pdf",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".artifacts/refined-work-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "목록", exact: true }).click();
  await expect(page.locator(".work-month-list")).toContainText(
    "가상 교직원 협의회",
  );
});

test("high-school draft retains credit units in cells and deletion impact", async ({
  page,
}) => {
  await loginAs(page, admin);
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("학교명", { exact: true })
    .fill(`학점 검증 학교 ${Date.now()}`);
  await dialog.getByLabel("학교급", { exact: true }).selectOption("고등학교");
  await dialog
    .getByRole("button", { name: "학교 작업공간 만들기", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/app\/[^/]+\/settings/);
  await expect(page.getByLabel("학교급", { exact: true })).toHaveValue(
    "고등학교",
  );
  await page.getByRole("link", { name: "교육과정", exact: true }).click();
  await page.getByRole("tab", { name: "총론 기반 초안" }).click();
  await expect(page.locator("tfoot")).toContainText("192");
  await page.getByRole("button", { name: "이 초안으로 편성표 만들기" }).click();
  await expect(
    page.getByLabel("[초안] 국어 1학년 1학기 학점", { exact: true }),
  ).toHaveValue("2");
  await page.reload();
  await expect(
    page.getByLabel("[초안] 국어 1학년 1학기 학점", { exact: true }),
  ).toHaveValue("2");
  await page.getByRole("tab", { name: "교과군·과목 설정" }).click();
  await page
    .getByRole("button", { name: "[초안] 국어 과목 삭제", exact: true })
    .click();
  dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("8학점");
  await expect(dialog).not.toContainText("8시간");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "[초안] 국어 과목 삭제", exact: true }),
  ).toBeVisible();
});
