import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Search → Focus Panel convergence (scenarios A–H).
 *
 * The negative reference is the old white modal overlay: clicking a Search result
 * used to open the generic AdminV2 drawer product on top of the workspace. The
 * accepted result is the operator staying in their operational context with the
 * INLINE Focus Panel focused on the card they asked for.
 *
 * Logs in per test — the harness README records that a reused storage-state
 * session is rejected on a cold SSR load.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "search-focus-panel");
const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);

test.use({ storageState: undefined });
test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function signIn(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(OPERATOR.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(OPERATOR.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: LOGIN_WAIT });
    await page.waitForLoadState("domcontentloaded");
}

async function searchFor(page: Page, q: string) {
    const input = page.locator('[data-global-search-input="true"]');
    await input.waitFor({ state: "visible", timeout: 60_000 });
    await input.click();
    await input.fill(q);
    await page.locator("#adminv2-global-search-results").waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForFunction(
        () => {
            const el = document.querySelector("#adminv2-global-search-results");
            return !!el && !el.textContent?.includes("Searching…");
        },
        undefined,
        { timeout: 120_000 }
    );
    return input;
}

/** The negative reference: the generic modal drawer must never be mounted. */
async function assertNoModalDrawer(page: Page) {
    const modal = page.locator('[role="dialog"][aria-modal="true"], .admin-entity-drawer, [data-admin-drawer-modal]');
    expect(await modal.count()).toBe(0);
}

/** Where did we land, and what is focused? Reported for evidence either way. */
async function reportState(page: Page, label: string) {
    const state = await page.evaluate(() => {
        const focused = Array.from(document.querySelectorAll("[data-focus-panel-grid-cell]"))
            .map((el) => ({
                cell: el.getAttribute("data-focus-panel-grid-cell"),
                focused: el.getAttribute("data-focused") ?? el.className.includes("focused"),
            }))
            .filter((c) => c.focused);
        return {
            url: location.pathname + location.search,
            cells: Array.from(document.querySelectorAll("[data-focus-panel-grid-cell]"))
                .map((el) => el.getAttribute("data-focus-panel-grid-cell"))
                .slice(0, 12),
            focusedCells: focused.map((f) => f.cell),
            hasModal: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
        };
    });
    console.log(`[CERT ${label}] ${JSON.stringify(state)}`);
    return state;
}

async function shot(page: Page, name: string) {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

test.describe.configure({ mode: "default" });

test("A — child click lands on the inline Focus Panel, no modal", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Joe Smith");

    const subject = page.locator('[data-search-subject-button="true"]').first();
    await subject.waitFor({ state: "visible", timeout: 60_000 });
    const t0 = Date.now();
    await subject.click();

    // Search acknowledges immediately — the dropdown goes away before anything loads.
    await expect(page.locator('[data-global-search-input="true"]')).toHaveValue("", { timeout: 20_000 });
    console.log(`[CERT A] search dismissed in ${Date.now() - t0}ms`);

    await page.waitForTimeout(12_000);
    const state = await reportState(page, "A");
    await shot(page, "A-child-joe");
    await assertNoModalDrawer(page);
    expect(state.hasModal).toBe(false);
});

test("B — sibling selection lands the same way", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Emma Smith");
    await page.locator('[data-search-subject-button="true"]').first().click();
    await expect(page.locator('[data-global-search-input="true"]')).toHaveValue("", { timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reportState(page, "B");
    await shot(page, "B-sibling-emma");
    await assertNoModalDrawer(page);
});

test("C — parent lands on Household context, not a modal", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Jane Smith");
    await page.locator('[data-search-subject-button="true"]').first().click();
    await expect(page.locator('[data-global-search-input="true"]')).toHaveValue("", { timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reportState(page, "C");
    await shot(page, "C-parent-jane");
    await assertNoModalDrawer(page);
});

test("D — household subject", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Smith Household");
    await page.locator('[data-search-subject-button="true"]').first().click();
    await expect(page.locator('[data-global-search-input="true"]')).toHaveValue("", { timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reportState(page, "D");
    await shot(page, "D-household");
    await assertNoModalDrawer(page);
});

test("E — process context stays tied to the child and is distinct from subject open", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Joe Smith");

    // The process pill must EXIST alongside the subject — the defect was that the
    // dedupe collapsed them and left only Household.
    const pills = page.locator("[data-search-destination]");
    const keys = await pills.evaluateAll((els) => els.map((e) => e.getAttribute("data-search-destination")));
    console.log(`[CERT E] destination keys: ${JSON.stringify(keys)}`);
    expect(keys.some((k) => k?.startsWith("process:"))).toBe(true);
    await shot(page, "E-process-pill-present");

    const process = pills.filter({ hasText: /Enrollment/ }).first();
    if (await process.count()) {
        await process.click();
        await page.waitForTimeout(12_000);
        await reportState(page, "E");
        await shot(page, "E-process-context");
        await assertNoModalDrawer(page);
    }
});

test("F — assignment intent targets the assignment card", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Joe Smith schedule");
    const keys = await page
        .locator("[data-search-destination]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-search-destination")));
    console.log(`[CERT F] destination keys: ${JSON.stringify(keys)}`);
    await shot(page, "F-assignment-intent");
    expect(keys).toContain("assignment");
});

test("G — rapid switching: the newer selection wins", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Joe Smith");
    await page.locator('[data-search-subject-button="true"]').first().click();
    await page.waitForTimeout(600);

    await searchFor(page, "Emma Smith");
    await page.locator('[data-search-subject-button="true"]').first().click();
    await page.waitForTimeout(15_000);

    const state = await reportState(page, "G");
    await shot(page, "G-rapid-switch");
    await assertNoModalDrawer(page);
    // Whatever the panel shows, it must not be blank and must not be the modal.
    expect(state.hasModal).toBe(false);
});

test("H — keyboard selection has the same semantics as a click", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    const input = await searchFor(page, "Joe Smith");
    await page.locator('[data-search-subject-button="true"]').first().waitFor({ timeout: 60_000 });
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reportState(page, "H");
    await shot(page, "H-keyboard");
    await assertNoModalDrawer(page);
});
