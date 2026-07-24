#!/usr/bin/env node
/** Persist Provider Runtime V1 QA screenshots by driving the LIVE app. node 18+. */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/web/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/docs/platform/planning/vacilando-os/qa/provider-runtime";
mkdirSync(OUT, { recursive: true });
const BASE = "http://127.0.0.1:3020";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => console.log("saved", n));
const goto = async (h) => { await p.goto(`${BASE}/?_=${Date.now()}#/${h}`, { waitUntil: "domcontentloaded" }); await sleep(4500); };
try {
  // 01 — Provider Manager (Settings → Providers): auth owned by Provider Runtime
  await goto("settings");
  await p.waitForSelector(".pm-card", { timeout: 12000 }).catch(() => {});
  await sleep(1200); await shot("01-provider-manager");

  // 02 — Diagnostics dialog for Claude (no secrets)
  const diag = await p.$('[data-prov-diag="claude"]'); if (diag) await diag.click();
  await p.waitForSelector(".ov .dlg", { timeout: 6000 }).catch(() => {});
  await sleep(700); await shot("02-diagnostics-claude");
  const c1 = await p.$(".ov .cancel"); if (c1) await c1.click(); await sleep(400);

  // 03 — Reconnect dialog for Claude (one reconnect fixes every worker)
  const rc = await p.$('[data-prov-reconnect="claude"]'); if (rc) await rc.click();
  await p.waitForSelector(".ov .dlg", { timeout: 6000 }).catch(() => {});
  await sleep(700); await shot("03-reconnect-claude");
  const c2 = await p.$(".ov .cancel"); if (c2) await c2.click(); await sleep(400);

  // 04 — Dashboard Providers block (Phase 7)
  await goto("command");
  await p.waitForSelector(".dsec", { timeout: 10000 }).catch(() => {});
  await sleep(1500); await shot("04-dashboard-providers");

  // 05 — Worker Director tab reads shared provider status (Authentication required for a Claude worker)
  await goto("command/worker/6");
  await p.waitForSelector('[data-tab="director"]', { timeout: 20000 }).catch(() => {});
  for (let i = 0; i < 4 && !(await p.$(".director")); i++) { const t = await p.$('[data-tab="director"]'); if (t) await t.click(); await sleep(1000); }
  await sleep(1200); await shot("05-worker-provider-metadata");
  console.log("Provider Runtime QA capture complete →", OUT);
} catch (e) { console.error("err:", e.message); await shot("ERROR"); } finally { await b.close(); }
