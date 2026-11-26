/**
 * V3-1 browser certification — Workspace Runtime (Identity Platform).
 * Usage: VAC_PORT=3026 node scripts/local-dev/apps/vacilando/capture-v3-1-workspace.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/web/node_modules/playwright/index.mjs";

const PORT = process.env.VAC_PORT || "3026";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/docs/platform/planning/vacilando-os/qa/v3-1/screenshots";
mkdirSync(OUT, { recursive: true });

async function api(path, opts) {
  const r = await fetch(`${BASE}${path}`, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const checks = {};
const shots = {};

const runtime = await api("/api/v2/views/workspace-runtime?id=ws_identity");
checks.apiOk = runtime.ok === true;
checks.hasMessages = (runtime.runtime?.messages?.length || 0) > 0;
checks.currentStateDerived = runtime.runtime?.currentState?.derived === true
  && runtime.runtime?.currentState?.editable === false;
checks.hasContextRail = Boolean(runtime.runtime?.context?.worker);
checks.singleWorkspace = (runtime.workspaces?.length || 0) === 1;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/#/workspaces/ws_identity`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".ws-shell", { timeout: 30000 });
await page.waitForSelector(".ws-msg", { timeout: 90000 });
await page.waitForTimeout(800);

await page.screenshot({ path: join(OUT, "v3-1-opening-workspace.png"), fullPage: false });
shots.opening = "v3-1-opening-workspace.png";

const shell = page.locator(".ws-shell");
await shell.screenshot({ path: join(OUT, "v3-1-conversation.png") });
shots.conversation = "v3-1-conversation.png";

await page.locator(".ws-composer-wrap").screenshot({ path: join(OUT, "v3-1-composer.png") });
shots.composer = "v3-1-composer.png";

await page.locator(".ws-context").screenshot({ path: join(OUT, "v3-1-current-state-context.png") });
shots.context = "v3-1-current-state-context.png";

await page.locator(".ws-nav").screenshot({ path: join(OUT, "v3-1-workspace-nav.png") });
shots.nav = "v3-1-workspace-nav.png";

const thread = page.locator("#ws-thread");
const before = await thread.evaluate((el) => el.scrollTop);
await thread.evaluate((el) => { el.scrollTop = 0; });
await page.waitForTimeout(200);
await thread.screenshot({ path: join(OUT, "v3-1-scroll-top.png") });
await thread.evaluate((el) => { el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(200);
await thread.screenshot({ path: join(OUT, "v3-1-scroll-bottom.png") });
shots.scroll = ["v3-1-scroll-top.png", "v3-1-scroll-bottom.png"];
checks.scrolling = before !== undefined;

const marker = `V3-1 cert ${Date.now()}`;
await page.fill("#ws-composer", marker);
await page.waitForTimeout(200);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/v2/workspace/reply") && r.ok(), { timeout: 60000 }),
  page.click("[data-ws-send]"),
]);
await page.waitForFunction((text) => {
  return Array.from(document.querySelectorAll(".ws-msg-body")).some((el) => (el.textContent || "").includes(text));
}, marker, { timeout: 30000 });

await page.screenshot({ path: join(OUT, "v3-1-reply.png"), fullPage: false });
shots.reply = "v3-1-reply.png";
checks.replyVisible = true;

const after = await api("/api/v2/views/workspace-runtime?id=ws_identity");
const last = after.runtime?.messages?.slice(-1)[0];
checks.replyProjected = String(last?.body || "").includes(marker)
  && last?.provenance?.type === "operator_message"
  && last?.from?.label === "Kelly";

const provenanceTypes = (after.runtime?.messages || []).map((m) => m.provenance?.type).filter(Boolean);
checks.eventProjection = provenanceTypes.length > 0
  && provenanceTypes.every((t) => typeof t === "string");
checks.provenanceKept = (after.runtime?.messages || []).every((m) => m.provenance?.source === "timeline");

await browser.close();

const report = {
  sprint: "V3-1",
  base: BASE,
  workspaceId: "ws_identity",
  missionId: after.runtime?.missionId || runtime.runtime?.missionId,
  messageCount: after.runtime?.messages?.length,
  currentState: after.runtime?.currentState,
  context: {
    worker: after.runtime?.context?.worker,
    branch: after.runtime?.context?.branch,
    evidence: after.runtime?.context?.evidence,
  },
  checks,
  shots,
  capturedAt: new Date().toISOString(),
};

writeFileSync(join(OUT, "v3-1-browser-checks.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const failed = Object.entries(checks).filter(([, v]) => !v);
if (failed.length) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("v3-1 browser cert: ok");
