/**
 * A POLICY-PRODUCED DISCOUNT SPECIMEN, through canonical actions only.
 *
 * The account holds nothing but manual reductions, so the policy provenance added in Section 2 has
 * never been exercised on a screen. This authors a real `commercial_policies` discount and applies
 * it with `billing.apply_discounts` — the action that deliberately REFUSES caller-supplied values,
 * so the number can only come from the authored policy. No ledger row is inserted by hand.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-specimen";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("author a discount policy and apply it", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const out = await page.evaluate(async () => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        const cust = "29944d3e-8267-45b7-8dcb-7405060e2573";
        const steps: Record<string, unknown> = {};

        const vm0 = (await j(await fetch(`/api/admin/financials/card?customer_id=${cust}`, { credentials: "include" }))).body?.vm;
        const subjects = (vm0?.subjects ?? []) as Array<{ customerMemberId: string; displayName: string }>;
        steps.subjects = subjects;
        const period = vm0?.period?.key ?? null;
        steps.period = period;

        // 1. Existing discount policies?
        const existing = await j(await fetch("/api/admin/commercial/policies?policy_type=discount", { credentials: "include" }));
        steps.existingPolicies = { status: existing.status, count: Array.isArray(existing.body) ? existing.body.length : (existing.body?.policies?.length ?? null) };

        // 2. Author an ONGOING percentage discount on tuition. Open-ended + active = ongoing by the
        //    policy's own window, which is the canonical answer the provenance reads.
        const created = await j(await fetch("/api/admin/commercial/policies", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
            body: JSON.stringify({
                policy_type: "discount",
                scope_type: "org",
                label: "Sibling discount (QA specimen)",
                description: "10% of tuition, ongoing, authored for Section 2B mounted proof.",
                value: { basis: "percentage", value: 10, applies_to: "all" },
                effective_start: "2026-01-01",
                effective_end: null,
                is_active: true,
            }),
        }));
        steps.createPolicy = { status: created.status, id: created.body?.id ?? created.body?.policy?.id, error: created.body?.error };

        // 3. Apply discounts for the current period, per child.
        const applied: unknown[] = [];
        for (const s of subjects) {
            const r = await j(await fetch("/api/admin/actions/execute", {
                method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
                body: JSON.stringify({
                    action_key: "billing.apply_discounts",
                    entity_type: "child",
                    entity_id: s.customerMemberId,
                    mode: "execute",
                    confirmation: { confirmed: true },
                    payload: { period_key: period, customer_id: cust },
                }),
            }));
            applied.push({ child: s.displayName, status: r.status, ok: r.body?.ok, error: r.body?.error, result: r.body?.data?.execution_result ?? null });
        }
        steps.applied = applied;

        // 4. What the read model now carries.
        const vm1 = (await j(await fetch(`/api/admin/financials/card?customer_id=${cust}`, { credentials: "include" }))).body?.vm;
        const withProv = ((vm1?.rows ?? []) as Array<Record<string, unknown>>)
            .filter((r) => r.reduction)
            .map((r) => ({ chargeId: r.chargeId, amount: r.amountCents, subject: r.subjectName, reduction: r.reduction }));
        steps.rowsWithProvenance = withProv.length;
        steps.discountRows = withProv.filter((r) => (r.reduction as { concept?: string })?.concept === "discount");
        return steps;
    });

    writeFileSync(`${OUT}/specimen.json`, JSON.stringify(out, null, 2));
    /* eslint-disable no-console */
    log(`period: ${JSON.stringify(out.period)}`);
    log(`existing discount policies: ${JSON.stringify(out.existingPolicies)}`);
    log(`createPolicy: ${JSON.stringify(out.createPolicy)}`);
    log(`applied: ${JSON.stringify(out.applied, null, 1).slice(0, 1200)}`);
    log(`rows with provenance: ${out.rowsWithProvenance}`);
    log(`DISCOUNT rows: ${JSON.stringify(out.discountRows, null, 1).slice(0, 1500)}`);
    /* eslint-enable no-console */
});
