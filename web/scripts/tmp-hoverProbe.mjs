import { chromium } from "playwright";
import { homedir } from "os"; import { join } from "path";
const BASE = "http://127.0.0.1:3015";
const b = await chromium.launch({ headless: true });
const c = await b.newContext({ storageState: join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json"), viewport: { width: 1440, height: 960 } });
const p = await c.newPage();
let t0 = null; const marks = [];
p.on("request", (r) => { if (/\/api\/admin\/(records|scheduling)/.test(r.url())) marks.push({ u: r.url().replace(BASE,""), t: Date.now(), k: "req" }); });
p.on("response", (r) => { if (/\/api\/admin\/(records|scheduling)/.test(r.url())) marks.push({ u: r.url().replace(BASE,""), t: Date.now(), k: "res" }); });
await p.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.waitForTimeout(20000);
await p.evaluate(() => window.sessionStorage.setItem("alloy.workspace.resume.operations", JSON.stringify({ mode:"work", section:"children", lens:"rooms", range:"day", studioSection:"types" })));
marks.length = 0;
const hoverT = Date.now();
// REAL pointer hover. React implements onMouseEnter through mouseover delegation, so a synthetic
// MouseEvent("mouseenter") never reaches the handler and the warm looks dead when it is not.
await p.locator('[aria-label^="Operations"]').first().hover();
await p.waitForTimeout(2500);
t0 = Date.now();
await p.locator('[aria-label^="Operations"]').first().click();
await p.waitForTimeout(9000);
console.log(`hover at ${hoverT-t0}ms, click at 0ms:`);
for (const m of marks) console.log(`  ${String(m.t-t0).padStart(6)}  ${m.k} ${m.u}`);
await b.close();
