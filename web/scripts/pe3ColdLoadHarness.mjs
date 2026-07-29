/**
 * PE-3 — cold primary-usable decomposition harness.
 *
 * Measures the PROD build with PROD-NATIVE instrumentation only:
 *   - Navigation Timing (precise, prod)
 *   - the server `timings` object embedded in the streamed HTML (prod)
 *   - DOM milestones via a pre-navigation MutationObserver (prod)
 *   - Resource Timing waterfall + duplicate detection (prod)
 *
 * It does NOT rely on `focus_panel_chain:*` / `perceived_*` marks: those are gated by
 * `perfDevDetailEnabled()` = `NODE_ENV !== "production"` and DO NOT FIRE in a prod build.
 *
 * "Cold" here = cold server process + cold in-process caches + cold browser context.
 * The database is REMOTE Supabase, so remote DB/page-cache warmth is NOT reset by a restart.
 *
 * Usage: node scripts/tmp-pe3-coldload.mjs <mode> <variant> <label>
 *   mode:    cold | warmproc | warm
 *   variant: deeplink | bare
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import fs from "fs";

const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const BASE = "http://127.0.0.1:3013";
const SUBJECT = "b29921ca-b4d2-4cf4-b26c-2b9bd7263d78";
const URLS = {
  deeplink: `${BASE}/workspace/work-unit/lifecycle_wu_lead?subject_id=${SUBJECT}`,
  bare: `${BASE}/workspace/work-unit/lifecycle_wu_lead`,
};

const mode = process.argv[2] ?? "warmproc";
const variant = process.argv[3] ?? "deeplink";
const label = process.argv[4] ?? `${mode}-${variant}`;
const URL_ = URLS[variant];
const OUT = `/tmp/pe3/${label}.json`;
fs.mkdirSync("/tmp/pe3", { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();

await page.addInitScript(() => {
  window.__pe3 = { milestones: [] };
  const stamp = (name, extra) => {
    if (window.__pe3.milestones.some((m) => m.name === name)) return;
    window.__pe3.milestones.push({ name, t: Math.round(performance.now()), ...(extra ?? {}) });
  };
  let lastCount = -1;
  let lastReserved = -1;
  const check = () => {
    if (document.querySelector("[data-alloy-os-runtime]")) stamp("runtime_root");
    if (document.querySelector("[data-runtime-label='WU.SURFACE']")) stamp("wu_surface");
    if (document.querySelector("[data-focus-panel-boundary]")) stamp("fp_boundary");
    const panel = document.querySelector("[data-fp-render-strategy]");
    if (panel) stamp("focus_panel_shell", { strategy: panel.getAttribute("data-fp-render-strategy") });
    const inline = document.querySelector("[data-inline-focus-panel]");
    if (inline?.getAttribute("data-inline-focus-panel-resolved") === "true") stamp("fp_resolved");

    // the authoritative cell-usable signal (prod): a cell is RESERVED once it is truthfully usable,
    // and carries data-focus-panel-cell-preparing while it is not.
    const cells = document.querySelectorAll("[data-focus-panel-grid-cell]");
    const reserved = document.querySelectorAll("[data-focus-panel-cell-reserved='true']");
    const preparing = document.querySelectorAll("[data-focus-panel-cell-preparing='true']");
    if (reserved.length !== lastReserved) {
      lastReserved = reserved.length;
      if (reserved.length > 0) stamp(`cells_reserved_${reserved.length}`, { cells: cells.length, preparing: preparing.length });
    }
    if (cells.length > 0 && preparing.length === 0 && reserved.length >= cells.length)
      stamp("all_cells_reserved", { cells: cells.length });

    const cards = document.querySelectorAll("[data-card-role]");
    if (cards.length !== lastCount) {
      lastCount = cards.length;
      if (cards.length > 0) stamp(`cards_${cards.length}`);
    }
    for (const c of cards) {
      if ((c.textContent || "").trim().length > 20) { stamp("first_card_truthful"); break; }
    }
    const published = panel?.getAttribute("data-fp-published-cards");
    if (published && cards.length >= Number(published)) stamp("all_published_cards_present");
  };
  const start = () => {
    new MutationObserver(check).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true,
    });
    check();
  };
  if (document.documentElement) start();
  else document.addEventListener("readystatechange", start, { once: true });
});

if (mode === "warm") {
  // prime the client: one full load, then measure the second
  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(20000);
  await page.evaluate(() => { window.__pe3.milestones.length = 0; });
}

const wallStart = Date.now();
const resp = await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 180000 });
const html = await resp.text();
const status = resp.status();
const finalUrl = page.url();

// middleware spans (response headers — middleware ends before the first byte)
const mwT0 = Number(resp.headers()["x-alloy-mw-t0"] ?? 0) || null;
const mwAuthMs = Number(resp.headers()["x-alloy-mw-auth-ms"] ?? NaN);

// layout spans (script tag — the layout runs while the response is already streaming)
let routeTiming = null;
const rt = html.match(/id="__alloy_route_timing"[^>]*>(\{.*?\})</);
if (rt) { try { routeTiming = JSON.parse(rt[1]); } catch { routeTiming = rt[1]; } }
if (routeTiming && mwT0) routeTiming.mw_to_layout_ms = routeTiming.layout_entry_epoch_ms - mwT0;

// server compose timings, as delivered in the HTML
let serverTimings = null;
const m = html.match(/\\"timings\\":(\{[^{}]*\})/) ?? html.match(/"timings":(\{[^{}]*\})/);
if (m) { try { serverTimings = JSON.parse(m[1].replace(/\\"/g, '"')); } catch { serverTimings = m[1]; } }

// settle
await page.waitForTimeout(30000);

const data = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const navOut = nav ? Object.fromEntries(
    ["fetchStart","domainLookupEnd","connectEnd","requestStart","responseStart","responseEnd",
     "domInteractive","domContentLoadedEventStart","domContentLoadedEventEnd","domComplete","loadEventEnd"]
      .map((k) => [k, Math.round(nav[k])])) : null;
  const res = performance.getEntriesByType("resource").map((r) => ({
    name: r.name, start: Math.round(r.startTime), dur: Math.round(r.duration),
    type: r.initiatorType, size: r.transferSize ?? 0,
  }));
  return { navOut, milestones: window.__pe3?.milestones ?? [], res,
           bodyLen: document.body.innerText.length };
});

const api = data.res.filter((r) => r.name.includes("/api/"));
const dupes = {};
api.forEach((r) => { const k = r.name.split("?")[0].replace("http://127.0.0.1:3013",""); dupes[k]=(dupes[k]||0)+1; });

const out = {
  label, mode, variant, url: URL_, status, finalUrl, authOK: !finalUrl.includes("/login"),
  wallMs: Date.now() - wallStart,
  htmlBytes: html.length,
  mwAuthMs: Number.isFinite(mwAuthMs) ? mwAuthMs : null,
  routeTiming,
  serverTimings,
  nav: data.navOut,
  milestones: data.milestones,
  api: api.map((r) => ({ path: r.name.replace("http://127.0.0.1:3013",""), start: r.start, dur: r.dur })).sort((a,b)=>a.start-b.start),
  duplicates: Object.entries(dupes).filter(([,c]) => c > 1).map(([k,c]) => ({ path: k, count: c })),
  bodyLen: data.bodyLen,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

console.log(`\n### ${label}  (${mode}/${variant})  status=${status} auth=${out.authOK}`);
console.log("nav:", JSON.stringify(data.navOut));
console.log("mwAuthMs:", out.mwAuthMs, " routeTiming:", JSON.stringify(routeTiming));
console.log("serverTimings:", JSON.stringify(serverTimings));
console.log("milestones:", JSON.stringify(data.milestones));
console.log("duplicates:", JSON.stringify(out.duplicates));
console.log("-> " + OUT);

await browser.close();
