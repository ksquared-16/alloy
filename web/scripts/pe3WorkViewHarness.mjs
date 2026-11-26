/**
 * Work View switching on the PREPARED path. A pill click is a K1 lens movement inside the committed
 * surface, not a navigation, so it is measured against the pill/queue/identity/card contracts.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const IDLE = Number(process.env.PE3_IDLE_MS ?? 30000);

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const prep = [];
p.on("request", (r) => { const u = r.url(); if (u.includes("provisioning-answer")) prep.push({ t: Date.now(), u: u.replace(BASE, "").slice(0, 95) }); });

await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
await p.waitForTimeout(IDLE);
await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
await p.waitForTimeout(14000);

const pills = await p.evaluate(() => {
  const seen = new Set();
  return [...document.querySelectorAll("[data-work-view-id]")]
    .map((e) => ({ id: e.getAttribute("data-work-view-id"), active: e.getAttribute("aria-selected") === "true",
                   label: (e.innerText || "").trim().split("\n")[0] }))
    .filter((v) => (seen.has(v.id) ? false : seen.add(v.id)));
});
console.log("pills:", JSON.stringify(pills));

const read = () => p.evaluate(() => ({
  active: document.querySelector('[data-work-view-id][aria-selected="true"]')?.getAttribute("data-work-view-id") ?? null,
  rows: document.querySelectorAll("[data-entity-id]").length,
  hdr: document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim().split("\n")[0] ?? null,
  truthful: [...document.querySelectorAll("[data-card-role]")].filter((c) => (c.textContent || "").trim().length > 20).length,
  cards: document.querySelectorAll("[data-card-role]").length,
}));

async function switchTo(id, label) {
  const base = await read();
  const before = prep.length;
  const t0 = Date.now();
  // The active view is rendered more than once (pill strip + overflow); pick the VISIBLE one.
  await p.locator(`[data-work-view-id="${id}"]:visible`).first().click({ timeout: 15000 });
  let T_pill = null, T_queue = null, T_ident = null, T_cards = null, T_hyd = null;
  for (let i = 0; i < 400; i++) {
    const s = await read(); const el = Date.now() - t0;
    if (T_pill === null && s.active === id) T_pill = el;
    if (T_queue === null && s.rows !== base.rows) T_queue = el;
    if (T_ident === null && s.hdr && s.hdr !== base.hdr) T_ident = el;
    if (T_cards === null && T_ident !== null && s.truthful > 0) T_cards = el;
    if (T_hyd === null && T_cards !== null && s.cards >= 5 && s.truthful >= 5) T_hyd = el;
    if (T_pill !== null && T_queue !== null && T_ident !== null && T_cards !== null && T_hyd !== null) break;
    await p.waitForTimeout(40);
  }
  const f = (v) => (v === null ? "    -" : String(v).padStart(5));
  const s = await read();
  console.log(`  ${label.padEnd(22)} pill${f(T_pill)} queue${f(T_queue)} identity${f(T_ident)} cards${f(T_cards)} hydrated${f(T_hyd)} | prep+${prep.length - before} rows=${s.rows} hdr=${JSON.stringify(s.hdr)}`);
}

console.log(`\n=== Work View switching (prepared entry) ===`);
const withData = ["new_work_view_6", "new_work_view_4"];   // all (1 row), waitlist (15 rows)
await switchTo(withData[0], "-> all");           await p.waitForTimeout(6000);
await switchTo(withData[1], "-> waitlist");      await p.waitForTimeout(6000);
await switchTo(withData[0], "-> all (warm)");    await p.waitForTimeout(6000);
await switchTo(withData[1], "-> waitlist (warm)");
console.log(`\nprovisioning requests, whole page life: ${prep.length}`);
await b.close();
