import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const R = [];
const rec = (id, goal, expected, actual, status) => { R.push({id,goal,status}); console.log(`${status.padEnd(7)} ${id.padEnd(6)} ${goal} :: ${actual}`); };
const browser = await chromium.launch();

// --- Unauthenticated: no storage state at all ---
const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ap = await anon.newPage();
const routes = ["/api/admin/integrations/installations","/api/admin/integrations/applications","/api/admin/integrations/capabilities","/api/admin/integrations/locations"];
const anonCodes = [];
for (const r of routes) {
  const res = await ap.request.get(`${BASE}${r}`).catch(() => null);
  anonCodes.push(`${r.split("/").pop()}=${res ? res.status() : "ERR"}`);
}
const allDenied = anonCodes.every((c) => /=(401|403|404|302|307)$/.test(c));
rec("G2-S1", "admin integration APIs deny an unauthenticated caller", "401/403 on every route",
    anonCodes.join(" "), allDenied ? "PASS" : "FAIL");

// Direct UI route with no session must not render the surface
await ap.goto(`${BASE}/adminV2/settings/organization/integrations`, { waitUntil: "domcontentloaded", timeout: 60000 });
await ap.waitForTimeout(9000);
const anonRendered = await ap.evaluate(() => Boolean(document.querySelector('[data-testid="organization-integrations"]')));
rec("G2-S2", "direct route cannot be reached without a session", "surface not rendered / redirected",
    `url=${ap.url().replace(BASE,"")} surface_rendered=${anonRendered}`, anonRendered ? "FAIL" : "PASS");
await anon.close();

// --- Authenticated: confirm the same routes succeed, proving the deny is about identity ---
const auth = await browser.newContext({ storageState: STORAGE, viewport: { width: 1280, height: 900 } });
const pp = await auth.newPage();
await pp.goto(`${BASE}/adminV2/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pp.waitForTimeout(7000);
const authCodes = [];
for (const r of routes) {
  const res = await pp.request.get(`${BASE}${r}`).catch(() => null);
  authCodes.push(`${r.split("/").pop()}=${res ? res.status() : "ERR"}`);
}
rec("G2-S3", "the same routes succeed for a granted operator", "200 on every route",
    authCodes.join(" "), authCodes.every((c)=>/=200$/.test(c)) ? "PASS" : "FAIL");

// Error state: a non-existent installation id must fail cleanly, no stack/payload leak
const bad = await pp.request.get(`${BASE}/api/admin/integrations/installations/00000000-0000-0000-0000-000000000000`).catch(() => null);
const badTxt = bad ? (await bad.text()).slice(0, 300) : "";
const leaks = /at .*\(.*:\d+:\d+\)|stack|SUPABASE_SERVICE|service_role/i.test(badTxt);
rec("G2-E1", "unknown installation fails cleanly without leaking internals", "4xx + operator-safe body",
    `status=${bad ? bad.status() : "ERR"} leak=${leaks} body=${badTxt.slice(0,110)}`,
    bad && bad.status() >= 400 && bad.status() < 500 && !leaks ? "PASS" : "FAIL");
console.log("\nTALLY:", JSON.stringify(R.reduce((a,r)=>((a[r.status]=(a[r.status]||0)+1),a),{})));
await browser.close();
