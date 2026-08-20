/**
 * PE-3 — warm INTERACTION decomposition harness.
 *
 * `pe3ColdLoadHarness.mjs` measures cold route load. It cannot measure the mission's actual spine:
 * Work View switch, queue row -> Focus Panel, card focus, command destination, dropdown open, save.
 * Runbook §4 flows 4-7 are the ones that have never been measured; this drives them.
 *
 * Every interaction is decomposed into the same five points, so surfaces are comparable:
 *
 *   T0  intent            the click, taken in the page's own clock
 *   T1  acknowledgement   the pressed/selected state the operator can see
 *   T2  destination       the shell/subject identity is committed
 *   T3  primary usable    the first real content the operator can act on
 *   T4  fully hydrated    everything the surface promised has resolved
 *
 * Signals are DOM contracts already in the product (aria-selected on [data-work-view-id],
 * [data-queue-row-active], [data-inline-focus-panel-subject], [data-card-role], ...). Nothing is
 * instrumented for the benchmark's benefit, so the harness cannot drift from what ships.
 *
 * PROD ONLY. `perfDevDetailEnabled()` marks are gated on NODE_ENV !== "production" and do not fire.
 *
 * Usage: node scripts/pe3InteractionHarness.mjs <label> [runIndex]
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import fs from "fs";

const SLOT = process.env.PE3_SLOT ?? "5";
const PORT = process.env.PE3_PORT ?? String(3010 + Number(SLOT));
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${PORT}`;
const STORAGE = process.env.PE3_STORAGE ?? join(homedir(), `.local/state/alloy-dev/auth/slot${SLOT}/storage-state.json`);
const SLUG = process.env.PE3_SLUG ?? "waitlist";
const LABEL = process.argv[2] ?? "interactions";
const SETTLE = Number(process.env.PE3_SETTLE ?? 9000);
const OUT = `/tmp/pe3/${LABEL}.json`;
fs.mkdirSync("/tmp/pe3", { recursive: true });

/** Signals evaluated on every mutation. First truth after T0 wins; re-armed per interaction. */
const SIGNAL_SOURCE = `
/**
 * Signals are TARGET-RELATIVE. A predicate like "some row carries data-queue-row-active" is still
 * true from the PREVIOUS interaction, so it stamps at ~2ms and the surface looks instantaneous no
 * matter how slow it is. Every signal below must either match the expected target or differ from
 * the baseline captured at T0.
 */
window.__pe3i = {
  t0: null, marks: [], armed: false, expect: null, base: null, shift: 0,
  snapshot() {
    const fp = document.querySelector("[data-inline-focus-panel]");
    const activeRow = document.querySelector('[data-queue-row-active="true"]');
    const activePill = document.querySelector('[data-work-view-id][aria-selected="true"]');
    return {
      subject: fp ? fp.getAttribute("data-inline-focus-panel-subject") : null,
      row: activeRow ? activeRow.getAttribute("data-entity-id") : null,
      pill: activePill ? activePill.getAttribute("data-work-view-id") : null,
      cards: Array.from(document.querySelectorAll("[data-card-role]")).map(function (e) { return e.getAttribute("data-card-role"); }).join(","),
      rows: document.querySelectorAll("[data-entity-id]").length,
      menus: document.querySelectorAll('[role="listbox"],[role="menu"]').length,
    };
  },
  reset(tag, expect) {
    this.t0 = performance.now(); this.tag = tag; this.expect = expect || {};
    this.marks = []; this.seen = new Set(); this.base = this.snapshot(); this.shift = 0; this.armed = true;
  },
  stop() { this.armed = false; },
  stamp(name, extra) {
    if (!this.armed || this.seen.has(name)) return;
    this.seen.add(name);
    this.marks.push({ name: name, ms: Math.round((performance.now() - this.t0) * 10) / 10, ...(extra || {}) });
  },
};
const S = window.__pe3i;
window.__pe3check = function () {
  if (!S.armed) return;
  const now = S.snapshot();
  const b = S.base, x = S.expect;
  const hit = function (want, cur, basev) { return want ? cur === want : (cur !== basev && cur !== null); };

  // T1 acknowledgement — the state change the operator can SEE
  if (hit(x.pill, now.pill, b.pill)) S.stamp("T1_pill_active", { id: now.pill });
  if (hit(x.row, now.row, b.row)) S.stamp("T1_row_active", { entity: now.row });
  if (now.menus > b.menus) S.stamp("T1_menu_open", { n: now.menus });
  // T2 destination committed — subject identity, not merely "a panel exists"
  if (hit(x.subject || x.row, now.subject, b.subject)) S.stamp("T2_subject", { subject: now.subject });
  if (x.rowsChange && now.rows !== b.rows) S.stamp("T2_queue_changed", { rows: now.rows });
  // T3 primary usable — real content FOR THE NEW TARGET
  const committed = S.seen.has("T2_subject") || S.seen.has("T2_queue_changed") || S.seen.has("T1_menu_open");
  const cards = Array.from(document.querySelectorAll("[data-card-role]"));
  if (committed && cards.length) {
    S.stamp("T3_card_present", { n: cards.length });
    for (const c of cards) {
      if ((c.textContent || "").trim().length > 20) { S.stamp("T3_card_truthful"); break; }
    }
  }
  const opts = document.querySelectorAll('[role="option"],[role="menuitem"]');
  if (S.seen.has("T1_menu_open") && opts.length) S.stamp("T3_menu_options", { n: opts.length });
  // T4 fully hydrated
  const fp = document.querySelector("[data-inline-focus-panel]");
  const holding = document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length;
  const thinking = document.querySelectorAll("[data-focus-panel-thinking],[data-focus-panel-skeleton-mode]").length;
  if (committed && cards.length && holding === 0 && thinking === 0) S.stamp("T4_no_placeholder", { cards: cards.length });
  if (committed && fp && fp.getAttribute("data-inline-focus-panel-resolved") === "true") S.stamp("T4_fp_resolved");
  if (committed && fp && fp.getAttribute("data-focus-panel-operational") === "resolved") S.stamp("T4_fp_operational");
};
// Cumulative layout shift attributable to this interaction — motion is not separable from timing.
try {
  new PerformanceObserver(function (l) {
    for (const e of l.getEntries()) if (!e.hadRecentInput && S.armed) S.shift += e.value;
  }).observe({ type: "layout-shift", buffered: false });
} catch (e) { /* not supported */ }
// The observer MUST be guarded. At document-start document.documentElement can still be null;
// observe() then throws, the rest of this init script never runs, and every mark silently
// collapses onto the driver final explicit check — i.e. onto the settle timeout. That reads as
// a complete, plausible profile in which every phase takes exactly as long as you waited.
const startObserving = function () {
  try {
    new MutationObserver(function () { window.__pe3check(); }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, characterData: true,
    });
  } catch (e) { /* retried by the poll below */ }
  window.__pe3check();
};
// attribute-only changes on already-mounted nodes are the common acknowledgement path, and a
// mutation observer does not fire for them on ancestors — poll cheaply as well.
setInterval(function () { window.__pe3check(); }, 8);
if (document.documentElement) startObserving();
else document.addEventListener("readystatechange", startObserving, { once: true });
`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
await context.addInitScript(SIGNAL_SOURCE);
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 180)); });
const badResponses = [];
page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 150)}`); });

const results = [];

async function resources(sinceMs) {
  return page.evaluate((since) => performance.getEntriesByType("resource")
    .filter((r) => r.startTime >= since)
    .map((r) => ({ name: r.name.replace(location.origin, ""), start: Math.round(r.startTime - since), dur: Math.round(r.duration), size: r.transferSize ?? 0 })), sinceMs);
}

/** Runs one interaction: arm, act, settle, harvest. */
async function interaction(name, act, { settle = SETTLE, expect = {} } = {}) {
  await page.evaluate(() => { window.__pe3i.stop(); });
  const badBefore = badResponses.length;
  const since = await page.evaluate(([tag, exp]) => { window.__pe3i.reset(tag, exp); return performance.now(); }, [name, expect]);
  const wall0 = Date.now();
  try { await act(); } catch (e) { results.push({ name, error: String(e).slice(0, 200) }); return null; }
  await page.waitForTimeout(settle);
  await page.evaluate(() => window.__pe3check());
  const marks = await page.evaluate(() => window.__pe3i.marks);
  const shift = await page.evaluate(() => Math.round(window.__pe3i.shift * 10000) / 10000);
  const settledState = await page.evaluate(() => window.__pe3i.snapshot());
  const res = await resources(since);
  const api = res.filter((r) => r.name.includes("/api/"));
  const counts = {};
  api.forEach((r) => { const k = r.name.split("?")[0]; counts[k] = (counts[k] || 0) + 1; });
  const rec = {
    name,
    expect,
    wallMs: Date.now() - wall0,
    marks,
    layoutShift: shift,
    settled: settledState,
    nonOk: badResponses.slice(badBefore),
    requests: res.length,
    apiRequests: api.length,
    apiBytes: api.reduce((s, r) => s + r.size, 0),
    duplicates: Object.entries(counts).filter(([, c]) => c > 1).map(([k, c]) => ({ path: k, count: c })),
    slowestApi: [...api].sort((a, b) => b.dur - a.dur).slice(0, 6),
    largestApi: [...api].sort((a, b) => b.size - a.size).slice(0, 5),
  };
  results.push(rec);
  const m = Object.fromEntries(marks.map((x) => [x.name, x.ms]));
  const f = (v) => (v === undefined ? "  -  " : String(Math.round(v)).padStart(5));
  console.log(`  ${name.padEnd(30)} T1${f(m.T1_pill_active ?? m.T1_row_active ?? m.T1_menu_open)} T2${f(m.T2_subject ?? m.T2_queue_changed)} T3${f(m.T3_card_truthful ?? m.T3_menu_options)} T4${f(m.T4_no_placeholder)} | api=${String(rec.apiRequests).padStart(2)} kb=${String(Math.round(rec.apiBytes / 1024)).padStart(4)} cls=${rec.layoutShift}${rec.nonOk.length ? " ERR:" + rec.nonOk.length : ""}${rec.duplicates.length ? " DUP:" + rec.duplicates.map((d) => d.count + "x" + d.path.split("/").slice(-2).join("/")).join(",") : ""}`);
  return rec;
}

console.log(`\n=== PE3 interactions · ${LABEL} · ${BASE}/workspace/work-unit/${SLUG} ===`);

// Prime: full cold-ish load, then let the surface settle. Everything after this is WARM.
await page.goto(`${BASE}/workspace/work-unit/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(20000);
await page.evaluate(() => window.__pe3i.stop());

const inventory = await page.evaluate(() => ({
  pills: Array.from(document.querySelectorAll("[data-work-view-id]")).map((e) => ({ id: e.getAttribute("data-work-view-id"), active: e.getAttribute("aria-selected") === "true", label: (e.innerText || "").trim().split("\n")[0] })),
  rows: Array.from(document.querySelectorAll("[data-entity-id]")).map((e) => e.getAttribute("data-entity-id")),
  cards: Array.from(document.querySelectorAll("[data-card-role]")).map((e) => e.getAttribute("data-card-role")),
  subject: document.querySelector("[data-inline-focus-panel]")?.getAttribute("data-inline-focus-panel-subject") ?? null,
}));
console.log("inventory:", JSON.stringify({ pills: inventory.pills.length, rows: inventory.rows.length, cards: inventory.cards, subject: inventory.subject }));
console.log("pills:", inventory.pills.map((p) => `${p.id}${p.active ? "*" : ""}`).join(" "));

// NOTE: the active work view is rendered TWICE with the same data-work-view-id (7 elements,
// 6 distinct ids), so a bare attribute selector is ambiguous under Playwright strict mode.
const clickPill = (id) => page.locator(`[data-work-view-id="${id}"]`).first().click({ timeout: 15000 });
const clickRow = (entity) => page.locator(`[data-entity-id="${entity}"]`).first().click({ timeout: 15000 });

// ---- Surface 4: Work View switching ------------------------------------------------
const seenPill = new Set();
const distinctPills = inventory.pills.filter((p) => (seenPill.has(p.id) ? false : seenPill.add(p.id)));
const others = distinctPills.filter((p) => !p.active);
if (others[0]) await interaction(`workview_switch:${others[0].id}`, () => clickPill(others[0].id), { expect: { pill: others[0].id, rowsChange: true } });
if (others[1]) await interaction(`workview_switch:${others[1].id}`, () => clickPill(others[1].id), { expect: { pill: others[1].id, rowsChange: true } });
const first = distinctPills.find((p) => p.active) ?? distinctPills[0];
if (first) await interaction(`workview_return:${first.id}`, () => clickPill(first.id), { expect: { pill: first.id, rowsChange: true } });
if (others[0]) await interaction(`workview_switch_warm:${others[0].id}`, () => clickPill(others[0].id), { expect: { pill: others[0].id, rowsChange: true } });
if (first) await interaction(`workview_return_warm:${first.id}`, () => clickPill(first.id), { expect: { pill: first.id, rowsChange: true } });

// ---- Surface 5: Queue row -> Focus Panel -------------------------------------------
const live = await page.evaluate(() => Array.from(document.querySelectorAll("[data-entity-id]")).map((e) => e.getAttribute("data-entity-id")));
const [A, B] = [live[0], live[1]];
if (A) await interaction(`row_select:A`, () => clickRow(A), { expect: { row: A, subject: A } });
if (B) await interaction(`row_select:B`, () => clickRow(B), { expect: { row: B, subject: B } });
if (A) await interaction(`row_select:A_warm`, () => clickRow(A), { expect: { row: A, subject: A } });
if (B) await interaction(`row_select:B_warm`, () => clickRow(B), { expect: { row: B, subject: B } });
if (A && B) {
  // latest-click-wins: fire A then B with no settle between; B must win.
  await interaction(`row_rapid:A_then_B`, async () => { await clickRow(A); await page.waitForTimeout(60); await clickRow(B); }, { expect: { row: B, subject: B } });
  const settled = await page.evaluate(() => document.querySelector("[data-inline-focus-panel]")?.getAttribute("data-inline-focus-panel-subject") ?? null);
  results[results.length - 1].latestClickWins = { expected: B, settled, ok: settled === B };
  console.log(`  latest-click-wins: expected=${B} settled=${settled} ${settled === B ? "OK" : "VIOLATED"}`);
}

// ---- Surface 6: card focus ----------------------------------------------------------
const cardRoles = await page.evaluate(() => Array.from(document.querySelectorAll("[data-card-role]")).map((e) => e.getAttribute("data-card-role")));
for (const role of cardRoles.slice(0, 4)) {
  await interaction(`card_focus:${role}`, () => page.locator(`[data-card-role="${role}"]`).first().click({ timeout: 15000 }), { settle: 6000 });
}

fs.writeFileSync(OUT, JSON.stringify({ label: LABEL, base: BASE, slug: SLUG, inventory, results, consoleErrors: consoleErrors.slice(0, 20), badResponses: badResponses.slice(0, 40) }, null, 2));
console.log(`\nconsole errors: ${consoleErrors.length}  non-2xx: ${badResponses.length}`);
if (badResponses.length) console.log([...new Set(badResponses)].slice(0, 12).map((b) => "  " + b).join("\n"));
console.log("-> " + OUT);
await browser.close();
