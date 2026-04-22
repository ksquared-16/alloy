import { test, expect } from "@playwright/test";

const email = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim();
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim();

test.beforeEach(async ({ page }) => {
  test.skip(!email || !password, "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD");
  await page.goto("/login");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/, { timeout: 30000 });
});

test("Enrollment sprint screenshots", async ({ page }) => {
  // 1) /adminV2/workspace
  await page.goto("/adminV2/workspace");
  await expect(page.getByText("Organization workspace")).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "playwright/artifacts/enrollment-1-workspace.png", fullPage: true });

  // 2) /dept (Enrollment)
  const enrollmentCard = page.getByRole("link", { name: /enrollment/i }).first();
  await expect(enrollmentCard).toBeVisible({ timeout: 30000 });
  await enrollmentCard.click();
  await expect(page.getByRole("heading", { name: /enrollment/i }).first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "playwright/artifacts/enrollment-2-dept.png", fullPage: true });

  // 3) /work-unit for All inquiries
  const allInquiries = page.getByRole("link", { name: /all inquiries/i }).first();
  await expect(allInquiries).toBeVisible({ timeout: 30000 });
  await allInquiries.click();
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "playwright/artifacts/enrollment-3-work-unit-all-inquiries.png", fullPage: true });

  // 4) One opportunity record view (open first row)
  const firstRow = page.locator("[data-ws-queue-id] .adminv2-ws-wu-queue-card").first();
  await expect(firstRow).toBeVisible({ timeout: 30000 });
  await firstRow.click();
  // Drawer/modal should appear with record headline.
  await expect(page.locator("h2").first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "playwright/artifacts/enrollment-4-opportunity-record.png", fullPage: true });
});

