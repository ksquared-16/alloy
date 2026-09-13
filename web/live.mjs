import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
async function attempt() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: STORAGE });
  const page = await ctx.newPage();
  const posts = [];
  page.on("request", (r) => { if (r.method() === "POST" && /actions\/execute/.test(r.url())) { try { posts.push(JSON.parse(r.postData()||"{}")); } catch {} } });
  const resps = [];
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && /actions\/execute/.test(r.url())) { try { resps.push(await r.json()); } catch {} }
  });
  try {
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(8000);
    if (page.url().includes("login")) return { state: "SIGNED_OUT" };
    await page.getByText("Waitlist", { exact: true }).first().click();
    await page.waitForTimeout(12000);
    const subject = await page.evaluate(() => window.__ALLOY_QUEUE_ROW_SURFACE_DIAG__?.firstRow?.context?.drawer_open_active_subject ?? null);
    const btn = page.locator('[data-process-action="stage_work.start"]');
    if (!(await btn.count())) return { state: "no-control" };
    const label = (await btn.first().innerText()).trim();
    await btn.first().click();
    await page.waitForTimeout(9000);
    const start = posts.find((p) => p.action_key === "stage_work.start");
    return { state: start ? "EXECUTED" : "no-execute-post", label, subject,
      sent: start ?? null, resp: resps.find((r) => r?.data || r?.error) ?? null };
  } finally { await browser.close(); }
}
for (let i = 0; i < 16; i++) {
  const r = await attempt();
  console.log(`[${i}] ${r.state} label=${r.label ?? "-"}`);
  if (r.state === "EXECUTED" || r.state === "SIGNED_OUT") { console.log(JSON.stringify(r, null, 1).slice(0, 1600)); break; }
}
