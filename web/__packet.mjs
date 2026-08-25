import { chromium } from "@playwright/test";
import fs from "node:fs";
const STATE = "/Users/Kelly/.local/state/alloy-dev/gateway/auth/slot4/cert-storage-state.json";
const CASE = JSON.parse(fs.readFileSync("/tmp/finalcase.json","utf8")).caseId;
const log = (...a) => console.log("[pkt]", ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STATE });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:3014/workspace", { waitUntil: "domcontentloaded", timeout: 240000 });
await page.waitForTimeout(3000);
const r = await page.request.post(`http://127.0.0.1:3014/api/admin/processing/cases/${CASE}/form-draft`,
  { data: { mode: "packet" }, timeout: 600000 });
log("packet analysis ->", r.status());
const body = await r.json().catch(()=>({}));
const pk = body.data?.packet_intake;
if (!pk) { log("NO PACKET", JSON.stringify(body).slice(0,400)); await browser.close(); process.exit(1); }
log("sources:", pk.sources?.length, "| destinations:", pk.destinations?.length, "| obligations:", pk.obligations?.length, "| correlations:", pk.correlations?.length);
const disp = {};
for (const a of Object.values(pk.source_analysis ?? {})) for (const p of a.proposals ?? []) disp[p.disposition] = (disp[p.disposition] ?? 0) + 1;
log("dispositions:", JSON.stringify(disp));
fs.writeFileSync("/tmp/tenant-packet.json", JSON.stringify({ caseId: CASE, counts: { sources: pk.sources?.length, destinations: pk.destinations?.length, obligations: pk.obligations?.length, correlations: pk.correlations?.length }, dispositions: disp }, null, 2));
await browser.close();
