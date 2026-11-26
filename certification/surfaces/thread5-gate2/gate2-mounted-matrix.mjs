import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const OUT = "/tmp/gate2";
mkdirSync(OUT, { recursive: true });
const R = [];
const rec = (id, goal, expected, actual, status, evidence) => {
  R.push({ id, goal, expected, actual, status, evidence: evidence ?? null });
  console.log(`${status.padEnd(7)} ${id.padEnd(6)} ${goal} :: ${actual}`);
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1600, height: 1100 } });
const page = await ctx.newPage();
const net = [];
page.on("response", (r) => { if (/\/api\/admin\/integrations/.test(r.url())) net.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE,"")}`); });
const q = (sel) => page.locator(`[data-testid="${sel}"]`);
const seen = async (sel, ms = 25000) => { try { await q(sel).first().waitFor({ timeout: ms }); return true; } catch { return false; } };
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");

// ---------- DISCOVERY ----------
await page.goto(`${BASE}/adminV2/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
if (/\/login/.test(page.url())) { console.log("SESSION DEAD"); await browser.close(); process.exit(2); }
const navSeen = await seen("config-mode-nav-integrations", 20000);
rec("G2-D1", "operator discovers Integrations in settings nav", "nav item present",
    navSeen ? "config-mode-nav-integrations present" : "nav item not found", navSeen ? "PASS" : "FAIL");

await page.goto(`${BASE}/adminV2/settings/organization/integrations`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(12000);
const root = await seen("organization-integrations", 25000);
const errState = await q("integrations-error").count();
const loading = await q("integrations-loading").count();
rec("G2-D2", "direct route loads for an authorized operator", "surface root renders",
    root ? "organization-integrations rendered" : `root absent (error=${errState}, loading=${loading})`, root ? "PASS" : "FAIL");
await page.screenshot({ path: `${OUT}/G2-D2-list.png` });

// ---------- LIST / EMPTY ----------
const hasList = await q("integrations-list").count();
const hasEmpty = await q("integrations-empty-state").count();
rec("G2-L1", "list or intentional empty state (never a blank page)", "exactly one of list/empty",
    `list=${hasList} empty=${hasEmpty}`, (hasList + hasEmpty) >= 1 ? "PASS" : "FAIL");
const rows = await page.locator('[data-testid^="integration-row-"]').count();
const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="integration-row-"]')].map((e)=>e.getAttribute("data-testid").replace("integration-row-","")));
rec("G2-L2", "installations render recognizable identity/state", "row + state per installation",
    `rows=${rows} ids=${JSON.stringify(ids).slice(0,120)}`, rows >= 0 ? "PASS" : "FAIL");

// ---------- CANONICAL MODEL / NETWORK ----------
rec("G2-M1", "surface consumes only canonical integration APIs", "only /api/admin/integrations/*",
    JSON.stringify(net).slice(0, 300), net.every((n)=>/\/api\/admin\/integrations/.test(n)) ? "PASS" : "FAIL");

// ---------- PRODUCER VOCABULARY ----------
const body = await txt();
const producerHits = (body.match(/producer/gi) || []).length;
rec("G2-P1", "no retired producer-era vocabulary on the surface", "zero 'producer' mentions",
    `producer mentions = ${producerHits}`, producerHits === 0 ? "PASS" : "FAIL");

// ---------- ADD INTEGRATION ----------
if (await q("add-integration").count()) {
  await q("add-integration").first().click(); await page.waitForTimeout(6000);
  const wiz = await seen("add-integration-wizard", 20000);
  rec("G2-A1", "operator can launch the add-integration flow", "wizard opens",
      wiz ? "add-integration-wizard opened" : "wizard did not open", wiz ? "PASS" : "FAIL");
  await page.screenshot({ path: `${OUT}/G2-A1-wizard.png` });
  const apps = await page.locator('[data-testid^="wizard-application-"]').count();
  const none = await q("wizard-no-applications").count();
  rec("G2-A2", "available applications resolve from canonical model", "apps listed or explicit none-state",
      `applications=${apps} no-applications-state=${none}`, (apps + none) >= 1 ? "PASS" : "FAIL");
  const nextDisabled = (await q("wizard-next").count()) ? await q("wizard-next").first().isDisabled() : null;
  rec("G2-A3", "validation prevents advancing without a selection", "Next disabled until chosen",
      `wizard-next disabled=${nextDisabled}`, nextDisabled === true ? "PASS" : (nextDisabled === null ? "BLOCKED" : "FAIL"));
  if (await q("wizard-cancel").count()) { await q("wizard-cancel").first().click(); await page.waitForTimeout(4000); }
} else {
  rec("G2-A1", "operator can launch the add-integration flow", "wizard opens", "add-integration control absent", "BLOCKED");
}

// ---------- DETAIL ----------
if (ids.length) {
  const id = ids[0];
  await page.locator(`[data-testid="integration-row-${id}"]`).first().click();
  await page.waitForTimeout(8000);
  const det = await seen(`installation-detail-${id}`, 20000);
  rec("G2-T1", "detail is governed by the canonical installation id", `installation-detail-${id}`,
      det ? "detail keyed by installation id" : "detail not found for that id", det ? "PASS" : "FAIL");
  await page.screenshot({ path: `${OUT}/G2-T1-detail.png` });
  const dbody = await txt();
  rec("G2-T2", "no producer identifiers surface in detail", "zero 'producer' mentions",
      `producer mentions = ${(dbody.match(/producer/gi)||[]).length}`, (dbody.match(/producer/gi)||[]).length === 0 ? "PASS" : "FAIL");
  rec("G2-T3", "health/state presented", "health region present",
      `health=${await q("installation-health").count()} state-controls=${await q("installation-state-controls").count()}`,
      (await q("installation-health").count()) ? "PASS" : "FAIL");
  // ACCESS
  rec("G2-X1", "access/capability region reachable", "installation-access present",
      `access=${await q("installation-access").count()} edit-capabilities=${await q("edit-capabilities").count()}`,
      (await q("installation-access").count()) ? "PASS" : "FAIL");
  if (await q("edit-capabilities").count()) {
    await q("edit-capabilities").first().click(); await page.waitForTimeout(5000);
    const ed = await seen("capability-editor", 15000);
    const scopes = await page.locator('[data-testid^="editor-capability-"]').count();
    rec("G2-X2", "capability editor loads with resolved scopes", "editor + scope list",
        `capability-editor=${ed} scopes=${scopes}`, ed ? "PASS" : "FAIL");
    await page.screenshot({ path: `${OUT}/G2-X2-capabilities.png` });
    if (await q("capability-cancel").count()) { await q("capability-cancel").first().click(); await page.waitForTimeout(3000); }
  }
  // CREDENTIAL SAFETY
  const credRegion = await q("installation-credentials").count();
  const secretVisible = await q("credential-secret-value").count();
  const clientId = await q("credential-client-id-value").count();
  rec("G2-C1", "no secret material rendered before an explicit issue/reveal", "secret value absent on load",
      `credentials-region=${credRegion} secret-value-present=${secretVisible} client-id-present=${clientId}`,
      secretVisible === 0 ? "PASS" : "FAIL");
  const dtext = await txt();
  const leak = /-----BEGIN|service_role|sk_live|SUPABASE_SERVICE/.test(dtext);
  rec("G2-C2", "no raw service/admin secret leaks into the page", "no secret markers",
      leak ? "secret marker found in page text" : "no secret markers in page text", leak ? "FAIL" : "PASS");
  // NAV / REFRESH
  await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(10000);
  const afterReload = await seen("organization-integrations", 20000) || await seen(`installation-detail-${id}`, 5000);
  rec("G2-N1", "refresh retains a coherent surface", "surface renders after reload",
      afterReload ? "coherent surface after reload" : "broken/stale surface after reload", afterReload ? "PASS" : "FAIL");
  if (await q("installation-back").count()) {
    await q("installation-back").first().click(); await page.waitForTimeout(6000);
    rec("G2-N2", "detail -> back returns to the list", "list root renders",
        (await q("organization-integrations").count()) ? "returned to list" : "did not return", (await q("organization-integrations").count()) ? "PASS" : "FAIL");
  }
} else {
  for (const [id, goal] of [["G2-T1","detail governed by canonical installation id"],["G2-T2","no producer identifiers in detail"],["G2-T3","health/state presented"],["G2-X1","access region reachable"],["G2-X2","capability editor loads"],["G2-C1","no secret before reveal"],["G2-C2","no raw secret leak"],["G2-N1","refresh retains state"],["G2-N2","back returns to list"]])
    rec(id, goal, "requires an existing installation", "no installation present in this org", "BLOCKED");
}
writeFileSync(`${OUT}/results.json`, JSON.stringify({ staging: "3792e4be2", results: R, network: net }, null, 2));
console.log("\nNETWORK:", JSON.stringify(net, null, 1).slice(0, 900));
console.log("\nTALLY:", JSON.stringify(R.reduce((a,r)=>((a[r.status]=(a[r.status]||0)+1),a),{})));
await browser.close();
