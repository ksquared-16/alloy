/**
 * A–K (D, E, G, H, I, J, K) on the repaired deployed build — through the product's own routes.
 *
 * ── WHY THIS IS SPLIT FROM THE MOUNTED GATES ─────────────────────────────────────────────────
 *
 * A single spec doing both ran out of its 880s budget inside the authoring UI, which starved the
 * gates after it and produced no verdict for any of them. Round-trips to a deployed preview are
 * seconds each and the mounted act needs long settles; together they do not fit. Split, each half
 * has its own budget and one slow phase cannot hide the other's result.
 *
 * F's mounted contract and the forecast-vs-lifecycle surface proof live in
 * zz-11b-ak-mounted.spec.ts. Everything here is the canonical authority answering.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-discounts";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

type Call = { u: string; i: { method: string; body: unknown } | null };

test("A-K authority gates on the repaired deployed build", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const P: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/ak-authority.json`, JSON.stringify(P, null, 2));
    const t0 = Date.now();
    const mark = (s: string) => log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${s}`);

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    P.build = await page.evaluate(async () => (await (await fetch("/api/build-info")).json()));
    mark(`build ${(P.build as { gitSha?: string }).gitSha}`);

    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(12_000);

    const call = async (path: string, init?: { method: string; body: unknown }) =>
        page.evaluate(async ({ u, i }: Call) => {
            const r = await fetch(u, i
                ? { method: i.method, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(i.body) }
                : { credentials: "include" });
            return { status: r.status, body: (await r.json().catch(() => null)) as unknown };
        }, { u: path, i: init ?? null } as Call);

    const ids = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll("[data-tuition-assignment]"))
        .map((e) => e.getAttribute("data-tuition-assignment")).filter(Boolean))] as string[]);
    const customerId = await page.evaluate(() =>
        (document.querySelector("[data-financials-card='true']") as HTMLElement | null)?.getAttribute("data-financials-account") ?? null);
    expect(ids.length, "at least one priced assignment must be in view").toBeGreaterThan(0);
    P.assignments = ids; P.customerId = customerId;

    const fc = async (id: string) => call(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${id}`);
    const actOn = async (id: string, action_key: string, payload: Record<string, unknown>) =>
        call("/api/admin/actions/execute", { method: "POST", body: {
            action_key, entity_type: "opportunity_customer_member", entity_id: id,
            mode: "execute", confirmation: { confirmed: true }, payload } });
    const exc = (b: unknown) => ((b as { exceptions?: Array<Record<string, unknown>> } | null)?.exceptions ?? []);
    const out = (b: unknown) => ((b as { forecast?: { outcomes?: Array<Record<string, unknown>> } } | null)?.forecast?.outcomes ?? []);
    const vmReductions = async () => ((((await call(`/api/admin/financials/card?customer_id=${customerId}`)).body) as { vm?: { reductions?: Array<Record<string, unknown>> } } | null)?.vm?.reductions ?? []);

    /* ── J BASELINE, before any lifecycle change ──────────────────────────────────────────── */
    const before = await vmReductions();
    P.J_before = before;
    mark(`J baseline ${before.length} reductions`);
    flush();

    /* ── NEUTRALISE so BEFORE is genuinely eligible ───────────────────────────────────────── */
    const first = await fc(ids[0]!);
    const periodKey = String((first.body as { forecast?: { periodKey?: string } } | null)?.forecast?.periodKey ?? "");
    const pStart = `${periodKey}-01`;
    const priorM = (() => { const d = new Date(`${pStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
    const dayBefore = (() => { const d = new Date(`${pStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    for (const id of ids) {
        for (const e of exc((await fc(id)).body).filter((e) => e.appliesNow)) {
            await actOn(id, "billing.except_commercial_policy", { policy_id: e.policyId,
                reason: "A-K — neutralised to a closed past window so BEFORE is eligible",
                effective_start: priorM, effective_end: dayBefore });
        }
    }
    mark("neutralised");

    /* ── D and E ──────────────────────────────────────────────────────────────────────────── */
    const eByOcm: Record<string, unknown> = {};
    for (const id of ids) eByOcm[id] = out((await fc(id)).body);
    const probe = await fc(ids[0]!);
    P.D = { status: probe.status, exceptionsKeyPresent: Boolean(probe.body && "exceptions" in (probe.body as object)), error: (probe.body as { error?: string } | null)?.error ?? null };
    P.E = { periodKey, outcomesByAssignment: eByOcm };
    const subject = ids.find((id) => (eByOcm[id] as Array<Record<string, unknown>>)?.[0]?.kind === "expected") ?? ids[0]!;
    const control = ids.find((id) => id !== subject) ?? null;
    const policyId = String(((eByOcm[subject] as Array<Record<string, unknown>>)?.[0]?.policyId) ?? "");
    P.subject = subject; P.control = control; P.policyId = policyId;
    mark(`E: subject=${subject.slice(0, 8)} control=${control?.slice(0, 8)} policy=${policyId.slice(0, 8)}`);
    flush();

    /* ── THE NAMED REFUSAL, exercised for real ────────────────────────────────────────────── */
    const dup1 = await actOn(subject, "billing.except_commercial_policy", { policy_id: policyId, reason: "A-K — first of a duplicate pair", effective_start: pStart });
    const dup2 = await actOn(subject, "billing.except_commercial_policy", { policy_id: policyId, reason: "A-K — second, same start, must be refused or supersede", effective_start: pStart });
    P.namedRefusal = {
        first: { ok: (dup1.body as { ok?: boolean } | null)?.ok ?? null },
        second: { ok: (dup2.body as { ok?: boolean } | null)?.ok ?? null, error: (dup2.body as { error?: unknown } | null)?.error ?? null },
        rawPostgresLeaked: /duplicate key value violates unique constraint/i.test(JSON.stringify(dup2.body ?? {})),
    };
    mark(`named refusal: leaked=${(P.namedRefusal as Record<string, unknown>).rawPostgresLeaked}`);

    /* ── G ────────────────────────────────────────────────────────────────────────────────── */
    const afterG = await fc(subject);
    P.G = { outcomes: out(afterG.body), reason: out(afterG.body)[0]?.reason ?? null, exceptions: exc(afterG.body) };
    mark(`G: ${P.G && (P.G as Record<string, unknown>).reason}`);
    flush();

    /* ── H · the canonical writer, and I's contrast in the same run ───────────────────────── */
    const apply = await actOn(subject, "billing.apply_discounts", { period_key: periodKey });
    const detail = (apply.body as { result?: { detail?: Record<string, unknown> } } | null)?.result?.detail ?? null;
    const afterRows = await vmReductions();
    const newRows = afterRows.filter((r) => !before.some((b) => b.applicationId === r.applicationId));
    const fH = (afterG.body as { forecast?: { totalCents?: number; netCents?: number; grossCents?: number } } | null)?.forecast;
    P.H = {
        writerOk: (apply.body as { ok?: boolean } | null)?.ok ?? null,
        writerDetail: detail,
        forecastTotalCents: fH?.totalCents ?? null,
        netEqualsGross: fH ? fH.netCents === fH.grossCents : null,
        grossCents: fH?.grossCents ?? null,
        newRows: newRows.map((r) => ({ applicationId: r.applicationId, commercialPolicyId: r.commercialPolicyId, memberId: r.customerMemberId, agreementId: r.agreementId, amountCents: r.amountCents, chargeStatus: r.chargeStatus })),
    };
    const controlFc = control ? await fc(control) : null;
    P.I = {
        configuredAndForecast: policyId,
        onExceptionRow: exc(afterG.body).find((e) => e.appliesNow)?.policyId ?? null,
        control,
        controlOutcome: controlFc ? out(controlFc.body)[0] ?? null : null,
        controlHasNoApplicableException: controlFc ? exc(controlFc.body).filter((e) => e.appliesNow).length === 0 : null,
        ledgerRowsForPolicy: newRows.filter((r) => String(r.commercialPolicyId ?? "") === policyId)
            .map((r) => ({ applicationId: r.applicationId, memberId: r.customerMemberId, amountCents: r.amountCents })),
    };
    mark(`H: writerOk=${(P.H as Record<string, unknown>).writerOk} newRows=${newRows.length}`);
    flush();

    /* ── J · posted history unchanged across the whole lifecycle ──────────────────────────── */
    const byId = new Map(before.map((r) => [String(r.applicationId), r]));
    const afterById = new Map(afterRows.map((r) => [String(r.applicationId), r]));
    const FIELDS = ["amountCents", "currencyCode", "category", "kind", "reason", "periodKey",
        "commercialPolicyId", "policyKind", "basis", "basisValue", "basisAmountCents", "capped",
        "sourceChargeId", "chargeStatus", "chargeId", "agreementId", "customerMemberId",
        "createdAt", "reversedByApplicationId", "reversesApplicationId"];
    const drift: Array<Record<string, unknown>> = [];
    for (const [id, b] of byId) {
        const a = afterById.get(id);
        if (!a) { drift.push({ applicationId: id, problem: "disappeared" }); continue; }
        for (const f of FIELDS) if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) drift.push({ applicationId: id, field: f, before: b[f], after: a[f] });
    }
    const posted = before.filter((r) => String(r.chargeStatus ?? "") === "posted");
    P.J = {
        comparedCount: byId.size, postedComparedCount: posted.length, fieldsCompared: FIELDS.length,
        postedSpecimens: posted.slice(0, 3).map((r) => ({ applicationId: r.applicationId, commercialPolicyId: r.commercialPolicyId, amountCents: r.amountCents, basis: r.basis, basisAmountCents: r.basisAmountCents, capped: r.capped, chargeStatus: r.chargeStatus })),
        drift, unchanged: drift.length === 0,
    };
    mark(`J: compared ${byId.size} (${posted.length} posted) across ${FIELDS.length} fields, drift ${drift.length}`);
    flush();

    /* ── K · supersession, history, and restoration in a LATER period ─────────────────────── */
    const k = await actOn(subject, "billing.except_commercial_policy", { policy_id: policyId,
        reason: "A-K — a window that closed before this period", effective_start: priorM, effective_end: dayBefore });
    const afterK = await fc(subject);
    P.K = {
        supersedingWriteOk: (k.body as { ok?: boolean } | null)?.ok ?? null,
        window: { start: priorM, end: dayBefore, currentPeriodStart: pStart },
        outcomes: out(afterK.body),
        eligibilityRestored: out(afterK.body)[0]?.kind === "expected",
        rows: exc(afterK.body).length,
        supersededRows: exc(afterK.body).filter((e) => e.superseded).length,
        nothingDeleted: exc(afterK.body).length >= 2,
        history: exc(afterK.body),
    };
    mark(`K: restored=${(P.K as Record<string, unknown>).eligibilityRestored} rows=${(P.K as Record<string, unknown>).rows}`);

    /* ── EFFECTIVE DATING as the deployed read model reports it ───────────────────────────── */
    P.effectiveDating = exc(afterK.body).map((e) => ({ start: e.effectiveStart, end: e.effectiveEnd,
        appliesNow: e.appliesNow, isLiveNow: e.isLiveNow, ended: e.ended, superseded: e.superseded }));
    mark(`DATING: ${JSON.stringify(P.effectiveDating)}`);
    flush();
});
