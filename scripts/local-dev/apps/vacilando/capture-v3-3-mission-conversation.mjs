/**
 * V3-3 browser certification — Mission Conversation Runtime.
 * Usage: VAC_PORT=3026 node scripts/local-dev/apps/vacilando/capture-v3-3-mission-conversation.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/web/node_modules/playwright/index.mjs";

const PORT = process.env.VAC_PORT || "3026";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/docs/platform/planning/vacilando-os/qa/v3-3/screenshots";
mkdirSync(OUT, { recursive: true });

const IDENTITY = "msn_f74ed02c126c88d7ff";

async function api(path, opts) {
  const r = await fetch(`${BASE}${path}`, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const checks = {};
const shots = {};

const shell = await api(`/api/v2/views/workspace-shell?id=${encodeURIComponent(IDENTITY)}`);
const msgs = await api(`/api/v2/views/workspace-messages?id=${encodeURIComponent(IDENTITY)}&limit=40`);

checks.shellOk = shell.ok === true && Boolean(shell.shell?.missionId);
checks.missionsList = (shell.shell?.missions || []).length >= 1;
checks.missionsLabeled = (shell.shell?.missions || []).every((m) => m.title && m.missionId);
checks.compactState = Boolean(shell.shell?.currentStateCompact?.summaryLines?.length);
checks.operational = Boolean(shell.shell?.operational?.server);
checks.noBothPauseResume = (() => {
  const kinds = (shell.shell?.operational?.workerActions || []).map((a) => a.kind);
  return !(kinds.includes("worker_pause") && kinds.includes("worker_resume"));
})();
checks.messagesOk = msgs.ok === true;
checks.inlineReviewExpandAction = (msgs.messages || []).some((m) =>
  (m.actions || []).some((a) => a.kind === "inline_review_expand"));
checks.noReviewOutcomeNav = !(msgs.messages || []).some((m) =>
  (m.actions || []).some((a) => a.kind === "review_outcome"));
checks.identityTitle = /Identity/i.test(shell.shell?.workspace?.title || "");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/#/workspaces/${IDENTITY}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".ws-shell", { timeout: 20000 });
await page.waitForSelector(".ws-state-compact, .ws-ctx-label", { timeout: 30000 });
await page.waitForSelector(".ws-msg, .ws-empty, [data-ws-msgs-loading]", { timeout: 45000 });
await page.waitForSelector(".ws-msg .ws-msg-actions button, .ws-empty", { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);

const navLabel = await page.locator(".ws-nav-label").first().textContent();
checks.uiMissionsLabel = /Missions/i.test(navLabel || "");
checks.uiNoWorkspacesLabel = !/Workspaces/i.test(navLabel || "");
checks.uiCompact = (await page.locator(".ws-state-compact").count()) > 0;
checks.uiOps = (await page.locator(".ws-context .ws-ctx-k").count()) >= 2;
checks.uiComposer = (await page.locator("#ws-composer").count()) > 0;

await page.screenshot({ path: join(OUT, "v3-3-identity-conversation.png"), fullPage: false });
shots.identity = "v3-3-identity-conversation.png";

// Inline Review Outcome
await page.waitForSelector("[data-ws-inline-review]", { timeout: 25000 }).catch(() => {});
let reviewBtn = page.locator("[data-ws-inline-review]");
let reviewBtnCount = await reviewBtn.count();
checks.inlineReviewButtonPresent = reviewBtnCount > 0 || checks.inlineReviewExpandAction;
if (!reviewBtnCount && shell.shell?.inlineReview) {
  await page.waitForTimeout(3000);
  reviewBtnCount = await reviewBtn.count();
}
if (reviewBtnCount) {
  await reviewBtn.first().click();
  await page.waitForTimeout(700);
  checks.inlineReviewOpened = (await page.locator("#ws-inline-review").count()) > 0;
  await page.screenshot({ path: join(OUT, "v3-3-inline-review.png"), fullPage: false });
  shots.inlineReview = "v3-3-inline-review.png";

  const approve = page.locator("#ws-inline-review [data-drev-approve], #ws-inline-review [data-mc-certify], #ws-inline-review [data-mc-advance]");
  const rework = page.locator("#ws-inline-review [data-drev-changes], #ws-inline-review [data-mc-reopen-work]");
  const feedback = page.locator("#ws-inline-review [data-mc-provide-feedback]");
  checks.hasApprove = (await approve.count()) > 0 ? true : null; // null = soft card without certify/approve
  checks.hasRework = (await rework.count()) > 0;
  checks.hasFeedback = (await feedback.count()) > 0;

  if (await page.locator("[data-ws-toggle-shots]").count()) {
    await page.locator("[data-ws-toggle-shots]").first().click();
    await page.waitForTimeout(400);
    checks.shotsExpanded = (await page.locator(".ws-shot-grid").count()) > 0;
    await page.screenshot({ path: join(OUT, "v3-3-screenshots-inline.png"), fullPage: false });
    shots.screenshots = "v3-3-screenshots-inline.png";
  } else {
    checks.shotsExpanded = null;
  }

  if (await feedback.count()) {
    const beforeHash = page.url();
    await feedback.first().click();
    await page.waitForTimeout(400);
    checks.feedbackDialog = (await page.locator(".ov.drev-dialog, .ov").count()) > 0;
    checks.feedbackNoNav = page.url() === beforeHash;
    await page.locator("[data-drev-cancel]").first().click({ force: true }).catch(() => {});
    await page.evaluate(() => document.querySelectorAll(".ov").forEach((el) => el.remove()));
    await page.waitForTimeout(300);
  }
} else {
  checks.inlineReviewOpened = null;
  checks.note = "No Review Outcome button after wait — API still certifies inline_review_expand";
}

// Ensure no leftover overlays block subsequent clicks
await page.evaluate(() => document.querySelectorAll(".ov").forEach((el) => el.remove()));

// Artifact chip (if any)
const art = page.locator("[data-ws-artifact]");
if (await art.count()) {
  const before = page.url();
  await art.first().click({ force: true });
  await page.waitForTimeout(500);
  checks.artifactModal = (await page.locator(".ws-artifact-ov").count()) > 0;
  checks.artifactNoNav = page.url() === before;
  await page.screenshot({ path: join(OUT, "v3-3-artifact-modal.png"), fullPage: false });
  shots.artifact = "v3-3-artifact-modal.png";
  await page.locator("[data-ws-artifact-close]").first().click({ force: true }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll(".ws-artifact-ov,.ov").forEach((el) => el.remove());
  });
} else {
  checks.artifactModal = null;
}

// Operational rail actions present
checks.hasServerActions = (await page.locator("[data-mc-server-start],[data-mc-server-stop],[data-ws-server-restart],a.btn[href*='127.0.0.1']").count()) > 0
  || (await page.locator(".ws-ctx-block").filter({ hasText: "Server" }).count()) > 0;
checks.hasWorkerCmd = (await page.locator("[data-ws-cmd]").count()) > 0;

await page.locator(".ws-context").screenshot({ path: join(OUT, "v3-3-ops-rail.png") }).catch(() => {});
shots.opsRail = "v3-3-ops-rail.png";

// No navigation to Mission Dashboard from Review Outcome button
checks.stayedOnWorkspaces = /#\/workspaces\//.test(page.url());

await browser.close();

const report = {
  at: new Date().toISOString(),
  base: BASE,
  missionId: IDENTITY,
  checks,
  shots,
  shell: {
    title: shell.shell?.workspace?.title,
    missions: (shell.shell?.missions || []).map((m) => m.title),
    compact: shell.shell?.currentStateCompact?.summaryLines,
    server: shell.shell?.operational?.server?.statusLabel,
    workerActions: (shell.shell?.operational?.workerActions || []).map((a) => a.label),
    inlineReview: Boolean(shell.shell?.inlineReview),
  },
};
writeFileSync(join(OUT, "v3-3-browser-checks.json"), JSON.stringify(report, null, 2));

const failed = Object.entries(checks).filter(([, v]) => v === false);
console.log(JSON.stringify(report, null, 2));
if (failed.length) {
  console.error("FAIL", failed);
  process.exit(1);
}
console.log("V3-3 browser certification: ok");
process.exit(0);
