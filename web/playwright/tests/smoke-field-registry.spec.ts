import { test, expect } from "@playwright/test";

const email = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim();
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD?.trim();
/** Visible label of a *custom* (non-system) person field in the drawer form */
const personCustomFieldLabel = process.env.PLAYWRIGHT_PERSON_CUSTOM_FIELD_LABEL?.trim();

test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD");
    await page.goto("/login");
    await page.locator("#email").fill(email!);
    await page.locator("#password").fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/admin/, { timeout: 30000 });
});

test("customer drawer shows record number (Customer #)", async ({ page }) => {
    await page.goto("/admin/customers");
    await page.locator("tbody tr").first().waitFor({ state: "visible", timeout: 30000 });
    await page.locator("tbody tr").first().click();
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/customer #/i).first()).toBeVisible({ timeout: 15000 });

    const drawerText = await page.locator(".max-w-2xl").innerText();
    const uuidLine = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bareUuidShown = drawerText
        .split("\n")
        .map((l) => l.trim())
        .some((l) => l.length > 0 && uuidLine.test(l));
    expect(bareUuidShown).toBe(false);
});

test("job drawer shows record number (Job #)", async ({ page }) => {
    await page.goto("/admin/jobs");
    await page.locator("tbody tr").first().waitFor({ state: "visible", timeout: 30000 });
    await page.locator("tbody tr").first().click();
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/job #/i).first()).toBeVisible({ timeout: 15000 });
});

test("person drawer: custom field edit and Saved", async ({ page }) => {
    test.skip(!personCustomFieldLabel, "Set PLAYWRIGHT_PERSON_CUSTOM_FIELD_LABEL to a custom person field label");

    await page.goto("/admin/people");
    await page.locator("tbody tr").first().waitFor({ state: "visible", timeout: 30000 });
    await page.locator("tbody tr").first().click();
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/person #/i).first()).toBeVisible({ timeout: 15000 });

    const field = page.getByLabel(personCustomFieldLabel as string, { exact: false }).first();
    await expect(field).toBeVisible({ timeout: 10000 });
    await field.fill(`pw-smoke-${Date.now()}`);
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 20000 });
});
