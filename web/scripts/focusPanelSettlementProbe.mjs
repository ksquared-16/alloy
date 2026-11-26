/**
 * FOCUS PANEL SETTLEMENT — per-card first truth, and what the entry competes with.
 *
 * What this established, and why the numbers are worth keeping: the four family-grain cards
 * (Household, Children, Assignments, Billing) become truthful only when the opportunity drawer VM
 * settles. Timed alone against an otherwise idle server that request is 1,601-2,065 ms (median
 * 1,862 ms) for ~178 KB — indistinguishable from its in-journey duration, so its cost is the
 * composition, not contention, and no client-side scheduling can shorten it. The already-prepared
 * click is 376 ms because that composition is already cached, not because a faster path exists.
 *
 * Per card: first DOM presence, first TRUTHFUL content (present, not a skeleton, carrying more than
 * its own title), and final settled content (last change). Card text is never printed.
 *
 * PE3_CLICK_AT_MS controls WHEN the destination is clicked, measured from the Workspace load. The
 * Workspace becomes actionable at ~2.07 s and the speculative destination warm bursts at ~2.06 s, so
 * clicking at 2100 ms is the realistic operator moment and clicking at 12000 ms is the same journey
 * with the burst already drained. The difference between the two is the burst's cost to a real click.
 */
import { BASE, redact, withOperatorPage } from "./pe3HarnessEnv.mjs";

const CLICK_AT = Number(process.env.PE3_CLICK_AT_MS ?? 2100);
/**
 * Pointer dwell before the click. A real operator's cursor crosses the row and rests on it; a
 * synthetic click gives the row's pointer-intent warm no lead time at all, which flatters or
 * penalises the measurement depending on what that warm prepares.
 */
const HOVER_MS = Number(process.env.PE3_HOVER_MS ?? 0);
const OBSERVE = Number(process.env.PE3_OBSERVE_MS ?? 22_000);
const POLL = 50;
const TITLE_SLACK = 24; // a cell holding only its own heading is present, not truthful

const READ = `(() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (el) => (el ? (el.textContent || "").replace(/\\s+/g, " ").trim() : "");
  const cells = {};
  q('[data-focus-panel-grid-cell]').forEach((el) => {
    const k = el.getAttribute('data-focus-panel-grid-cell');
    const t = txt(el);
    cells[k] = {
      len: t.length,
      sig: t.length,
      skeleton: Boolean(el.querySelector('[data-testid="inline-focus-panel-skeleton"], .animate-pulse, [aria-busy="true"]')),
    };
  });
  return {
    cells,
    identity: txt(document.querySelector('#admin-focus-panel-title')).length,
    rows: q('[data-entity-id]').length,
    commands: q('[data-command-rail-action], [data-adminv2-command-action], button[data-action-key]').length,
    busy: q('[data-testid="inline-focus-panel-skeleton"], .animate-pulse, [aria-busy="true"]').length,
  };
})()`;

await withOperatorPage(async (page, context) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const inflight = new Map();
    const recs = [];
    let clickT0 = 0;
    cdp.on("Network.requestWillBeSent", (e) => {
        if (!e.request.url.startsWith(BASE)) return;
        inflight.set(e.requestId, { url: e.request.url, startedAt: Date.now() });
    });
    cdp.on("Network.responseReceived", (e) => { const r = inflight.get(e.requestId); if (r) r.status = e.response.status; });
    const fin = (id, x) => {
        const r = inflight.get(id); if (!r) return;
        Object.assign(r, x); r.dur = Date.now() - r.startedAt;
        r.start = clickT0 ? r.startedAt - clickT0 : null;
        r.end = clickT0 ? Date.now() - clickT0 : null;
        recs.push(r); inflight.delete(id);
    };
    cdp.on("Network.loadingFinished", (e) => fin(e.requestId, { size: e.encodedDataLength }));
    cdp.on("Network.loadingFailed", (e) => fin(e.requestId, { failed: e.errorText, canceled: e.canceled }));

    await page.goto(`${BASE}/login`, { waitUntil: "commit", timeout: 120_000 });
    await page.waitForTimeout(1200);

    const wsT0 = Date.now();
    await page.goto(`${BASE}/workspace`, { waitUntil: "commit", timeout: 180_000 });
    await page.waitForFunction(`document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0`, { timeout: 90_000 });
    const link = page.locator(`a[href^="/workspace/work-unit/waitlist"]`).first();
    await link.waitFor({ state: "visible", timeout: 30_000 });
    const wait = CLICK_AT - (Date.now() - wsT0) - HOVER_MS;
    if (wait > 0) await page.waitForTimeout(wait);
    if (HOVER_MS > 0) {
        await link.hover({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(HOVER_MS);
    }
    const clickedAtFromLoad = Date.now() - wsT0;

    recs.length = 0;
    clickT0 = Date.now();
    link.click({ timeout: 20_000, noWaitAfter: true }).catch(() => {});

    const first = {}, truthful = {}, settled = {}, lastSig = {};
    let identityAt = null, rowsAt = null, commandsAt = null, quietAt = null;
    let lastReqAt = Date.now();
    cdp.on("Network.requestWillBeSent", (e) => { if (e.request.url.startsWith(BASE)) lastReqAt = Date.now(); });
    while (Date.now() - clickT0 < OBSERVE) {
        let r; try { r = await page.evaluate(READ); } catch { await page.waitForTimeout(POLL); continue; }
        const t = Date.now() - clickT0;
        if (identityAt === null && r.identity > 0) identityAt = t;
        if (rowsAt === null && r.rows > 0) rowsAt = t;
        if (commandsAt === null && r.commands > 0) commandsAt = t;
        for (const [k, c] of Object.entries(r.cells)) {
            if (first[k] === undefined) first[k] = t;
            if (truthful[k] === undefined && !c.skeleton && c.len > TITLE_SLACK) truthful[k] = t;
            if (lastSig[k] !== c.sig) { lastSig[k] = c.sig; settled[k] = t; }
        }
        if (quietAt === null && r.busy === 0 && Object.keys(r.cells).length > 0 && Date.now() - lastReqAt > 1500) quietAt = t;
        await page.waitForTimeout(POLL);
    }

    console.log(`\n=== per-card settlement — clicked ${clickedAtFromLoad} ms after the Workspace load, after ${HOVER_MS} ms pointer dwell ===`);
    console.log("   card                first-DOM  first-truth  final-settled");
    for (const k of Object.keys(first).sort((a, b) => (truthful[a] ?? 1e9) - (truthful[b] ?? 1e9))) {
        console.log(`   ${k.padEnd(20)} ${String(first[k]).padStart(6)}ms ${String(truthful[k] ?? -1).padStart(9)}ms ${String(settled[k]).padStart(11)}ms`);
    }
    console.log(`   ${"identity".padEnd(20)} ${String(identityAt).padStart(6)}ms`);
    console.log(`   ${"queue rows".padEnd(20)} ${String(rowsAt).padStart(6)}ms`);
    console.log(`   ${"commands".padEnd(20)} ${String(commandsAt).padStart(6)}ms`);
    console.log(`   ${"quiet (no skeleton + network idle)".padEnd(20)} ${quietAt} ms`);

    const app = recs.filter((r) => r.url.includes("/api/"));
    console.log(`\n=== requests during entry (${app.length} total) — longest 14 ===`);
    for (const r of app.sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0)).slice(0, 14)) {
        console.log(`   ${String(r.dur).padStart(5)}ms  start ${String(r.start).padStart(6)}ms  end ${String(r.end).padStart(6)}ms  ${String(r.size ?? 0).padStart(7)}B  ${r.status ?? r.failed}  ${redact(r.url).slice(0, 60)}`);
    }
    const related = app.filter((r) => r.url.includes("/related/"));
    console.log(`\n=== the drawer-tab documents read (deferred past the reveal) ===`);
    console.log(related.length
        ? related.map((r) => `   start ${r.start}ms  dur ${r.dur}ms  ${r.size}B  status ${r.status ?? r.failed}${r.canceled ? " CANCELED" : ""}`).join("\n")
        : "   not requested during this entry");
    const peak = (() => {
        const evts = [];
        for (const r of app) { evts.push([r.start, 1], [r.end, -1]); }
        evts.sort((a, b) => a[0] - b[0]);
        let cur = 0, max = 0; for (const [, d] of evts) { cur += d; max = Math.max(max, cur); }
        return max;
    })();
    console.log(`\n=== peak in-flight app requests during entry: ${peak} ===`);
}, {});
