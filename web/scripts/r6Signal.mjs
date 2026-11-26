/**
 * R6 — prove WHEN the BOS rail becomes visible relative to the Work Unit reveal lifecycle.
 *
 * Correlates two timelines the CLS harness cannot: the rail overlay's geometry+visibility, and the
 * canonical reveal-gate events (`beginWorkUnitPrimaryReveal` / `endWorkUnitPrimaryReveal`, read from
 * the controller's diagnostic ring buffer). That correlation is what identifies the trustworthy
 * moment, and what shows the window in which the rail is exposed at provisional geometry.
 *
 * Env: PE3_BASE / PE3_STORAGE; arg: direct | prepared. Local hosts only.
 */
import { chromium } from "playwright";
import fs from "fs";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3012}`;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) throw new Error(`non-local host refused: ${BASE}`);
const MODE = process.argv[2] ?? "direct";
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
  const c = await b.newContext({ storageState: process.env.PE3_STORAGE ?? join(homedir(), `.local/state/alloy-dev/auth/slot${process.env.PE3_SLOT ?? "5"}/storage-state.json`), viewport:{width:1440,height:960} });
  await c.addInitScript(() => {
    window.__ev = [];
    const mark = (k, v) => window.__ev.push({ t: Math.round(performance.now()), k, v });
    // Rail geometry changes
    window.__last = null;
    setInterval(() => {
      const el = document.querySelector('[data-adminv2-bos-rail-overlay="true"]');
      const s = el ? (() => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} vis=${cs.visibility}`; })() : "absent";
      if (s !== window.__last) { window.__last = s; mark("rail", s); }
    }, 100);
  });
  const p = await c.newPage();
  if (MODE === "prepared") {
    await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 120000 });
    await p.waitForTimeout(20000);
    await p.evaluate(() => { window.__ev.length = 0; window.__t0 = performance.now(); });
    await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
  } else {
    await p.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 180000 });
  }
  await p.waitForTimeout(22000);
  const out = await p.evaluate(() => ({
    ev: window.__ev,
    reveal: (window.__ALLOY_REVEAL_GATE_DIAG__ ?? []).map(e => ({ t: e.t, event: e.event, active: e.active })),
    t0: window.__t0 ?? 0,
  }));
  console.log(`### ${MODE} — rail geometry timeline`);
  out.ev.forEach(e => console.log(`  t=${String(e.t).padStart(6)} ${e.v}`));
  console.log(`### reveal-gate events (${out.reveal.length})`);
  out.reveal.slice(0, 14).forEach(e => console.log(`  t=${String(e.t).padStart(6)} ${e.event} active=${e.active}`));
} finally { await b.close(); }
