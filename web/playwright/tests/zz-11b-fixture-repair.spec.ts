/**
 * HUMAN-QA FIXTURE REPAIR — governed actions only.
 *
 * Two jobs, both on the designated family:
 *
 *   1. Retire the exception state MY certification probes left behind. Through the governed
 *      end/supersede lifecycle — never a delete, never SQL. History stays; what changes is which
 *      row is in force, so Kelly opens the Assignment and reads a clean product state instead of
 *      "§12 — governed this period, and already ended".
 *
 *   2. Create ONE responsibility arrangement, because the family has none and the capability
 *      therefore has nothing to show. Household grain, one party, a fixed amount — the shape an
 *      operator can state exactly and the one the panel itself authors.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-audit";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
type Call = { u: string; i: { method: string; body: unknown } | null };

test("clean the certification residue and give the family a responsibility arrangement", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const R: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/fixture-repair.json`, JSON.stringify(R, null, 2));

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(17_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(13_000);

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
    R.family = { customerId, assignments: ids };

    const fc = async (id: string) => call(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${id}`);
    const exc = (b: unknown) => ((b as { exceptions?: Array<Record<string, unknown>> } | null)?.exceptions ?? []);
    const out = (b: unknown) => ((b as { forecast?: { outcomes?: Array<Record<string, unknown>> } } | null)?.forecast?.outcomes ?? []);
    const act = async (entity_type: string, entity_id: string, action_key: string, payload: Record<string, unknown>) =>
        call("/api/admin/actions/execute", { method: "POST", body: {
            action_key, entity_type, entity_id, mode: "execute", confirmation: { confirmed: true }, payload } });

    /* ── 1 · RETIRE THE RESIDUE ───────────────────────────────────────────────────────────── */
    const before: Record<string, unknown> = {};
    for (const id of ids) {
        const f = await fc(id);
        before[id] = { outcome: out(f.body)[0] ?? null, rows: exc(f.body).length,
                       liveOrApplicable: exc(f.body).filter((e) => e.isLiveNow || e.appliesNow).length };
    }
    R.before = before;
    log(`BEFORE: ${JSON.stringify(before)}`);

    /*
     * Ending closes the window at today, and the forecast judges at the PERIOD start — so an
     * exception opened before this period keeps governing it after being ended. Retiring the
     * residue therefore means SUPERSEDING each applicable row with one whose window closed before
     * the period began, then ending anything still live. Both are the canonical writers.
     */
    let retired = 0;
    for (const id of ids) {
        const f0 = await fc(id);
        const periodKey = String((f0.body as { forecast?: { periodKey?: string } } | null)?.forecast?.periodKey ?? "");
        const pStart = `${periodKey}-01`;
        const prior = (() => { const d = new Date(`${pStart}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
        const dayBefore = (() => { const d = new Date(`${pStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
        for (const e of exc(f0.body).filter((e) => e.appliesNow)) {
            await act("opportunity_customer_member", id, "billing.except_commercial_policy", {
                policy_id: e.policyId,
                reason: "Retired: certification scaffolding, superseded so the walkthrough starts clean",
                effective_start: prior, effective_end: dayBefore });
            retired += 1;
        }
        /*
         * A FUTURE-DATED ROW CANNOT BE ENDED. Ending sets effective_end to today, and a row that
         * starts next month would then close before it opens — the service refuses it as
         * dates_out_of_order, correctly, and the row stays live. The H/I probe left exactly such a
         * row ("excluded for the next period"), which would silently exclude Kelly's OCTOBER
         * discount. Superseding with a closed past window is the writer that can retire it.
         */
        for (const e of exc((await fc(id)).body).filter((e) => e.isLiveNow)) {
            const startsLater = String(e.effectiveStart ?? "") > new Date().toISOString().slice(0, 10);
            if (startsLater) {
                await act("opportunity_customer_member", id, "billing.except_commercial_policy", {
                    policy_id: e.policyId,
                    reason: "Retired: certification scaffolding dated into a future period",
                    effective_start: prior, effective_end: dayBefore });
            } else {
                await act("opportunity_customer_member", id, "billing.end_commercial_policy_exception", { exception_id: e.id });
            }
            retired += 1;
        }
    }
    const after: Record<string, unknown> = {};
    for (const id of ids) {
        const f = await fc(id);
        after[id] = { outcome: out(f.body)[0] ?? null, rows: exc(f.body).length,
                      liveOrApplicable: exc(f.body).filter((e) => e.isLiveNow || e.appliesNow).length,
                      residueVisible: exc(f.body).some((e) => /A-K|§12|H\/I|promotion proof|duplicate pair/i.test(String(e.reason ?? "")) && (e.isLiveNow || e.appliesNow)) };
    }
    R.retiredCount = retired; R.after = after;
    log(`AFTER: ${JSON.stringify(after)}`);
    flush();

    /* ── 2 · ONE RESPONSIBILITY ARRANGEMENT ───────────────────────────────────────────────── */
    const cand = await call(`/api/admin/financials/responsibility-candidates?customer_id=${customerId}`);
    const candidates = (((cand.body as { candidates?: Array<Record<string, unknown>> } | null)?.candidates) ?? []) as Array<Record<string, unknown>>;
    R.candidates = candidates.map((c) => ({ personId: c.personId, name: c.name, holdsShare: c.holdsShare }));
    log(`CANDIDATES: ${JSON.stringify(R.candidates)}`);

    const party = candidates[0];
    const partyId = String(party?.personId ?? "");
    if (partyId) {
        const today = new Date().toISOString().slice(0, 10);
        const first = `${today.slice(0, 7)}-01`;
        const res = await act("child", ids[0]!, "billing.configure_responsibility", {
            customer_id: customerId,
            /* NULL = the household's arrangement, which is what "who owes this account" means. */
            customer_member_id: null,
            effective_start: first,
            shares: [{ responsible_party_id: partyId, method: "fixed", amount_cents: 50000 }],
        });
        R.arrangement = {
            requested: { grain: "household", partyId, method: "fixed", amountCents: 50000, effectiveStart: first },
            status: res.status,
            ok: (res.body as { ok?: boolean } | null)?.ok ?? null,
            error: (res.body as { error?: unknown } | null)?.error ?? null,
        };
        log(`ARRANGEMENT: ${JSON.stringify(R.arrangement)}`);
    } else {
        R.arrangement = { skipped: "no responsible-party candidate on this household" };
    }
    flush();

    /* ── READ-BACK through the canonical account view ─────────────────────────────────────── */
    const vm = await call(`/api/admin/financials/card?customer_id=${customerId}`);
    const v = (vm.body as { vm?: Record<string, unknown> } | null)?.vm ?? {};
    /*
     * The arrangement is read from ITS OWN route. An earlier pass read `vm.responsibility.shares`,
     * a field the view model does not have, and concluded the family had zero arrangements. The
     * VM exposes `parties`; the arrangement itself lives behind responsibility-arrangement.
     */
    const arr = await call(`/api/admin/financials/responsibility-arrangement?customer_id=${customerId}`);
    R.readBack = {
        arrangementRoute: { status: arr.status, body: arr.body },
        vmResponsibility: v.responsibility ?? null,
        prepaidAvailableCents: (v.prepaid as Record<string, unknown> | undefined)?.availableCents ?? null,
    };
    log(`READ-BACK: ${JSON.stringify(R.readBack)}`);
    flush();
});
