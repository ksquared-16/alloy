#!/usr/bin/env node
/**
 * Persist the acceptance-gate QA screenshots by driving the LIVE control plane.
 * Uses the worktree-local Playwright. Includes a REAL Cursor round-trip.
 *
 * Run (server must be up on 3020):
 *   node scripts/local-dev/apps/vacilando/capture-qa.mjs
 */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/web/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3020";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def/docs/platform/planning/vacilando-os/qa/current";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("saved", name); };
const goto = async (hash) => { await page.goto(`${BASE}/?_=${Date.now()}#/${hash}`, { waitUntil: "domcontentloaded" }); await sleep(2500); };

try {
  // 1. Command Center with a worker selected
  await goto("command/worker/4");
  await sleep(2500);
  await shot("01-command-center");

  // 2. Resources tab
  await page.click('[data-tab="resources"]'); await sleep(1200); await shot("02-resources");

  // 3. Outputs with screenshots (slot 4 has evidence images)
  await page.click('[data-tab="outputs"]'); await sleep(2500); await shot("03-outputs-screenshot");

  // 4. Repository tab → Open draft PR preview (do NOT confirm)
  await page.click('[data-tab="repository"]'); await sleep(1800); await shot("04-repository");
  await page.click('[data-prcmd]'); await sleep(600);
  await page.click('.ov .ok'); await sleep(1200); // preview → confirm dialog (shows gh pr create)
  await shot("05-promotion-preview");
  await page.click('.ov .cancel'); await sleep(500);

  // 6. Director conversation — a REAL Cursor round-trip (safe read-only prompt)
  await page.click('[data-tab="director"]'); await sleep(1000);
  await page.fill('#d-msg', "In one short sentence, what does this worktree's most recent commit change? Do not modify any files.");
  await page.click('[data-ask]'); await sleep(700);
  await page.click('.ov .ok'); // confirm the round-trip
  await sleep(22000); // wait for the provider to answer
  await shot("06-director");

  // 7. Start Work preview
  await goto("command/worker/1");
  await page.click('[data-start]'); await sleep(600);
  await page.fill('.ov .f-name', "demo-new-work");
  await shot("07-start-work-preview");
  await page.click('.ov .cancel'); await sleep(400);

  // 8. End Work preview
  await page.click('[data-end="1"]'); await sleep(700); await shot("08-end-work-preview");
  await page.click('.ov .cancel'); await sleep(400);

  // 9. Review approval flow
  await page.click('[data-review]'); await sleep(800); await shot("09-review-approval");
  await page.click('.ov .cancel'); await sleep(400);

  // 10. Policies page
  await goto("policies");
  await sleep(1500); await shot("10-policies");

  console.log("QA capture complete →", OUT);
} catch (e) {
  console.error("capture error:", e.message);
  await shot("ERROR");
} finally {
  await browser.close();
}
