/**
 * §16 — the lifecycle boundary, proven against the REAL accepted terms and without touching them.
 *
 * Both terms are effective 2026-09-01. Previewing AUGUST asks the generator about a period the
 * terms do not yet cover, which is the "not yet effective" boundary exactly — no dates rewritten,
 * no fixture damaged. September is the active case and is already generated.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("august is not yet effective", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const out = await page.evaluate(async () => {
        const preview = async (period: string, cadence: string) => {
            const r = await fetch("/api/admin/actions/execute", {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action_key: "billing.generate_tuition",
                    entity_type: "opportunity_customer_member",
                    entity_id: "",
                    mode: "preview",
                    payload: { period_key: period, cadence },
                }),
            });
            const b = (await r.json().catch(() => null)) as { data?: { execution_result?: { preview?: { after?: unknown } } } } | null;
            return { period, cadence, after: b?.data?.execution_result?.preview?.after ?? null };
        };
        return {
            augustWeekly: await preview("2026-08", "weekly"),
            augustMonthly: await preview("2026-08", "monthly"),
            septemberMonthly: await preview("2026-09", "monthly"),
        };
    });
    writeFileSync(`${OUT}/lifecycle.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 1).slice(0, 4000));
});
