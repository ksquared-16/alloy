import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(180_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("where is the sidebar", async ({ page }) => {
    for (const route of ["/workspace/work-unit/enrolled-children", "/adminV2/workspace", "/organization/financials"]) {
        await page.goto(route, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(9000);
        const d = await page.evaluate(() => ({
            url: location.pathname,
            modalNavs: Array.from(document.querySelectorAll("[data-adminv2-sidebar-modal-nav]"))
                .map((e) => e.getAttribute("data-adminv2-sidebar-modal-nav")),
            anySidebar: Boolean(document.querySelector("[data-adminv2-sidebar], aside")),
            ariaFinancials: Array.from(document.querySelectorAll("[aria-label]"))
                .map((e) => e.getAttribute("aria-label") ?? "").filter((t) => /financ/i.test(t)).slice(0, 4),
        }));
        log(`${route} → ${JSON.stringify(d)}`);
    }
});
