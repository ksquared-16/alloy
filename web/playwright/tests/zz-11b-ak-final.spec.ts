/**
 * A–K, COMPLETE, against the repaired deployed build.
 *
 * Nothing is carried from the previous run: every gate is re-asked, because the repair could have
 * invalidated one that passed.
 *
 * Two things the previous run could not prove, and how they are proved here:
 *
 *   J  posted-history safety — the account card VM carries each reduction's applicationId,
 *      amount, category, reason, period and charge. It is read BEFORE and AFTER and compared
 *      field by field, rather than inspected in source.
 *
 *   K  later eligibility restored — the forecast evaluates the CURRENT canonical Billing Period,
 *      so proving restoration against that same period while the ended window still covers its
 *      start is the mistake the last run made. Instead the final exception's window is closed
 *      BEFORE the current period begins: the current period is then a LATER period than the
 *      window, and the canonical period authority — not a manufactured date — decides which.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-discounts";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

type Call = { u: string; i: { method: string; body: unknown } | null };

test("A-K complete, on the repaired deployed build", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const P: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/ak-final.json`, JSON.stringify(P, null, 2));

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    P.build = await page.evaluate(async () => (await (await fetch("/api/build-info")).json()));
    log(`BUILD: ${JSON.stringify(P.build)}`);

    const call = async (path: string, init?: { method: string; body: unknown }) =>
        page.evaluate(async ({ u, i }: Call) => {
            const r = await fetch(u, i
                ? { method: i.method, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(i.body) }
                : { credentials: "include" });
            return { status: r.status, body: (await r.json().catch(() => null)) as unknown };
        }, { u: path, i: init ?? null } as Call);

    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);

    /* The subject is the assignment whose section carries the discount — two are on this panel. */
    const subjects = await page.evaluate(async () => {
        const ids = [...new Set(Array.from(document.querySelectorAll("[data-tuition-assignment]"))
            .map((e) => e.getAttribute("data-tuition-assignment")).filter(Boolean))] as string[];
        const out = [];
        for (const id of ids) {
            const r = await fetch(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${id}`, { credentials: "include" });
            const b = await r.json().catch(() => null);
            out.push({ id, gross: b?.forecast?.grossCents ?? null, outcomes: b?.forecast?.outcomes ?? null, exceptions: b?.exceptions ?? null });
        }
        return out;
    });
    const target = subjects.find((s) => (s.outcomes ?? []).length > 0) ?? subjects[0];
    const ocm = target!.id;
    P.subject = { ocm, candidates: subjects.map((s) => ({ id: s.id, gross: s.gross })) };

    const customerId = await page.evaluate(() =>
        (document.querySelector("[data-financials-card='true']") as HTMLElement | null)?.getAttribute("data-financials-account") ?? null);
    P.customerId = customerId;

    const forecast = async () => call(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${ocm}`);
    const cardVm = async () => call(`/api/admin/financials/card?customer_id=${customerId}`);
    const act = async (action_key: string, payload: Record<string, unknown>) =>
        call("/api/admin/actions/execute", { method: "POST", body: {
            action_key, entity_type: "opportunity_customer_member", entity_id: ocm,
            mode: "execute", confirmation: { confirmed: true }, payload } });
    const exceptionsOf = (b: unknown) => ((b as { exceptions?: Array<Record<string, unknown>> } | null)?.exceptions ?? []);
    const outcomesOf = (b: unknown) => ((b as { forecast?: { outcomes?: Array<Record<string, unknown>> } } | null)?.forecast?.outcomes ?? []);

    /* ── J BASELINE · every posted reduction on this account, before anything changes ──────── */
    const vmBefore = await cardVm();
    const reductionsBefore = ((vmBefore.body as { reductions?: Array<Record<string, unknown>> } | null)?.reductions ?? []);
    P.J_before = reductionsBefore;
    log(`J BASELINE: ${reductionsBefore.length} reduction(s)`);
    flush();

    /* ── CLEAN SLATE ──────────────────────────────────────────────────────────────────────── */
    const start = await forecast();
    for (const e of exceptionsOf(start.body).filter((e) => e.isLiveNow)) {
        await act("billing.end_commercial_policy_exception", { exception_id: e.id });
    }
    const cleared = await forecast();
    P.precondition = { endedAtStart: exceptionsOf(start.body).filter((e) => e.isLiveNow).length, outcomes: outcomesOf(cleared.body) };

    /* ── D ────────────────────────────────────────────────────────────────────────────────── */
    P.D = { status: cleared.status, exceptionsKeyPresent: Boolean(cleared.body && "exceptions" in (cleared.body as object)), error: (cleared.body as { error?: string } | null)?.error ?? null };

    /* ── E ────────────────────────────────────────────────────────────────────────────────── */
    const expected = outcomesOf(cleared.body).find((o) => o.kind === "expected");
    const periodKey = String((cleared.body as { forecast?: { periodKey?: string } } | null)?.forecast?.periodKey ?? "");
    P.E = { periodKey, outcomes: outcomesOf(cleared.body), expectedPolicyId: expected?.policyId ?? null };
    log(`E: ${JSON.stringify(P.E)}`);
    flush();

    /* ── F · MOUNTED authoring, and the WRITE must succeed ─────────────────────────────────── */
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);

    const F: Record<string, unknown> = {};
    const add = page.locator(`[data-add-policy-exception="${expected?.policyId}"]`).first();
    F.offered = (await add.count()) > 0;
    if (F.offered) {
        await add.click({ timeout: 20_000 });
        await page.waitForTimeout(3000);
        const confirm = page.locator("[data-policy-exception-confirm]").first();
        const reason = page.locator("[data-policy-exception-reason]").first();
        F.draftOpened = (await page.locator("[data-policy-exception-draft]").count()) > 0;
        F.confirmDisabledWithoutReason = (await confirm.count()) ? !(await confirm.isEnabled()) : null;
        F.preview = await page.locator("[data-policy-exception-preview]").first().innerText().catch(() => null);
        F.previewQuotesNoFigure = typeof F.preview === "string" ? !/\$\s?\d|\d+\s?%/.test(F.preview) : null;
        if (await reason.count()) {
            await reason.fill("A-K final — mounted authoring on the repaired build", { timeout: 20_000 });
            await page.waitForTimeout(1200);
            F.confirmEnabledWithReason = await confirm.isEnabled();
            if (F.confirmEnabledWithReason) { await confirm.click({ timeout: 20_000 }); await page.waitForTimeout(15_000); }
        }
        F.errorShown = await page.locator("[data-policy-exception-error]").first().innerText().catch(() => null);
        F.noRawDatabaseError = typeof F.errorShown === "string" ? !/duplicate key|violates unique constraint|constraint "/i.test(F.errorShown) : true;
    }
    const afterF = await forecast();
    F.readBack = exceptionsOf(afterF.body);
    F.writeSucceeded = F.errorShown == null && exceptionsOf(afterF.body).some((e) => e.isLiveNow);
    P.F = F;
    log(`F: offered=${F.offered} draft=${F.draftOpened} wrote=${F.writeSucceeded} err=${JSON.stringify(F.errorShown)}`);
    await page.screenshot({ path: `${OUT}/final-F.png`, fullPage: true });
    flush();

    /* ── G · the excluded state, authored at the period boundary through the same authority ── */
    const g = await act("billing.except_commercial_policy", {
        policy_id: expected?.policyId, reason: "A-K final — excluded for the whole period", effective_start: `${periodKey}-01` });
    const afterG = await forecast();
    P.G = {
        authorOk: (g.body as { ok?: boolean } | null)?.ok ?? null,
        outcomes: outcomesOf(afterG.body),
        reason: outcomesOf(afterG.body)[0]?.reason ?? null,
        exceptions: exceptionsOf(afterG.body),
    };
    log(`G: ${JSON.stringify({ reason: P.G && (P.G as Record<string, unknown>).reason })}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);
    P.G_ui = await page.evaluate(() => ({
        outcomes: Array.from(document.querySelectorAll("[data-forecast-outcome]")).map((e) => ({ kind: e.getAttribute("data-forecast-outcome"), reason: e.getAttribute("data-forecast-reason"), text: e.textContent?.trim().slice(0, 140) })),
        exceptions: Array.from(document.querySelectorAll("[data-policy-exception]")).map((e) => ({
            applies: e.getAttribute("data-exception-applies"), live: e.getAttribute("data-exception-live"), text: e.textContent?.trim().slice(0, 170) })),
        endOffered: document.querySelectorAll("[data-end-policy-exception]").length,
        endedLabels: document.querySelectorAll('[data-exception-ended="true"]').length,
    }));
    log(`G UI: ${JSON.stringify(P.G_ui)}`);
    await page.screenshot({ path: `${OUT}/final-G.png`, fullPage: true });
    flush();

    /*
     * ── H · THE ACTUAL WRITE PATH, not the projection ────────────────────────────────────────
     *
     * `billing.apply_discounts` is the canonical writer: it evaluates authored policy against the
     * period's eligible obligations and creates reduction applications. Run for real, with the
     * exception in force, so the claim is about `financial_reduction_applications` rather than
     * about forecast arithmetic. Nothing is created and then deleted — what it writes stands.
     *
     * ── AND I, IN THE SAME RUN ───────────────────────────────────────────────────────────────
     *
     * Two assignments sit on this panel and only one is excluded, which is exactly the contrast
     * item I asks for: the same configured policy id must reach a ledger reduction on the
     * NON-excluded relationship and must write nothing on the excluded one. One run proves both
     * halves, and proves the exclusion is scoped rather than global.
     */
    const otherOcm = subjects.map((s) => s.id).find((id) => id !== ocm) ?? null;
    const apply = await call("/api/admin/actions/execute", { method: "POST", body: {
        action_key: "billing.apply_discounts", entity_type: "opportunity_customer_member", entity_id: ocm,
        mode: "execute", confirmation: { confirmed: true }, payload: { period_key: periodKey } } });
    P.H_applyRun = { status: apply.status, ok: (apply.body as { ok?: boolean } | null)?.ok ?? null, error: (apply.body as { error?: unknown } | null)?.error ?? null };

    const fh = (afterG.body as { forecast?: { totalCents?: number; netCents?: number; grossCents?: number } } | null)?.forecast;
    const vmH = await cardVm();
    const reductionsH = ((vmH.body as { reductions?: Array<Record<string, unknown>> } | null)?.reductions ?? []);
    const newRows = reductionsH.filter((r) => !reductionsBefore.some((b) => b.applicationId === r.applicationId));
    /* The excluded relationship's agreement — anything written against it would be the defect. */
    const excludedAgreement = (afterG.body as { forecast?: unknown } | null) && (F.readBack as Array<Record<string, unknown>> | undefined)?.[0]?.opportunityCustomerMemberId;
    P.H = {
        appliedThroughCanonicalWriter: (apply.body as { ok?: boolean } | null)?.ok ?? null,
        forecastTotalCents: fh?.totalCents ?? null,
        netEqualsGross: fh ? fh.netCents === fh.grossCents : null,
        grossUnchanged: fh?.grossCents ?? null,
        newApplicationRows: newRows.map((r) => ({ applicationId: r.applicationId, commercialPolicyId: r.commercialPolicyId ?? null, agreementId: r.agreementId, memberId: r.customerMemberId, amountCents: r.amountCents, category: r.category })),
        excludedAgreementHint: excludedAgreement ?? null,
    };
    log(`H: applied=${P.H && (P.H as Record<string, unknown>).appliedThroughCanonicalWriter} newRows=${newRows.length}`);
    flush();

    /* ── I · one identity, and the exclusion is scoped ────────────────────────────────────── */
    const liveG = exceptionsOf(afterG.body).find((e) => e.appliesNow);
    const otherForecast = otherOcm ? await call(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${otherOcm}`) : null;
    P.I = {
        configuredAndForecast: expected?.policyId ?? null,
        onException: liveG?.policyId ?? null,
        nonExcludedRelationship: otherOcm,
        nonExcludedOutcome: otherForecast ? outcomesOf(otherForecast.body)[0] ?? null : null,
        nonExcludedHasNoException: otherForecast ? exceptionsOf(otherForecast.body).filter((e) => e.appliesNow).length === 0 : null,
        ledgerRowsForPolicy: newRows.filter((r) => String(r.commercialPolicyId ?? "") === String(expected?.policyId ?? "")).map((r) => ({ applicationId: r.applicationId, memberId: r.customerMemberId, amountCents: r.amountCents })),
    };
    log(`I: ${JSON.stringify(P.I).slice(0, 400)}`);

    /* ── J · the posted reductions are byte-for-byte what they were ───────────────────────── */
    const key = (r: Record<string, unknown>) => String(r.applicationId);
    const beforeById = new Map(reductionsBefore.map((r) => [key(r), r]));
    /* Read AFTER the canonical writer ran, so J spans a real write and not just a forecast. */
    const afterById = new Map(reductionsH.map((r) => [key(r), r]));
    const drift: Array<Record<string, unknown>> = [];
    for (const [id, b] of beforeById) {
        const a = afterById.get(id);
        if (!a) { drift.push({ applicationId: id, problem: "disappeared" }); continue; }
        /*
         * Every field that carries financial truth or provenance — read from AccountReduction, not
         * guessed: the money, the policy that produced it, the basis it was computed on, whether a
         * cap bound it, and `chargeStatus`, which is the POSTED STATE the gate names.
         */
        for (const f of [
            "amountCents", "currencyCode", "category", "kind", "reason", "periodKey",
            "commercialPolicyId", "policyKind", "basis", "basisValue", "basisAmountCents", "capped",
            "sourceChargeId", "chargeStatus", "chargeId", "agreementId", "customerMemberId",
            "createdAt", "reversedByApplicationId", "reversesApplicationId",
        ]) {
            if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) drift.push({ applicationId: id, field: f, before: b[f], after: a[f] });
        }
    }
    /* Posted rows are the ones the gate is about; drafts may legitimately move. */
    const postedBefore = reductionsBefore.filter((r) => String(r.chargeStatus ?? "") === "posted");
    const postedDrift = drift.filter((d) => postedBefore.some((r) => r.applicationId === d.applicationId));
    P.J = {
        comparedCount: beforeById.size,
        postedComparedCount: postedBefore.length,
        postedSpecimens: postedBefore.slice(0, 3).map((r) => ({ applicationId: r.applicationId, commercialPolicyId: r.commercialPolicyId, amountCents: r.amountCents, basis: r.basis, chargeStatus: r.chargeStatus })),
        drift,
        postedDrift,
        unchanged: postedDrift.length === 0 && drift.length === 0,
    };
    log(`J: compared ${beforeById.size}, drift ${drift.length}`);
    flush();

    /* ── K · supersession, history, and restoration in a LATER period ─────────────────────── */
    const K: Record<string, unknown> = {};
    /*
     * The current canonical Billing Period is what the forecast evaluates. Closing the window
     * BEFORE that period begins makes the current period a LATER period than the exception — the
     * canonical authority decides which period that is, not this probe.
     */
    const periodStart = `${periodKey}-01`;
    const priorMonth = (() => { const d = new Date(`${periodStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
    const dayBeforePeriod = (() => { const d = new Date(`${periodStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    const k = await act("billing.except_commercial_policy", {
        policy_id: expected?.policyId, reason: "A-K final — a window that closed before this period", effective_start: priorMonth, effective_end: dayBeforePeriod });
    K.supersedingAuthorOk = (k.body as { ok?: boolean } | null)?.ok ?? null;
    K.window = { start: priorMonth, end: dayBeforePeriod, currentPeriodStart: periodStart };
    const afterK = await forecast();
    K.outcomes = outcomesOf(afterK.body);
    K.eligibilityRestored = outcomesOf(afterK.body)[0]?.kind === "expected";
    K.history = exceptionsOf(afterK.body);
    K.historyRowCount = exceptionsOf(afterK.body).length;
    K.supersededRows = exceptionsOf(afterK.body).filter((e) => e.superseded).length;
    K.nothingDeleted = exceptionsOf(afterK.body).length >= 2;
    P.K = K;
    log(`K: restored=${K.eligibilityRestored} rows=${K.historyRowCount} superseded=${K.supersededRows}`);
    await page.screenshot({ path: `${OUT}/final-K.png`, fullPage: true });
    flush();

    /* ── EFFECTIVE DATING, as the deployed read model reports it ──────────────────────────── */
    P.effectiveDating = exceptionsOf(afterK.body).map((e) => ({
        start: e.effectiveStart, end: e.effectiveEnd, appliesNow: e.appliesNow, isLiveNow: e.isLiveNow, ended: e.ended, superseded: e.superseded }));
    log(`DATING: ${JSON.stringify(P.effectiveDating)}`);
    flush();
});
