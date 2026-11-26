/**
 * §13/§14/§17/§18 — one Save, and what it must and must not change.
 *
 * The Save is executed through the product's own card. Everything around it is READ through the
 * canonical routes before and after, so the proof is a comparison of canonical truth rather than
 * of anything this probe computed.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(560_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("configure once, and compare canonical truth", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    await page.locator('[data-workspace-section-tab="accounts"]').first().click({ force: true });
    await page.waitForTimeout(11_000);
    await page.locator("[data-financials-account-row]").first().click({ force: true });
    await page.waitForTimeout(12_000);

    const customerId = await page.evaluate(
        () => document.querySelector("[data-financials-account-row][data-financials-account-selected='true']")
            ?.getAttribute("data-financials-account-row")
            ?? document.querySelector("[data-financials-account-row]")?.getAttribute("data-financials-account-row"),
    );
    log(`account: ${customerId}`);

    /** Canonical reads, through the product's own routes. */
    const snapshot = async (label: string) => {
        const snap = await page.evaluate(async (cid) => {
            const j = async (u: string) => { const r = await fetch(u, { credentials: "include" }); return r.ok ? r.json() : { error: r.status }; };
            const scopes = await j(`/api/admin/financials/responsibility-scopes?customer_id=${cid}`);
            const members = (scopes.members ?? []) as { customerMemberId: string; label: string }[];
            const byScope: Record<string, unknown> = {};
            byScope["Household"] = await j(`/api/admin/financials/responsibility-arrangement?customer_id=${cid}`);
            for (const m of members) {
                byScope[m.label] = await j(`/api/admin/financials/responsibility-arrangement?customer_id=${cid}&customer_member_id=${m.customerMemberId}`);
            }
            const card = await j(`/api/admin/financials/card?customer_id=${cid}`);
            const vm = (card.vm ?? {}) as { rows?: Array<Record<string, unknown>>; payments?: Array<Record<string, unknown>>; reconciliation?: Record<string, number> };
            return {
                byScope,
                /* §17/§18: the facts responsibility must not touch. */
                rows: (vm.rows ?? []).map((r) => ({
                    id: r.chargeId ?? r.id, child: r.childName ?? r.subjectLabel ?? null,
                    amount: r.amountCents, status: r.status, responsible: r.responsiblePartyLabel ?? r.responsibleParty ?? null,
                })),
                payments: (vm.payments ?? []).map((p) => ({ id: p.paymentId, payer: p.payerLabel, amount: p.amountCents })),
                reconciliation: vm.reconciliation ?? null,
            };
        }, customerId);
        const compact = (s: typeof snap) =>
            Object.fromEntries(Object.entries(s.byScope).map(([k, v]) => {
                const a = (v as { arrangement?: { id?: string; effectiveStart?: string; shares?: { name: string; amountCents: number }[] } | null; authoredAtRequestedScope?: boolean });
                return [k, a.arrangement ? `${a.authoredAtRequestedScope ? "authored" : "inherited"} ${a.arrangement.id} from ${a.arrangement.effectiveStart} · ${(a.arrangement.shares ?? []).map((sh) => `${sh.name} ${sh.amountCents}`).join(", ")}` : "none"];
            }));
        log(`\n--- ${label} ---`);
        log(JSON.stringify(compact(snap), null, 1));
        log(`rows ${snap.rows.length} · payments ${snap.payments.length} · reconciliation ${JSON.stringify(snap.reconciliation)}`);
        return snap;
    };

    const before = await snapshot("BEFORE");

    // ── Execute ONE configure, through the card, on a child scope. ──
    await page.locator('[data-financials-manage-responsibility="gear"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    const opts = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid='responsibility-scope'] option"))
            .map((o) => ({ v: (o as HTMLOptionElement).value, t: (o as HTMLOptionElement).textContent?.trim() })));
    const child = opts.find((o) => o.v !== "__household__");
    log(`\nconfiguring scope: ${JSON.stringify(child)}`);
    if (child) { await page.selectOption("[data-testid='responsibility-scope']", child.v); await page.waitForTimeout(7000); }

    /* A new amount, so the write is visible; effective TODAY — never backdated to manufacture proof. */
    const amountInput = page.locator('[data-financials-manage-responsibility="depth-card"] input[inputmode], [data-financials-manage-responsibility="depth-card"] input[type="text"]').first();
    log(`amount inputs: ${await amountInput.count()}`);
    if (await amountInput.count()) { await amountInput.fill("33.00").catch((e) => log(`fill: ${e}`)); await page.waitForTimeout(1500); }
    const card = page.locator('[data-financials-manage-responsibility="depth-card"]');
    const buttons = await card.locator("button").allInnerTexts();
    log(`card buttons: ${JSON.stringify(buttons)}`);
    for (const name of ["Preview", "Save", "Confirm", "Apply"]) {
        const b = card.getByRole("button", { name: new RegExp(`^${name}$`) }).first();
        if (await b.count()) { log(`clicking ${name}`); await b.click({ force: true }).catch((e) => log(`${name}: ${e}`)); await page.waitForTimeout(9000); }
    }
    out.cardAfterSave = await page.evaluate(() => ({
        stillOpen: Boolean(document.querySelector('[data-financials-manage-responsibility="depth-card"]')),
        text: (document.querySelector('[data-financials-manage-responsibility="depth-card"]') as HTMLElement | null)?.innerText?.replace(/\n+/g, " / ").slice(0, 400) ?? null,
        detailStillOpen: Boolean(document.querySelector("[data-financials-filter-slot]")),
    }));
    log(`\nAFTER SAVE (card): ${JSON.stringify(out.cardAfterSave)}`);

    const after = await snapshot("AFTER");

    // ── §17/§18: what must not have changed. ──
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    out.nonMutation = {
        childAttributionUnchanged: same(before.rows.map((r) => [r.id, r.child]), after.rows.map((r) => [r.id, r.child])),
        chargeAmountsUnchanged: same(before.rows.map((r) => [r.id, r.amount]), after.rows.map((r) => [r.id, r.amount])),
        chargeStatusesUnchanged: same(before.rows.map((r) => [r.id, r.status]), after.rows.map((r) => [r.id, r.status])),
        paymentsUnchanged: same(before.payments, after.payments),
        postedAllocationUnchanged: same(
            before.rows.filter((r) => String(r.status) === "posted").map((r) => [r.id, r.responsible]),
            after.rows.filter((r) => String(r.status) === "posted").map((r) => [r.id, r.responsible]),
        ),
    };
    log(`\nNON-MUTATION: ${JSON.stringify(out.nonMutation, null, 1)}`);
    out.before = before.byScope; out.after = after.byScope;
    writeFileSync(`${OUT}/responsibility-parity.json`, JSON.stringify(out, null, 2));
});
