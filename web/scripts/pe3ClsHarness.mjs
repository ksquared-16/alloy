/**
 * Initial-load CLS, attributed to the ELEMENTS responsible. A total is not actionable; the sources
 * are. Captures every layout-shift entry with its shifted nodes, on the path the operator takes.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const MODE = process.argv[2] ?? "prepared";   // prepared | direct
const TILE = process.env.PE3_TILE ?? "waitlist";

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
await c.addInitScript(() => {
  window.__shifts = []; window.__cls = 0;
  const describe = (n) => {
    if (!n || n.nodeType !== 1) return "(non-element)";
    const el = n;
    const attrs = ["data-card-role", "data-focus-panel-cell-preparing", "data-entity-id", "data-work-view-id", "data-runtime-label", "data-inline-focus-panel-header"];
    for (const a of attrs) if (el.getAttribute?.(a) != null) return `[${a}=${el.getAttribute(a)}]`;
    const cls = (el.className && typeof el.className === "string") ? "." + el.className.split(/\s+/).slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}`.slice(0, 70);
  };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls += e.value;
        window.__shifts.push({
          t: Math.round(e.startTime), v: Math.round(e.value * 10000) / 10000,
          sources: (e.sources || []).slice(0, 3).map((s) => ({
            node: describe(s.node),
            from: s.previousRect ? `${Math.round(s.previousRect.y)}x${Math.round(s.previousRect.height)}` : null,
            to: s.currentRect ? `${Math.round(s.currentRect.y)}x${Math.round(s.currentRect.height)}` : null,
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
});
const p = await c.newPage();

if (MODE === "prepared") {
  await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
  await p.waitForTimeout(30000);
  await p.evaluate(() => { window.__shifts.length = 0; window.__cls = 0; });   // measure the WORK UNIT, not the workspace
  await p.locator(`a[href^="/workspace/work-unit/${TILE}"]`).first().click({ timeout: 20000 });
} else {
  await p.goto(`${BASE}/workspace/work-unit/${TILE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
}
await p.waitForTimeout(28000);
const d = await p.evaluate(() => ({ cls: Math.round(window.__cls * 10000) / 10000, shifts: window.__shifts }));
console.log(`\n=== initial-load CLS · ${MODE} · ${TILE} ===`);
console.log(`total CLS ${d.cls} across ${d.shifts.length} shift entries`);
const byNode = {};
for (const s of d.shifts) for (const src of s.sources) byNode[src.node] = (byNode[src.node] ?? 0) + s.v / Math.max(1, s.sources.length);
console.log("\ncontribution by element:");
Object.entries(byNode).sort((a, b2) => b2[1] - a[1]).slice(0, 12)
  .forEach(([n, v]) => console.log(`  ${String(Math.round(v * 10000) / 10000).padStart(8)}  ${n}`));
console.log("\nlargest individual shifts:");
d.shifts.sort((a, b2) => b2.v - a.v).slice(0, 6).forEach((s) => console.log(`  t=${String(s.t).padStart(6)}ms v=${s.v}  ${JSON.stringify(s.sources)}`.slice(0, 210)));
await b.close();
