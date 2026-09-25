/**
 * A -> B -> C, and the floor's geometry at three widths.
 *
 * The hard invariant: selected account identity and rendered financial truth must never disagree.
 * The floor now names its account, so that is observable rather than inferred from row counts.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/details-floor";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const out: Record<string, unknown>[] = [];

async function reach(page: Page) {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 2, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_500);
}

const frame = (page: Page) => page.evaluate(() => {
    const sel = document.querySelector("[data-financials-account-row][data-financials-account-selected='true']");
    const floor = document.querySelector("[data-financials-detail-account]");
    const card = document.querySelector("[data-financials-account-card]");
    return {
        selected: sel?.getAttribute("data-financials-account-row") ?? null,
        floorAccount: floor?.getAttribute("data-financials-detail-account") ?? null,
        pending: floor?.getAttribute("data-financials-detail-pending") ?? null,
        truth: floor?.getAttribute("data-financials-detail-truth") ?? null,
        ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
        reading: !!document.querySelector("[data-financials-ledger-reading]"),
        money: ((card?.textContent ?? "").match(/\$[\d,]+\.\d\d/g) ?? []).slice(0, 3),
    };
});

test("A to B to C — identity and truth never disagree", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await reach(page);
    const rows = page.locator("[data-financials-account-row]");
    /*
     * ADDRESS THE ROWS BY ID, NOT BY POSITION. The account list is ordered by money, so selecting
     * one can reorder the rest — a first cut took nth(2) and nth(4) after a click and got the SAME
     * account twice, which silently reduced an A-to-B-to-C specimen to A-to-B.
     */
    const ids = await page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-account-row]")].map((r) => r.getAttribute("data-financials-account-row")));
    const [A, B, C] = [ids[0], ids[2], ids[4]];
    expect(new Set([A, B, C]).size, "three distinct accounts").toBe(3);
    const row = (id: string | null) => page.locator(`[data-financials-account-row="${id}"]`).first();

    await row(A).click({ timeout: 30_000 });
    await page.waitForTimeout(5_000);
    log(`A settled: ${JSON.stringify(await frame(page))}`);

    await row(B).click({ timeout: 30_000 });
    await page.waitForTimeout(140);
    const afterB = await frame(page);
    log(`after B(+140ms): ${JSON.stringify(afterB)}`);
    expect(afterB.floorAccount, "the floor names B immediately").toBe(B);
    expect(afterB.ledgerRows, "and states no rows of anybody's").toBe(0);

    await row(C).click({ timeout: 30_000 });
    const t = Date.now();
    const frames: Array<Record<string, unknown>> = [];
    for (const at of [120, 350, 700, 1400, 2600, 4200, 6500]) {
        while (Date.now() - t < at) await page.waitForTimeout(40);
        const f = await frame(page);
        frames.push({ at: Date.now() - t, ...f });
        const disagree = f.floorAccount && f.selected && f.floorAccount !== f.selected;
        const staleLedger = f.ledgerRows > 0 && f.floorAccount !== C;
        log(`  +${Date.now() - t}ms sel=${f.selected?.slice(0, 8)} floor=${f.floorAccount?.slice(0, 8)} truth=${f.truth} rows=${f.ledgerRows} money=${JSON.stringify(f.money)}${disagree ? "  <<< DISAGREE" : ""}${staleLedger ? "  <<< STALE LEDGER" : ""}`);
        expect(disagree, "selected identity and rendered truth must never disagree").toBeFalsy();
        if (f.selected) expect(f.selected, "only C may be selected").toBe(C);
        expect(staleLedger, "no ledger may belong to an account other than the selected one").toBeFalsy();
    }
    out.push({ specimen: "a-b-c", A, B, C, afterB, frames });
});

test("geometry at 1280 / 1440 / 1680", async ({ page }) => {
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 900 });
        await reach(page);
        const rows = page.locator("[data-financials-account-row]");
        await rows.nth(3).click({ timeout: 30_000 });
        await page.waitForFunction(() => !!document.querySelector("[data-financials-detail-account]"), undefined, { timeout: 60_000 }).catch(() => undefined);
        const box = async () => page.evaluate(() => {
            const d = document.querySelector("[data-financials-detail='true']") ?? document.querySelector("[data-financials-detail-account]");
            const r = d?.getBoundingClientRect();
            return {
                w: r ? Math.round(r.width) : null,
                lenses: !!document.querySelector("[data-financials-lenses]"),
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        });
        const pending = await box();
        await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 120_000 }).catch(() => undefined);
        await page.waitForTimeout(800);
        const settled = await box();
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: `${OUT}/floor-${width}-settled.png` });
        log(`width ${width}: pending ${JSON.stringify(pending)} settled ${JSON.stringify(settled)}`);
        out.push({ specimen: "geometry", width, pending, settled });
        expect(pending.overflow, `${width}: no horizontal overflow while pending`).toBeLessThanOrEqual(1);
        expect(settled.overflow, `${width}: nor when settled`).toBeLessThanOrEqual(1);
        if (pending.w && settled.w) {
            expect(Math.abs(settled.w - pending.w), `${width}: the floor must not resize when truth lands`).toBeLessThanOrEqual(2);
        }
    }
    writeFileSync(`${OUT}/abc-geometry.json`, JSON.stringify(out, null, 2));
    expect(out.length).toBeGreaterThan(0);
});
