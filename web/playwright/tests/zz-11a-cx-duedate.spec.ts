/**
 * §15 — a due-date policy that is actually in force when the obligation invoices.
 *
 * The tenant's two `due_date` policies begin 2026-09-18 and 2026-09-19, and `resolveDueDate` reads
 * them `asOf` the INVOICE date — 2026-09-01 for a September obligation. So neither was effective
 * and "No configured terms" was the honest answer, not a defect. The fixture needs terms in force
 * during the period it bills.
 *
 * Authored org-wide through the policy authority, effective 2026-08-01, net 10 — nothing about
 * recurring tuition is special-cased.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("author the due-date terms and regenerate", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const out = await page.evaluate(async () => {
        const post = async (u: string, body: unknown) => {
            const r = await fetch(u, {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" }, body: JSON.stringify(body),
            });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const created = await post("/api/admin/financial/policies", {
            action: "create",
            scope_type: "org",
            policy_type: "due_date",
            label: "Tuition terms — net 10",
            effective_start: "2026-08-01",
            value: { strategy: "days_after_invoice", offset_days: 10 },
        });
        const run = async (cadence: string) =>
            post("/api/admin/actions/execute", {
                action_key: "billing.generate_tuition",
                entity_type: "opportunity_customer_member",
                entity_id: "",
                mode: "execute",
                confirmation: { confirmed: true },
                payload: { period_key: "2026-09", cadence },
            });
        const weekly = await run("weekly");
        const monthly = await run("monthly");
        return { created, weekly, monthly };
    });
    writeFileSync(`${OUT}/duedate.json`, JSON.stringify(out, null, 2));
    log(`policy: ${out.created.status} ${JSON.stringify(out.created.body).slice(0, 700)}`);
    log(`weekly: ${JSON.stringify(out.weekly.body?.data?.execution_result ?? out.weekly.body).slice(0, 500)}`);
    log(`monthly: ${JSON.stringify(out.monthly.body?.data?.execution_result ?? out.monthly.body).slice(0, 500)}`);
});
