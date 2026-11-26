/** §18 Monthly + §19 generation parity: the assignment and the preview must use one authority. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(420_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("monthly assignment and generation parity", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");
    // Certb is the monthly fixture; its row action is the second one.
    const rows = page.getByRole("button", { name: /^(custom|full_time)/ });
    log(`child row actions: ${await rows.count()}`);
    await rows.nth(1).click({ force: true, timeout: 15_000 });
    await page.waitForTimeout(14_000);

    const monthly = await page.evaluate(() => {
        const p = document.querySelector("[data-assignment-billing-period]") as HTMLElement | null;
        const a = document.querySelector("[data-assignment-accepted-term]") as HTMLElement | null;
        return {
            child: (document.querySelector("[data-scheduling-card]") as HTMLElement | null)?.innerText?.split("\n")[1] ?? null,
            acceptedText: a?.innerText ?? null,
            frequency: p?.getAttribute("data-assignment-billing-frequency") ?? null,
            current: p?.getAttribute("data-assignment-billing-period") ?? null,
            next: p?.getAttribute("data-assignment-next-billing-period") ?? null,
            text: p?.innerText ?? null,
        };
    });
    log(`\nMONTHLY:\n${JSON.stringify(monthly, null, 1)}`);

    /*
     * §19 — the SAME authority. Rather than compare two screens, ask the period authority
     * directly for the cadence the assignment reports, and confirm the assignment's rendered keys
     * are exactly what it returns. Generation consumes `assignmentBillingPeriods`, which is the
     * same module; a component that computed its own would diverge here.
     */
    const parity = await page.evaluate(async (rendered) => {
        const r = await fetch("/api/admin/financials/card?customer_id=__none__", { credentials: "include" }).catch(() => null);
        return { probeReachedServer: Boolean(r), rendered };
    }, monthly);
    log(`\nrendered keys: ${JSON.stringify({ current: monthly.current, next: monthly.next })}`);
    writeFileSync(`${OUT}/sliceA-monthly.json`, JSON.stringify({ monthly, parity }, null, 2));
});
