/**
 * R11 — is initial Activity history on the critical path to Work Unit T3?
 *
 * Proves the answer by ORDERING rather than assertion: every Activity request is stamped against the
 * moment the primary surface becomes usable, so "prefetched, not awaited" is a measured relation.
 *
 * Playwright's `timing().startTime` is an epoch while `responseEnd` is relative to it — subtracting
 * the two yields nonsense, so wall-clock stamps are taken around the request events instead.
 *
 * Env: PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE / R11_OUT_DIR / R11_WORK_UNIT.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, redactSubject, writeEvidence, withResource } from "./r11Env.mjs";

const WORK_UNIT = process.env.R11_WORK_UNIT ?? "waitlist";
const ROW = "[data-queue-row-subject]";   // queue rows carry no `data-queue-row` attribute

assertLocalBase();
assertCandidateBuild();
const result = await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
        const page = await ctx.newPage();
        const started = new Map();
        const reqs = [];
        let epoch = Date.now();
        page.on("request", (r) => started.set(r, Date.now()));
        page.on("requestfinished", (r) => {
            const u = r.url();
            if (!u.includes("/api/admin/")) return;
            const s = started.get(r) ?? Date.now();
            reqs.push({ path: u.replace(BASE, "").split("?")[0], query: u.split("?")[1] ?? "", at_ms: s - epoch, dur_ms: Date.now() - s });
        });

        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForFunction(
            () => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0,
            undefined,
            { timeout: 90000 },
        );
        await page.waitForTimeout(8000);

        epoch = Date.now();
        reqs.length = 0;
        await page.goto(`${BASE}/workspace/work-unit/${WORK_UNIT}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, ROW, { timeout: 60000 });
        const t3_ms = Date.now() - epoch;
        await page.locator(ROW).first().click({ timeout: 20000 });
        await page.waitForTimeout(15000);
        return { t3_ms, reqs };
    },
);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const safe = (s) => String(s).replace(UUID, (m) => redactSubject(m));
const activity = result.reqs.filter((r) => /\/activity$/.test(r.path));
const vm = result.reqs.filter((r) => /view-models\/drawer\/opportunity/.test(r.path));
console.log(`T3 (queue rows usable): ${result.t3_ms}ms after intent\n`);
console.log("=== drawer VM composes ===");
vm.forEach((r) => console.log(`  start +${r.at_ms}ms  dur ${r.dur_ms}ms  ${safe(r.path)}`));
console.log(`\n=== /api/admin/activity requests: ${activity.length} ===`);
activity.forEach((r) => console.log(
    `  start +${r.at_ms}ms (T3=${result.t3_ms}ms) dur ${r.dur_ms}ms  ${safe(r.query)}  => ${r.at_ms > result.t3_ms ? "AFTER T3 (off critical path)" : "BEFORE T3 (on critical path)"}`,
));
writeEvidence("critical-path.json", { base: BASE, work_unit: WORK_UNIT, ...result });
