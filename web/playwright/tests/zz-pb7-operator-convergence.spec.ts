/**
 * §24 — the operator converges the over-bound backlog through Generate Tuition, then automation
 * is asked again.
 *
 * This is the escape hatch the refusal points at. The handler told the operator exactly which
 * periods it would not bill and named Generate Tuition as the way through; this runs that path
 * and then lets the real clock re-read canonical truth.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const C_OCM = "e978987c-56d1-4972-af34-54ccc32f37e2";

test("operator convergence then automation", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    const r = await page.evaluate(async (ocm) => {
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const post = async (u: string, b?: unknown) => {
            const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" },
                credentials: "include", ...(b ? { body: JSON.stringify(b) } : {}) });
            return { s: x.status, j: await j(x) };
        };
        /* The canonical operator path, confirmed — this is a real generation run. */
        const run = await post("/api/admin/actions/execute", {
            action_key: "billing.generate_tuition",
            entity_type: "opportunity_customer_member", entity_id: ocm,
            mode: "execute", confirmation: { confirmed: true },
            payload: { period_key: "2026-09", cadence: "weekly" },
        });
        const again = await post("/api/admin/financials/periodic-billing-evaluate-now");
        return { run: { status: run.s, body: JSON.stringify(run.j).slice(0, 900) }, again: { status: again.s, body: again.j } };
    }, C_OCM);

    log(`GENERATE TUITION (operator) ${JSON.stringify(r.run)}`);
    log(`EVALUATE NOW ${JSON.stringify(r.again)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/operator-convergence.json`, JSON.stringify(r, null, 2));
    expect(r.run.status).toBe(200);
    expect(r.again.status).toBe(200);
});
