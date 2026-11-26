/**
 * F and §12 — the mounted half, on the repaired deployed build.
 *
 * ── REACHING THE ADD CONTROL ─────────────────────────────────────────────────────────────────
 *
 * The card offers "Add exception" only beside a policy the forecast EXPECTS to apply. An
 * assignment already excluded for the period therefore hides the control, and ending does not
 * bring it back — ending closes the window at today while the forecast judges at the period
 * start. So the rendered assignment is first returned to an eligible state by superseding with a
 * window that closed well before this period, through the same canonical writer.
 *
 * ── §12, THE DISTINCTION THE REPAIR INTRODUCED ───────────────────────────────────────────────
 *
 * After authoring, the exception is ended with YESTERDAY's date. Its window then still covers the
 * period start — so the forecast truthfully says it governed this period — while it is no longer
 * in force today. The surface must say "Ended" and must NOT offer End. Before the repair the card
 * read the forecast's answer and offered to end something already ended.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-discounts";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
type Call = { u: string; i: { method: string; body: unknown } | null };

test("F mounted, and the forecast-vs-lifecycle split on the surface", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const P: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/ak-mounted.json`, JSON.stringify(P, null, 2));

    const open = async () => {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(15_000);
        expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
        await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(13_000);
    };
    const call = async (path: string, init?: { method: string; body: unknown }) =>
        page.evaluate(async ({ u, i }: Call) => {
            const r = await fetch(u, i
                ? { method: i.method, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(i.body) }
                : { credentials: "include" });
            return { status: r.status, body: (await r.json().catch(() => null)) as unknown };
        }, { u: path, i: init ?? null } as Call);
    const section = () => page.evaluate(() => ({
        outcomes: Array.from(document.querySelectorAll("[data-forecast-outcome]")).map((e) => ({
            kind: e.getAttribute("data-forecast-outcome"), reason: e.getAttribute("data-forecast-reason"), text: e.textContent?.trim().slice(0, 150) })),
        exceptions: Array.from(document.querySelectorAll("[data-policy-exception]")).map((e) => ({
            applies: e.getAttribute("data-exception-applies"), live: e.getAttribute("data-exception-live"), text: e.textContent?.trim().slice(0, 190) })),
        addOffered: document.querySelectorAll("[data-add-policy-exception]").length,
        endOffered: document.querySelectorAll("[data-end-policy-exception]").length,
        endedLabels: document.querySelectorAll('[data-exception-ended="true"]').length,
    }));

    await open();
    P.build = await page.evaluate(async () => (await (await fetch("/api/build-info")).json()));

    const ids = (await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll("[data-tuition-assignment]"))
        .map((e) => e.getAttribute("data-tuition-assignment")).filter(Boolean))])) as string[];
    const fc = async (id: string) => call(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${id}`);
    const actOn = async (id: string, k: string, payload: Record<string, unknown>) =>
        call("/api/admin/actions/execute", { method: "POST", body: {
            action_key: k, entity_type: "opportunity_customer_member", entity_id: id,
            mode: "execute", confirmation: { confirmed: true }, payload } });
    const exc = (b: unknown) => ((b as { exceptions?: Array<Record<string, unknown>> } | null)?.exceptions ?? []);
    const out = (b: unknown) => ((b as { forecast?: { outcomes?: Array<Record<string, unknown>> } } | null)?.forecast?.outcomes ?? []);

    /* Return every assignment to an eligible state, with a window long closed. */
    for (const id of ids) {
        for (const e of exc((await fc(id)).body).filter((e) => e.appliesNow)) {
            await actOn(id, "billing.except_commercial_policy", { policy_id: e.policyId,
                reason: "F — retired to a long-closed window so the period is ungoverned",
                effective_start: "2026-07-01", effective_end: "2026-07-31" });
        }
    }
    P.eligibleBefore = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, out((await fc(id)).body)])));
    log(`BEFORE: ${JSON.stringify(P.eligibleBefore).slice(0, 300)}`);
    flush();

    /* ── F · the mounted act ──────────────────────────────────────────────────────────────── */
    await open();
    const F: Record<string, unknown> = {};
    F.sectionBefore = await section();
    const add = page.locator("[data-add-policy-exception]").first();
    F.offered = (await add.count()) > 0;
    expect(F.offered, "the Add control must be reachable for F to mean anything").toBe(true);
    F.policyId = await add.getAttribute("data-add-policy-exception");
    await add.click({ timeout: 20_000 });
    await page.waitForTimeout(2500);

    const draft = page.locator("[data-policy-exception-draft]").first();
    const confirm = page.locator("[data-policy-exception-confirm]").first();
    const reason = page.locator("[data-policy-exception-reason]").first();
    F.draftOpened = (await draft.count()) > 0;
    F.confirmPresent = (await confirm.count()) > 0;
    F.confirmDisabledWithoutReason = F.confirmPresent ? !(await confirm.isEnabled()) : null;
    F.preview = (await draft.count()) ? await page.locator("[data-policy-exception-preview]").first().innerText().catch(() => null) : null;
    F.previewStatesApplicability = typeof F.preview === "string" ? /will not apply/i.test(F.preview) : null;
    F.previewInventsNoAmount = typeof F.preview === "string" ? !/\$\s?\d|\d+\s?%/.test(F.preview) : null;

    await reason.fill("A-K final — mounted authoring on the repaired deployed build", { timeout: 20_000 });
    await page.waitForTimeout(1200);
    F.confirmEnabledWithReason = await confirm.isEnabled();
    await confirm.click({ timeout: 20_000 });
    await page.waitForTimeout(14_000);
    F.errorShown = (await page.locator("[data-policy-exception-error]").count()) ? await page.locator("[data-policy-exception-error]").first().innerText() : null;
    F.noRawDatabaseError = typeof F.errorShown === "string" ? !/duplicate key|violates unique constraint/i.test(F.errorShown) : true;
    F.sectionAfter = await section();

    /* The canonical read-back, from the authority rather than the screen. */
    const subject = ids.find(async (id) => exc((await fc(id)).body).some((e) => e.isLiveNow)) ?? ids[0]!;
    let authored: Record<string, unknown> | undefined;
    let subjectId = ids[0]!;
    for (const id of ids) {
        const live = exc((await fc(id)).body).find((e) => e.isLiveNow && !e.superseded && String(e.reason ?? "").includes("mounted authoring"));
        if (live) { authored = live; subjectId = id; }
    }
    F.canonicalReadBack = authored ?? null;
    F.writeSucceeded = Boolean(F.offered && F.draftOpened && F.confirmEnabledWithReason && F.errorShown == null && authored);
    P.F = F; P.subject = subjectId;
    log(`F: offered=${F.offered} draft=${F.draftOpened} disabled=${F.confirmDisabledWithoutReason} wrote=${F.writeSucceeded} err=${JSON.stringify(F.errorShown)}`);
    await page.screenshot({ path: `${OUT}/mounted-F.png`, fullPage: true });
    flush();

    /* ── END, THEN RE-AUTHOR THE SAME COMBINATION — the repair itself ─────────────────────── */
    if (authored) {
        const yesterday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
        await actOn(subjectId, "billing.end_commercial_policy_exception", { exception_id: authored.id, effective_end: yesterday });
        const re = await actOn(subjectId, "billing.except_commercial_policy", {
            policy_id: F.policyId, reason: "A-K final — re-authored the same combination after ending",
            effective_start: String(authored.effectiveStart) });
        const after = await fc(subjectId);
        P.endThenReauthor = {
            endedTo: yesterday,
            reauthorOk: (re.body as { ok?: boolean } | null)?.ok ?? null,
            reauthorError: (re.body as { error?: unknown } | null)?.error ?? null,
            endedRowStillReadable: exc(after.body).some((e) => e.id === authored!.id),
            rows: exc(after.body).length,
            liveRows: exc(after.body).filter((e) => e.isLiveNow && !e.superseded).length,
        };
        log(`RE-AUTHOR: ${JSON.stringify(P.endThenReauthor)}`);
        flush();

        /*
         * ── §12 · HISTORICAL YES, CURRENT NO ──────────────────────────────────────────────
         *
         * The case has to be CONSTRUCTED, not stumbled into: a window that opened at or before
         * the period start and closed before today. An earlier attempt tried to end the
         * re-authored exception — which starts today — with yesterday's date, and the service
         * correctly refused it as dates_out_of_order, leaving the row live and the case unmade.
         *
         * So it is authored as one window in a single act. `appliesNow` is judged at the period
         * start and must be true; `isLiveNow` is judged today and must be false.
         */
        const fcNow = await fc(subjectId);
        const periodStartForSplit = String((fcNow.body as { forecast?: { periodKey?: string } } | null)?.forecast?.periodKey ?? "") + "-01";
        const split12 = await actOn(subjectId, "billing.except_commercial_policy", {
            policy_id: F.policyId, reason: "§12 — governed this period, and already ended",
            effective_start: periodStartForSplit, effective_end: yesterday });
        P.split12Write = { ok: (split12.body as { ok?: boolean } | null)?.ok ?? null, error: (split12.body as { error?: unknown } | null)?.error ?? null, window: { start: periodStartForSplit, end: yesterday } };
        const split = await fc(subjectId);
        const governedButEnded = exc(split.body).filter((e) => e.appliesNow && !e.isLiveNow && !e.superseded);
        await open();
        const ui = await section();
        P.forecastVsLifecycle = {
            rowsGoverningThePeriodButNotLive: governedButEnded.map((e) => ({ start: e.effectiveStart, end: e.effectiveEnd, appliesNow: e.appliesNow, isLiveNow: e.isLiveNow, ended: e.ended })),
            uiEndOffered: ui.endOffered,
            uiEndedLabels: ui.endedLabels,
            uiExceptions: ui.exceptions,
            forecastStillSaysGoverned: out(split.body)[0]?.reason === "excluded_by_exception",
        };
        log(`§12: ${JSON.stringify(P.forecastVsLifecycle).slice(0, 600)}`);
        await page.screenshot({ path: `${OUT}/mounted-split.png`, fullPage: true });
        flush();
    }
});
