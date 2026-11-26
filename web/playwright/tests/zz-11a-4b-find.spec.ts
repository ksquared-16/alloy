/** §4B — read the ledger by its real row markup and identify the $18.00 obligation exactly. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-4b";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("4B-find · the $18 obligation, by row", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);

    const rows = await page.evaluate(() => {
        const out: Array<Record<string, unknown>> = [];
        document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
            if (r.className.includes("--head")) return;
            const cells = Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim());
            const resp = r.querySelector("[data-financials-responsibility]");
            out.push({
                chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
                responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
                responsibilityText: (resp as HTMLElement | null)?.innerText?.trim() ?? null,
                cells: cells.filter(Boolean).slice(0, 9),
                actions: Array.from(r.querySelectorAll("[data-financials-row-action]"))
                    .map((a) => a.getAttribute("data-financials-row-action")),
            });
        });
        return out;
    });
    writeFileSync(`${OUT}/4b-ledger-rows.json`, JSON.stringify(rows, null, 2));
    log(`rows: ${rows.length}`);
    const interesting = rows.filter((r) => /18\.00/.test(JSON.stringify(r.cells)) || r.responsibility === "unassigned");
    log(`\n=== $18 or unassigned (${interesting.length}) ===`);
    for (const r of interesting) log(`${r.chargeId} · ${r.responsibility} · ${JSON.stringify(r.cells)} · actions=${JSON.stringify(r.actions)}`);

    const byState: Record<string, number> = {};
    for (const r of rows) byState[String(r.responsibility)] = (byState[String(r.responsibility)] ?? 0) + 1;
    log(`\nresponsibility states across the ledger: ${JSON.stringify(byState)}`);
});
