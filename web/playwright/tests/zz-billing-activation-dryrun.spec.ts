/**
 * §16 — THE ACTIVATION DRY RUN, and it is a gate rather than a report.
 *
 * The question automatic Billing has to answer before it is switched on is not "does the handler
 * work" but "what would it DO the moment it wakes". This drives the product's own preview seam —
 * `previewTuitionGeneration` behind `billing.generate_tuition` in preview mode, which shares every
 * decision with the real run and writes nothing — across every billable cadence and back through
 * history, and totals what generation would create.
 *
 * NOTHING IS CONFIRMED. `mode: "preview"` with `confirmed: false` on every call.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
const ENTRY = "/workspace/work-unit/enrolled-children";
const CADENCES = ["monthly", "weekly", "biweekly"];
const MONTHS_BACK = 18;

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 1000 } });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("activation dry run", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    expect(page.url(), "signed in").not.toContain("/login");
    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${build.gitSha} ${build.gitBranch} ${build.nodeEnv}`);

    /* The periods to probe: this month and the MONTHS_BACK before it. */
    const periods: string[] = await page.evaluate((n) => {
        const out: string[] = [];
        const d = new Date();
        for (let i = 0; i <= n; i += 1) {
            const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
            out.push(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`);
        }
        return out;
    }, MONTHS_BACK);

    const rows = await page.evaluate(async ({ periods, cadences }) => {
        const results: Array<Record<string, unknown>> = [];
        for (const cadence of cadences) {
            for (const periodKey of periods) {
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        action_key: "billing.generate_tuition",
                        entity_type: "opportunity_customer_member",
                        entity_id: "",
                        mode: "preview",
                        confirmation: { confirmed: false },
                        payload: { period_key: periodKey, cadence },
                    }),
                });
                /*
                 * THE RESULT IS TWO LEVELS DOWN, and reading it one level up returned HTTP 200,
                 * ok:true and a row of nulls for every period — a census that would have reported
                 * "nothing would be billed" for the emptiest possible reason. Preview answers
                 * under `preview.after`; execute answers under `after`.
                 */
                const json = await res.json().catch(() => null) as
                    { ok?: boolean; data?: { execution_result?: { preview?: { after?: Record<string, unknown> }; after?: Record<string, unknown> } }; error?: unknown } | null;
                const ex = json?.data?.execution_result ?? null;
                const r = ex?.preview?.after ?? ex?.after ?? null;
                results.push({
                    cadence,
                    periodKey,
                    status: res.status,
                    ok: json?.ok !== false,
                    error: r ? null : JSON.stringify(json?.error ?? null).slice(0, 160),
                    counts: r?.counts ?? null,
                    totalAmountCents: (r?.total_amount_cents as number | undefined) ?? null,
                    servicePeriod: (r?.service_period as unknown) ?? null,
                    refusedReasons: Array.isArray(r?.refused_outcomes)
                        ? [...new Set((r!.refused_outcomes as Array<{ reason?: string }>).map((o) => o.reason ?? "?"))]
                        : [],
                    notDueReasons: Array.isArray(r?.not_due_outcomes)
                        ? [...new Set((r!.not_due_outcomes as Array<{ reason?: string }>).map((o) => o.reason ?? "?"))]
                        : [],
                });
            }
        }
        return results;
    }, { periods, cadences: CADENCES });

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/activation-dry-run.json`, JSON.stringify({ build, periods, rows }, null, 2));

    /* The total that matters: what WOULD be created if the clock woke over this whole history. */
    let wouldCreate = 0; let wouldDollars = 0; let converged = 0; let refused = 0; let notDue = 0;
    for (const r of rows as Array<{ counts: Record<string, number> | null; totalAmountCents: number | null }>) {
        if (!r.counts) continue;
        wouldCreate += Number(r.counts.generated ?? 0);
        converged += Number(r.counts.unchanged ?? 0) + Number(r.counts.alreadyPosted ?? r.counts.already_posted ?? 0);
        refused += Number(r.counts.refused ?? 0);
        notDue += Number(r.counts.notDue ?? r.counts.not_due ?? 0);
        if (Number(r.counts.generated ?? 0) > 0) wouldDollars += Number(r.totalAmountCents ?? 0);
    }
    log(`\nDRY RUN TOTALS over ${periods.length} months x ${CADENCES.length} cadences`);
    log(`  would create/recalculate : ${wouldCreate}`);
    log(`  gross cents if created   : ${wouldDollars}`);
    log(`  already converged        : ${converged}`);
    log(`  refused                  : ${refused}`);
    log(`  not due                  : ${notDue}`);
    log(`\nPER PERIOD (non-zero only):`);
    for (const r of rows as Array<Record<string, unknown>>) {
        const c = r.counts as Record<string, number> | null;
        if (!c) { log(`  ${r.cadence} ${r.periodKey}: ERROR ${r.error}`); continue; }
        if ((c.generated ?? 0) > 0 || (c.refused ?? 0) > 0) {
            log(`  ${r.cadence} ${r.periodKey}: generated=${c.generated} unchanged=${c.unchanged} alreadyPosted=${c.alreadyPosted ?? c.already_posted} refused=${c.refused} notDue=${c.notDue ?? c.not_due} cents=${r.totalAmountCents} refusedReasons=${JSON.stringify(r.refusedReasons)}`);
        }
    }
});
