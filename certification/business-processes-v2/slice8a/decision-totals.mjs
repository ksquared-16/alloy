import { createRequire } from "node:module";
const require = createRequire("/Users/vacilando/Code/alloy-worktrees/business-processes/web/package.json");
const { chromium } = require("playwright");
const BASE = "https://staging.workwithalloy.com";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: process.env.STORAGE_STATE, viewport: { width: 1440, height: 1000 } });
await ctx.route("**/*", (route) => {
  const q = route.request();
  const readPost = q.method() === "POST" && q.url().startsWith(`${BASE}/api/admin/queue-view-totals`);
  if (!readPost && q.method() !== "GET" && q.method() !== "HEAD" && q.url().startsWith(BASE)) return route.abort();
  return route.continue();
});
const page = await ctx.newPage();
const totals = [];
page.on("response", async (x) => { if (x.url().includes("/api/admin/queue-view-totals")) { try { totals.push(await x.json()); } catch {} } });
await page.goto(`${BASE}/workspace/work-unit/all?work_view_id=new_work_view_8`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => null);
await page.waitForTimeout(5000);
const pick = (o) => JSON.stringify(o, (k, v) => (typeof v === "string" && v.length > 80 ? v.slice(0, 80) : v));
const hits = [];
for (const t of totals) { const s = pick(t); const i = s.indexOf("new_work_view_8"); if (i >= 0) hits.push(s.slice(Math.max(0, i - 200), i + 900)); }
console.log("responses", totals.length); console.log(hits.slice(0, 2).join("\n---\n"));
await browser.close();
