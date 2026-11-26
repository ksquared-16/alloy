import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(200_000);
test("dump Sep 18 rows", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const rows = await page.evaluate(() => {
        const out: Array<Record<string, unknown>> = [];
        document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
            if (r.className.includes("--head")) return;
            out.push({
                chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
                actions: Array.from(r.querySelectorAll("[data-financials-row-action]")).map((a) => a.getAttribute("data-financials-row-action")),
                cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
            });
        });
        return out;
    });
    const sep18 = rows.filter((r) => /Sep 18, 2026/.test(String((r.cells as string[])[0]))
        || /Reversal|Replacement/i.test(String((r.cells as string[])[1])));
    writeFileSync(`${OUT}/b1-sep18.json`, JSON.stringify(sep18, null, 2));
    console.log(`total=${rows.length} sep18=${sep18.length}`); // eslint-disable-line no-console
    for (const r of sep18) console.log(`${r.chargeId} | ${JSON.stringify(r.cells)} | ${JSON.stringify(r.actions)}`); // eslint-disable-line no-console
});
