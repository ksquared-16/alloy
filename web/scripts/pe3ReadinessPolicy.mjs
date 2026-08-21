/**
 * Readiness POLICY comparison on one build. The policy is not changed in code — each run exercises
 * a different operator behaviour against the same runtime, which is what actually distinguishes
 * "the idle set earned this" from "hover would have earned it anyway".
 *
 *   control  click as soon as tiles paint (only the eager primary warm has fired)
 *   hover    hover the target tile, brief settle, click   (policy D)
 *   idle     wait for idle preparation to settle, click   (policy A, current)
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const MODE = process.argv[2] ?? "idle";
const TILE = process.env.PE3_TILE ?? "waitlist";
const HOVER_SETTLE = Number(process.env.PE3_HOVER_MS ?? 2500);
const IDLE = Number(process.env.PE3_IDLE_MS ?? 30000);

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const prep = [];
p.on("request", (r) => { const u = r.url();
  if (u.includes("provisioning-answer") || u.includes("view-models/drawer")) prep.push(u.replace(BASE, "")); });

const tWs = Date.now();
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
const wsUsable = Date.now() - tWs;

if (MODE === "hover") { await p.locator(`a[href^="/workspace/work-unit/${TILE}"]`).first().hover({ timeout: 15000 }); await p.waitForTimeout(HOVER_SETTLE); }
else if (MODE === "idle") { await p.waitForTimeout(IDLE); }

const prepared = prep.length;
const usedUrl = `/api/admin/work-units/${TILE}/provisioning-answer`;
const targetPrepared = prep.some((u) => u.startsWith(usedUrl));

const read = () => p.evaluate(() => ({
  url: location.pathname,
  hdr: document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null,
  rows: document.querySelectorAll("[data-entity-id]").length,
  cards: document.querySelectorAll("[data-card-role]").length,
  truthful: [...document.querySelectorAll("[data-card-role]")].filter((c) => (c.textContent || "").trim().length > 20).length,
}));
const t0 = Date.now();
await p.locator(`a[href^="/workspace/work-unit/${TILE}"]`).first().click({ timeout: 20000 });
let T_usable = null, T_hyd = null;
for (let i = 0; i < 500; i++) {
  const s = await read(); const el = Date.now() - t0;
  if (T_usable === null && s.rows > 0 && s.truthful > 0) T_usable = el;
  if (T_hyd === null && s.cards >= 5 && s.truthful >= 5) T_hyd = el;
  if (T_hyd !== null) break;
  await p.waitForTimeout(40);
}
const after = prep.length;
console.log(JSON.stringify({
  policy: MODE, tile: TILE,
  workspace_usable_ms: wsUsable,
  prep_before_click: prepared,
  target_prepared: targetPrepared,
  first_usable_ms: T_usable,
  fully_hydrated_ms: T_hyd,
  prep_total_page_life: after,
  wasted_prepared: Math.max(0, prepared - (targetPrepared ? 1 : 0)),
}));
await b.close();
