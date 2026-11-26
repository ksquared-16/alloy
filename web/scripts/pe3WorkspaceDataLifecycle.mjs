/**
 * Operational workspace DATA lifecycle across repeated open/close cycles.
 *
 * One open/close tells you the cost. FOUR tell you the SHAPE: flat = a loader, rising = an
 * accumulating effect that close does not clean up. Production build, so StrictMode double-invoke
 * cannot be mistaken for a duplicate (the M-1 rule).
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const CYCLES = Number(process.env.PE3_CYCLES ?? 4);

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const reqs = [];
p.on("request", (r) => { if (r.url().includes("/api/")) reqs.push(r.url().replace(BASE, "").split("?")[0]); });

await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(22000);

const open = async (aria) => {
  await p.evaluate((m) => {
    const el = [...document.querySelectorAll("[aria-label]")].find((e) => new RegExp(m, "i").test(e.getAttribute("aria-label") || ""));
    el?.click();
  }, aria);
  await p.waitForTimeout(7000);
};
const close = async () => { await p.keyboard.press("Escape"); await p.waitForTimeout(3000); };

for (const [label, aria] of [["Processing", "^Processing"], ["Work Items", "^Work Items"], ["Operations", "^Operations"], ["Inbox", "^Inbox"]]) {
  console.log(`\n=== ${label} ===`);
  const perCycle = [];
  for (let i = 0; i < CYCLES; i++) {
    const n0 = reqs.length;
    await open(aria);
    const during = reqs.slice(n0);
    const counts = {};
    during.forEach((u) => { counts[u] = (counts[u] ?? 0) + 1; });
    perCycle.push({ total: during.length, counts });
    await close();
  }
  perCycle.forEach((cy, i) => {
    const dups = Object.entries(cy.counts).filter(([, n]) => n > 1)
      .sort((a, b2) => b2[1] - a[1]).map(([u, n]) => `${n}x ${u.split("/api/admin/")[1] ?? u}`);
    console.log(`  open#${i + 1}: ${String(cy.total).padStart(3)} requests${dups.length ? "  | " + dups.slice(0, 4).join(", ") : ""}`);
  });
  // the shape is the finding
  const totals = perCycle.map((c2) => c2.total);
  const rising = totals.every((v, i) => i === 0 || v >= totals[i - 1]) && totals[totals.length - 1] > totals[0];
  console.log(`  shape: ${JSON.stringify(totals)} -> ${rising ? "RISING (accumulating effect)" : totals.every((v) => v === totals[0]) ? "FLAT" : "varies"}`);
}
await b.close();
