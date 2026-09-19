/**
 * THE SPECIMEN CHAIN, all canonical: author a tuition template, raise a gross tuition obligation,
 * let the authored policy discount it. `billing.apply_discounts` refuses caller-supplied values, so
 * the -$40 can only have come from the 10% policy.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-specimen";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("tuition template -> gross -> policy discount", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const out = await page.evaluate(async () => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        const cust = "29944d3e-8267-45b7-8dcb-7405060e2573";
        const s: Record<string, unknown> = {};
        const vm = (await j(await fetch(`/api/admin/financials/card?customer_id=${cust}`, { credentials: "include" }))).body?.vm;
        const period = vm?.period?.key as string;
        const subjects = (vm?.subjects ?? []) as Array<{ customerMemberId: string; displayName: string }>;
        s.period = period;

        // 1. A tuition charge template, authored the way the configuration surface authors one.
        let tplId: string | null = null;
        const existing = (vm?.chargeTemplates ?? []) as Array<Record<string, unknown>>;
        const already = existing.find((t) => String(t.categoryKey) === "tuition");
        if (already) { tplId = String(already.id); s.templateReused = true; }
        else {
            const made = await j(await fetch("/api/admin/financial/charge-templates", {
                method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
                body: JSON.stringify({
                    action: "create", template_key: "tuition", label: "Monthly tuition",
                    description: "Recurring care tuition (QA specimen).",
                    charge_category: "tuition", trigger_type: "manual",
                    amount_strategy: "fixed", amount_cents: 40_000, currency_code: "USD",
                    occurs_on_strategy: "service_period_start", billable_on_strategy: "immediate",
                    effective_start: "2026-01-01", review_required: false,
                }),
            }));
            s.createTemplate = { status: made.status, id: made.body?.template?.id, error: made.body?.error };
            tplId = made.body?.template?.id ?? null;
        }
        s.templateId = tplId;
        if (!tplId) return s;

        // 2. A gross tuition obligation for ONE child, so the other proves the negative.
        const child = subjects[0];
        s.child = child;
        const add = await j(await fetch("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
            body: JSON.stringify({
                action_key: "charge.add", entity_type: "child", entity_id: child.customerMemberId,
                mode: "execute", confirmation: { confirmed: true },
                payload: { template_id: tplId, customer_id: cust, customer_member_id: child.customerMemberId,
                           service_period_start: `${period}-01`, event_date: `${period}-01`, today: `${period}-01` },
            }),
        }));
        s.addCharge = { status: add.status, ok: add.body?.ok, error: add.body?.error, detail: add.body?.data?.execution_result?.detail };

        // 3. The authored policy does the arithmetic.
        const apply = await j(await fetch("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
            body: JSON.stringify({
                action_key: "billing.apply_discounts", entity_type: "child", entity_id: child.customerMemberId,
                mode: "execute", confirmation: { confirmed: true },
                payload: { period_key: period, customer_id: cust },
            }),
        }));
        s.applyDiscounts = { status: apply.status, ok: apply.body?.ok, error: apply.body?.error, result: apply.body?.data?.execution_result };

        const vm2 = (await j(await fetch(`/api/admin/financials/card?customer_id=${cust}`, { credentials: "include" }))).body?.vm;
        s.discountRows = ((vm2?.rows ?? []) as Array<Record<string, unknown>>)
            .filter((r) => (r.reduction as { concept?: string } | null)?.concept === "discount")
            .map((r) => ({ amount: r.amountCents, subject: r.subjectName, period: r.periodKey, reduction: r.reduction }));
        return s;
    });
    writeFileSync(`${OUT}/specimen3.json`, JSON.stringify(out, null, 2));
    /* eslint-disable no-console */
    log(`createTemplate: ${JSON.stringify(out.createTemplate ?? out.templateReused)}`);
    log(`addCharge: ${JSON.stringify(out.addCharge)}`);
    log(`applyDiscounts: ${JSON.stringify(out.applyDiscounts)}`);
    log(`DISCOUNT ROWS: ${JSON.stringify(out.discountRows, null, 1)}`);
    /* eslint-enable no-console */
});
