/**
 * SETTLEMENT TIMING — which cards actually wait, and for how long.
 *
 * The static dependency graph says what a card COULD resolve from. This says what it DID, and when,
 * relative to the two markers the doctrine distinguishes:
 *
 *   data-focus-panel-operational  -> operational-ready (must not wait on the drawer VM)
 *   data-focus-panel-settlement   -> enriched settlement (Billing legitimately rides this)
 *
 * Per card it records the first frame in which that card carries truthful content, so the gap can be
 * attributed to specific cards instead of to "settlement" as an undifferentiated 7-8s block.
 *
 * Usage: node scripts/tmp-settlementTiming.mjs [url-suffix]
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import fs from "fs";

const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const BASE = "http://127.0.0.1:3013";
const A = "b29921ca-b4d2-4cf4-b26c-2b9bd7263d78";
const suffix = process.argv[2] ?? `?subject_id=${A}`;
fs.mkdirSync("/tmp/settle", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const page = await ctx.newPage();

// Stamp milestones from a pre-navigation observer so nothing depends on polling cadence.
await page.addInitScript(() => {
  window.__settle = { events: [] };
  const seen = new Set();
  const stamp = (name, extra) => {
    if (seen.has(name)) return;
    seen.add(name);
    window.__settle.events.push({ name, t: Math.round(performance.now()), ...(extra ?? {}) });
  };
  const check = () => {
    const panel = document.querySelector("[data-inline-focus-panel]");
    if (panel) {
      const op = panel.getAttribute("data-focus-panel-operational");
      const st = panel.getAttribute("data-focus-panel-settlement");
      if (op === "resolved") stamp("operational-resolved");
      if (st === "pending") stamp("settlement-pending");
      if (st === "resolved") stamp("settlement-resolved");
    }
    // Per-card truthful paint. A reserved cell carries the title but no body content, so "truthful"
    // means the card has real content beyond its heading.
    document.querySelectorAll("[data-card-role]").forEach((el) => {
      const txt = (el.textContent || "").trim();
      if (txt.length <= 24) return;
      const title = txt.slice(0, 20).replace(/\s+/g, " ");
      stamp(`card:${title}`, { chars: txt.length });
    });
    const cells = document.querySelectorAll("[data-focus-panel-grid-cell]").length;
    const reserved = document.querySelectorAll("[data-focus-panel-cell-reserved='true']").length;
    if (cells) stamp(`cells:${cells}`, { reserved });
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

const drawerVm = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/view-models/drawer/opportunity/")) {
    drawerVm.push({ url: u.split("/").pop().slice(0, 12), status: r.status(), timing: r.request().timing() });
  }
});

await page.goto(`${BASE}/workspace/work-unit/lifecycle_wu_lead${suffix}`, {
  waitUntil: "domcontentloaded", timeout: 180000,
});
await page.waitForTimeout(30000);

const out = await page.evaluate(() => ({
  events: window.__settle?.events ?? [],
  nav: (() => { const n = performance.getEntriesByType("navigation")[0];
    return n ? { ttfb: Math.round(n.responseStart), htmlEnd: Math.round(n.responseEnd) } : null; })(),
  cards: Array.from(document.querySelectorAll("[data-card-role]")).map((el) => ({
    role: el.getAttribute("data-card-role"),
    text: (el.textContent || "").trim().slice(0, 34),
  })),
  strategy: document.querySelector("[data-fp-render-strategy]")?.getAttribute("data-fp-render-strategy"),
  publishedCards: document.querySelector("[data-fp-published-cards]")?.getAttribute("data-fp-published-cards"),
}));

const at = (n) => out.events.find((e) => e.name === n)?.t ?? null;
const opReady = at("operational-resolved");
const settled = at("settlement-resolved");

console.log(`\nurl suffix: ${suffix || "(bare)"}`);
console.log(`nav: ttfb=${out.nav?.ttfb} htmlEnd=${out.nav?.htmlEnd}`);
console.log(`strategy=${out.strategy} publishedCards=${out.publishedCards}`);
console.log(`\ntimeline (ms from navigationStart):`);
for (const e of out.events.sort((a, b) => a.t - b.t)) {
  const rel = opReady != null ? ` (op+${e.t - opReady})` : "";
  console.log(`  ${String(e.t).padStart(6)}  ${e.name}${rel}${e.chars ? ` chars=${e.chars}` : ""}${e.reserved !== undefined ? ` reserved=${e.reserved}` : ""}`);
}
console.log(`\noperational-ready : ${opReady}`);
console.log(`settlement        : ${settled}`);
console.log(`GAP op->settle    : ${opReady != null && settled != null ? settled - opReady : "n/a"} ms`);
console.log(`\ncards that painted AFTER operational-ready (i.e. actually waited):`);
const late = out.events.filter((e) => e.name.startsWith("card:") && opReady != null && e.t > opReady + 250);
if (!late.length) console.log("  (none — every visible card was truthful at operational-ready)");
late.forEach((e) => console.log(`  op+${String(e.t - opReady).padStart(6)}ms  ${e.name}`));
console.log(`\ndrawer-VM responses: ${drawerVm.length}`);
drawerVm.forEach((d) => console.log(`  ${d.url} status=${d.status}`));
console.log(`\nfinal cards:`);
out.cards.forEach((c) => console.log(`  [${c.role}] ${c.text}`));

fs.writeFileSync(`/tmp/settle/${(suffix || "bare").replace(/\W/g, "_").slice(0, 40)}.json`, JSON.stringify(out, null, 2));
await browser.close();
