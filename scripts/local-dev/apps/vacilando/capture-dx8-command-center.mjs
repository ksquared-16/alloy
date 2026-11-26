/**
 * Capture DX-8 Executive Command Center screenshots + browser checks.
 * Requires Vacilando on :3026.
 */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/web/node_modules/playwright/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.VACILANDO_BASE || "http://127.0.0.1:3026";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/docs/platform/planning/vacilando-os/qa/director-experience-v2/screenshots";
mkdirSync(OUT, { recursive: true });

const home = await (await fetch(`${BASE}/api/v2/views/missions?filter=active`)).json();
const pf = home.portfolio || {};
const cc = pf.commandCenter || {};
const apiMeta = {
  portfolioKind: pf.kind,
  commandKind: cc.kind,
  lead: cc.lead,
  counts: cc.counts,
  lanes: (cc.lanes || []).filter((l) => l.count > 0).map((l) => ({
    id: l.id,
    label: l.label,
    count: l.count,
    sample: (l.cards || []).slice(0, 2).map((c) => ({
      title: c.title,
      actionTitle: c.actionTitle,
      primary: c.primaryAction?.kind,
    })),
  })),
  portfolioCounts: pf.counts,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
await page.goto(`${BASE}/#/missions`, { waitUntil: "commit", timeout: 120000 });
await page.waitForSelector("#mc-command-center, .mc-command-center, .mc-portfolio-counts", { timeout: 120000 });
await page.waitForTimeout(1000);

const checks = {
  hasCommandCenter: (await page.locator("#mc-command-center, .mc-command-center").count()) > 0,
  hasPortfolioCounts: (await page.locator(".mc-portfolio-counts").count()) > 0,
  commandCardCount: await page.locator(".mc-command-card").count(),
  portfolioCardCount: await page.locator(".mc-portfolio-card").count(),
  laneCount: await page.locator(".mc-command-lane").count(),
};

await page.locator(".mc-command-center, .mc-hero").first().screenshot({
  path: join(OUT, "dx8-command-center.png"),
}).catch(async () => {
  await page.screenshot({ path: join(OUT, "dx8-command-center.png") });
});
await page.screenshot({ path: join(OUT, "dx8-home.png"), fullPage: false });

const firstLane = page.locator(".mc-command-lane").first();
if (await firstLane.count()) {
  await firstLane.scrollIntoViewIfNeeded();
  await firstLane.screenshot({ path: join(OUT, "dx8-command-lane.png") });
}
const firstCard = page.locator(".mc-command-card").first();
if (await firstCard.count()) {
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.screenshot({ path: join(OUT, "dx8-command-card.png") });
}

const openBtn = page.locator('.mc-command-card [data-nav^="missions/"]').first();
let missionOk = false;
if (await openBtn.count()) {
  const href = await openBtn.getAttribute("data-nav");
  await openBtn.click();
  await page.waitForSelector(".mc-outcome-hero, .mc-dash-summary, #mc-outcome-hero, #mc-decisions", { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(600);
  missionOk = (await page.locator(".mc-outcome-hero, .mc-dash-summary, #mc-outcome-hero, #mc-decisions").count()) > 0;
  await page.screenshot({ path: join(OUT, "dx8-mission-detail-unchanged.png") });
  checks.navigatedMissionHref = href;
}
checks.missionDetailStillRenders = missionOk;

await browser.close();

const report = {
  at: new Date().toISOString(),
  base: BASE,
  apiMeta,
  checks: {
    ...checks,
    apiHasCommandCenter: cc.kind === "executive_command_center",
    apiHasPortfolio: pf.kind === "director_portfolio",
    consistentActionable: (cc.counts?.actionable ?? 0) >= 0,
  },
  shots: {
    commandCenter: "dx8-command-center.png",
    home: "dx8-home.png",
    lane: "dx8-command-lane.png",
    card: "dx8-command-card.png",
    mission: "dx8-mission-detail-unchanged.png",
  },
};

writeFileSync(join(OUT, "dx8-browser-checks.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const failed = !report.checks.hasCommandCenter
  || !report.checks.apiHasCommandCenter
  || !report.checks.hasPortfolioCounts
  || report.checks.commandCardCount < 1;
if (failed) process.exit(1);
