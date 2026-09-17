/**
 * SLICE 12E PART B v2 — FINANCIALS WORKSPACE / DETAILS TRACE. MEASUREMENT ONLY.
 *
 * v1 reported 2 ms and 1 ms for several legs. Those were not fast legs: the selectors were ALREADY
 * PRESENT before the action, so the wait returned immediately and measured nothing. Every leg here
 * records presence BEFORE the action and refuses to report a duration when the target was already
 * there — an "already_present" leg is evidence about the DOM, not about latency.
 *
 * v1 also clicked the wrong control: `data-financials-details` is not a button. The Details command
 * is `[data-financials-nav="details"]` and the overlay it opens is `[data-financials-overlay="detail"]`.
 */
import { createRequire } from "node:module";
import { homedir } from "os"; import { join } from "path"; import fs from "fs";
const webRequire = createRequire("/Users/vacilando/Code/alloy-worktrees/wt1-work-unit-grade-a/web/package.json");
const { chromium } = webRequire("playwright");

const BASE = "https://staging.workwithalloy.com";
const STORAGE = join(homedir(), ".local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json");
const OUT = "/private/tmp/claude-501/-Users-vacilando-Code-alloy-worktrees-wt1-work-unit-grade-a/cef3de6d-880c-4118-9a12-615c80ff76a4/scratchpad";

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: STORAGE, viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

let leg = "(boot)";
const reqs = [];
page.on("requestfinished", (r) => {
    try {
        const u = new URL(r.url());
        if (!u.pathname.startsWith("/api/") && r.resourceType() !== "document") return;
        const t = r.timing();
        reqs.push({ leg, path: u.pathname, search: u.search.slice(0, 110),
                    ms: t.responseEnd >= 0 ? Math.round(t.responseEnd) : null });
    } catch { /* ignore */ }
});

const legs = [];
async function step(name, sel, action, timeout = 45000) {
    leg = name;
    const before = reqs.length;
    const already = sel ? await page.locator(sel).count() > 0 : false;
    const t0 = Date.now();
    let outcome;
    try {
        await action();
        if (!sel) outcome = { ok: true };
        else if (already) outcome = { already_present: true };
        else {
            const t = Date.now();
            await page.waitForSelector(sel, { timeout, state: "attached" });
            outcome = { appeared_ms: Date.now() - t };
        }
    } catch (e) { outcome = { failed: e instanceof Error ? e.message.split("\n")[0].slice(0, 90) : String(e) }; }
    const ms = Date.now() - t0;
    const caused = reqs.slice(before);
    const slowest = caused.slice().sort((a, c) => (c.ms ?? 0) - (a.ms ?? 0))[0] ?? null;
    legs.push({ leg: name, leg_ms: ms, outcome, requests: caused.map((r) => `${r.path}${r.search} ${r.ms}ms`),
                slowest_ms: slowest?.ms ?? null, slowest_path: slowest ? slowest.path + slowest.search : null });
    console.log(`${name.padEnd(46)} ${String(ms).padStart(6)}ms ${JSON.stringify(outcome).padEnd(26)} slowest=${slowest?.ms ?? "-"}ms [${caused.length} req]`);
}

// ── A · WORK UNIT ENTRY ───────────────────────────────────────────────────────────────────────
await step("navigate -> compact Financials useful", "article.alloy-os-ucard[data-universal-card-key='financials']",
    async () => { await page.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "commit", timeout: 90000 }); }, 60000);
await page.waitForTimeout(4000);

const compact = await page.evaluate(() => {
    const el = document.querySelector("[data-financials-card]");
    const nav = document.querySelector('[data-financials-nav="details"]');
    return { account: el?.getAttribute("data-financials-account") ?? null,
             detailsControlPresent: !!nav,
             detailOverlayOpen: !!document.querySelector('[data-financials-overlay="detail"]') };
});
console.log("compact:", JSON.stringify(compact));

// ── B · DETAILS — the predictable next action ────────────────────────────────────────────────
await step("Details click -> detail overlay frame", '[data-financials-overlay="detail"]', async () => {
    const nav = page.locator('[data-financials-nav="details"]').first();
    if (await nav.count()) await nav.click({ timeout: 10000 });
}, 30000);
await step("Details -> hydrated", "[data-financials-detail-hydrated]", async () => {}, 60000);
await page.waitForTimeout(1500);
const afterDetails = await page.evaluate(() => ({
    overlay: document.querySelector("[data-financials-card][data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
    ledgerLines: document.querySelectorAll("[data-financials-line]").length,
}));
console.log("afterDetails:", JSON.stringify(afterDetails));
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(800);

// ── C · FINANCIALS WORKSPACE ─────────────────────────────────────────────────────────────────
await step("open Financials -> shell present", "[data-financials-workspace], [data-adminv2-workspace-modal='financials'], [data-financials-overview-scope]",
    async () => {
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) await nav.click({ timeout: 15000 });
    }, 45000);
await step("shell -> Overview useful", "[data-financials-overview-recent-row], [data-financials-overview-exception], [data-financials-overview-error]",
    async () => {}, 45000);
await step("Accounts click -> queue useful", "[data-financials-account-row]",
    async () => { const t = page.locator("button:has-text('Accounts')").first(); if (await t.count()) await t.click({ timeout: 15000 }); }, 60000);

const accounts = await page.evaluate(() => [...document.querySelectorAll("[data-financials-account-row]")]
    .map((r) => ({ id: r.getAttribute("data-financials-account-row"), outstanding: r.querySelector("[data-financials-account-outstanding]")?.textContent?.trim() ?? null,
                   state: r.getAttribute("data-financials-account-state") })).slice(0, 12));
console.log("accounts:", JSON.stringify(accounts.slice(0, 6)));

// A · a HEALTHY account (money on it) and B · a ZERO-ACTIVITY account
const healthy = accounts.find((a) => a.outstanding && /[1-9]/.test(a.outstanding)) ?? accounts[0];
const zero = accounts.find((a) => a.id !== healthy?.id && (!a.outstanding || !/[1-9]/.test(a.outstanding))) ?? accounts[1];
console.log("specimens:", JSON.stringify({ healthy, zero }));

for (const [label, spec] of [["A healthy", healthy], ["B zero-activity", zero]]) {
    if (!spec?.id) continue;
    await step(`${label}: select -> detail frame`, "[data-financials-account-detail]",
        async () => { await page.locator(`[data-financials-account-row="${spec.id}"]`).first().click({ timeout: 15000 }); }, 45000);
    await step(`${label}: -> detail hydrated`, "[data-financials-detail-hydrated]", async () => {}, 60000);
    await step(`${label}: -> ledger present`, "[data-financials-ledger]", async () => {}, 60000);
    await page.waitForTimeout(1200);
}

// ── D · RE-SELECT the SAME account: is anything reused? ──────────────────────────────────────
if (healthy?.id) {
    await step("re-select the SAME account (reuse?)", null,
        async () => { await page.locator(`[data-financials-account-row="${healthy.id}"]`).first().click({ timeout: 15000 }); await page.waitForTimeout(6000); });
}

const out = { compact, afterDetails, accounts, specimens: { healthy, zero }, legs,
              card_endpoint_calls: reqs.filter((r) => r.path === "/api/admin/financials/card").map((r) => ({ leg: r.leg, search: r.search, ms: r.ms })),
              all_requests: reqs };
fs.writeFileSync(`${OUT}/s12e-ws2.json`, JSON.stringify(out, null, 1));
console.log(`\nwrote ${reqs.length} requests across ${legs.length} legs`);
await b.close();
