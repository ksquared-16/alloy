/**
 * THE OPERATOR JOURNEY: /workspace -> click a Work Unit tile -> first usable.
 *
 * The cold-load harness navigates DIRECTLY to the work-unit URL. That bypasses the entire readiness
 * architecture — workspace idle preparation, tile hover warm, and the K1 entry gesture (which commits
 * in place rather than performing a document navigation). It measures a path an operator does not take.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const IDLE = Number(process.env.PE3_IDLE_MS ?? 25000);
const TILE = process.env.PE3_TILE ?? "waitlist";
const LABEL = process.argv[2] ?? "journey";

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const reqs = [];
p.on("request", (r) => { if (r.url().includes("/api/")) reqs.push({ t: Date.now(), u: r.url().replace(BASE, "") }); });

const t_ws = Date.now();
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
const wsReady = Date.now() - t_ws;
const preIdle = reqs.length;
await p.waitForTimeout(IDLE);                      // let workspace idle preparation run
const prepReqs = reqs.slice(preIdle).filter((r) => r.u.includes("provisioning-answer") || r.u.includes("view-models/drawer"));
console.log(`workspace usable in ${wsReady}ms; during ${IDLE}ms idle: ${prepReqs.length} preparation requests`);
for (const r of prepReqs.slice(0, 8)) console.log(`   prep: ${r.u.slice(0, 110)}`);

const read = () => p.evaluate(() => ({
  url: location.pathname,
  hdr: document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null,
  rows: document.querySelectorAll("[data-entity-id]").length,
  pills: document.querySelectorAll("[data-work-view-id]").length,
  cards: document.querySelectorAll("[data-card-role]").length,
  truthful: [...document.querySelectorAll("[data-card-role]")].filter((c) => (c.textContent || "").trim().length > 20).length,
  surface: !!document.querySelector("[data-runtime-label='WU.SURFACE']"),
}));

const t0 = Date.now();
await p.locator(`a[href^="/workspace/work-unit/${TILE}"]`).first().click({ timeout: 20000 });
let T_route = null, T_surface = null, T_queue = null, T_identity = null, T_usable = null, T_hydrated = null;
for (let i = 0; i < 400; i++) {
  const s = await read();
  const el = Date.now() - t0;
  if (T_route === null && s.url.includes("/work-unit/")) T_route = el;
  if (T_surface === null && s.surface) T_surface = el;
  if (T_queue === null && s.rows > 0) T_queue = el;
  if (T_identity === null && s.hdr) T_identity = el;
  if (T_usable === null && s.truthful > 0) T_usable = el;
  if (T_hydrated === null && s.cards >= 5 && s.truthful >= 5) T_hydrated = el;
  if (T_hydrated !== null) break;
  await p.waitForTimeout(50);
}
const f = (v) => (v === null ? "    -" : String(v).padStart(5));
console.log(`\n=== JOURNEY  /workspace -> click "${TILE}" ===`);
console.log(`  route committed   ${f(T_route)}ms`);
console.log(`  WU surface        ${f(T_surface)}ms`);
console.log(`  queue rows        ${f(T_queue)}ms`);
console.log(`  subject identity  ${f(T_identity)}ms`);
console.log(`  FIRST USABLE      ${f(T_usable)}ms`);
console.log(`  fully hydrated    ${f(T_hydrated)}ms`);
console.log(`  final: ${JSON.stringify(await read())}`);
await b.close();
