import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const BASE = "https://staging.workwithalloy.com";
const STORAGE = `${process.env.HOME}/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json`;
const b = await chromium.launch();
const c = await b.newContext({ storageState: JSON.parse(readFileSync(STORAGE, "utf8")) });
const p = await c.newPage();
await p.goto(`${BASE}/organization/locations`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(5000);
const r = await p.evaluate(async () => {
  const res = await fetch("/api/admin/locations/50bceb7d-fed5-418d-9550-faa2fe5a549e/archive", { method: "POST", credentials: "include" });
  return { status: res.status, body: await res.text() };
});
console.log(JSON.stringify(r, null, 2).slice(0, 900));
await b.close();
