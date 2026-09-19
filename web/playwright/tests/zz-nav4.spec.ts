import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("inside the modal", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(10_000);
    const d = await page.evaluate(() => {
        const dlg = document.querySelector("[role='dialog']") as HTMLElement | null;
        if (!dlg) return { none: true };
        return {
            section: dlg.querySelector("[data-financials-section]")?.getAttribute("data-financials-section") ?? null,
            mode: dlg.querySelector("[data-financials-mode]")?.getAttribute("data-financials-mode") ?? null,
            buttons: Array.from(dlg.querySelectorAll("button")).map((b) => ({
                t: (b as HTMLElement).innerText.trim().replace(/\n/g, "·").slice(0, 30),
                d: Array.from(b.attributes).filter((a) => a.name.startsWith("data-")).map((a) => `${a.name}=${a.value}`).slice(0, 2).join(" "),
            })).slice(0, 30),
            text: dlg.innerText.replace(/\n+/g, " / ").slice(0, 500),
        };
    });
    log(JSON.stringify(d, null, 1));
});
