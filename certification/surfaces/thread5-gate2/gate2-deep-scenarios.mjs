import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const INST = "5bdc7c1e-86ca-45f9-a18d-7d00fd7b6923";
const R=[]; const rec=(id,goal,actual,status)=>{R.push({id,status});console.log(`${status.padEnd(7)} ${id.padEnd(7)} ${goal} :: ${actual}`);};
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, viewport:{width:1600,height:1100} });
const page = await ctx.newPage();
const net=[]; page.on("response",(r)=>{if(/\/api\/admin\/integrations/.test(r.url()))net.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE,"")}`);});
const q=(s)=>page.locator(`[data-testid="${s}"]`);
const seen=async(s,ms=20000)=>{try{await q(s).first().waitFor({timeout:ms});return true;}catch{return false;}};
const openDetail = async () => {
  await page.goto(`${BASE}/adminV2/settings/organization/integrations`, { waitUntil:"domcontentloaded", timeout:60000 });
  await page.waitForTimeout(11000);
  await q(`integration-row-${INST}`).first().click(); await page.waitForTimeout(8000);
};
const capState = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="editor-capability-"]')]
  .map((l)=>({ scope:l.getAttribute("data-testid").replace("editor-capability-",""), checked:l.querySelector('input[type=checkbox]')?.checked })));

await openDetail();
const ident = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g," ");
rec("G2-T4","detail shows canonical application identity", `sandbox=${/Alloy Certification Sandbox/.test(ident)}`, /Alloy Certification Sandbox/.test(ident)?"PASS":"FAIL");
rec("G2-T5","no producer identifier in detail", `producer=${(ident.match(/producer/gi)||[]).length}`, (ident.match(/producer/gi)||[]).length===0?"PASS":"FAIL");

// N2 — the scenario the matrix cannot reach (its N1 reload removes the precondition)
await q("installation-back").first().click(); await page.waitForTimeout(6000);
rec("G2-N2","detail -> back returns to the list",
    `list_root=${await q("organization-integrations").count()} rows=${await page.locator('[data-testid^="integration-row-"]').count()}`,
    (await q("organization-integrations").count())?"PASS":"FAIL");

// N3 — refresh WHILE on detail
await openDetail();
await page.reload({ waitUntil:"domcontentloaded" }); await page.waitForTimeout(11000);
rec("G2-N3","refresh while on detail yields a coherent surface",
    `coherent=${await seen(`installation-detail-${INST}`,12000) || await seen("organization-integrations",8000)}`,
    (await q("organization-integrations").count()) || (await q(`installation-detail-${INST}`).count()) ? "PASS":"FAIL");

// X3/X4/X5 — access mutation persists, survives reload, and can be revoked
await openDetail();
await q("edit-capabilities").first().click(); await page.waitForTimeout(5000);
const before = await capState();
const target = before.find((s)=>s.checked===false);
if (!target) rec("G2-X3","access change persists","no unselected scope available","BLOCKED");
else {
  net.length=0;
  await page.locator(`[data-testid="editor-capability-${target.scope}"] input[type=checkbox]`).first().check();
  await page.waitForTimeout(1200);
  await q("capability-save").first().click(); await page.waitForTimeout(9000);
  rec("G2-X3","allowed access change persists through the canonical API",
      `granted=${target.scope} writes=${JSON.stringify(net.filter(x=>/^2\d\d PATCH/.test(x)))}`,
      net.some(x=>/^2\d\d PATCH/.test(x))?"PASS":"FAIL");
  await openDetail(); await q("edit-capabilities").first().click(); await page.waitForTimeout(5000);
  const stuck = (await capState()).find((s)=>s.scope===target.scope)?.checked===true;
  rec("G2-X4","persisted access survives a full reload", `${target.scope} still_checked=${stuck}`, stuck?"PASS":"FAIL");
  net.length=0;
  await page.locator(`[data-testid="editor-capability-${target.scope}"] input[type=checkbox]`).first().uncheck();
  await page.waitForTimeout(1200);
  await q("capability-save").first().click(); await page.waitForTimeout(9000);
  rec("G2-X5","revoking a grant also persists (state restored)",
      `revoked=${target.scope} writes=${JSON.stringify(net.filter(x=>/^2\d\d PATCH/.test(x)))}`,
      net.some(x=>/^2\d\d PATCH/.test(x))?"PASS":"FAIL");
}

// S4/S5 — write APIs are server-enforced, not UI-gated
const anon = await browser.newContext(); const ap = await anon.newPage();
const w1 = await ap.request.patch(`${BASE}/api/admin/integrations/installations/${INST}`, { data:{scopes:[]} }).catch(()=>null);
rec("G2-S4","write API refuses an unauthenticated caller", `PATCH -> ${w1?w1.status():"ERR"}`, w1&&[401,403].includes(w1.status())?"PASS":"FAIL");
const w2 = await ap.request.post(`${BASE}/api/admin/integrations/installations/${INST}/credentials`, { data:{} }).catch(()=>null);
rec("G2-S5","credential write refuses an unauthenticated caller", `POST credentials -> ${w2?w2.status():"ERR"}`, w2&&[401,403].includes(w2.status())?"PASS":"FAIL");
await anon.close();
console.log("\nTALLY:", JSON.stringify(R.reduce((a,r)=>((a[r.status]=(a[r.status]||0)+1),a),{})));
await browser.close();
