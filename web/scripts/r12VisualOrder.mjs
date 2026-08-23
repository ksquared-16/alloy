/**
 * R12 — TRUE visual order of waitlist rows, by geometry.
 *
 * Document order is not visual order (CSS `order`, grid placement and portals all break that), and a
 * precedence claim built on the wrong order would be fiction. Rows are therefore sorted by their
 * on-screen top edge and compared against the rank label each row shows.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path"; import fs from "fs";
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
    document.querySelectorAll("[data-queue-row-waitlist-rank-cluster]").forEach((el, docIndex) => {
      let host = el;
      while (host && !host.querySelector?.("[data-queue-row-subject]")) host = host.parentElement;
      const subjEl = host?.querySelector("[data-queue-row-subject]") ?? null;
      const r = (host ?? el).getBoundingClientRect();
      out.push({
        docIndex,
        top: Math.round(r.top + window.scrollY),
        name: (subjEl?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32),
        rankText: (el.querySelector("[data-queue-row-waitlist-rank]") ?? el).textContent?.trim() ?? null,
        section: (() => { // nearest preceding group header
          let n = host, hdr = null;
          while (n && !hdr) { let s = n.previousElementSibling;
            while (s && !hdr) { if (s.matches?.("[data-queue-group-header]") || s.querySelector?.("[data-queue-group-header]")) hdr = s.matches?.("[data-queue-group-header]") ? s : s.querySelector("[data-queue-group-header]"); s = s.previousElementSibling; }
            n = n.parentElement; }
          return hdr?.getAttribute("data-queue-group-value") ?? null;
        })(),
      });
    });
    return out.sort((a, b2) => a.top - b2.top);
  });
  fs.mkdirSync("/tmp/r12", { recursive: true });
  fs.writeFileSync("/tmp/r12/visual-order.json", JSON.stringify(rows, null, 2));
  console.log("visual# docIdx  top   section              name                  rank");
  rows.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}   ${String(r.docIndex).padStart(4)}  ${String(r.top).padStart(5)}  ${String(r.section ?? "-").padEnd(20)} ${String(r.name).padEnd(21)} ${r.rankText}`));
  // Within each section, does visual order match the rank label?
  const bySection = new Map();
  rows.forEach((r) => { const k = r.section ?? "-"; bySection.set(k, [...(bySection.get(k) ?? []), r]); });
  console.log("\n=== rank vs visual order, per section ===");
  for (const [sec, list] of bySection) {
    const nums = list.map((r) => Number(String(r.rankText).split("/")[0]));
    const monotonic = nums.every((n, i) => i === 0 || n >= nums[i - 1]);
    console.log(`  ${sec}: visual ranks = [${nums.join(", ")}] -> ${monotonic ? "MATCHES display order" : "DISAGREES with display order"}`);
  }
} finally { await b.close(); }
