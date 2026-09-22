/**
 * §1 — MEASURE THE EXISTING AUTHORITY BEFORE CHANGING ANYTHING.
 *
 * The matrix recorded J21's cause as "materializeCurrentFinancialConsequences handles only
 * vacation_credit", and that was the wrong layer to be looking at. A commercial discount is not a
 * consumption consequence: `applyFinancialReductions` is Thread 10's period-level write path, it
 * reads the gross `tuition` charges a period produced and records the reduction twice — as a
 * `discount` charge and as a `financial_reduction_applications` row — and `billing.apply_discounts`
 * already invokes it.
 *
 * So the first question is not "what should be built" but "what does the existing authority do with
 * the recurring gross that now exists". This asks it, and writes nothing until it has.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-j21";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("what does billing.apply_discounts do with the recurring gross", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const out = await page.evaluate(async () => {
        const call = async (mode: string) => {
            const r = await fetch("/api/admin/actions/execute", {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action_key: "billing.apply_discounts",
                    entity_type: "opportunity_customer_member",
                    entity_id: "",
                    mode,
                    confirmation: { confirmed: true },
                    payload: { period_key: "2026-09" },
                }),
            });
            return { mode, status: r.status, body: await r.json().catch(() => null) };
        };
        return { preview: await call("preview"), run1: await call("execute"), run2: await call("execute") };
    });
    writeFileSync(`${OUT}/apply.json`, JSON.stringify(out, null, 2));
    log(`preview: ${JSON.stringify(out.preview).slice(0, 1800)}`);
    log(`\nrun 1: ${JSON.stringify(out.run1).slice(0, 3000)}`);
    log(`\nrun 2: ${JSON.stringify(out.run2).slice(0, 3000)}`);
});
