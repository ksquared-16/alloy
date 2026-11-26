/** Give the period a gross tuition obligation, then let the authored policy discount it. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-specimen";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("tuition then discount", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const out = await page.evaluate(async () => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        const cust = "29944d3e-8267-45b7-8dcb-7405060e2573";
        const steps: Record<string, unknown> = {};
        const vm = (await j(await fetch(`/api/admin/financials/card?customer_id=${cust}`, { credentials: "include" }))).body?.vm;
        const period = vm?.period?.key as string;
        const subjects = (vm?.subjects ?? []) as Array<{ customerMemberId: string; displayName: string }>;
        const templates = (vm?.chargeTemplates ?? []) as Array<Record<string, unknown>>;
        steps.templates = templates.map((t) => ({ id: t.id, label: t.label, category: t.categoryKey, amount: t.amountCents, strategy: t.amountStrategy }));
        const tuition = templates.find((t) => String(t.categoryKey) === "tuition");
        steps.tuitionTemplate = tuition ? { id: tuition.id, label: tuition.label } : null;
        if (!tuition) return steps;

        // ONE child only — so the proof also shows the other child correctly receiving nothing.
        const child = subjects[0];
        steps.child = child;
        const add = await j(await fetch("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
            body: JSON.stringify({
                action_key: "charge.add", entity_type: "child", entity_id: child.customerMemberId,
                mode: "execute", confirmation: { confirmed: true },
                payload: {
                    template_id: tuition.id, customer_id: cust, customer_member_id: child.customerMemberId,
                    amount_cents: 40_000, service_period_start: `${period}-01`, event_date: `${period}-01`,
                    today: `${period}-01`,
                },
            }),
        }));
        steps.addCharge = { status: add.status, ok: add.body?.ok, error: add.body?.error, detail: add.body?.data?.execution_result?.detail };

        const apply = await j(await fetch("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
            body: JSON.stringify({
                action_key: "billing.apply_discounts", entity_type: "child", entity_id: child.customerMemberId,
                mode: "execute", confirmation: { confirmed: true },
                payload: { period_key: period, customer_id: cust },
            }),
        }));
        steps.applyDiscounts = { status: apply.status, ok: apply.body?.ok, error: apply.body?.error, result: apply.body?.data?.execution_result };

        const vm2 = (await j(await fetch(`/api/admin/financials/card?customer_id=${cust}`, { credentials: "include" }))).body?.vm;
        steps.discountRows = ((vm2?.rows ?? []) as Array<Record<string, unknown>>)
            .filter((r) => (r.reduction as { concept?: string } | null)?.concept === "discount")
            .map((r) => ({ amount: r.amountCents, subject: r.subjectName, reduction: r.reduction }));
        return steps;
    });
    writeFileSync(`${OUT}/specimen2.json`, JSON.stringify(out, null, 2));
    /* eslint-disable no-console */
    log(`tuition template: ${JSON.stringify(out.tuitionTemplate)}`);
    log(`templates: ${JSON.stringify(out.templates)}`);
    log(`addCharge: ${JSON.stringify(out.addCharge)}`);
    log(`applyDiscounts: ${JSON.stringify(out.applyDiscounts)}`);
    log(`DISCOUNT ROWS: ${JSON.stringify(out.discountRows, null, 1)}`);
    /* eslint-enable no-console */
});
