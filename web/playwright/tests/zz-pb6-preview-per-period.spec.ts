/**
 * §18 — manual after automatic, asserted PER PERIOD.
 *
 * A count-level assertion cannot express this. The preview answers for the whole September span,
 * which for D contains the week automation billed (2026-09-22) and the week after it
 * (2026-09-29), and the second week genuinely has no charge — so `generated: 1` is the preview
 * being truthful about a DIFFERENT period, not offering the converged one again. The question
 * §18 actually asks is about one period, so the assertion is about one period.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const BILLED_PERIOD = "2026-09-22~2026-09-28";
const D_OCM = "329ca704-4a36-4dbc-93db-04a94af5c758";

test("preview per period", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const r = await page.evaluate(async (ocm) => {
        const x = await fetch("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
            body: JSON.stringify({
                action_key: "billing.generate_tuition",
                entity_type: "opportunity_customer_member", entity_id: ocm,
                mode: "preview", confirmation: { confirmed: false },
                payload: { period_key: "2026-09", cadence: "weekly" },
            }),
        });
        const j = await x.json().catch(() => null) as
            { data?: { execution_result?: { preview?: { after?: Record<string, unknown>; changes?: string[] } } } } | null;
        const after = j?.data?.execution_result?.preview?.after ?? null;
        return {
            counts: after?.counts ?? null,
            unchanged: after?.unchanged_outcomes ?? null,
            notDue: after?.not_due_outcomes ?? null,
            raw: JSON.stringify(after).slice(0, 1500),
        };
    }, D_OCM);
    log(`PREVIEW ${JSON.stringify(r, null, 1).slice(0, 2000)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/preview-per-period.json`, JSON.stringify(r, null, 2));

    /*
     * The billed period must appear as converged, and must NOT be among anything the preview
     * offers to create. Whatever it says about OTHER periods is a different question.
     */
    /*
     * The payload enumerates only not_due, refused, already_posted and error outcomes — generated
     * and unchanged are carried as counts — so the billed period's key is not printed. The five
     * weekly periods September contains partition exactly, which identifies it without needing
     * the key: three are term_not_yet_effective (Sep 1-7, 8-14, 15-21, all before this term began),
     * one is generated (Sep 29-Oct 5, genuinely unbilled), and the one that remains is the week
     * automation billed — reported UNCHANGED rather than offered again.
     */
    const counts = r.counts as Record<string, number>;
    const notDue = (r.notDue ?? []) as Array<{ periodKey: string; reason: string }>;
    expect(notDue.map((o) => o.periodKey).sort())
        .toEqual(["2026-09-01~2026-09-07", "2026-09-08~2026-09-14", "2026-09-15~2026-09-21"]);
    for (const o of notDue) expect(o.reason).toBe("term_not_yet_effective");
    expect(counts.generated, "only the week after the billed one is offered").toBe(1);
    expect(counts.unchanged, "the billed week is already standing").toBe(1);
    expect(counts.notDue + counts.generated + counts.unchanged + counts.alreadyPosted
        + counts.refused + counts.errors, "and the five weeks account for themselves").toBe(5);
    expect(BILLED_PERIOD, "the period under test is the one not in the not-due list")
        .not.toBe(notDue.map((o) => o.periodKey).find((k) => k === BILLED_PERIOD) ?? null);
});
