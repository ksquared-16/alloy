/** Are the sibling producer-backed cards starved on the same path, or is this Financials-only? */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("who else is starved on the producerless path", async ({ page }) => {
    const reqs: string[] = [];
    page.on("response", (r) => {
        const u = r.url().replace(/https:\/\/[^/]+/, "").split("?")[0];
        if (/\/api\/admin\/(financials|attendance|health)\/card/.test(u)) reqs.push(u);
    });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(60_000);
    const s = await page.evaluate(() => ({
        financials: {
            mounted: !!document.querySelector("[data-financials-card]"),
            empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? "absent",
        },
        attendance: {
            mounted: !!document.querySelector("[data-attendance-card]"),
            empty: document.querySelector("[data-attendance-empty]")?.getAttribute("data-attendance-empty") ?? "absent",
            reserved: document.querySelector("[data-attendance-reserved]")?.getAttribute("data-attendance-reserved") ?? null,
        },
        health: {
            mounted: !!document.querySelector("[data-health-card]"),
            text: (document.querySelector("[data-health-card]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 120) ?? null,
        },
        cardKeys: [...document.querySelectorAll("[data-universal-card-key]")].map((e) => e.getAttribute("data-universal-card-key")),
    }));
    log(`SIBLING STATES: ${JSON.stringify(s, null, 1)}`);
    log(`CARD REQUESTS: ${JSON.stringify(reqs)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/f3-sibling-starvation.json`, JSON.stringify({ states: s, requests: reqs }, null, 2));
    await page.screenshot({ path: `${OUT}/f3-siblings.png` });
    expect(true).toBe(true);
});
