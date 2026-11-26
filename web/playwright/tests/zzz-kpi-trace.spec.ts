/** AUTHORITY TRACE — ask the canonical reader both ways and diff to the cent. Read only. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/kpi-authority";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const CERTB = "46105cd4-6030-417d-a7cb-faf409071c0d";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1280, height: 800 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("canonical reader, household vs member scope", async ({ page }) => {
    await page.goto("/adminV2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    const r = await page.evaluate(async ({ household, certb }) => {
        const get = async (qs: string) => {
            const res = await fetch(`/api/admin/financials/card?${qs}`, { credentials: "include" });
            const body = await res.json().catch(() => null);
            const vm = body?.vm ?? null;
            if (!vm) return { status: res.status, vm: null };
            return {
                status: res.status,
                reconciliation: vm.reconciliation ?? null,
                pastDue: vm.pastDue ?? null,
                reconciliationBySubject: vm.reconciliationBySubject ?? null,
                pastDueBySubject: vm.pastDueBySubject ?? null,
                subjects: (vm.subjects ?? []).map((s: Record<string, unknown>) => ({ id: s.customerMemberId, name: s.displayName })),
                rowCount: (vm.rows ?? []).length,
                rowsBySubject: (vm.rows ?? []).reduce((acc: Record<string, number>, row: Record<string, unknown>) => {
                    const k = String(row.subjectMemberId ?? "HOUSEHOLD");
                    acc[k] = (acc[k] ?? 0) + 1; return acc;
                }, {}),
                netBySubject: (vm.rows ?? []).reduce((acc: Record<string, number>, row: Record<string, unknown>) => {
                    const k = String(row.subjectMemberId ?? "HOUSEHOLD");
                    acc[k] = (acc[k] ?? 0) + Number(row.amountCents ?? 0); return acc;
                }, {}),
                collectible: vm.collectible ?? null,
                prepaid: vm.prepaid ?? null,
            };
        };
        return {
            householdScope: await get(`customer_id=${household}`),
            memberScope: await get(`customer_id=${household}&customer_member_id=${certb}`),
        };
    }, { household: HOUSEHOLD, certb: CERTB });
    log(`TRACE ${JSON.stringify(r, null, 1).slice(0, 6000)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/reader-trace.json`, JSON.stringify(r, null, 2));
});
