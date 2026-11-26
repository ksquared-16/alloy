/** Probe only: exactly what controls the Edit policy dialog exposes. */
import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const POLICY_ID = "5df9fc6c-71e6-4f1b-a00f-f612cecbe9e0";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("probe", async ({ page }) => {
    await page.goto("/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    await page.locator(`[data-testid="policy-${POLICY_ID}"]`).first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(4000);
    await page.locator('[data-testid="policy-edit"]').first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(5000);
    const m = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null;
        const scope: ParentNode = dlg ?? document;
        return {
            dialogPresent: Boolean(dlg),
            selects: Array.from(scope.querySelectorAll("select")).map((s) => {
                const r = (s as HTMLElement).getBoundingClientRect();
                const cs = getComputedStyle(s);
                return {
                    name: s.getAttribute("name") ?? s.getAttribute("aria-label") ?? s.id ?? null,
                    testId: s.getAttribute("data-testid"),
                    visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0",
                    box: `${Math.round(r.width)}x${Math.round(r.height)}`,
                    appearance: `${cs.appearance}/${cs.webkitAppearance}`,
                    options: Array.from(s.options).map((o) => o.text).slice(0, 6),
                    labelText: (s.closest("label") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim().slice(0, 60)
                        ?? (s.previousElementSibling as HTMLElement | null)?.innerText?.trim().slice(0, 60) ?? null,
                };
            }),
            alloySelects: scope.querySelectorAll(".alloy-select, [data-alloy-select]").length,
            allSelectsOnPage: document.querySelectorAll("select").length,
        };
    });
    log(JSON.stringify(m, null, 1));
    await page.screenshot({ path: "../certification/financials/11c-final/p8-edit-policy-dialog.png", fullPage: true });
});
