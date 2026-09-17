/** What the account shell's FIRST frame actually contains on the hosted tenant, vs hydrated. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const HOUSEHOLD = "fd000000-0000-4000-8000-0000000c0001";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });

test("first frame anatomy", async ({ page }) => {
    test.setTimeout(400_000);
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell).toBeVisible({ timeout: 120_000 });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`);
    await expect(row).toBeVisible({ timeout: 120_000 });

    // Record every distinct frame of the card from the click onward.
    await page.evaluate(() => {
        const w = window as unknown as { __f?: string[] };
        w.__f = [];
        let last = "";
        const tick = () => {
            const c = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
            const s = c
                ? `h=${Math.round(c.getBoundingClientRect().height)} reserved=${c.getAttribute("data-financials-reserved") ?? "-"} account=${c.getAttribute("data-financials-account") ?? "-"} stats=${c.querySelectorAll(".alloy-os-fdetail__stat").length} buttons=${c.querySelectorAll("button").length} text="${c.innerText.replace(/\s+/g, " ").slice(0, 90)}"`
                : "NO_CARD";
            if (s !== last) { last = s; w.__f!.push(`+${Math.round(performance.now())}ms ${s}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    await row.click();
    await page.waitForTimeout(20_000);
    const frames = await page.evaluate(() => (window as unknown as { __f: string[] }).__f ?? []);
    // eslint-disable-next-line no-console
    console.log("FIRST_FRAME_SEQUENCE (" + frames.length + ")\n" + frames.join("\n"));
});
