/**
 * R6 — BOS rail placement: layout-shift evidence with per-element attribution and a rail rect timeline.
 *
 * Extends the pe3 CLS harness with what R6 needs and it lacks: a configurable viewport (the rail's
 * placement policy is breakpoint-dependent), a timestamped bounding-rect timeline for the rail and
 * the surfaces around it, and BOTH input and non-input shifts — the pe3 harness discards
 * `hadRecentInput` entries entirely, which would hide an intentional navigation transition rather
 * than distinguishing it.
 *
 * Env: PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE / PE3_TILE / R6_W / R6_H. Local hosts only.
 */
import { chromium } from "playwright";
import fs from "fs";
import { homedir } from "os"; import { join } from "path";

const SLOT = process.env.PE3_SLOT ?? "5";
const PORT = process.env.PE3_PORT ?? String(3010 + Number(SLOT));
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${PORT}`;
const STORAGE = process.env.PE3_STORAGE ?? join(homedir(), `.local/state/alloy-dev/auth/slot${SLOT}/storage-state.json`);
const TILE = process.env.PE3_TILE ?? "waitlist";
const MODE = process.argv[2] ?? "direct";              // direct | prepared | warm | back
const W = Number(process.env.R6_W ?? 1440);
const H = Number(process.env.R6_H ?? 960);
const LABEL = process.env.R6_LABEL ?? `${MODE}-${W}`;

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) throw new Error(`non-local host refused: ${BASE}`);

/**
 * Refuse to measure a build that predates the working tree.
 *
 * `pe3ProdBuild.sh` can FAIL while a previous `.next-prodcert` stays on disk and keeps serving, so a
 * run started after a failed build silently measures the old artifact. That happened once during R6
 * and the reading had to be discarded. This makes it impossible rather than a thing to remember.
 */
function assertCandidateBuild() {
    const dist = join(process.cwd(), ".next-prodcert");
    let builtAt;
    try {
        builtAt = fs.statSync(join(dist, "BUILD_ID")).mtimeMs;
    } catch {
        throw new Error(`no production build at ${dist} — run scripts/pe3ProdBuild.sh first`);
    }
    let newest = 0;
    let newestPath = "";
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const p = join(dir, entry.name);
            if (entry.isDirectory()) { walk(p); continue; }
            if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
            const m = fs.statSync(p).mtimeMs;
            if (m > newest) { newest = m; newestPath = p; }
        }
    };
    for (const root of ["lib", "app", "components", "contexts"]) {
        try { walk(join(process.cwd(), root)); } catch { /* absent root */ }
    }
    if (newest > builtAt) {
        throw new Error(
            `STALE BUILD: ${newestPath.replace(process.cwd() + "/", "")} is newer than .next-prodcert — rebuild before measuring`,
        );
    }
    console.log(`build: .next-prodcert BUILD_ID ${fs.readFileSync(join(dist, "BUILD_ID"), "utf8").trim()}`);
}

assertCandidateBuild();

const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ storageState: STORAGE, viewport: { width: W, height: H } });
  await c.addInitScript(() => {
    window.__shifts = []; window.__clsNoInput = 0; window.__clsInput = 0;
    const describe = (n) => {
      if (!n || n.nodeType !== 1) return "(non-element)";
      const el = n;
      for (const a of ["data-adminv2-bos-rail-overlay", "data-adminv2-workspace-command-column",
                       "data-adminv2-persistent-command-rail", "data-adminv2-command-rail-bos-host",
                       "data-runtime-label", "data-card-role", "data-entity-id", "data-work-view-id"]) {
        if (el.getAttribute?.(a) != null) return `[${a}]`;
      }
      const cls = (typeof el.className === "string") ? "." + el.className.split(/\s+/).slice(0, 2).join(".") : "";
      return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}`.slice(0, 70);
    };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.hadRecentInput) window.__clsInput += e.value; else window.__clsNoInput += e.value;
          window.__shifts.push({
            t: Math.round(e.startTime), v: Math.round(e.value * 100000) / 100000, input: !!e.hadRecentInput,
            sources: (e.sources || []).slice(0, 3).map((s) => ({
              node: describe(s.node),
              from: s.previousRect ? `${Math.round(s.previousRect.x)},${Math.round(s.previousRect.y)} ${Math.round(s.previousRect.width)}x${Math.round(s.previousRect.height)}` : null,
              to: s.currentRect ? `${Math.round(s.currentRect.x)},${Math.round(s.currentRect.y)} ${Math.round(s.currentRect.width)}x${Math.round(s.currentRect.height)}` : null,
            })),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
    // Rect timeline for the rail and the surfaces it sits beside.
    window.__rects = [];
    const SEL = {
      railOverlay: "[data-adminv2-bos-rail-overlay]",
      commandColumn: "[data-adminv2-workspace-command-column]",
      persistentRail: "[data-adminv2-persistent-command-rail]",
      bosHost: "[data-adminv2-command-rail-bos-host]",
      wuSurface: "[data-runtime-label='WU.SURFACE']",
      focusPanel: "[data-inline-focus-panel]",
    };
    const snap = () => {
      const t = Math.round(performance.now());
      const row = { t };
      for (const [k, sel] of Object.entries(SEL)) {
        const el = document.querySelector(sel);
        if (!el) { row[k] = null; continue; }
        const r = el.getBoundingClientRect();
        row[k] = `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      }
      const last = window.__rects[window.__rects.length - 1];
      if (!last || Object.keys(SEL).some((k) => last[k] !== row[k])) window.__rects.push(row);
    };
    const start = () => { setInterval(snap, 250); snap(); };
    if (document.documentElement) start(); else addEventListener("readystatechange", start, { once: true });
  });

  const p = await c.newPage();
  const reset = () => p.evaluate(() => { window.__shifts.length = 0; window.__clsNoInput = 0; window.__clsInput = 0; window.__rects.length = 0; });

  if (MODE === "prepared") {
    await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 120000 });
    await p.waitForTimeout(26000);
    await reset();                                          // measure the WORK UNIT, not the workspace
    await p.locator(`a[href^="/workspace/work-unit/${TILE}"]`).first().click({ timeout: 20000 });
  } else if (MODE === "warm") {
    await p.goto(`${BASE}/workspace/work-unit/${TILE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.waitForTimeout(24000);
    await reset();
    await p.goto(`${BASE}/workspace/work-unit/${TILE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  } else if (MODE === "back") {
    await p.goto(`${BASE}/workspace/work-unit/${TILE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.waitForTimeout(20000);
    await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await p.waitForTimeout(10000);
    await reset();
    await p.goBack({ timeout: 60000 });
  } else {
    await p.goto(`${BASE}/workspace/work-unit/${TILE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  }

  await p.waitForTimeout(26000);
  const d = await p.evaluate(() => ({
    noInput: Math.round(window.__clsNoInput * 100000) / 100000,
    input: Math.round(window.__clsInput * 100000) / 100000,
    shifts: window.__shifts, rects: window.__rects,
  }));

  console.log(`\n=== ${LABEL} · ${MODE} · ${TILE} · ${W}x${H} ===`);
  console.log(`CLS(no-input) ${d.noInput}   CLS(recent-input) ${d.input}   entries ${d.shifts.length}`);
  const railish = (n) => /bos-rail-overlay|command-column|persistent-command-rail|command-rail-bos-host/.test(n);
  let railCls = 0;
  const byNode = {};
  for (const s of d.shifts) {
    if (s.input) continue;
    const share = s.v / Math.max(1, s.sources.length);
    for (const src of s.sources) {
      byNode[src.node] = (byNode[src.node] ?? 0) + share;
      if (railish(src.node)) railCls += share;
    }
  }
  console.log(`RAIL-ATTRIBUTED CLS: ${Math.round(railCls * 100000) / 100000}`);
  console.log("contribution by element (no-input only):");
  Object.entries(byNode).sort((a, b2) => b2[1] - a[1]).slice(0, 8)
    .forEach(([n, v]) => console.log(`  ${String(Math.round(v * 100000) / 100000).padStart(9)}  ${n}`));
  console.log("largest shifts:");
  [...d.shifts].sort((a, b2) => b2.v - a.v).slice(0, 5)
    .forEach((s) => console.log(`  t=${String(s.t).padStart(6)} v=${s.v} input=${s.input} ${JSON.stringify(s.sources).slice(0, 200)}`));
  console.log(`rail rect timeline (${d.rects.length} distinct states):`);
  d.rects.slice(0, 10).forEach((r) => console.log(`  t=${String(r.t).padStart(6)} overlay=${r.railOverlay} column=${r.commandColumn} host=${r.bosHost}`));
} finally { await b.close(); }
