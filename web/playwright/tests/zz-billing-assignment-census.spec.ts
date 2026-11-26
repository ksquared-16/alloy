/**
 * §9 — THE CENSUS AT THE GRAIN THE BOUND USES: canonical periods PER ASSIGNMENT.
 *
 * The earlier census counted charge rows, and six charge rows is not six billing periods. The
 * bound is applied per assignment over its own canonical periods, so that is what this counts —
 * by scoping the product's own preview to one assignment at a time, which the action supports
 * because an entity id there narrows the run.
 *
 * PREVIEW ONLY. Nothing is confirmed.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
const ENTRY = "/workspace/work-unit/enrolled-children";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 1000 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("per-assignment census", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    expect(page.url(), "signed in").not.toContain("/login");

    const children = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-children-child]")).map((e) => ({
            ocm: e.getAttribute("data-children-child"),
            who: /(Cert\w+ Certhouse)/.exec((e as HTMLElement).innerText.replace(/\s+/g, " "))?.[1] ?? null,
        })));
    log(`ASSIGNMENTS ${JSON.stringify(children)}`);

    const rows = await page.evaluate(async (kids: { ocm: string | null; who: string | null }[]) => {
        const out: Array<Record<string, unknown>> = [];
        const months = ["2026-07", "2026-08", "2026-09"];
        for (const kid of kids) {
            for (const cadence of ["monthly", "weekly", "biweekly"]) {
                for (const periodKey of months) {
                    const res = await fetch("/api/admin/actions/execute", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            action_key: "billing.generate_tuition",
                            entity_type: "opportunity_customer_member",
                            /* The id NARROWS the run — this is the per-assignment grain. */
                            entity_id: kid.ocm,
                            mode: "preview",
                            confirmation: { confirmed: false },
                            payload: { period_key: periodKey, cadence },
                        }),
                    });
                    const json = await res.json().catch(() => null) as
                        { data?: { execution_result?: { preview?: { after?: Record<string, unknown>; changes?: string[] } } } } | null;
                    const after = json?.data?.execution_result?.preview?.after ?? null;
                    const counts = (after?.counts ?? null) as Record<string, number> | null;
                    if (!counts || (counts.generated ?? 0) === 0) continue;
                    out.push({
                        who: kid.who, ocm: kid.ocm, cadence, periodKey,
                        generated: counts.generated,
                        unchanged: counts.unchanged,
                        alreadyPosted: counts.alreadyPosted,
                        totalAmountCents: after?.total_amount_cents ?? null,
                        changes: json?.data?.execution_result?.preview?.changes ?? [],
                    });
                }
            }
        }
        return out;
    }, children as never);

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/per-assignment-census.json`, JSON.stringify({ children, rows }, null, 2));
    log(`\nPER-ASSIGNMENT, non-zero only:`);
    for (const r of rows as Array<Record<string, unknown>>) {
        log(`  ${r.who} · ${r.cadence} · ${r.periodKey}: generated=${r.generated} unchanged=${r.unchanged} alreadyPosted=${r.alreadyPosted} cents=${r.totalAmountCents}`);
        for (const c of (r.changes as string[])) log(`      ${c}`);
    }
});
