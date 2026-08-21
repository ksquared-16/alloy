/**
 * Operational workspace lifecycle: launcher -> shell -> primary usable -> close -> warm reopen.
 * Measures the SHARED family (Processing / Work Items / Operations / Inbox) with one contract, so a
 * per-workspace divergence in loading grammar shows up as a difference in the same columns.
 */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${process.env.PE3_PORT ?? 3015}`;
const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");

const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
const net = [];
p.on("request", (r) => { if (r.url().includes("/api/")) net.push({ t: Date.now(), u: r.url().replace(BASE, "").split("?")[0] }); });

await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(22000);

const shell = () => p.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const txt = (d?.innerText || "").trim();
  return {
    open: Boolean(d),
    textLen: txt.length,
    controls: d ? d.querySelectorAll("button,a[href],input,select,[role=tab],[role=button]").length : 0,
    title: txt.split("\n")[0]?.slice(0, 40) ?? null,
    h: d ? Math.round(d.getBoundingClientRect().height) : 0,
  };
});

async function cycle(label, ariaMatch, pass) {
  const n0 = net.length;
  const t0 = Date.now();
  await p.getByLabel(new RegExp(ariaMatch, "i")).first().click({ timeout: 15000 }).catch(async () => {
    await p.evaluate((m) => { const el = [...document.querySelectorAll("[aria-label]")].find((e) => new RegExp(m, "i").test(e.getAttribute("aria-label") || "")); el?.click(); }, ariaMatch);
  });
  let T_shell = null, T_usable = null, T_controls = null;
  for (let i = 0; i < 400; i++) {
    const s = await shell(); const el = Date.now() - t0;
    if (T_shell === null && s.open) T_shell = el;
    if (T_controls === null && s.controls > 3) T_controls = el;
    if (T_usable === null && s.textLen > 120) T_usable = el;
    if (T_shell !== null && T_usable !== null && T_controls !== null) break;
    await p.waitForTimeout(30);
  }
  await p.waitForTimeout(6000);
  const s = await shell();
  const reqs = net.slice(n0);
  const f = (v) => (v === null ? "    -" : String(v).padStart(5));
  console.log(`  ${(label + " " + pass).padEnd(26)} shell${f(T_shell)} controls${f(T_controls)} usable${f(T_usable)} | api=${String(reqs.length).padStart(2)} h=${s.h} title=${JSON.stringify(s.title)}`);
  const dup = {}; reqs.forEach((r) => { dup[r.u] = (dup[r.u] || 0) + 1; });
  const dups = Object.entries(dup).filter(([, n]) => n > 1);
  if (dups.length) console.log(`      duplicate fetches: ${JSON.stringify(dups)}`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(2500);
  const closed = await shell();
  if (closed.open) console.log("      WARN: Escape did not close the workspace");
  return { T_shell, T_usable, api: reqs.length };
}

console.log("\n=== operational workspace lifecycle (first open vs warm reopen) ===");
for (const [label, aria] of [["Processing", "^Processing"], ["Work Items", "^Work Items"], ["Operations", "^Operations"], ["Inbox", "^Inbox"]]) {
  const first = await cycle(label, aria, "(first)");
  await p.waitForTimeout(2500);
  const warm = await cycle(label, aria, "(reopen)");
  if (first.T_usable && warm.T_usable) {
    console.log(`      reopen delta: usable ${first.T_usable} -> ${warm.T_usable}ms · api ${first.api} -> ${warm.api}`);
  }
  await p.waitForTimeout(2500);
}
await b.close();
