/**
 * V3-4 browser certification — Conversational Director + shell simplification.
 * Usage: VAC_PORT=3026 node scripts/local-dev/apps/vacilando/capture-v3-4-conversational-director.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/web/node_modules/playwright/index.mjs";

const PORT = process.env.VAC_PORT || "3026";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/docs/platform/planning/vacilando-os/qa/v3-4/screenshots";
mkdirSync(OUT, { recursive: true });
const IDENTITY = "msn_f74ed02c126c88d7ff";

async function api(path, opts) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${path}`, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(j)}`);
  return { ...j, _ms: Date.now() - t0 };
}

const checks = {};
const shots = {};
const timings = {};

const rail = await api("/api/v2/views/mission-rail");
checks.missionRailApi = (rail.missions || []).length >= 1;
checks.identityInRail = (rail.missions || []).some((m) => /Identity/i.test(m.title));

const shell = await api(`/api/v2/views/workspace-shell?id=${IDENTITY}`);
timings.shellMs = shell._ms;
checks.shellOk = shell.ok && Boolean(shell.shell?.missionId);
checks.shellFastEnough = shell._ms < 8000;
checks.noSinceOnShell = shell.shell?.sinceLastVisit == null;

const reply = await api("/api/v2/workspace/reply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    workspace_id: IDENTITY,
    text: "Give me a recap of where we're at and what you recommend next.",
    actor: "operator",
  }),
});
checks.replyOk = reply.ok === true;
checks.directorReplied = Boolean(reply.director?.ok && reply.directorMessage);
checks.directorGrounded = /recommend|phase|status|blocker|waiting|wave|implementation|discovery/i
  .test(reply.directorMessage?.body || "");

const guide = await api("/api/v2/workspace/reply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    workspace_id: IDENTITY,
    text: "I don't like the current implementation. I want the role editor simplified without changing the access architecture.",
    actor: "operator",
  }),
});
checks.guidanceMode = guide.director?.mode === "guidance";

const recall = await api("/api/v2/workspace/reply", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    workspace_id: IDENTITY,
    text: "What feedback did I just give?",
    actor: "operator",
  }),
});
checks.recallOk = /role editor/i.test(recall.directorMessage?.body || "");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const tOpen = Date.now();
await page.goto(`${BASE}/#/workspaces/${IDENTITY}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".ws-shell", { timeout: 20000 });
// Must not stick on Opening indefinitely
await page.waitForSelector(".ws-shell:not(.ws-shell-boot) .ws-main-h h1, .ws-state-compact, .ws-empty button[data-ws-retry]", { timeout: 20000 });
timings.openToShellMs = Date.now() - tOpen;
checks.openedWithoutIndefiniteBoot = !(await page.locator(".ws-shell-boot").count())
  || (await page.locator(".ws-state-compact, .ws-empty").count()) > 0;

await page.waitForSelector(".ws-msg, .ws-empty, [data-ws-msgs-loading]", { timeout: 45000 });
await page.waitForTimeout(1500);

checks.greenMissionRail = (await page.locator("#mission-rail .mission-rail-item").count()) >= 1;
checks.noBeigeMissionNav = (await page.locator(".ws-shell .ws-nav").count()) === 0;
checks.settingsAtBottom = (await page.locator(".ruser[data-route='settings']").count()) > 0;
checks.composerPresent = (await page.locator("#ws-composer").count()) > 0;

await page.screenshot({ path: join(OUT, "v3-4-identity-open.png") });
shots.open = "v3-4-identity-open.png";

// Composer recap
const stamp = `V3-4 cert ${Date.now()}: Where are we at?`;
await page.fill("#ws-composer", stamp);
await page.click("[data-ws-send]");
await page.waitForTimeout(4000);
await page.waitForFunction((s) => {
  return [...document.querySelectorAll(".ws-msg .ws-msg-body")].some((el) => (el.textContent || "").includes(s.slice(0, 24)));
}, stamp, { timeout: 15000 }).catch(() => {});
const bodies = await page.locator(".ws-msg .ws-msg-body").allTextContents();
checks.kellyMessageVisible = bodies.some((b) => b.includes(stamp) || b.includes(stamp.slice(0, 24)));
checks.directorInThread = (await page.locator(".ws-msg.role-counsel, .ws-msg.kind-director_counsel").count()) > 0
  || bodies.some((b) => /recommend|status|phase|waiting/i.test(b));
checks.stayedOnConversation = /#\/workspaces\//.test(page.url());

await page.screenshot({ path: join(OUT, "v3-4-director-recap.png") });
shots.recap = "v3-4-director-recap.png";

// Refresh preserves
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".ws-msg", { timeout: 45000 });
await page.waitForTimeout(1500);
const after = await page.locator(".ws-msg .ws-msg-body").allTextContents();
checks.refreshKeepsTurns = after.some((b) => b.includes(stamp));

await page.screenshot({ path: join(OUT, "v3-4-after-refresh.png") });
shots.refresh = "v3-4-after-refresh.png";

await page.locator(".ws-context").screenshot({ path: join(OUT, "v3-4-ops-rail.png") }).catch(() => {});
shots.ops = "v3-4-ops-rail.png";

await browser.close();

const report = {
  at: new Date().toISOString(),
  base: BASE,
  missionId: IDENTITY,
  checks,
  timings,
  shots,
  sampleDirector: (reply.directorMessage?.body || "").slice(0, 400),
};
writeFileSync(join(OUT, "v3-4-browser-checks.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const failed = Object.entries(checks).filter(([, v]) => v === false);
if (failed.length) {
  console.error("FAIL", failed);
  process.exit(1);
}
console.log("V3-4 browser certification: ok");
process.exit(0);
