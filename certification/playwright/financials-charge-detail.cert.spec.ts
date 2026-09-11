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

/*
 * SELECT WHATEVER THE TENANT ACTUALLY HAS.
 *
 * The Charges section holds two views: drafts awaiting posting, and the posted record. A shared
 * tenant may legitimately have none of the first — another lane posts them — and a case about
 * "a selected charge explains itself" is not a case about drafts. So this takes whichever view has
 * work in it and fails only when neither does.
 */
async function selectAnyCharge(page: Page, shell: Locator): Promise<"awaiting" | "posted"> {
    await shell.locator('[data-workspace-section-tab="charges"]').click();
    await page.waitForTimeout(8_000);

    const drafts = page.locator("[data-financials-queue-row]");
    if ((await drafts.count()) > 0) {
        await drafts.first().click();
        await page.waitForTimeout(10_000);
        return "awaiting";
    }

    await page.locator('[data-financials-charges-view="posted"]').click();
    await page.waitForTimeout(10_000);
    const posted = page.locator("[data-financials-posted-row]");
    expect(await posted.count(), "neither charges view has anything to select").toBeGreaterThan(0);
    await posted.first().click();
    await page.waitForTimeout(10_000);
    return "posted";
}

test("charge detail explains the selected obligation", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
    test.setTimeout(900_000);
    const shell = await openFinancials(page);
    await selectAnyCharge(page, shell);

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
    const view = await selectAnyCharge(page, shell);
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
    if (view === "posted") {
        await page.locator('[data-financials-charges-view="posted"]').click();
        await page.waitForTimeout(10_000);
        await page.locator("[data-financials-posted-row]").first().click();
    } else {
        await page.locator("[data-financials-queue-row]").first().click();
    }
    await page.waitForTimeout(10_000);
    const after = await page.locator("[data-financials-charge-detail]").innerText();
    expect(after, "the same charge read differently after a reload").toBe(before);
});

test("charge detail stays usable at a narrow viewport", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
    test.setTimeout(900_000);
    await page.setViewportSize({ width: 900, height: 800 });
    const shell = await openFinancials(page);
    await selectAnyCharge(page, shell);
    const detail = page.locator("[data-financials-charge-detail]");
    await expect(detail).toBeVisible({ timeout: 60_000 });
    const box = await detail.boundingBox();
    expect(box, "the charge detail has no box at a narrow viewport").toBeTruthy();
    expect(box!.width, "the charge detail collapsed at a narrow viewport").toBeGreaterThan(200);
    await page.screenshot({ path: "evidence/screens/charge-detail-narrow.png", fullPage: false });
});


/*
 * THE RECORD, NOT ONLY THE WORK.
 *
 * Charge detail was reachable from the draft queue alone, so posted obligations — the ones carrying
 * responsibility, funding, applications and suppression — could not be opened at all. Both views
 * now converge on the same detail surface, and the action offered is the one the charge's own state
 * allows.
 */
test("posted charges are reachable and offer the action their state allows", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
    test.setTimeout(900_000);
    const shell = await openFinancials(page);
    await shell.locator('[data-workspace-section-tab="charges"]').click();
    await page.waitForTimeout(8_000);

    await expect(page.locator('[data-financials-charges-view="awaiting"]')).toBeVisible();
    await page.locator('[data-financials-charges-view="posted"]').click();
    await page.waitForTimeout(10_000);

    const posted = page.locator("[data-financials-posted-row]");
    expect(await posted.count(), "no posted charge is reachable").toBeGreaterThan(0);
    await posted.first().click();
    await page.waitForTimeout(12_000);

    const detail = page.locator("[data-financials-charge-detail]");
    await expect(detail, "a posted charge opens the same detail surface").toBeVisible({ timeout: 60_000 });
    // eslint-disable-next-line no-console
    console.log("[posted-charge] full panel text:\n" + (await detail.innerText()));

    await expect(
        page.locator("[data-financials-charge-status]"),
        "the posted charge states its lifecycle",
    ).toBeVisible();

    /*
     * THE ACTION THE STATE ALLOWS. A posted charge is reversed, not posted again. Neither control
     * decides whether it may run — the registered command does — but offering Post here would be a
     * product claim that the charge is still a draft.
     */
    await expect(page.locator("[data-financials-reverse-charge]")).toHaveCount(1);
    await expect(page.locator("[data-financials-post-charge]")).toHaveCount(0);

    /* Money that was taken back may not be presented as money that settled something. */
    const reversedRows = page.locator('[data-financials-charge-line="application-reversed"]');
    const appliedRows = page.locator('[data-financials-charge-line="application"]');
    if ((await reversedRows.count()) > 0) {
        expect(
            (await reversedRows.first().innerText()).toLowerCase(),
            "a reversed application must say so",
        ).toContain("reversed");
    }
    void appliedRows;

    // Switching back returns to the work queue: the two questions stay separate.
    await page.locator('[data-financials-charges-view="awaiting"]').click();
    await page.waitForTimeout(6_000);
    await expect(shell).toHaveAttribute("data-financials-section", "charges");

    await page.screenshot({ path: "evidence/screens/posted-charge-detail.png", fullPage: false });
});
