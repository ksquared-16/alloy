/** R12 — what the operator actually sees on the waitlist queue: order, rank, pin state, explanation. */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path"; import fs from "fs";
const BASE = process.env.R12_BASE ?? "http://127.0.0.1:3012";
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ storageState: join(homedir(), ".local/state/alloy-dev/auth/slot2/storage-state.json"), viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  await p.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForFunction(() => document.querySelectorAll("[data-queue-row-subject]").length > 0, undefined, { timeout: 90000 });
  await p.waitForTimeout(6000);
  const rows = await p.$$eval("[data-queue-row-waitlist-rank-cluster]", (els) => els.map((el, i) => {
    const rank = el.querySelector("[data-queue-row-waitlist-rank]") ?? el;
    const adjust = el.querySelector("[data-queue-row-waitlist-adjust]");
    // The row container is whichever ancestor also carries the subject anchor.
    let host = el;
    while (host && !host.querySelector?.("[data-queue-row-subject]")) host = host.parentElement;
    const subjEl = host?.querySelector("[data-queue-row-subject]") ?? null;
    return {
      index: i,
      subject: subjEl?.getAttribute("data-queue-row-subject") ?? null,
      name: (subjEl?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
      rankText: rank?.textContent?.trim() ?? null,
      rankTitle: rank?.getAttribute("title") ?? el.getAttribute("title") ?? null,
      clusterTitle: el.getAttribute("title") ?? null,
      hasAdjust: !!adjust,
      pinAttrs: Object.fromEntries([...el.attributes].filter((a) => /pin|manual|adjust/i.test(a.name)).map((a) => [a.name, a.value])),
    };
  }));
  const groups = await p.$$eval("[data-queue-group-header]", (els) => els.map((e) => ({ value: e.getAttribute("data-queue-group-value"), count: e.getAttribute("data-queue-group-count"), text: (e.textContent ?? "").replace(/\s+/g," ").slice(0,80) })));
  fs.mkdirSync("/tmp/r12", { recursive: true });
  fs.writeFileSync("/tmp/r12/dom.json", JSON.stringify({ groups, rows }, null, 2));
  console.log("=== group headers ===");
  groups.forEach((g) => console.log(`  ${g.value} (${g.count}) — ${g.text}`));
  console.log(`\n=== rows (${rows.length}) ===`);
  rows.forEach((r) => console.log(`  [${String(r.index).padStart(2)}] ${String(r.name).padEnd(22)} rank=${String(r.rankText).padEnd(9)} adjust=${r.hasAdjust ? "Y" : "n"} title="${String(r.rankTitle ?? r.clusterTitle ?? "").slice(0,120)}"`));
} finally { await b.close(); }
