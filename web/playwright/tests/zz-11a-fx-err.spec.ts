/** The read now fails loudly. This reads what it says. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("the message", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async () => {
        const r = await fetch(`/api/admin/financial-config/opportunity/e56e72d5-c7bc-41ff-8d34-f5d34fd4160a?t=${Date.now()}`, { credentials: "include", cache: "no-store" });
        const text = await r.text();
        const q = await fetch("/api/admin/enrollment/assignment-quote", {
            method: "POST", credentials: "include", headers: { "content-type": "application/json" },
            body: JSON.stringify({ opportunity_id: "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a", customer_member_id: "e408fa51-7261-43c4-8e60-555d17fc9888" }),
        });
        return { cfgStatus: r.status, cfgText: text.slice(0, 3000), quoteStatus: q.status, quoteText: (await q.text()).slice(0, 1500) };
    });
    writeFileSync(`${OUT}/err.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 1).slice(0, 4000));
});
