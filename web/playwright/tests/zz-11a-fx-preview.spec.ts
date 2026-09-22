/**
 * The pricing READER, exercised directly and read-only.
 *
 * `enrollment.pricing.accept` in `mode: "preview"` runs `previewEnrollmentPricingCommit`, which is
 * the same `resolveForCommit` the write path uses — `readAssignmentPricingFacts` plus the commercial
 * export plus the resolver — and writes nothing. It reads the OCM BY ID with no embed, so it
 * separates "the assignment cannot be read" from "the opportunity query returns nothing".
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const OCM_A = "79f8011d-a236-4054-bee7-af10f1dbc632";
const OCM_B = "cf044308-3ee4-47ab-a8fb-205eb172aa48";

test("preview both assignments", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async ({ a, b }) => {
        const preview = async (ocm: string) => {
            const r = await fetch("/api/admin/actions/execute", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_key: "enrollment.pricing.accept",
                    entity_type: "opportunity_customer_member",
                    entity_id: ocm,
                    mode: "preview",
                    payload: { opportunity_customer_member_id: ocm },
                }),
            });
            return { ocm, status: r.status, body: await r.json().catch(() => null) };
        };
        return { a: await preview(a), b: await preview(b) };
    }, { a: OCM_A, b: OCM_B });
    writeFileSync(`${OUT}/preview.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 1).slice(0, 4000));
});
