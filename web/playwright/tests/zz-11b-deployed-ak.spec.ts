/**
 * PROMOTION-GATED PROOF D–K, on the DEPLOYED staging build 6c1b84fdc.
 *
 * A, B, C are the census's job (gar_606fa99dcc3786).
 *
 * ── TWO ASSIGNMENTS ARE ON THIS PANEL, AND THAT COST A RUN ───────────────────────────────────
 *
 * `data-tuition-assignment` appears TWICE — once per priced assignment. An earlier probe took the
 * first and read the second one's discount section, then reported the API and the UI as
 * disagreeing about the same family. They were never talking about the same family. The subject
 * here is therefore derived from the SECTION being measured, and both are enumerated.
 *
 * ── WHY G NEEDS AN EARLIER EFFECTIVE START ───────────────────────────────────────────────────
 *
 * The surface authors `effective_start: today`, and the forecast judges an exception against the
 * START of the period being forecast. An exception recorded mid-period therefore does not exclude
 * the period already under way — correct, and the surface says so ("excluded from <date>",
 * appliesNow false). To show the excluded state itself, this authors a second exception through
 * the same registered action with a start at or before the period start. That is not a workaround:
 * the action is the authority and `effective_start` is one of its canonical inputs.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-discounts";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("D-K on the deployed build", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const P: Record<string, unknown> = { build: "6c1b84fdc", base: "https://staging.workwithalloy.com" };
    const flush = () => writeFileSync(`${OUT}/deployed-ak-proof.json`, JSON.stringify(P, null, 2));

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);

    /* ── THE SUBJECT: the assignment whose section actually carries the discount ───────────── */
    const subjects = await page.evaluate(async () => {
        const ids = [...new Set(Array.from(document.querySelectorAll("[data-tuition-assignment]"))
            .map((e) => e.getAttribute("data-tuition-assignment")).filter(Boolean))] as string[];
        const out = [];
        for (const id of ids) {
            const r = await fetch(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${id}`, { credentials: "include" });
            const b = await r.json().catch(() => null);
            out.push({ id, status: r.status, gross: b?.forecast?.grossCents ?? null, outcomes: b?.forecast?.outcomes ?? null, exceptions: b?.exceptions ?? null });
        }
        return out;
    });
    P.assignmentsOnPanel = subjects;
    /* The one the rendered section belongs to: the assignment whose forecast the card is showing. */
    const target = subjects.find((s) => (s.exceptions ?? []).length > 0) ?? subjects.find((s) => (s.outcomes ?? []).length > 0) ?? subjects[0];
    const ocm = target!.id;
    P.subject = ocm;
    log(`SUBJECTS: ${JSON.stringify(subjects.map((s) => ({ id: s.id, gross: s.gross, exc: (s.exceptions ?? []).length })))}`);
    flush();

    type Call = { u: string; i: { method: string; body: unknown } | null };
    const call = async (path: string, init?: { method: string; body: unknown }) =>
        page.evaluate(async ({ u, i }: Call) => {
            const r = await fetch(u, i
                ? { method: i.method, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(i.body) }
                : { credentials: "include" });
            return { status: r.status, body: (await r.json().catch(() => null)) as unknown };
        }, { u: path, i: init ?? null } as Call);

    const forecast = async () => call(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${ocm}`);
    const act = async (action_key: string, payload: Record<string, unknown>) =>
        call("/api/admin/actions/execute", {
            method: "POST",
            body: { action_key, entity_type: "opportunity_customer_member", entity_id: ocm, mode: "execute", confirmation: { confirmed: true }, payload },
        });

    /* ── CLEAN SLATE — end every live exception through the canonical writer ───────────────── */
    const start = await forecast();
    const live0 = ((start.body as { exceptions?: Array<Record<string, unknown>> } | null)?.exceptions ?? []).filter((e) => !e.superseded && !e.effectiveEnd);
    for (const e of live0) await act("billing.end_commercial_policy_exception", { exception_id: e.id });
    const cleared = await forecast();
    P.precondition = { liveEndedAtStart: live0.length, forecast: (cleared.body as { forecast?: unknown } | null)?.forecast };
    flush();

    /* ── D · the deployed runtime reads the table ──────────────────────────────────────────── */
    P.D = { status: cleared.status, exceptionsKeyPresent: Boolean(cleared.body && "exceptions" in (cleared.body as object)), error: (cleared.body as { error?: string } | null)?.error ?? null };
    log(`D: ${JSON.stringify(P.D)}`);

    /* ── E · forecast BEFORE ───────────────────────────────────────────────────────────────── */
    const beforeBody = cleared.body as { forecast?: { outcomes?: Array<{ kind?: string; policyId?: string; amountCents?: number }>; periodKey?: string } } | null;
    const expected = beforeBody?.forecast?.outcomes?.find((o) => o.kind === "expected");
    P.E = { periodKey: beforeBody?.forecast?.periodKey, outcomes: beforeBody?.forecast?.outcomes, expectedPolicyId: expected?.policyId ?? null, expectedCents: expected?.amountCents ?? null };
    log(`E: ${JSON.stringify(P.E)}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);
    await page.screenshot({ path: `${OUT}/ak-E-before.png`, fullPage: true });
    flush();

    /* ── F · MOUNTED authoring, guarded ────────────────────────────────────────────────────── */
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
            await reason.fill("11B promotion proof — mounted authoring on the deployed build", { timeout: 20_000 });
            await page.waitForTimeout(1200);
            F.confirmEnabledWithReason = await confirm.isEnabled();
            if (F.confirmEnabledWithReason) { await confirm.click({ timeout: 20_000 }); await page.waitForTimeout(15_000); }
        }
        F.errorShown = await page.locator("[data-policy-exception-error]").first().innerText().catch(() => null);
    }
    P.F = F;
    log(`F: ${JSON.stringify(F)}`);
    await page.screenshot({ path: `${OUT}/ak-F-authored.png`, fullPage: true });
    flush();

    /* ── CANONICAL READ-BACK + EFFECTIVE DATING ────────────────────────────────────────────── */
    const afterAuthor = await forecast();
    const excs = ((afterAuthor.body as { exceptions?: Array<Record<string, unknown>> } | null)?.exceptions ?? []);
    P.readBack = excs;
    P.effectiveDating = excs.map((e) => ({ start: e.effectiveStart, end: e.effectiveEnd, appliesNow: e.appliesNow, superseded: e.superseded, reason: e.reason }));
    log(`READ-BACK: ${JSON.stringify(P.effectiveDating)}`);
    flush();

    /*
     * ── G · THE EXCLUDED STATE, through the same authority with a start at the period boundary.
     * This also supersedes the one authored above, which is item K's supersession half.
     */
    const periodStart = `${beforeBody?.forecast?.periodKey ?? "2026-09"}-01`;
    const g = await act("billing.except_commercial_policy", {
        policy_id: expected?.policyId, reason: "11B promotion proof — excluded for the whole period", effective_start: periodStart,
    });
    P.G_authorAtPeriodStart = { status: g.status, ok: (g.body as { ok?: boolean } | null)?.ok ?? null, error: (g.body as { error?: unknown } | null)?.error ?? null };
    const afterG = await forecast();
    const gBody = afterG.body as { forecast?: { outcomes?: Array<{ kind?: string; reason?: string }> }; exceptions?: Array<Record<string, unknown>> } | null;
    P.G = { outcomes: gBody?.forecast?.outcomes, reason: gBody?.forecast?.outcomes?.[0]?.reason ?? null, exceptions: gBody?.exceptions };
    log(`G: ${JSON.stringify(P.G)}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);
    P.G_ui = await page.evaluate(() => ({
        outcomes: Array.from(document.querySelectorAll("[data-forecast-outcome]")).map((e) => ({ kind: e.getAttribute("data-forecast-outcome"), reason: e.getAttribute("data-forecast-reason"), text: e.textContent?.trim().slice(0, 140) })),
        exceptions: Array.from(document.querySelectorAll("[data-policy-exception]")).map((e) => ({ appliesNow: e.getAttribute("data-exception-applies"), text: e.textContent?.trim().slice(0, 180) })),
    }));
    log(`G UI: ${JSON.stringify(P.G_ui)}`);
    await page.screenshot({ path: `${OUT}/ak-G-excluded.png`, fullPage: true });
    flush();

    /* ── H · the draft ledger: does the excluded policy write a reduction? ─────────────────── */
    P.H = await call(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${ocm}`).then((r) => ({
        forecastTotalCents: (r.body as { forecast?: { totalCents?: number; netCents?: number; grossCents?: number } } | null)?.forecast?.totalCents ?? null,
        netEqualsGross: (() => {
            const f = (r.body as { forecast?: { netCents?: number; grossCents?: number } } | null)?.forecast;
            return f ? f.netCents === f.grossCents : null;
        })(),
    }));
    log(`H: ${JSON.stringify(P.H)}`);

    /* ── K · end it; later eligibility restored, history survives ─────────────────────────── */
    const liveNow = ((gBody?.exceptions ?? []) as Array<Record<string, unknown>>).filter((e) => e.appliesNow);
    const K: Record<string, unknown> = { endedCount: liveNow.length };
    for (const e of liveNow) await act("billing.end_commercial_policy_exception", { exception_id: e.id });
    const ended = await forecast();
    const eBody = ended.body as { forecast?: { outcomes?: Array<{ kind?: string }> }; exceptions?: Array<Record<string, unknown>> } | null;
    K.forecastAfterEnd = eBody?.forecast?.outcomes;
    K.eligibilityRestored = eBody?.forecast?.outcomes?.[0]?.kind === "expected";
    K.historySurvives = (eBody?.exceptions ?? []).length > 0;
    K.history = eBody?.exceptions;
    P.K = K;
    log(`K: ${JSON.stringify({ restored: K.eligibilityRestored, survives: K.historySurvives, rows: (eBody?.exceptions ?? []).length })}`);
    await page.screenshot({ path: `${OUT}/ak-K-restored.png`, fullPage: true });
    flush();
});
