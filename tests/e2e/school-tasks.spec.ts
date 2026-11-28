import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const fixture = process.env.EDUPLAN_TASK_FIXTURES;
test.skip(!fixture, "이 검증은 격리된 Supabase의 가상 학교와 교원 계정이 필요합니다.");
type TestAccount = { email: string; password: string };
type Scenario = { workspace: string; year: number; sender: TestAccount; recipient: TestAccount; second: TestAccount; administrator: TestAccount; sourceId?: string; sourceTitle?: string };
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });

async function login(page: Page, account: TestAccount) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(account.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
}

test("one shared task flows from distribution and alerts to the home and weekly lists", async ({ page, browser }) => {
  const data = JSON.parse(readFileSync(fixture!, "utf8")) as Scenario;
  const root = `/app/${data.workspace}`;
  const home = `${root}/home?year=${data.year}`;
  const plans = `${root}/plans?year=${data.year}`;
  const recipient = await browser.newContext({ viewport: { width: 320, height: 850 }, hasTouch: true, isMobile: true });
  const separate = await browser.newContext();
  const admin = await browser.newContext();
  const [receiver, other, schoolAdmin] = await Promise.all([recipient.newPage(), separate.newPage(), admin.newPage()]);
  const task = "교원 연계 테스트 업무 " + Date.now();
  const privateTask = "교원 개인 검증 " + Date.now();
  const scope = (p: Page) => p.locator("#my-tasks");
  const taskRow = (p: Page, title: string) => scope(p).getByRole("listitem")
    .filter({ has: p.getByRole("checkbox", { name: `${title} 완료`, exact: true }) });
  const field = (p: Page) => p.getByLabel("제목", { exact: true });
  try {
    await Promise.all([login(page, data.sender), login(receiver, data.recipient), login(other, data.second), login(schoolAdmin, data.administrator)]);
    await page.goto(home);
    await scope(page).getByRole("button", { name: "할 일 추가", exact: true }).click();
    await field(page).fill(privateTask);
    await dialog(page, "개인 할 일 추가").getByRole("button", { name: "저장", exact: true }).click();
    await expect(scope(page).getByText(privateTask, { exact: true })).toBeVisible();
    await scope(page).getByRole("checkbox",{name:privateTask+" 완료",exact:true}).check();
    const todayDone = (p: Page) => scope(p).locator(".task-history-today");
    await expect(todayDone(page).getByRole("checkbox", { name: privateTask+" 완료", exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: "실행 취소", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "실행 취소", exact: true }).click();
    await expect(scope(page).getByRole("checkbox", { name: privateTask+" 완료", exact: true })).not.toBeChecked();
    await scope(page).getByRole("checkbox", { name: privateTask+" 완료", exact: true }).check();
    await expect(todayDone(page).getByRole("checkbox", { name: privateTask+" 완료", exact: true })).toBeChecked();
    await page.reload();
    await expect(scope(page).getByRole("checkbox",{name:privateTask+" 완료",exact:true})).toBeChecked();
    await scope(page).getByRole("checkbox",{name:privateTask+" 완료",exact:true}).uncheck();
    await expect(scope(page).getByRole("checkbox",{name:privateTask+" 완료",exact:true})).not.toBeChecked();
    await schoolAdmin.goto(home);
    await expect(scope(schoolAdmin).getByText(privateTask, { exact: true })).toHaveCount(0);
    await expect(scope(schoolAdmin).getByRole("button", { name: "업무 배포", exact: true })).toHaveCount(0);

    await scope(page).getByRole("button", { name: "업무 배포", exact: true }).click();
    await field(page).fill(task);
    await page.getByLabel("마감일", { exact: true }).fill(`${data.year}-11-20`);
    await dialog(page, "업무 배포").getByRole("checkbox", { name: "전체 교원", exact: true }).check();
    await dialog(page, "업무 배포").getByText("부서·학년 담임 선택", { exact: true }).click();
    await dialog(page, "업무 배포").getByRole("checkbox", { name: "1학년 담임", exact: true }).check();
    await expect(dialog(page, "업무 배포").getByText("수신자 미리보기 · 3명")).toBeVisible();
    await dialog(page, "업무 배포").getByRole("button", { name: "업무 배포", exact: true }).click();
    await expect(dialog(page, "배포한 업무 관리").getByText(task, { exact: true })).toBeVisible();

    await receiver.goto(`${root}/notifications?year=${data.year}`);
    const notice = receiver.getByRole("listitem").filter({ hasText: task });
    await notice.getByRole("link", { name: "할 일 열기" }).click();
    await expect(dialog(receiver, "할 일 상세").getByRole("heading", { name: task })).toBeVisible();
    await expect(dialog(receiver, "할 일 상세").getByRole("button", { name: "완료 처리" })).toBeVisible();
    await dialog(receiver, "할 일 상세").getByRole("button", { name: "닫기" }).click();
    await expect(taskRow(receiver, task).getByText("기한 경과", { exact: true })).toBeVisible();
    const taskCheckbox = scope(receiver).getByRole("checkbox", { name: `${task} 완료` });
    const geometry = await taskCheckbox.evaluate(el => {
      const box = el.getBoundingClientRect();
      const label = el.closest("label")!.getBoundingClientRect();
      return { width: box.width, height: box.height, padding: getComputedStyle(el).padding, touchWidth: label.width, touchHeight: label.height };
    });
    expect(geometry.width).toBe(18);
    expect(geometry.height).toBe(18);
    expect(geometry.padding).toBe("0px");
    expect(geometry.touchWidth).toBeGreaterThanOrEqual(44);
    expect(geometry.touchHeight).toBeGreaterThanOrEqual(44);
    await taskCheckbox.click();
    await expect(todayDone(receiver).getByRole("checkbox", { name: task+" 완료", exact: true })).toBeChecked();
    const toast = receiver.locator(".task-undo");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCSS("position", "fixed");
    const toastBox = await toast.boundingBox();
    const navBox = await receiver.locator(".mobile-bottom-nav").boundingBox();
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(navBox!.y);
    await receiver.goto(plans);
    await expect(todayDone(receiver)).toHaveAttribute("open", "");
    await expect(scope(receiver).getByRole("checkbox", { name: `${task} 완료` })).toBeChecked();
    await receiver.getByRole("button", { name: "이전 기간" }).click();
    await expect(scope(receiver).getByRole("checkbox", { name: `${task} 완료` })).toBeChecked();

    await other.goto(home);
    await expect(scope(other).getByRole("checkbox", { name: `${task} 완료` })).not.toBeChecked();
    await expect(scope(other).getByText(privateTask, { exact: true })).toHaveCount(0);
    await page.reload();
    await scope(page).getByRole("button", { name: "배포한 업무", exact: true }).click();
    await dialog(page, "배포한 업무 관리").getByText(task, { exact: true }).click();
    await expect(dialog(page, "배포한 업무 관리").getByText("완료 1명 / 전체 3명 · 미완료 2명")).toBeVisible();
    await dialog(page, "배포한 업무 관리").getByRole("button", { name: "업무 수정" }).click();
    const updated = task + " 수정";
    await field(page).fill(updated);
    await page.getByLabel("마감일", { exact: true }).fill(`${data.year + 1}-01-10`);
    await dialog(page, "할 일 수정").getByRole("button", { name: "저장", exact: true }).click();
    await expect(dialog(page, "배포한 업무 관리").getByText("완료 1명 / 전체 3명 · 미완료 2명")).toBeVisible();

    await other.reload();
    await expect(scope(other).getByText(updated, { exact: true })).toBeVisible();
    await expect(taskRow(other, updated).getByText("기한 경과", { exact: true })).toHaveCount(0);
    await dialog(page, "배포한 업무 관리").getByRole("button", { name: "업무 취소" }).click();
    await page.getByRole("button", { name: "변경 확인", exact: true }).click();
    await expect(dialog(page, "배포한 업무 관리").getByText("취소", { exact: true })).toBeVisible();
    await receiver.goto(home);
    await scope(receiver).getByText(/^취소된 업무 \(\d+\)$/).click();
    const box = scope(receiver).getByRole("checkbox", { name: `${updated} 완료` });
    await expect(box).toBeChecked();
    await expect(box).toBeDisabled();
    for (const width of [320, 390]) {
      await receiver.setViewportSize({ width, height: 850 });
      await expect.poll(() => receiver.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  } finally {
    await Promise.all([recipient.close(), separate.close(), admin.close()]);
  }
});

test("creates a linked task from a published work item and opens the exact source", async ({ page, browser }) => {
  const data = JSON.parse(readFileSync(fixture!, "utf8")) as Scenario;
  const base = `/app/${data.workspace}`;
  const context = await browser.newContext();
  const receiver = await context.newPage();
  const title = data.sourceTitle ?? "공개 업무 연결 자료";
  const sourceId = encodeURIComponent(data.sourceId ?? "task-browser-source");
  try {
    await login(page, data.sender);
    await page.goto(`${base}/plans?year=${data.year}&date=${data.year}-11-27&workItem=${sourceId}`);
    await expect(dialog(page, "일정 상세").getByRole("heading", { name: title })).toBeVisible();
    await dialog(page, "일정 상세").getByRole("link", { name: "할 일로 배포" }).click();
    await expect(dialog(page, "업무 배포").getByLabel("제목", { exact: true })).toHaveValue(title);
    await dialog(page, "업무 배포").getByRole("checkbox", { name: "공개 업무계획 날짜를 마감일로 사용", exact: true }).check();
    await dialog(page, "업무 배포").getByRole("checkbox", { name: "전체 교원", exact: true }).check();
    await dialog(page, "업무 배포").getByRole("button", { name: "업무 배포", exact: true }).click();
    await expect(dialog(page, "배포한 업무 관리").getByText(title, { exact: true })).toBeVisible();
    await login(receiver, data.recipient);
    await receiver.goto(`${base}/home?year=${data.year}`);
    await receiver.locator("#my-tasks").getByRole("button")
      .filter({ has: receiver.getByText(title, { exact: true }) }).click();
    await expect(dialog(receiver, "할 일 상세").getByText(/11월 27일.*공개 업무계획 날짜 연동/)).toBeVisible();
    await dialog(receiver, "할 일 상세").getByRole("link", { name: "원본 업무계획 보기" }).click();
    await expect(dialog(receiver, "일정 상세").getByRole("heading", { name: title })).toBeVisible();
  } finally {
    await context.close();
  }
});
