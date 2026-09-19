/** §13 — the monthly plan, run and rerun, through the same one-payload contract. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("monthly preview, run, rerun", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const out = await page.evaluate(async () => {
        const exec = async (mode: string) => {
            const r = await fetch("/api/admin/actions/execute", {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action_key: "billing.generate_tuition",
                    entity_type: "opportunity_customer_member",
                    entity_id: "",
                    mode,
                    confirmation: { confirmed: true },
                    payload: { period_key: "2026-09", cadence: "monthly" },
                }),
            });
            return { mode, status: r.status, body: await r.json().catch(() => null) };
        };
        return { preview: await exec("preview"), run1: await exec("execute"), run2: await exec("execute") };
    });
    writeFileSync(`${OUT}/monthly.json`, JSON.stringify(out, null, 2));
    log(`preview: ${JSON.stringify(out.preview).slice(0, 2200)}`);
    log(`\nrun 1: ${JSON.stringify(out.run1).slice(0, 1200)}`);
    log(`\nrun 2: ${JSON.stringify(out.run2).slice(0, 1200)}`);
});
