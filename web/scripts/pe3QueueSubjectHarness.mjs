/**
 * Queue subject readiness. Identity is already immediate; the open question is when the CHILD-scoped
 * Mission card (`current_work`) leaves its reserve and commits for the newly selected child.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const IDLE = Number(process.env.PE3_IDLE_MS ?? 30000);

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const net = [];
p.on("request", (r) => { const u = r.url();
  if (u.includes("provisioning-answer") || u.includes("view-models/drawer") || u.includes("stage-work")) net.push({ t: Date.now(), u: u.replace(BASE, "").slice(0, 90) }); });

await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
await p.waitForTimeout(IDLE);
await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
await p.waitForTimeout(14000);

const rows = await p.evaluate(() => [...document.querySelectorAll("[data-entity-id]")].map((e) => ({
  id: e.getAttribute("data-entity-id"),
  name: (e.innerText || "").trim().split("\n").map((x) => x.trim()).filter((x) => x.length > 2)[0] })));
const read = () => p.evaluate(() => ({
  row: document.querySelector('[data-queue-row-active="true"]')?.getAttribute("data-entity-id") ?? null,
  hdr: document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null,
  preparing: [...document.querySelectorAll("[data-focus-panel-cell-preparing]")].map((e) => e.getAttribute("data-focus-panel-cell-preparing")),
  truthful: [...document.querySelectorAll("[data-card-role]")].filter((c) => (c.textContent || "").trim().length > 20).length,
  cells: document.querySelectorAll("[data-focus-panel-grid-cell]").length,
}));

async function select(r, label) {
  const before = net.length;
  const t0 = Date.now();
  await p.locator(`[data-entity-id="${r.id}"]`).first().click({ timeout: 15000 });
  let T1 = null, T2 = null, T3 = null, T_mission = null, reservedSeen = false;
  for (let i = 0; i < 600; i++) {
    const s = await read(); const el = Date.now() - t0;
    if (T1 === null && s.row === r.id) T1 = el;
    if (T2 === null && s.hdr === r.name) T2 = el;
    if (T3 === null && T2 !== null && s.truthful > 0) T3 = el;
    if (s.preparing.includes("current_work")) reservedSeen = true;
    if (T_mission === null && T2 !== null && !s.preparing.includes("current_work") && s.truthful >= 5) T_mission = el;
    if (T1 !== null && T2 !== null && T3 !== null && T_mission !== null) break;
    await p.waitForTimeout(40);
  }
  const f = (v) => (v === null ? "     -" : String(v).padStart(6));
  console.log(`  ${label.padEnd(22)} T1${f(T1)} T2${f(T2)} T3${f(T3)} mission${f(T_mission)} | reserved_seen=${reservedSeen} net+${net.length - before}`);
  return { T1, T2, T3, T_mission };
}

console.log(`\n=== Queue subject selection (prepared entry) ===`);
// Does the ±2 neighbour WINDOW follow the operator, or stay pinned to the entry anchor?
await select(rows[1], `rows[1] (near anchor)`);   await p.waitForTimeout(12000);
await select(rows[5], `rows[5] (far)`);           await p.waitForTimeout(14000);
await select(rows[6], `rows[6] (nbr of 5?)`);     await p.waitForTimeout(12000);
await select(rows[4], `rows[4] (nbr of 5?)`);     await p.waitForTimeout(4000);
const A = rows[1], B = rows[4];
// latest-click-wins under rapid switching
const t0 = Date.now();
await p.locator(`[data-entity-id="${A.id}"]`).first().click({ timeout: 15000 });
await p.waitForTimeout(45);
await p.locator(`[data-entity-id="${B.id}"]`).first().click({ timeout: 15000 });
await p.waitForTimeout(16000);
const s = await read();
console.log(`  rapid A->B: header=${JSON.stringify(s.hdr)} expected=${JSON.stringify(B.name)} -> ${s.hdr === B.name ? "OK" : "VIOLATED"}  preparing=${JSON.stringify(s.preparing)}`);
console.log(`\nsubject-related requests, whole page life: ${net.length}`);
await b.close();
