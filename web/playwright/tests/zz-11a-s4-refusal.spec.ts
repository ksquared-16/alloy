/** The refusal now reaches the operator, and the surface stays open so they can read it. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s4";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const TARGET = "6005cf5f-24e8-4fd2-a624-0bc83496b977";

test("S4 · the engine's refusal is put in front of the operator", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);

    await page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${TARGET}"]`).first().click();
    await page.waitForTimeout(4000);
    await page.getByTestId("responsibility-preview-button").click();
    await page.waitForTimeout(7000);
    await page.getByTestId("responsibility-confirm").click();
    await page.waitForTimeout(11_000);

    const after = await page.evaluate(() => ({
        overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
        mode: document.querySelector("[data-financials-responsibility-mode]")?.getAttribute("data-financials-responsibility-mode") ?? null,
        error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
    }));
    log(`AFTER CONFIRM: ${JSON.stringify(after)}`);
    writeFileSync(`${OUT}/s4-refusal.json`, JSON.stringify(after, null, 2));
    await page.screenshot({ path: `${OUT}/s4-refusal.png` });
});
