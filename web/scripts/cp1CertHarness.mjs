/**
 * CP-1 certification harness.
 *
 * Measures what the doctrine actually distinguishes, which the PE-3 harness conflated:
 *   - `data-focus-panel-operational`  → panel operational-ready (must NOT wait for the drawer VM)
 *   - `data-focus-panel-settlement`   → enriched settlement (may lag; Billing rides this)
 *   - per-CARD first appearance       → which cards paint at commit vs at settlement
 *
 * Usage: node scripts/cp1CertHarness.mjs <scenario> <label>
 *   scenario: coldlink | warmlink | switch | narrow
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import fs from "fs";

const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const BASE = "http://127.0.0.1:3013";
const SUBJECT_A = "b29921ca-b4d2-4cf4-b26c-2b9bd7263d78"; // Chapmap, 1 child
const url = (s) => `${BASE}/workspace/work-unit/lifecycle_wu_lead${s ? `?subject_id=${s}` : ""}`;

const scenario = process.argv[2] ?? "coldlink";
const label = process.argv[3] ?? scenario;
fs.mkdirSync("/tmp/cp1", { recursive: true });

const INIT = () => {
  window.__cp1 = { events: [] };
  const seen = new Set();
  const push = (name, extra) => {
    const id = name + JSON.stringify(extra ?? {});
    if (seen.has(id)) return;
    seen.add(id);
    window.__cp1.events.push({ name, t: Math.round(performance.now()), ...(extra ?? {}) });
  };
  const check = () => {
    const panel = document.querySelector("[data-inline-focus-panel]");
    if (panel) {
      const op = panel.getAttribute("data-focus-panel-operational");
      const st = panel.getAttribute("data-focus-panel-settlement");
      if (op) push(`operational:${op}`);
      if (st) push(`settlement:${st}`);
      const subj = panel.getAttribute("data-inline-focus-panel-subject");
      if (subj) push(`subject:${subj}`);
    }
    document.querySelectorAll("[data-card-role]").forEach((el) => {
      const title = (el.querySelector("h1,h2,h3,h4,[class*='title']")?.textContent
        || (el.textContent || "").trim().slice(0, 24)).trim();
      const hasContent = (el.textContent || "").trim().length > 20;
      if (hasContent) push(`card:${title}`);
    });
    const reserved = document.querySelectorAll("[data-focus-panel-cell-reserved='true']").length;
    const cells = document.querySelectorAll("[data-focus-panel-grid-cell]").length;
    if (cells) push(`cells:${cells}/reserved:${reserved}`);
  };
  const start = () => {
    new MutationObserver(check).observe(document.documentElement,
      { childList: true, subtree: true, characterData: true, attributes: true });
    check();
  };
  if (document.documentElement) start();
  else document.addEventListener("readystatechange", start, { once: true });
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: STORAGE,
  viewport: scenario === "narrow" ? { width: 480, height: 900 } : { width: 1440, height: 960 },
});
const page = await ctx.newPage();
await page.addInitScript(INIT);

const reqs = [];
page.on("request", (r) => { if (r.url().includes("/api/")) reqs.push({ t: Date.now(), url: r.url() }); });
const consoleErrs = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text().slice(0, 160)); });
const pageErrs = [];
page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 160)));

const t0 = Date.now();
await page.goto(url(SUBJECT_A), { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(scenario === "switch" ? 25000 : 32000);

let switchReport = null;
if (scenario === "switch") {
  // Record switching: pick a different queue row and watch for a stale-subject flash.
  switchReport = await page.evaluate(async () => {
    const out = { steps: [] };
    const panelSubject = () =>
      document.querySelector("[data-inline-focus-panel]")?.getAttribute("data-inline-focus-panel-subject") ?? null;
    const cardText = () =>
      Array.from(document.querySelectorAll("[data-card-role]")).map((e) => (e.textContent || "").trim().slice(0, 40));
    const rows = Array.from(document.querySelectorAll("[data-runtime-label='WU.QUEUE_ROW'], [data-queue-row-id]"));
    out.rowCount = rows.length;
    out.before = { subject: panelSubject(), cards: cardText() };
    const other = rows.find((r) => !(r.getAttribute("data-queue-row-id") ?? "").includes(out.before.subject ?? "@@"));
    if (!other) { out.note = "no alternate row found"; return out; }
    other.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    other.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const started = performance.now();
    // sample for a stale flash: panel subject changed but cards still show the OLD subject's text
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 100));
      // Capture CONTENT, not just a count: a stale-subject flash is the panel showing the OLD
      // family's names under the NEW subject id, which a count can never detect.
      out.steps.push({
        t: Math.round(performance.now() - started),
        subject: panelSubject(),
        cards: cardText().length,
        fingerprint: cardText().join("¦").slice(0, 200),
      });
    }
    out.after = { subject: panelSubject(), cards: cardText() };
    return out;
  });
}

const data = await page.evaluate(() => ({
  events: window.__cp1?.events ?? [],
  nav: (() => { const n = performance.getEntriesByType("navigation")[0];
    return n ? { ttfb: Math.round(n.responseStart), htmlEnd: Math.round(n.responseEnd) } : null; })(),
  finalCards: Array.from(document.querySelectorAll("[data-card-role]")).map((el) => ({
    role: el.getAttribute("data-card-role"),
    text: (el.textContent || "").trim().slice(0, 46),
  })),
  panel: (() => { const p = document.querySelector("[data-inline-focus-panel]");
    return p ? { operational: p.getAttribute("data-focus-panel-operational"),
                 settlement: p.getAttribute("data-focus-panel-settlement"),
                 strategy: document.querySelector("[data-fp-render-strategy]")?.getAttribute("data-fp-render-strategy"),
                 publishedCards: document.querySelector("[data-fp-published-cards]")?.getAttribute("data-fp-published-cards") } : null; })(),
}));

const api = reqs.map((r) => ({ ms: r.t - t0, path: r.url.replace(BASE + "/api/admin/", "").slice(0, 72) }));
const provisioning = api.filter((a) => a.path.includes("provisioning-answer"));
const out = { label, scenario, nav: data.nav, panel: data.panel, events: data.events,
  finalCards: data.finalCards, apiCount: api.length,
  provisioningCount: provisioning.length, provisioning, switchReport,
  consoleErrs, pageErrs };
fs.writeFileSync(`/tmp/cp1/${label}.json`, JSON.stringify(out, null, 2));

console.log(`\n### ${label} (${scenario})  ttfb=${data.nav?.ttfb} htmlEnd=${data.nav?.htmlEnd}`);
console.log("panel:", JSON.stringify(data.panel));
console.log("timeline:");
for (const e of data.events) console.log(`   ${String(e.t).padStart(6)}ms  ${e.name}`);
console.log(`api requests: ${api.length}   provisioning-answer: ${provisioning.length}`);
provisioning.forEach((p) => console.log(`   +${p.ms}ms ${p.path}`));
console.log("final cards:", JSON.stringify(data.finalCards, null, 1));
if (switchReport) console.log("switch:", JSON.stringify(switchReport, null, 1).slice(0, 2500));
console.log("console errors:", consoleErrs.length, " page errors:", pageErrs.length);
if (pageErrs.length) console.log(pageErrs);

await browser.close();
