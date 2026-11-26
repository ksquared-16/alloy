/**
 * H and I at the ACTUAL application/write grain.
 *
 * ── WHY A DRAFT HAD TO BE GENERATED ──────────────────────────────────────────────────────────
 *
 * `billing.apply_discounts` over September reported `applied: 0, unchanged: 7` — it evaluated the
 * period's obligations and wrote nothing because they are already converged. That is a true
 * answer and a useless one for this gate: nothing would have been written with or without the
 * exception, so it isolates nothing.
 *
 * §8 asks for an ELIGIBLE DRAFT OBLIGATION, so one is generated through the canonical generator
 * for the NEXT period — an ordinary operator act, on a period the September evidence does not
 * depend on. Nothing is created and then deleted.
 *
 * The proof is a contrast on one run: the EXCLUDED relationship must get no reduction row for
 * that policy, and the CONTROL relationship must get one carrying the same configured policy id.
 * That is H and I together, and it also shows the exclusion is scoped rather than global.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-discounts";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
type Call = { u: string; i: { method: string; body: unknown } | null };

test("H and I through the canonical write path", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const P: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/hi-write-proof.json`, JSON.stringify(P, null, 2));

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(12_000);

    const call = async (path: string, init?: { method: string; body: unknown }) =>
        page.evaluate(async ({ u, i }: Call) => {
            const r = await fetch(u, i
                ? { method: i.method, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(i.body) }
                : { credentials: "include" });
            return { status: r.status, body: (await r.json().catch(() => null)) as unknown };
        }, { u: path, i: init ?? null } as Call);

    const ids = (await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll("[data-tuition-assignment]"))
        .map((e) => e.getAttribute("data-tuition-assignment")).filter(Boolean))])) as string[];
    const customerId = await page.evaluate(() =>
        (document.querySelector("[data-financials-card='true']") as HTMLElement | null)?.getAttribute("data-financials-account") ?? "");
    expect(ids.length, "the contrast needs two assignments").toBeGreaterThan(1);

    const fc = async (id: string) => call(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${id}`);
    const actOn = async (id: string, k: string, payload: Record<string, unknown>) =>
        call("/api/admin/actions/execute", { method: "POST", body: {
            action_key: k, entity_type: "opportunity_customer_member", entity_id: id,
            mode: "execute", confirmation: { confirmed: true }, payload } });
    const exc = (b: unknown) => ((b as { exceptions?: Array<Record<string, unknown>> } | null)?.exceptions ?? []);
    const out = (b: unknown) => ((b as { forecast?: { outcomes?: Array<Record<string, unknown>> } } | null)?.forecast?.outcomes ?? []);
    const reductions = async () => ((((await call(`/api/admin/financials/card?customer_id=${customerId}`)).body) as { vm?: { reductions?: Array<Record<string, unknown>> } } | null)?.vm?.reductions ?? []);

    /* The NEXT period, so September's evidence is untouched. */
    const thisMonth = new Date().toISOString().slice(0, 7);
    const nextPeriod = (() => { const d = new Date(`${thisMonth}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
    P.period = nextPeriod;

    /* ── SET UP THE CONTRAST: one excluded, one not, both otherwise eligible ──────────────── */
    const policyId = String(out((await fc(ids[0]!)).body)[0]?.policyId ?? out((await fc(ids[1]!)).body)[0]?.policyId ?? "");
    const excluded = ids[0]!, controlId = ids[1]!;
    const pStart = `${nextPeriod}-01`;
    const prior = (() => { const d = new Date(`${pStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
    const dayBefore = (() => { const d = new Date(`${pStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();

    /* The control must carry no exception governing the next period. */
    for (const e of exc((await fc(controlId)).body).filter((e) => !e.superseded)) {
        await actOn(controlId, "billing.except_commercial_policy", { policy_id: e.policyId,
            reason: "H/I — moved out of the way of the next period", effective_start: prior, effective_end: dayBefore });
    }
    /* The subject must carry one that DOES govern it. */
    const setExcl = await actOn(excluded, "billing.except_commercial_policy", {
        policy_id: policyId, reason: "H/I — excluded for the next period, to prove no row is written", effective_start: pStart });
    P.setup = { policyId, excluded, control: controlId, exclusionWriteOk: (setExcl.body as { ok?: boolean } | null)?.ok ?? null };
    flush();

    /*
     * ── GENERATE AN ELIGIBLE DRAFT FOR EACH SIDE ─────────────────────────────────────────────
     *
     * Both, because the contrast is the proof: the excluded relationship must produce no
     * reduction row and the control must produce one. Generating for only one side leaves I's
     * ledger half unproved, which is what happened on the first attempt.
     *
     * The cadence is left to the accepted term — naming one here would bill a family on a
     * frequency nobody agreed to, and the generator refuses rather than guessing anyway.
     */
    const gens: Record<string, unknown> = {};
    for (const id of [excluded, controlId]) {
        const g = await actOn(id, "billing.generate_tuition", { period_key: nextPeriod });
        gens[id] = (g.body as { data?: { execution_result?: unknown } } | null)?.data?.execution_result ?? g.body;
    }
    P.generate = gens;
    log(`GENERATE: ${JSON.stringify(gens).slice(0, 600)}`);
    flush();

    const before = await reductions();
    /* ── RUN THE CANONICAL WRITER ─────────────────────────────────────────────────────────── */
    const applyA = await actOn(excluded, "billing.apply_discounts", { period_key: nextPeriod });
    const detail = ((applyA.body as { data?: { execution_result?: Record<string, unknown> } } | null)?.data?.execution_result) ?? null;
    const applyB = await actOn(controlId, "billing.apply_discounts", { period_key: nextPeriod });
    const detailB = ((applyB.body as { data?: { execution_result?: Record<string, unknown> } } | null)?.data?.execution_result) ?? null;
    P.writerReportControlRun = detailB;
    const after = await reductions();
    const newRows = after.filter((r) => !before.some((b) => b.applicationId === r.applicationId));

    P.H = {
        writerReport: detail,
        obligationsEvaluated: detail ? Number(detail.applied ?? 0) + Number(detail.unchanged ?? 0) + Number(detail.notEligible ?? 0) + Number(detail.alreadyPosted ?? 0) : null,
        newRowCount: newRows.length,
        newRows: newRows.map((r) => ({ applicationId: r.applicationId, commercialPolicyId: r.commercialPolicyId, memberId: r.customerMemberId, agreementId: r.agreementId, amountCents: r.amountCents, periodKey: r.periodKey, chargeStatus: r.chargeStatus })),
    };
    const excludedForecast = await fc(excluded);
    const controlForecast = await fc(controlId);
    P.I = {
        policyId,
        excludedOutcome: out(excludedForecast.body)[0] ?? null,
        controlOutcome: out(controlForecast.body)[0] ?? null,
        rowsForPolicy: newRows.filter((r) => String(r.commercialPolicyId ?? "") === policyId)
            .map((r) => ({ applicationId: r.applicationId, memberId: r.customerMemberId, amountCents: r.amountCents })),
    };
    log(`H: ${JSON.stringify(P.H).slice(0, 600)}`);
    log(`I: ${JSON.stringify(P.I).slice(0, 500)}`);
    flush();
});
