/**
 * Measures the middleware auth tax that `x-alloy-mw-auth-ms` reports, across a representative
 * mix of document and /api requests. Middleware runs on EVERY matched request, so this cost is
 * paid once per request on the page — not once per page.
 * Requires the server built/run with ALLOY_ROUTE_TIMING=1 (Edge inlines env at build time).
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const PATHS = process.env.PE3_PROBE_PATHS?.split(",") ?? [
  "/api/admin/departments", "/api/admin/work-units", "/api/admin/entity-labels",
  "/api/admin/verticals", "/api/admin/communications/unread-count", "/api/admin/status-options?entity_type=opportunities",
];
const N = Number(process.env.PE3_PROBE_N ?? 5);
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE });
const p = await c.newPage();
const mw = [], total = [];
p.on("response", (r) => {
  const v = r.headers()["x-alloy-mw-auth-ms"];
  if (v !== undefined) mw.push(Number(v));
});
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(8000);
mw.length = 0;
for (let i = 0; i < N; i++) {
  for (const path of PATHS) {
    const t = Date.now();
    const st = await p.evaluate(async (u) => { const r = await fetch(u); await r.text(); return r.status; }, path);
    total.push(Date.now() - t);
    if (st !== 200) console.log("  non-200", st, path);
  }
}
const q = (a, x) => { const s = [...a].sort((m, n) => m - n); return s[Math.floor((s.length - 1) * x)]; };
const sum = (a) => a.reduce((s, v) => s + v, 0);
console.log(JSON.stringify({
  requests: total.length,
  mw_auth_samples: mw.length,
  mw_auth_p50: q(mw, .5), mw_auth_p90: q(mw, .9), mw_auth_max: Math.max(...mw),
  mw_auth_total_ms: sum(mw),
  request_total_p50: q(total, .5), request_total_p90: q(total, .9),
  mw_share_of_p50: mw.length ? +(q(mw, .5) / q(total, .5)).toFixed(3) : null,
}, null, 1));
await b.close();
