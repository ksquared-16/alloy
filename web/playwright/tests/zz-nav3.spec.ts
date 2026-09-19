import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("open the financials modal", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const nav = page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first();
    const before = await page.evaluate(() => ({
        dialogs: document.querySelectorAll("[role='dialog']").length,
        finAttrs: Array.from(document.querySelectorAll("*")).filter((e) => Array.from(e.attributes).some((a) => a.name.startsWith("data-financials"))).length,
    }));
    log(`before: ${JSON.stringify(before)}`);
    const box = await nav.boundingBox();
    log(`nav box: ${JSON.stringify(box)} · visible=${await nav.isVisible()} · enabled=${await nav.isEnabled()}`);
    await nav.click({ force: true, timeout: 15_000 }).catch((e) => log(`click err ${e}`));
    for (const wait of [3000, 6000, 12000]) {
        await page.waitForTimeout(wait);
        const d = await page.evaluate(() => ({
            dialogs: document.querySelectorAll("[role='dialog']").length,
            finAttrs: Array.from(document.querySelectorAll("*")).filter((e) => Array.from(e.attributes).some((a) => a.name.startsWith("data-financials"))).length,
            finAttrNames: [...new Set(Array.from(document.querySelectorAll("*")).flatMap((e) => Array.from(e.attributes).map((a) => a.name).filter((n) => n.startsWith("data-financials"))))].slice(0, 14),
            active: document.querySelector("[data-adminv2-sidebar-modal-nav='financials']")?.getAttribute("aria-current"),
        }));
        log(`after +${wait}: ${JSON.stringify(d)}`);
    }
    await page.screenshot({ path: "../certification/financials/11b-setup/modal-open-attempt.png", fullPage: true });
});
