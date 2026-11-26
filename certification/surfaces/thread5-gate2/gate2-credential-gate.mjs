import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const INST = "5bdc7c1e-86ca-45f9-a18d-7d00fd7b6923";
const R=[]; const rec=(id,goal,actual,status)=>{R.push({id,status});console.log(`${status.padEnd(7)} ${id.padEnd(7)} ${goal} :: ${actual}`);};
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, viewport:{width:1600,height:1100} });
const page = await ctx.newPage();
const q=(s)=>page.locator(`[data-testid="${s}"]`);
await page.goto(`${BASE}/adminV2/settings/organization/integrations`, { waitUntil:"domcontentloaded", timeout:60000 });
await page.waitForTimeout(11000);
if (/\/login/.test(page.url())) { console.log("SESSION DEAD"); await browser.close(); process.exit(2); }
await q(`integration-row-${INST}`).first().click(); await page.waitForTimeout(9000);
const rot = await q("credential-rotate").first().isDisabled().catch(()=>null);
const rev = await q("credential-revoke").first().isDisabled().catch(()=>null);
const iss = await q("credential-issue").first().isDisabled().catch(()=>null);
const label = (await q("installation-credentials").first().innerText()).replace(/\s+/g," ").trim().slice(0,90);
rec("G2-C8","revoked credential leaves rotate/revoke disabled (the repaired gate)",
    `label="${label}" rotate_disabled=${rot} revoke_disabled=${rev}`, rot===true && rev===true ? "PASS":"FAIL");
rec("G2-C9","Issue stays available so the operator can recover",
    `issue_disabled=${iss}`, iss===false ? "PASS":"FAIL");
await page.screenshot({ path:"/tmp/gate2b/P11-revoked-gate.png" });
console.log("TALLY:", JSON.stringify(R.reduce((a,r)=>((a[r.status]=(a[r.status]||0)+1),a),{})));
await browser.close();
