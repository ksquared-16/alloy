/**
 * DOES INTENT ACTUALLY BUY TIME? -- section 19's question, asked directly.
 *
 * The mounted specimens click with essentially no dwell: Playwright's `.click()` dispatches
 * pointer-enter and pointer-down in one gesture, so the read-ahead has no time to be ahead of
 * anything. That is a real worst case -- a decided or keyboard-driven operator -- but it is not the
 * only case, and the difference decides whether the deployed mechanism is insufficient or merely
 * unexercised by the harness.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/details-floor";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
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
        if (a === 2) throw new Error(`workspace never mounted at ${page.url()}`);
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 1, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);
}

test("post-click wait against dwell", async ({ page }) => {
    await reach(page);
    const rows = page.locator("[data-financials-account-row]");
    const n = await rows.count();
    const plan = [
        { dwell: 0, idx: 1 }, { dwell: 300, idx: 2 }, { dwell: 800, idx: 3 }, { dwell: 1500, idx: 4 },
        { dwell: 0, idx: 5 }, { dwell: 300, idx: 6 }, { dwell: 800, idx: 7 }, { dwell: 1500, idx: 8 % n },
    ];

    for (const { dwell, idx } of plan) {
        const target = await rows.nth(idx).getAttribute("data-financials-account-row");
        const seen: Array<{ start: number; end: number }> = [];
        const t0 = { t: Date.now() };
        const onResponse = (r: import("@playwright/test").Response) => {
            const u = r.url().replace(/https:\/\/[^/]+/, "");
            if (!/financials\/card\?/.test(u)) return;
            if (!u.includes(target ?? " ")) return;
            const ms = Math.round(r.request().timing().responseEnd);
            const end = Date.now() - t0.t;
            seen.push({ start: end - ms, end });
        };
        page.on("response", onResponse);

        await rows.nth(idx).hover();
        await page.waitForTimeout(dwell);
        const click = Date.now();
        t0.t = click;
        await rows.nth(idx).click({ timeout: 30_000 });
        const usable = await page.waitForFunction(() => {
            const d = document.querySelector("[data-financials-detail='true']");
            return !!d && !!d.querySelector("[data-financials-lenses]");
        }, undefined, { timeout: 120_000 }).then(() => Date.now() - click).catch(() => null);
        await page.waitForTimeout(1_500);
        page.off("response", onResponse);

        const warmed = seen.find((s) => s.start < 0);
        const headStart = warmed ? -warmed.start : 0;
        log(`dwell=${String(dwell).padStart(4)}ms headStart=${String(headStart).padStart(4)}ms POSTCLICK=${usable}ms cardReqs=${seen.length} acct=${target?.slice(0, 8)}`);
        out.push({ dwell, headStart, postClickUsable: usable, cardRequests: seen.length, account: target });
        await rows.nth(0).click({ timeout: 30_000 });
        await page.waitForTimeout(2_500);
    }

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/dwell-headstart.json`, JSON.stringify(out, null, 2));
    for (const d of [0, 300, 800, 1500]) {
        const xs = out.filter((r) => r.dwell === d).map((r) => r.postClickUsable as number).filter((x) => typeof x === "number").sort((a, b) => a - b);
        log(`DWELL ${d}ms -> postclick ${JSON.stringify(xs)}`);
    }
    expect(out.length).toBeGreaterThan(0);
});
