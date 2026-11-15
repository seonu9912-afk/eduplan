import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("2027 중학교 국어 2학년 주차 연동과 Supabase 재조회", async ({ page }) => {
  const fixtures = JSON.parse(readFileSync(".test-secrets.json", "utf8")) as {
    users: { role: string; email: string; password: string }[];
  };
  const admin = fixtures.users.find(user => user.role === "admin")!;
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(admin.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(admin.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: "학교 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("학교명", { exact: true }).fill("국어 주차 연동 테스트 " + Date.now());
  await dialog.getByRole("button", { name: "학교 작업공간 만들기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("개설할 학년도").fill("2027");
  await page.getByRole("button", { name: "학년도 설정 저장" }).click();
  await expect(page.getByLabel("학년도 선택")).toHaveValue("2027");

  await page.getByRole("link", { name: "학사운영", exact: true }).click();
  await page.getByRole("button", { name: "연간 계획 저장", exact: true }).click();
  await expect(page.getByText("저장본 v1", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await page.getByRole("button", { name: "새 수업 설정", exact: true }).click();
  await dialog.getByLabel("수업 학년", { exact: true }).selectOption("2");
  await dialog.getByLabel("수업 과목명", { exact: true }).fill("국어");
  await dialog.getByLabel("수업 기간", { exact: true }).selectOption("1");
  await dialog.getByRole("button", { name: "수업 만들기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const table = page.getByRole("table", { name: "주차별 교수학습계획" });
  const firstWeek = table.locator("tbody tr").first();
  await expect(firstWeek).toContainText("삼일절");
  await firstWeek.getByRole("textbox", { name: "3월 1주 단원명" }).fill("단원 하나\n단원 둘");
  await firstWeek.getByRole("textbox", { name: "3월 1주 직접 작성 비고" }).fill("교사 직접 비고");
  await expect(page.locator(".plan-savebar")).toContainText("저장 완료");
  await page.reload();
  await expect(firstWeek.getByRole("textbox", { name: "3월 1주 단원명" })).toHaveValue("단원 하나\n단원 둘");

  await page.getByRole("link", { name: "학사운영", exact: true }).click();
  await page.getByRole("button", { name: "2027-03-02 수업일", exact: true }).click();
  await page.getByRole("checkbox", { name: "사용", exact: true }).uncheck();
  await page.getByRole("button", { name: "선택 기간 적용", exact: true }).click();
  await page.getByRole("button", { name: "연간 계획 저장", exact: true }).click();
  await expect(page.getByText("저장본 v2", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "수업·평가", exact: true }).click();
  await expect(firstWeek).toContainText("휴업일(3.2.)");
  await expect(firstWeek.getByRole("textbox", { name: "3월 1주 직접 작성 비고" })).toHaveValue("교사 직접 비고");
  await page.getByRole("button", { name: "전체 문서 미리보기", exact: true }).click();
  await expect(page.locator(".teaching-report-preview")).toContainText("단원 하나");
});
