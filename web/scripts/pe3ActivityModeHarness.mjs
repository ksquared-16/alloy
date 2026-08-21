/** Focus Panel Activity mode: mode switch, subject switch while open, and return to Summary. */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const net = [];
p.on("request", (r) => { if (r.url().includes("/api/")) net.push(r.url().replace(BASE, "").split("?")[0]); });

await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
await p.waitForTimeout(30000);
await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
await p.waitForTimeout(14000);

const st = () => p.evaluate(() => {
  const fp = document.querySelector("[data-inline-focus-panel]");
  const body = document.querySelector("[data-adminv2-record-modal-scroll]");
  return {
    mode: fp?.getAttribute("data-inline-focus-panel-mode") ?? null,
    hdr: document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null,
    bodyLen: (body?.innerText || "").trim().length,
    panelH: fp ? Math.round(fp.getBoundingClientRect().height) : 0,
    scrollTop: body ? Math.round(body.scrollTop) : 0,
    text: (body?.innerText || "").replace(/\s+/g, " ").slice(0, 70),
  };
});

async function toMode(label, name) {
  const base = await st(); const n0 = net.length; const t0 = Date.now();
  /**
   * JS-dispatched click. `adminv2-bos-rail-overlay` intercepts pointer events over the Focus Panel
   * mode tabs, so Playwright's actionability check never resolves — the same overlay that accounts
   * for 97% of the direct-path CLS. Recorded as a finding; dispatched here so the mode transition
   * can still be measured.
   */
  const clicked = await p.evaluate((n) => {
    const el = [...document.querySelectorAll('button,[role="tab"]')]
      .find((e) => (e.innerText || "").trim() === n);
    if (!el) return false;
    el.click();
    return true;
  }, name);
  if (!clicked) { console.log(`  ${label}: no control named ${name}`); return await st(); }
  let T_mode = null, T_usable = null;
  for (let i = 0; i < 400; i++) {
    const s = await st(); const el = Date.now() - t0;
    if (T_mode === null && s.mode !== base.mode) T_mode = el;
    if (T_usable === null && T_mode !== null && s.bodyLen > 100) T_usable = el;
    if (T_mode !== null && T_usable !== null) break;
    await p.waitForTimeout(30);
  }
  await p.waitForTimeout(6000);
  const s = await st();
  const f = (v) => (v === null ? "    -" : String(v).padStart(5));
  console.log(`  ${label.padEnd(30)} mode${f(T_mode)} usable${f(T_usable)} | api=${net.length - n0} h=${s.panelH} hdr=${JSON.stringify(s.hdr)} mode=${s.mode}`);
  console.log(`      body: ${JSON.stringify(s.text)}`);
  return s;
}

console.log("\n=== Focus Panel Activity mode ===");
console.log("  start:", JSON.stringify(await st()));
await toMode("Summary -> Activity", "Activity");
// subject switch WHILE Activity is open
const rows = await p.evaluate(() => [...document.querySelectorAll("[data-entity-id]")].map((e) => ({
  id: e.getAttribute("data-entity-id"),
  name: (e.innerText || "").trim().split("\n").map((x) => x.trim()).filter((x) => x.length > 2)[0] })));
const target = rows.find((r) => /Wrigley/i.test(r.name || "")) ?? rows[4];
const n0 = net.length; const t0 = Date.now();
await p.locator(`[data-entity-id="${target.id}"]`).first().click({ timeout: 15000 });
let T_id = null;
for (let i = 0; i < 300; i++) { const s = await st(); if (s.hdr === target.name) { T_id = Date.now() - t0; break; } await p.waitForTimeout(40); }
await p.waitForTimeout(8000);
const after = await st();
console.log(`  subject switch in Activity      identity${String(T_id ?? "-").padStart(5)}ms | api=${net.length - n0} mode=${after.mode} hdr=${JSON.stringify(after.hdr)}`);
console.log(`      body: ${JSON.stringify(after.text)}`);
await toMode("Activity -> Summary", "Work");
await toMode("Summary -> Activity (warm)", "Activity");
await b.close();
