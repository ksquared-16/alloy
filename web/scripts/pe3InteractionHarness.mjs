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
 *
 * SUBJECT IDENTITY comes from the Focus Panel HEADER TEXT, not from
 * data-inline-focus-panel-subject.
 *
 * That attribute carries the settlement anchor and does NOT follow the selected row: clicking
 * three different children in the Waitlist queue leaves it pinned to one family opportunity
 * (d097e1a8) while the panel correctly renders "Lennon Kurzman", then "PassA Kid", then
 * "Test Process5". Reading it as the destination signal made a WORKING surface look like it never
 * committed a subject, and the accompanying 404 on the drawer opportunity VM made that misreading
 * look corroborated. The header is what the operator actually sees change, so it is what T2 means.
 */
window.__pe3i = {
  t0: null, marks: [], armed: false, expect: null, base: null, shift: 0,
  header() {
    const h = document.querySelector("[data-inline-focus-panel-header]");
    return h ? (h.innerText || "").trim().split("\\n")[0].trim() : null;
  },
  snapshot() {
    const activeRow = document.querySelector('[data-queue-row-active="true"]');
    const activePill = document.querySelector('[data-work-view-id][aria-selected="true"]');
    const fp = document.querySelector("[data-inline-focus-panel]");
    return {
      header: this.header(),
      row: activeRow ? activeRow.getAttribute("data-entity-id") : null,
      pill: activePill ? activePill.getAttribute("data-work-view-id") : null,
      cards: Array.from(document.querySelectorAll("[data-card-role]")).map(function (e) { return e.getAttribute("data-card-role"); }).join(","),
      cardCount: document.querySelectorAll("[data-card-role]").length,
      rows: document.querySelectorAll("[data-entity-id]").length,
      menus: document.querySelectorAll('[role="listbox"],[role="menu"]').length,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      mode: fp ? fp.getAttribute("data-inline-focus-panel-mode") : null,
      resolved: fp ? fp.getAttribute("data-inline-focus-panel-resolved") : null,
      url: location.pathname + location.search,
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

  // ---- T1 ACKNOWLEDGEMENT — the state change the operator can SEE immediately ----
  if (hit(x.pill, now.pill, b.pill)) S.stamp("T1_pill_active", { id: now.pill });
  if (hit(x.row, now.row, b.row)) S.stamp("T1_row_active", { entity: now.row });
  if (now.menus > b.menus) S.stamp("T1_menu_open");
  if (now.dialogs > b.dialogs) S.stamp("T1_dialog_open");
  if (x.urlChanges && now.url !== b.url) S.stamp("T1_url", { url: now.url });
  if (x.modeChanges && now.mode !== b.mode) S.stamp("T1_mode", { mode: now.mode });
  if (x.cardCountChanges && now.cardCount !== b.cardCount) S.stamp("T1_card_count", { n: now.cardCount });

  // ---- T2 DESTINATION COMMITTED — subject identity is visible ----
  if (x.headerChanges && now.header && now.header !== b.header) S.stamp("T2_identity", { header: now.header });
  if (x.rowsChange && now.rows !== b.rows) S.stamp("T2_queue_changed", { rows: now.rows });

  // ---- T3 PRIMARY USABLE — real content FOR THE NEW TARGET ----
  const committed = S.seen.has("T2_identity") || S.seen.has("T2_queue_changed")
    || S.seen.has("T1_menu_open") || S.seen.has("T1_dialog_open") || S.seen.has("T1_mode")
    || S.seen.has("T1_url") || S.seen.has("T1_card_count");
  const cards = Array.from(document.querySelectorAll("[data-card-role]"));
  if (committed && cards.length) {
    S.stamp("T3_card_present", { n: cards.length });
    for (const c of cards) {
      if ((c.textContent || "").trim().length > 20) { S.stamp("T3_usable"); break; }
    }
  }
  const opts = document.querySelectorAll('[role="option"],[role="menuitem"]');
  if (S.seen.has("T1_menu_open") && opts.length) S.stamp("T3_usable", { options: opts.length });
  if (S.seen.has("T1_dialog_open")) {
    const d = document.querySelector('[role="dialog"]');
    if (d && (d.textContent || "").trim().length > 40) S.stamp("T3_usable");
  }

  // ---- T4 FULLY HYDRATED ----
  const holding = document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length;
  const thinking = document.querySelectorAll("[data-focus-panel-thinking],[data-focus-panel-skeleton-mode]").length;
  if (committed && cards.length && holding === 0 && thinking === 0) S.stamp("T4_hydrated", { cards: cards.length });
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
setInterval(function () { window.__pe3check(); }, 8);
if (document.documentElement) startObserving();
else document.addEventListener("readystatechange", startObserving, { once: true });
`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
await context.addInitScript(SIGNAL_SOURCE);
const page = await context.newPage();
/**
 * Fail LOUDLY if the init script did not install. A silent failure here does not produce an
 * error — it produces a complete profile in which every mark lands on the settle timeout,
 * which reads as plausible timing. This has happened twice in this harness's life.
 */
async function assertInstrumented() {
  const ok = await page.evaluate(() => typeof window.__pe3i === "object" && typeof window.__pe3check === "function");
  if (!ok) throw new Error("PE3 FATAL: init script did not install — every measurement would be fiction.");
}
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
  const f = (v) => (v === undefined ? "    -" : String(Math.round(v)).padStart(5));
  const t1 = m.T1_pill_active ?? m.T1_row_active ?? m.T1_menu_open ?? m.T1_dialog_open ?? m.T1_mode ?? m.T1_card_count ?? m.T1_url;
  const t2 = m.T2_identity ?? m.T2_queue_changed;
  console.log(`  ${name.padEnd(30)} T1${f(t1)} T2${f(t2)} T3${f(m.T3_usable)} T4${f(m.T4_hydrated)} | api=${String(rec.apiRequests).padStart(2)} kb=${String(Math.round(rec.apiBytes / 1024)).padStart(4)} cls=${rec.layoutShift}${rec.nonOk.length ? " ERR:" + rec.nonOk.length : ""}${rec.duplicates.length ? " DUP:" + rec.duplicates.map((d) => d.count + "x" + d.path.split("/").slice(-2).join("/")).join(",") : ""}`);
  return rec;
}

console.log(`\n=== PE3 interactions · ${LABEL} · ${BASE}/workspace/work-unit/${SLUG} ===`);

// Prime: full load, then settle. Everything after this is WARM — the operator's real steady state.
await page.goto(`${BASE}/workspace/work-unit/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await assertInstrumented();
await page.waitForTimeout(22000);
await page.evaluate(() => window.__pe3i.stop());

const inventory = await page.evaluate(() => ({
  pills: Array.from(document.querySelectorAll("[data-work-view-id]")).map((e) => ({ id: e.getAttribute("data-work-view-id"), active: e.getAttribute("aria-selected") === "true" })),
  rows: Array.from(document.querySelectorAll("[data-entity-id]")).map((e) => ({
    id: e.getAttribute("data-entity-id"),
    lines: (e.innerText || "").trim().split("\n").map((t) => t.trim()).filter((t) => t.length > 2),
  })),
  cards: Array.from(document.querySelectorAll("[data-card-role]")).map((e) => e.getAttribute("data-card-role")),
  header: document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null,
}));
const seenPill = new Set();
const distinctPills = inventory.pills.filter((p) => (seenPill.has(p.id) ? false : seenPill.add(p.id)));
console.log(`inventory: ${distinctPills.length} distinct pills · ${inventory.rows.length} rows · cards=${inventory.cards.join(",")} · header="${inventory.header}"`);

const clickPill = (id) => page.locator(`[data-work-view-id="${id}"]`).first().click({ timeout: 15000 });
const clickRow = (id) => page.locator(`[data-entity-id="${id}"]`).first().click({ timeout: 15000 });

// ---------------- Surface 5 — Queue row -> Focus Panel ----------------
const live = await page.evaluate(() => Array.from(document.querySelectorAll("[data-entity-id]")).map((e) => ({
  id: e.getAttribute("data-entity-id"),
  lines: (e.innerText || "").trim().split("\n").map((t) => t.trim()).filter((t) => t.length > 2),
})));
const A = live[1], B = live[3], C = live[4];
const labelOf = (r) => (r ? r.lines.join(" / ").slice(0, 40) : "-");
if (A) await interaction(`S5 row_select:A`, () => clickRow(A.id), { expect: { row: A.id, headerChanges: true } });
if (B) await interaction(`S5 row_select:B`, () => clickRow(B.id), { expect: { row: B.id, headerChanges: true } });
if (A) await interaction(`S5 row_revisit:A`, () => clickRow(A.id), { expect: { row: A.id, headerChanges: true } });
if (C) await interaction(`S5 subject_to_subject:C`, () => clickRow(C.id), { expect: { row: C.id, headerChanges: true } });
if (A && B) {
  await interaction(`S5 rapid:A_then_B`, async () => { await clickRow(A.id); await page.waitForTimeout(60); await clickRow(B.id); }, { expect: { row: B.id, headerChanges: true } });
  const settled = await page.evaluate(() => document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null);
  const ok = B.lines.some((l) => l === settled);
  results[results.length - 1].latestClickWins = { expectedOneOf: B.lines, settled, ok };
  console.log(`  latest-click-wins: settled="${settled}" expected one of ${JSON.stringify(B.lines)} -> ${ok ? "OK" : "VIOLATED"}`);
}

// ---------------- Surface 4 — Work View switching ----------------
const others = distinctPills.filter((p) => !p.active);
const home = distinctPills.find((p) => p.active) ?? distinctPills[0];
if (others[0]) await interaction(`S4 workview_switch:${others[0].id}`, () => clickPill(others[0].id), { expect: { pill: others[0].id, rowsChange: true, headerChanges: true } });
if (home) await interaction(`S4 workview_return:${home.id}`, () => clickPill(home.id), { expect: { pill: home.id, rowsChange: true, headerChanges: true } });
if (others[0]) await interaction(`S4 workview_switch_warm`, () => clickPill(others[0].id), { expect: { pill: others[0].id, rowsChange: true, headerChanges: true } });
if (home) await interaction(`S4 workview_return_warm`, () => clickPill(home.id), { expect: { pill: home.id, rowsChange: true, headerChanges: true } });

// ---------------- Surface 6 — card focus ----------------
const cardRoles = await page.evaluate(() => Array.from(document.querySelectorAll("[data-card-role]")).map((e) => e.getAttribute("data-card-role")));
const seenRole = new Set();
for (const role of cardRoles.filter((r) => (seenRole.has(r) ? false : seenRole.add(r))).slice(0, 4)) {
  await interaction(`S6 card_focus:${role}`, () => page.locator(`[data-card-role="${role}"]`).first().click({ timeout: 15000 }),
    { settle: 7000, expect: { modeChanges: true, cardCountChanges: true, urlChanges: true } });
  await interaction(`S6 card_back:${role}`, () => page.keyboard.press("Escape"),
    { settle: 5000, expect: { modeChanges: true, cardCountChanges: true, urlChanges: true } });
}

// ---------------- Surface 7 — commands / capability destinations ----------------
const commands = await page.evaluate(() => Array.from(document.querySelectorAll("button,[role=button],a"))
  .map((e) => (e.innerText || "").trim().split("\n")[0])
  .filter((t) => /^(Message|Send Form|Tour|Schedule|Assignment|Manage|Add Child)$/i.test(t)));
for (const label of [...new Set(commands)].slice(0, 4)) {
  await interaction(`S7 command:${label}`, () => page.getByRole("button", { name: label, exact: true }).first().click({ timeout: 12000 }),
    { settle: 8000, expect: { dialogChanges: true, modeChanges: true, urlChanges: true, cardCountChanges: true } });
  await interaction(`S7 command_back:${label}`, () => page.keyboard.press("Escape"), { settle: 4000, expect: { modeChanges: true, cardCountChanges: true, urlChanges: true } });
}

// ---------------- Surface 8 — dropdown / editing ----------------
const combo = await page.locator('[role="combobox"], select, [data-alloy-select-trigger]').first();
if (await combo.count().catch(() => 0)) {
  await interaction(`S8 dropdown_open`, () => combo.click({ timeout: 10000 }), { settle: 4000, expect: {} });
  await interaction(`S8 dropdown_close`, () => page.keyboard.press("Escape"), { settle: 2500, expect: {} });
  await interaction(`S8 dropdown_reopen`, () => combo.click({ timeout: 10000 }), { settle: 4000, expect: {} });
  await page.keyboard.press("Escape").catch(() => {});
}

// ---------------- Surface 10 — /organization navigation ----------------
/**
 * Route navigation is measured with Navigation Timing, NOT the in-page observer: a full document
 * navigation destroys `window.__pe3i`, so the observer re-installs disarmed and stamps nothing.
 * The earlier run reported four blank Organization rows for exactly that reason — blank because
 * the instrument was gone, not because the page did nothing.
 */
for (const [name, path] of [["home", "/organization"], ["locations", "/organization/locations"], ["processes", "/organization/processes"], ["home_return", "/organization"]]) {
  const t0 = Date.now();
  let status = null;
  try { status = (await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 }))?.status(); }
  catch (e) { results.push({ name: `S10 org:${name}`, error: String(e).slice(0, 160) }); continue; }
  await page.waitForTimeout(9000);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByType("paint").map((p) => ({ n: p.name, t: Math.round(p.startTime) }));
    const res = performance.getEntriesByType("resource").filter((r) => r.name.includes("/api/"));
    return {
      ttfb: n ? Math.round(n.responseStart) : null,
      responseEnd: n ? Math.round(n.responseEnd) : null,
      domInteractive: n ? Math.round(n.domInteractive) : null,
      paint,
      api: res.length,
      apiKb: Math.round(res.reduce((s2, r) => s2 + (r.transferSize ?? 0), 0) / 1024),
      controls: document.querySelectorAll("button,input,select,a[href],[role=button]").length,
      textLen: document.body.innerText.length,
    };
  });
  const fcp = nav.paint.find((p) => p.n === "first-contentful-paint")?.t ?? null;
  results.push({ name: `S10 org:${name}`, status, wallMs: Date.now() - t0, nav, fcp });
  console.log(`  ${`S10 org:${name}`.padEnd(30)} TTFB${String(nav.ttfb).padStart(6)} FCP${String(fcp).padStart(6)} domInt${String(nav.domInteractive).padStart(6)} | api=${String(nav.api).padStart(2)} kb=${String(nav.apiKb).padStart(4)} controls=${nav.controls} text=${nav.textLen}`);
}

fs.writeFileSync(OUT, JSON.stringify({ label: LABEL, base: BASE, slug: SLUG, inventory, results, consoleErrors: consoleErrors.slice(0, 20), badResponses: badResponses.slice(0, 40) }, null, 2));
console.log(`\nconsole errors: ${consoleErrors.length}  non-2xx: ${badResponses.length}`);
if (badResponses.length) console.log([...new Set(badResponses)].slice(0, 10).map((b) => "  " + b).join("\n"));
console.log("-> " + OUT);
await browser.close();
