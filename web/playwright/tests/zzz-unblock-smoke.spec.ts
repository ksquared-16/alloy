/**
 * SHARED-RUNTIME UNBLOCK SMOKE — deployed, read only.
 * Settlement outcome is READ from `__ALLOY_SETTLEMENT_DIAG__`, never inferred.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/runtime-unblock";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

const FIN = () => {
    const shell = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
    const text = shell?.innerText.replace(/\s+/g, " ").trim() ?? "";
    const after = (label: string) => {
        const m = text.match(new RegExp(label + "\\s*(-?\\$[\\d,]+\\.\\d{2}|None)", "i"));
        return m ? m[1] : null;
    };
    const w = window as unknown as { __ALLOY_SETTLEMENT_DIAG__?: Array<Record<string, unknown>> };
    return {
        subject: shell?.getAttribute("data-financials-subject") ?? null,
        account: shell?.getAttribute("data-financials-account") ?? null,
        reserved: shell?.getAttribute("data-financials-reserved") ?? null,
        emptyState: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? null,
        skeletons: document.querySelectorAll("[data-financials-card-skeleton='true']").length,
        detailsNav: document.querySelectorAll("[data-financials-nav='details']").length,
        netObligation: after("NET OBLIGATION"),
        due: after("DUE"),
        balance: after("Balance"),
        paid: after("Paid"),
        prepaid: after("Available prepaid"),
        headline: text.slice(0, 200),
        bodySubject: document.querySelector("[data-focus-panel-body-subject]")?.getAttribute("data-focus-panel-body-subject") ?? null,
        settlement: (w.__ALLOY_SETTLEMENT_DIAG__ ?? []).map((e) => ({ outcome: e.outcome, addressed: e.addressed, t: e.t })),
    };
};
async function settled(page: Page, timeout = 150_000) {
    await expect(page.locator("[data-financials-nav='details']").first(), "the card settles and offers Details")
        .toHaveCount(1, { timeout });
}

test("A — direct route entry: a POPULATED Financials card, settlement read as applied", async ({ page }) => {
    const t0 = Date.now();
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await settled(page);
    const settledAt = Date.now() - t0;
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    const r = await page.evaluate(FIN);
    log(`A DIRECT ROUTE settled=${settledAt}ms ${JSON.stringify(r, null, 1)}`);
    save("A-direct-route", { settledAtMs: settledAt, ...r });
    await shot(page, "U1-direct-route");
    expect(r.emptyState, "no permanent skeleton").not.toBe("loading");
    expect(r.skeletons, "no skeleton bars").toBe(0);
    expect(r.netObligation, "NET OBLIGATION populated").toBeTruthy();
    expect(r.due, "DUE populated").toBeTruthy();
    expect(r.balance, "Balance populated").toBeTruthy();
    expect(r.paid, "Paid populated").toBeTruthy();
    const outcomes = (r.settlement as Array<Record<string, unknown>>).map((e) => e.outcome);
    log(`A SETTLEMENT OUTCOMES ${JSON.stringify(outcomes)}`);
    expect(outcomes.includes("applied"), "settlement APPLIED, read from the diagnostic").toBe(true);
    expect(outcomes.includes("no_frame"), "no no_frame refusal").toBe(false);
});

test("B — queue-row A to B: no A truth under B, settlement addressed and applied", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await settled(page);
    const A = await page.evaluate(FIN);
    log(`A SELECTED ${JSON.stringify({ subject: A.subject, account: A.account, net: A.netObligation, due: A.due, balance: A.balance })}`);
    await shot(page, "U3-subject-A");

    /* The Enrolled-children lane holds two children of ONE household, which cannot prove a
       cross-subject switch. Move to a lane with several families. */
    const allTab = page.locator("button").filter({ hasText: /^All\s*\d+$/ }).first();
    if (await allTab.count()) { await allTab.click({ timeout: 20_000 }); await page.waitForTimeout(12_000); }
    const rows = page.locator('[data-runtime-label="WU.QUEUE_ROW"]');
    const n = await rows.count();
    log(`queue rows in the All lane: ${n}`);
    let switched: Record<string, unknown> | null = null;
    let duringFrames: Array<Record<string, unknown>> = [];
    for (let i = 0; i < Math.min(n, 8); i++) {
        const row = rows.nth(i);
        const label = (await row.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 40);
        await row.click({ timeout: 20_000 }).catch(() => undefined);
        /* Sample DURING the transition — this is where A-under-B would show. */
        duringFrames = [];
        for (let k = 0; k < 10; k++) {
            duringFrames.push(await page.evaluate(FIN) as Record<string, unknown>);
            await page.waitForTimeout(400);
        }
        await settled(page).catch(() => undefined);
        const B = await page.evaluate(FIN);
        log(`clicked row ${i} (${label}) -> subject=${B.subject} account=${B.account} net=${B.netObligation}`);
        if (B.account && B.account !== A.account) { switched = { label, ...B }; break; }
    }
    expect(switched, "a row selecting a DIFFERENT household was reachable").toBeTruthy();
    const B = switched as Record<string, unknown>;
    log(`B SELECTED ${JSON.stringify({ subject: B.subject, account: B.account, net: B.netObligation, due: B.due, balance: B.balance })}`);
    save("B-switch", { A, B, duringFrames });
    await shot(page, "U4-subject-B");

    /* THE INVARIANT: at no sampled frame may B's card carry A's account or A's figures. */
    const violations = duringFrames.filter((f) =>
        (f.account && f.account === A.account && f.subject !== A.subject)
        || (f.subject !== A.subject && f.netObligation && f.netObligation === A.netObligation && f.account === A.account));
    log(`A-UNDER-B VIOLATIONS: ${violations.length}`);
    expect(violations.length, "no A financial truth ever appeared under B").toBe(0);
    expect(B.account, "B's card carries B's account").not.toBe(A.account);
    const outcomes = (B.settlement as Array<Record<string, unknown>>).map((e) => e.outcome);
    log(`B SETTLEMENT OUTCOMES ${JSON.stringify(outcomes)}`);
    expect(outcomes.includes("applied"), "settlement applied for the switch").toBe(true);
});

test("C D — Details opens the canonical inner product", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await settled(page);
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(6000);
    const r = await page.evaluate(() => {
        const q = (s: string) => document.querySelectorAll(s).length;
        const t = (s: string) => { const e = document.querySelector(s) as HTMLElement | null; return e ? e.innerText.replace(/\s+/g, " ").trim().slice(0, 280) : null; };
        return {
            detailRoot: q("[data-financials-detail='true']"),
            kpis: t("[data-financials-detail='true']"),
            payerRow: t("[data-financials-payer-row='true']"),
            rowGroups: q("[data-financials-row-group]"),
            discountGear: q("[data-financials-manage-discounts='gear']"),
            managePayments: q("[data-financials-manage-payments='open']"),
            responsibilityGear: q("[data-financials-manage-responsibility='gear']"),
            responsibleFilter: q("[data-testid='financials-filter-responsible-party']"),
            lenses: t("[data-financials-lenses='true']"),
            ledgerRows: q("[data-financials-ledger-row]"),
            periods: q("[data-financials-period]"),
        };
    });
    log(`C D FOCUS DETAILS ${JSON.stringify(r, null, 1)}`);
    save("C-focus-details", r);
    await shot(page, "U2-focus-details");
    expect(r.detailRoot, "Details mounted").toBe(1);
    expect(r.ledgerRows, "the ledger has rows").toBeGreaterThan(0);
});
