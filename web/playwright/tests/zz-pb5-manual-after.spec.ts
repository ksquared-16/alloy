/**
 * §18 — Generate Tuition preview over a period automation has already billed, and §23's second
 * evaluate-now in the same pass.
 *
 * This is also the repaired convergence-aware preview being re-certified against real data: the
 * specimen's period now carries a draft charge, so the preview must report it as unchanged rather
 * than offering to generate it again.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const D_OCM = "329ca704-4a36-4dbc-93db-04a94af5c758";
const C_OCM = "e978987c-56d1-4972-af34-54ccc32f37e2";

test("manual after automatic, then ask again", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    const r = await page.evaluate(async (c) => {
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const post = async (u: string, b?: unknown) => {
            const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" },
                credentials: "include", ...(b ? { body: JSON.stringify(b) } : {}) });
            return { s: x.status, j: await j(x) };
        };
        const preview = async (ocm: string) => {
            const res = await post("/api/admin/actions/execute", {
                action_key: "billing.generate_tuition",
                entity_type: "opportunity_customer_member", entity_id: ocm,
                mode: "preview", confirmation: { confirmed: false },
                payload: { period_key: "2026-09", cadence: "weekly" },
            });
            const after = (res.j as { data?: { execution_result?: { preview?: { after?: Record<string, unknown>; summary?: string } } } })
                ?.data?.execution_result?.preview;
            return { counts: after?.after?.counts ?? null, summary: (after as { summary?: string } | undefined)?.summary ?? null };
        };

        /* §18 — the period automation billed. */
        const dPreview = await preview(c.d);
        /* The over-bound specimen, for the operator-convergence step that follows. */
        const cPreview = await preview(c.c);
        /* §23 — ask for another evaluation without converging anything. */
        const again = await post("/api/admin/financials/periodic-billing-evaluate-now");
        return { dPreview, cPreview, again: { status: again.s, body: again.j } };
    }, { d: D_OCM, c: C_OCM });

    log(`D PREVIEW (manual after automatic) ${JSON.stringify(r.dPreview)}`);
    log(`C PREVIEW (over-bound backlog)     ${JSON.stringify(r.cPreview)}`);
    log(`EVALUATE NOW AGAIN ${JSON.stringify(r.again)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/manual-after-automatic.json`, JSON.stringify(r, null, 2));

    /* §18: nothing new offered for a period already billed. */
    const dc = r.dPreview.counts as Record<string, number> | null;
    expect(dc, "the preview answered").toBeTruthy();
    expect(dc!.generated, "no new obligation offered for the converged period").toBe(0);
    expect(dc!.unchanged + dc!.alreadyPosted, "it is reported as already handled").toBeGreaterThan(0);
});
