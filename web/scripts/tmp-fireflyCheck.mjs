/** Confirm the reversible Save-probe field is back to its original value on the live tenant. */
import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = "http://127.0.0.1:3015";
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json"), viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, { timeout: 90000 });
await p.waitForTimeout(24000);
await p.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
await p.waitForTimeout(14000);
await p.evaluate(() => {
  const card=[...document.querySelectorAll("[data-card-role]")].find(e=>(e.getAttribute("data-focus-panel-cell-type")||e.closest("[data-focus-panel-grid-cell]")?.getAttribute("data-focus-panel-grid-cell"))==="children");
  const el=[...(card?.querySelectorAll("button,a,[role=button]")||[])].find(x=>/Kurzman|Kid/.test(x.textContent||""));
  const o={bubbles:true,cancelable:true,composed:true,pointerId:1,button:0,isPrimary:true};
  el?.dispatchEvent(new PointerEvent("pointerdown",o)); el?.dispatchEvent(new PointerEvent("pointerup",o));
  el?.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));
});
await p.waitForTimeout(6000);
const v = await p.evaluate(() => {
  const pane = document.querySelector("[data-identity-depth='details']") ?? document.querySelector("[data-adminv2-record-modal-scroll]");
  const lines = (pane?.innerText || "").split("\n").map(s=>s.trim());
  const i = lines.findIndex(l => /^special instructions?$/i.test(l));
  return { found: i >= 0, value: i >= 0 ? lines[i+1] : null,
           probeLeft: /perf-probe-/.test(pane?.innerText || "") };
});
console.log("Special Instructions:", JSON.stringify(v));
console.log(v.probeLeft ? "FIREFLY MUTATION LEFT BEHIND" : "clean — no probe value remains");
await b.close();
