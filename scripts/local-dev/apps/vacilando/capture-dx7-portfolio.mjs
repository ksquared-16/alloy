/**
 * Capture DX-7 Director Portfolio screenshots + browser checks.
 * Requires Vacilando on :3026.
 */
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/web/node_modules/playwright/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.VACILANDO_BASE || "http://127.0.0.1:3026";
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/docs/platform/planning/vacilando-os/qa/director-experience-v2/screenshots";
mkdirSync(OUT, { recursive: true });

const home = await (await fetch(`${BASE}/api/v2/views/missions?filter=active`)).json();
if (!home?.ok && !home?.portfolio) {
  console.error("missions API failed", home);
  process.exit(1);
}
const pf = home.portfolio || {};
const apiMeta = {
  kind: pf.kind,
  focusLead: pf.focusLead,
  counts: pf.counts,
  groups: (pf.groups || []).map((g) => ({
    id: g.id,
    label: g.label,
    count: g.count,
    titles: (g.missions || []).slice(0, 5).map((m) => m.title),
  })),
  focus: (pf.focus || []).slice(0, 5).map((m) => ({
    title: m.title,
    groupId: m.groupId,
    recommendation: m.recommendation,
  })),
  sampleCard: (pf.cards || [])[0]
    ? {
        title: pf.cards[0].title,
        phase: pf.cards[0].phase,
        outcome: pf.cards[0].outcome?.label,
        recommendation: pf.cards[0].recommendation,
        owner: pf.cards[0].owner,
        confidence: pf.cards[0].confidence,
        nextAction: pf.cards[0].nextAction?.label,
      }
    : null,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
await page.goto(`${BASE}/#/missions`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".mc-portfolio-counts, .mc-portfolio-group, .rempty", { timeout: 90000 });
await page.waitForTimeout(800);

const checks = {
  hasPortfolioTitle: /Director Portfolio/i.test(await page.locator("h2").first().innerText().catch(() => "")),
  hasCounts: (await page.locator(".mc-portfolio-counts").count()) > 0,
  hasFocus: (await page.locator(".mc-portfolio-focus").count()) > 0,
  groupCount: await page.locator(".mc-portfolio-group").count(),
  cardCount: await page.locator(".mc-portfolio-card").count(),
  hasWorkersLink: (await page.locator('[data-nav="workers"]').count()) > 0,
};

await page.locator(".mc-portfolio-counts, .mc-hero").first().screenshot({
  path: join(OUT, "dx7-portfolio-counts.png"),
}).catch(async () => {
  await page.screenshot({ path: join(OUT, "dx7-portfolio-counts.png") });
});
await page.screenshot({ path: join(OUT, "dx7-portfolio-home.png"), fullPage: false });

const firstGroup = page.locator(".mc-portfolio-group").first();
if (await firstGroup.count()) {
  await firstGroup.scrollIntoViewIfNeeded();
  await firstGroup.screenshot({ path: join(OUT, "dx7-portfolio-group.png") });
}

const firstCard = page.locator(".mc-portfolio-card").first();
if (await firstCard.count()) {
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.screenshot({ path: join(OUT, "dx7-portfolio-card.png") });
}

// Navigate into a mission and back — no regression of mission page shell
const openBtn = page.locator('.mc-portfolio-card [data-nav^="missions/"]').first();
let missionOk = false;
if (await openBtn.count()) {
  const href = await openBtn.getAttribute("data-nav");
  await openBtn.click();
  await page.waitForTimeout(2200);
  await page.waitForSelector(".mc-outcome-hero, .mc-dash-summary, #mc-outcome-hero, .mc-sec", { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(800);
  missionOk = (await page.locator(".mc-outcome-hero, .mc-dash-summary, #mc-outcome-hero, #mc-decisions").count()) > 0;
  await page.screenshot({ path: join(OUT, "dx7-mission-detail-unchanged.png") });
  await page.goto(`${BASE}/#/missions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
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
    apiIsPortfolio: pf.kind === "director_portfolio",
    apiHasCounts: Boolean(pf.counts),
    apiHasGroups: Array.isArray(pf.groups) && pf.groups.length > 0,
  },
  shots: {
    counts: "dx7-portfolio-counts.png",
    home: "dx7-portfolio-home.png",
    group: "dx7-portfolio-group.png",
    card: "dx7-portfolio-card.png",
    mission: "dx7-mission-detail-unchanged.png",
  },
};

writeFileSync(join(OUT, "dx7-browser-checks.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const failed = !report.checks.hasPortfolioTitle
  || !report.checks.hasCounts
  || !report.checks.apiIsPortfolio
  || report.checks.cardCount < 1;
if (failed) process.exit(1);
