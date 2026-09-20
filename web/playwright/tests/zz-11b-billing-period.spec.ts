/** §21 — does the Assignment Tuition card now state its commercial period, and only where it can? */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("billing period on the tuition card", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(24_000);
    const out = await page.evaluate(() => ({
        periods: Array.from(document.querySelectorAll("[data-tuition-billing-period]")).map((e) => ({
            current: e.getAttribute("data-tuition-billing-period"),
            next: e.getAttribute("data-tuition-next-billing-period"),
            text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
        })),
        assignments: Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => ({
            child: (e.querySelector(".alloy-os-tuition__child") as HTMLElement | null)?.innerText ?? null,
            accepted: e.getAttribute("data-tuition-accepted"),
        })),
        card: (document.querySelector('[data-universal-card-key="assignment_tuition"]') as HTMLElement | null)?.innerText?.slice(0, 900) ?? null,
    }));
    await page.screenshot({ path: `${OUT}/billing-period.png`, fullPage: true });
    writeFileSync(`${OUT}/billing-period.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 1).slice(0, 2200));
});
