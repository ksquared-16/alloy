/**
 * W7-F040 — Scenario 20's obligation on W7 QA · Split Family, written by the CANONICAL writer.
 *
 * The demo-tenant seed writes no money by doctrine, and no registered reconciliation writes a
 * charge. So the obligation is made the way an operator makes one: `charge.add` (Registration fee,
 * $75.00, for Sasha Split, dated the run day) then `billing.resolve_responsibility` on it — the exact
 * sequence Add Charge performs — as the deployed QA operator. charge.add is idempotent on the same
 * template, subject and date (duplicate-charge notice), so re-running writes nothing new.
 *
 * Usage: node split-family-obligation.mjs [preview|execute]   (storage state from the governed QA restore)
 */
import { chromium } from "/Users/vacilando/Code/alloy-worktrees/financials/web/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const MODE = process.argv[2] === "execute" ? "execute" : "preview";
const BASE = "https://staging.workwithalloy.com";
const HH = "fd000000-0000-4000-8000-0000007c0005";
const SASHA = "fd000000-0000-4000-8000-0000007d0006";
const REGISTRATION_FEE = "c03e638e-0f3e-49f0-9d41-696276c8fa21";
const b = await chromium.launch();
const c = await b.newContext({ storageState: "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json" });
const card = async () => {
    const j = await (await c.request.get(`${BASE}/api/admin/financials/card?customer_id=${HH}`)).json();
    const vm = j.vm ?? j.data?.vm ?? j;
    return {
        rows: (vm.rows ?? []).map((x) => ({ chargeId: x.chargeId, label: x.categoryLabel, cents: x.amountCents, status: x.lifecycleStatus, date: x.date, responsible: x.responsiblePartyName })),
        balanceCents: vm.reconciliation?.balanceCents ?? null,
        payers: (vm.payers ?? []).map((p) => `${p.name} ${p.share}`),
    };
};
const exec = async (body) => {
    const r = await c.request.post(`${BASE}/api/admin/actions/execute`, { data: body });
    return { status: r.status(), body: await r.json().catch(() => null) };
};
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const out = { mode: MODE, today, before: await card() };
const add = {
    action_key: "charge.add",
    entity_type: "customer",
    entity_id: HH,
    mode: MODE,
    ...(MODE === "execute" ? { confirmation: { confirmed: true } } : {}),
    payload: { customer_id: HH, template_id: REGISTRATION_FEE, customer_member_id: SASHA, child_label: "Sasha Split", event_date: today, service_date: today },
};
out.add = await exec(add);
const chargeId = out.add.body?.data?.affected_id ?? null;
out.chargeId = chargeId;
if (MODE === "execute" && chargeId) {
    out.resolve = await exec({
        action_key: "billing.resolve_responsibility",
        entity_type: "child",
        entity_id: SASHA,
        mode: "execute",
        confirmation: { confirmed: true },
        payload: { charge_id: chargeId },
    });
}
out.after = await card();
writeFileSync(`/Users/vacilando/Code/alloy-worktrees/financials/certification/financials/w7-f040/split-family-obligation-${MODE}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ add: { status: out.add.status, summary: out.add.body?.data?.execution_result?.preview?.summary ?? out.add.body?.data?.execution_result ?? out.add.body?.error }, chargeId, resolve: out.resolve?.status, before: out.before, after: out.after }, null, 1).slice(0, 3000));
await b.close();
