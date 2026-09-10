/**
 * CHARGE DETAIL, IN THE MOUNTED PRODUCT.
 *
 * The Charges pane used to answer "how is this household doing?" and never "what is this charge?".
 * These cases drive the real application and read the whole rendered panel — never a truncated
 * excerpt, because a probe that cuts its own output short reports absence it did not observe.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

const HOME = "/workspace";

async function openFinancials(page: Page): Promise<Locator> {
    await page.goto(HOME);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(30_000);
    const nav = page.locator('[data-adminv2-sidebar-modal-nav="financials"]');
    await expect(nav, "Financials must appear in the left navigation").toBeVisible({ timeout: 60_000 });
    await nav.click();
    const shell = page.locator('[data-testid="financials-workspace-shell"]');
    await expect(shell, "the canonical workspace shell opens").toBeVisible({ timeout: 60_000 });
    return shell;
}

test("charge detail explains the selected obligation", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
    test.setTimeout(900_000);
    const shell = await openFinancials(page);

    await shell.locator('[data-workspace-section-tab="charges"]').click();
    await page.waitForTimeout(8_000);

    const rows = page.locator("[data-financials-queue-row]");
    expect(await rows.count(), "the charges queue has nothing to select").toBeGreaterThan(0);
    await rows.first().click();
    await page.waitForTimeout(10_000);

    // ── THE DETAIL RESOLVED BY ID, not from the row that was clicked ──────────────────────────
    const detail = page.locator("[data-financials-charge-detail]");
    await expect(detail, "selecting a charge opens its own detail").toBeVisible({ timeout: 60_000 });
    await expect(
        page.locator('[data-financials-charge-detail-error="true"]'),
        "the charge read failed",
    ).toHaveCount(0);

    const text = await detail.innerText();
    // eslint-disable-next-line no-console
    console.log("[charge-detail] full panel text:\n" + text);

    // IDENTITY BEFORE MONEY.
    await expect(page.locator('[data-financials-charge-label="true"]')).toBeVisible();
    const label = (await page.locator('[data-financials-charge-label="true"]').innerText()).trim();
    expect(label.length, "the charge renders no label").toBeGreaterThan(0);
    expect(label, "an internal billable-source key is being used as the label").not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
    );

    /*
     * ATTRIBUTION IS ONE OF THREE MEANINGS, and the surface must say which. "Household" and
     * "we cannot establish the subject" are different claims and may not share a rendering.
     */
    const attribution = page.locator("[data-financials-charge-attribution]");
    await expect(attribution).toBeVisible();
    const state = await attribution.getAttribute("data-financials-charge-attribution");
    expect(["child", "household", "unresolved"], `unknown attribution state ${state}`).toContain(state);

    // LIFECYCLE, STATED.
    const status = page.locator("[data-financials-charge-status]");
    await expect(status).toBeVisible();
    expect((await status.getAttribute("data-financials-charge-status")) ?? "").not.toBe("");

    /*
     * THE ACCOUNT CARD IS STILL THERE — the obligation is explained BESIDE Thread 2, never instead
     * of it. `data-financials-account-detail` is the Accounts section's own wrapper; in this pane
     * the card is mounted directly, so the card's own marker is what proves it.
     */
    await expect(
        page.locator('[data-financials-card]').first(),
        "the canonical account card must still mount beneath the charge",
    ).toBeVisible({ timeout: 60_000 });

    // CONTEXT SURVIVES: still Financials, still the Charges section.
    await expect(shell).toHaveAttribute("data-financials-section", "charges");

    await page.screenshot({ path: "evidence/screens/charge-detail.png", fullPage: false });
});

test("charge detail reconstructs after a cold reload", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
    test.setTimeout(900_000);
    const shell = await openFinancials(page);
    await shell.locator('[data-workspace-section-tab="charges"]').click();
    await page.waitForTimeout(8_000);
    await page.locator("[data-financials-queue-row]").first().click();
    await page.waitForTimeout(10_000);
    const before = await page.locator("[data-financials-charge-detail]").innerText();

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(30_000);
    const shellAfter = await (async () => {
        const nav = page.locator('[data-adminv2-sidebar-modal-nav="financials"]');
        if (await nav.isVisible().catch(() => false)) await nav.click();
        const s = page.locator('[data-testid="financials-workspace-shell"]');
        await expect(s).toBeVisible({ timeout: 60_000 });
        return s;
    })();
    await shellAfter.locator('[data-workspace-section-tab="charges"]').click();
    await page.waitForTimeout(8_000);
    await page.locator("[data-financials-queue-row]").first().click();
    await page.waitForTimeout(10_000);
    const after = await page.locator("[data-financials-charge-detail]").innerText();
    expect(after, "the same charge read differently after a reload").toBe(before);
});

test("charge detail stays usable at a narrow viewport", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
    test.setTimeout(900_000);
    await page.setViewportSize({ width: 900, height: 800 });
    const shell = await openFinancials(page);
    await shell.locator('[data-workspace-section-tab="charges"]').click();
    await page.waitForTimeout(8_000);
    await page.locator("[data-financials-queue-row]").first().click();
    await page.waitForTimeout(10_000);
    const detail = page.locator("[data-financials-charge-detail]");
    await expect(detail).toBeVisible({ timeout: 60_000 });
    const box = await detail.boundingBox();
    expect(box, "the charge detail has no box at a narrow viewport").toBeTruthy();
    expect(box!.width, "the charge detail collapsed at a narrow viewport").toBeGreaterThan(200);
    await page.screenshot({ path: "evidence/screens/charge-detail-narrow.png", fullPage: false });
});
