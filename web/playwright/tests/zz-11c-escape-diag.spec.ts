/** Why is Escape still closing Details? Is the depth-card wrapper even in the deployed DOM? */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("escape diagnosis", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);

    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    await expect(gear).toHaveCount(1);
    await gear.click({ timeout: 15_000 });
    await page.waitForTimeout(9000);

    const shape = await page.evaluate(() => {
        const panel = document.querySelector('[data-financials-manage-responsibility="open-panel"]');
        const depthCard = document.querySelector('[data-financials-manage-responsibility="depth-card"]');
        const active = document.activeElement as HTMLElement | null;
        /* Walk up from the panel to see which ancestors exist, so we can tell if the wrapper shipped. */
        const chain: string[] = [];
        let n: Element | null = panel;
        for (let i = 0; i < 8 && n; i += 1) {
            chain.push(`${n.tagName}${n.getAttribute("data-financials-manage-responsibility") ? `[${n.getAttribute("data-financials-manage-responsibility")}]` : ""}${n.getAttribute("data-testid") ? `{${n.getAttribute("data-testid")}}` : ""}`);
            n = n.parentElement;
        }
        return {
            panelPresent: Boolean(panel),
            depthCardWrapperPresent: Boolean(depthCard),
            panelIsInsideWrapper: Boolean(depthCard && panel && depthCard.contains(panel)),
            activeElement: active === document.body ? "BODY" : `${active?.tagName}[${active?.getAttribute("data-financials-manage-responsibility") ?? active?.getAttribute("aria-label") ?? ""}]`,
            ancestorChain: chain,
        };
    });
    log(`SHAPE: ${JSON.stringify(shape, null, 1)}`);
});
