/**
 * PREWARM HEAD START, measured from the REQUEST event rather than inferred from a response.
 *
 * The first attempt computed a request's start as `responseEnd - arrivalTime`, with the arrival
 * measured against an origin that was only set at the click. A response that landed BEFORE the
 * click was therefore timed against a stale origin and reported a positive start, which read as
 * "no head start" for every dwell. Requests are timestamped as they are ISSUED here, against one
 * origin that never moves.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/details-floor";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const out: Record<string, unknown>[] = [];

test("head start and post-click wait, against dwell", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 1, undefined, { timeout: 180_000 });
    await page.waitForTimeout(4_000);

    const rows = page.locator("[data-financials-account-row]");
    const n = await rows.count();
    const issued: Array<{ at: number; url: string }> = [];
    page.on("request", (r) => {
        const u = r.url();
        if (u.indexOf("/api/admin/financials/card?") >= 0) issued.push({ at: Date.now(), url: u });
    });

    const plan = [
        { dwell: 0, idx: 1 }, { dwell: 400, idx: 2 }, { dwell: 900, idx: 3 },
        { dwell: 0, idx: 4 }, { dwell: 400, idx: 5 }, { dwell: 900, idx: 6 % n },
    ];

    for (const { dwell, idx } of plan) {
        const target = (await rows.nth(idx).getAttribute("data-financials-account-row")) ?? "zzz";
        const mark = issued.length;
        await rows.nth(idx).hover();
        await page.waitForTimeout(dwell);
        const click = Date.now();
        await rows.nth(idx).click({ timeout: 30_000 });
        const usable = await page.waitForFunction(() => {
            const d = document.querySelector("[data-financials-detail='true']");
            return !!d && !!d.querySelector("[data-financials-lenses]");
        }, undefined, { timeout: 120_000 }).then(() => Date.now() - click).catch(() => null);
        await page.waitForTimeout(1_200);

        const mine = issued.slice(mark).filter((r) => r.url.indexOf(target) >= 0);
        const first = mine.length ? Math.min(...mine.map((r) => r.at)) : null;
        const headStart = first != null ? click - first : 0;
        log(`dwell=${dwell} headStart=${headStart}ms POSTCLICK=${usable}ms reqs=${mine.length} acct=${target.slice(0, 8)}`);
        out.push({ dwell, headStart, postClickUsable: usable, requests: mine.length, account: target });
        await rows.nth(0).click({ timeout: 30_000 });
        await page.waitForTimeout(2_000);
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/head-start.json`, JSON.stringify(out, null, 2));
    for (const d of [0, 400, 900]) {
        const g = out.filter((r) => r.dwell === d);
        log(`DWELL ${d}: headStart ${JSON.stringify(g.map((r) => r.headStart))} postclick ${JSON.stringify(g.map((r) => r.postClickUsable))} reqs ${JSON.stringify(g.map((r) => r.requests))}`);
    }
    expect(out.length).toBeGreaterThan(0);
});
