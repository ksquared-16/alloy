/** R12 — the operator-visible result: order, rank, pin, and the precedence explanation. */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.R12_BASE ?? "http://127.0.0.1:3012";
const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ storageState: join(homedir(), ".local/state/alloy-dev/auth/slot2/storage-state.json"), viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  await p.goto(`${BASE}/workspace/work-unit/waitlist`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForFunction(() => document.querySelectorAll("[data-queue-row-waitlist-rank-cluster]").length > 0, undefined, { timeout: 90000 });
  await p.waitForTimeout(6000);
  const rows = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll("[data-queue-row-waitlist-rank-cluster]").forEach((el) => {
      let host = el;
      while (host && !host.querySelector?.("[data-queue-row-subject]")) host = host.parentElement;
      const r = (host ?? el).getBoundingClientRect();
      const prec = el.querySelector("[data-queue-row-waitlist-precedence]");
      out.push({
        top: Math.round(r.top + window.scrollY),
        name: (host?.querySelector("[data-queue-row-subject]")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 28),
        rank: (el.querySelector("[data-queue-row-waitlist-rank]") ?? el).textContent?.trim() ?? null,
        precedence: prec?.textContent?.trim() ?? null,
        reason: prec?.getAttribute("data-precedence-reason") ?? null,
      });
    });
    return out.sort((a, b2) => a.top - b2.top);
  });
  console.log("visual#  name                  rank      reason                 explanation");
  rows.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}   ${String(r.name).padEnd(21)} ${String(r.rank).padEnd(9)} ${String(r.reason ?? "-").padEnd(22)} ${r.precedence ?? ""}`));
  const explained = rows.filter((r) => r.precedence);
  console.log(`\nrows with an explanation: ${explained.length}`);
} finally { await b.close(); }
