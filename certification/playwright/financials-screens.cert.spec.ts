/**
 * PRODUCT EVIDENCE — what an operator actually sees, captured for review.
 *
 * Not a test. It asserts nothing about pixels and fails nothing on layout; the density suite owns
 * the assertions. This exists because "is Financials demo-ready?" is a question a person answers by
 * looking, and the honest way to answer it is to photograph the real mounted product against the
 * representative tenant rather than to describe it.
 *
 * Written to `certification/evidence/screens/`.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

const HOME = "/workspace";
const OUT = "evidence/screens";

function sectionTab(shell: Locator, key: string): Locator {
    return shell.locator(`[data-workspace-section-tab="${key}"]`);
}
function modeTab(shell: Locator, key: string): Locator {
    return shell.locator(`[data-alloy-mode="${key}"]`);
}

async function openFinancials(page: Page): Promise<Locator> {
    await page.goto(HOME);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(30_000);
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').click();
    const shell = page.locator('[data-testid="financials-workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 60_000 });
    return shell;
}

/** Nothing is photographed while it is still loading; a picture of a skeleton evidences nothing. */
async function settle(page: Page) {
    await expect
        .poll(
            async () =>
                (await page.locator('[data-settlement-reserved="kpi"]').count())
                + (await page.locator('[data-settlement-reserved="exception"]').count())
                + (await page.locator("text=/^Loading /i").count()),
            { timeout: 120_000 },
        )
        .toBe(0);
    await page.waitForTimeout(2_000);
}

test("financials product screenshots", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "authorized evidence only");
    test.setTimeout(900_000);
    const shell = await openFinancials(page);

    // 1 · OVERVIEW
    await settle(page);
    await page.screenshot({ path: `${OUT}/01-overview.png`, fullPage: false });

    // 2 · ACCOUNTS, with a household selected and its canonical detail open
    await sectionTab(shell, "accounts").click();
    await page.waitForTimeout(6_000);
    await settle(page);
    await page.locator("[data-financials-account-row]").first().click();
    await page.waitForTimeout(8_000);
    await settle(page);
    await page.screenshot({ path: `${OUT}/02-accounts-detail.png`, fullPage: false });

    // 3 · CHARGES
    await sectionTab(shell, "charges").click();
    await page.waitForTimeout(6_000);
    await settle(page);
    await page.screenshot({ path: `${OUT}/03-charges.png`, fullPage: false });

    // 4 · PAYMENTS
    await sectionTab(shell, "payments").click();
    await page.waitForTimeout(6_000);
    await settle(page);
    await page.screenshot({ path: `${OUT}/04-payments.png`, fullPage: false });

    // 5 · SUBSIDY
    await sectionTab(shell, "subsidy").click();
    await page.waitForTimeout(6_000);
    await settle(page);
    await page.screenshot({ path: `${OUT}/05-subsidy.png`, fullPage: false });

    // 6 · ACTIVITY
    await sectionTab(shell, "activity").click();
    await page.waitForTimeout(6_000);
    await settle(page);
    await page.screenshot({ path: `${OUT}/06-activity.png`, fullPage: false });

    // 7 · STUDIO
    await modeTab(shell, "studio").click();
    await page.waitForTimeout(6_000);
    await settle(page);
    await page.screenshot({ path: `${OUT}/07-studio.png`, fullPage: false });

    // 8 · A SINGLE CAMPUS — the narrowed operational cohort
    await modeTab(shell, "work").click();
    await page.waitForTimeout(4_000);
    await sectionTab(shell, "accounts").click();
    await page.waitForTimeout(6_000);
    await settle(page);
    const picker = shell.getByRole("button", { name: "Site" });
    if (await picker.isVisible().catch(() => false)) {
        await picker.click();
        const riverside = page.getByRole("option", { name: /Riverside/i });
        if (await riverside.isVisible().catch(() => false)) {
            await riverside.click();
            await page.waitForTimeout(8_000);
            await settle(page);
        }
    }
    await page.screenshot({ path: `${OUT}/08-riverside-narrowed.png`, fullPage: false });
});
