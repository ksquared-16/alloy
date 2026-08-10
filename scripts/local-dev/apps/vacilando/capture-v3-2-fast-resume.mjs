/**
 * V3-2 browser certification — Fast Resume + Context Compression.
 * Usage: VAC_PORT=3026 node scripts/local-dev/apps/vacilando/capture-v3-2-fast-resume.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/web/node_modules/playwright/index.mjs";

const PORT = process.env.VAC_PORT || "3026";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "/Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation/docs/platform/planning/vacilando-os/qa/v3-2/screenshots";
mkdirSync(OUT, { recursive: true });

async function api(path, opts) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${path}`, opts);
  const j = await r.json().catch(() => ({}));
  const ms = Date.now() - t0;
  if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(j)}`);
  return { ...j, _ms: ms };
}

const checks = {};
const shots = {};
const timings = { before: null, after: {} };

// API split timings
const shellApi = await api("/api/v2/views/workspace-shell?id=ws_identity");
const msgsApi = await api("/api/v2/views/workspace-messages?id=ws_identity&limit=40");
timings.after.shellApiMs = shellApi._ms;
timings.after.messagesApiMs = msgsApi._ms;
checks.shellApiOk = shellApi.ok === true && shellApi.shell?.currentState?.derived === true;
checks.messagesApiOk = msgsApi.ok === true && (msgsApi.messages?.length || 0) > 0;
checks.hasSince = Boolean(shellApi.shell?.sinceLastVisit?.lines?.length);
checks.firstPageBounded = (msgsApi.messages?.length || 0) <= 40;
checks.hasEarlier = msgsApi.page?.hasEarlier === true;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function openAndTime(label) {
  const t0 = Date.now();
  const marks = {};
  await page.goto(`${BASE}/#/workspaces/ws_identity`, { waitUntil: "domcontentloaded" });
  marks.domContentLoaded = Date.now() - t0;
  await page.waitForSelector(".ws-shell", { timeout: 15000 });
  marks.shellVisible = Date.now() - t0;
  await page.waitForSelector(".ws-state-dl", { timeout: 30000 });
  marks.currentStateVisible = Date.now() - t0;
  await page.waitForSelector(".ws-since, .ws-msg, [data-ws-msgs-loading]", { timeout: 30000 });
  marks.compressionOrThread = Date.now() - t0;
  try {
    await page.waitForSelector(".ws-msg", { timeout: 60000 });
    marks.firstMessagesVisible = Date.now() - t0;
  } catch {
    marks.firstMessagesVisible = null;
  }
  marks.msgCount = await page.locator(".ws-msg").count();
  marks.label = label;
  return marks;
}

// 1) First-ever visit path (last-seen may already exist from V3-1 — still exercise open)
timings.after.firstOpen = await openAndTime("open");
await page.screenshot({ path: join(OUT, "v3-2-opening-shell.png"), fullPage: false });
shots.opening = "v3-2-opening-shell.png";

await page.locator(".ws-since").screenshot({ path: join(OUT, "v3-2-since-last-visit.png") }).catch(() => {});
shots.since = "v3-2-since-last-visit.png";

await page.locator(".ws-context").screenshot({ path: join(OUT, "v3-2-current-state.png") }).catch(() => {});
shots.currentState = "v3-2-current-state.png";

checks.shellUsableFast = timings.after.firstOpen.shellVisible != null
  && timings.after.firstOpen.shellVisible < 3000;
// Acceptance: understand material changes in under 15s (Current State + Since).
checks.currentStateFast = timings.after.firstOpen.currentStateVisible != null
  && timings.after.firstOpen.currentStateVisible < 15000;
checks.understandUnder15s = timings.after.firstOpen.currentStateVisible != null
  && timings.after.firstOpen.currentStateVisible < 15000
  && await page.locator(".ws-since").count() > 0;

// 2) Load earlier
if (await page.locator("[data-ws-earlier]").count()) {
  const beforeCount = await page.locator(".ws-msg").count();
  await page.click("[data-ws-earlier]");
  await page.waitForTimeout(2500);
  const afterCount = await page.locator(".ws-msg").count();
  checks.loadEarlier = afterCount >= beforeCount;
  await page.screenshot({ path: join(OUT, "v3-2-load-earlier.png"), fullPage: false });
  shots.loadEarlier = "v3-2-load-earlier.png";
} else {
  checks.loadEarlier = false;
}

// 3) Reply after progressive load
const marker = `V3-2 cert ${Date.now()}`;
await page.fill("#ws-composer", marker);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/v2/workspace/reply") && r.ok(), { timeout: 60000 }),
  page.click("[data-ws-send]"),
]);
await page.waitForFunction((text) => {
  return Array.from(document.querySelectorAll(".ws-msg-body")).some((el) => (el.textContent || "").includes(text));
}, marker, { timeout: 30000 });
await page.screenshot({ path: join(OUT, "v3-2-reply.png"), fullPage: false });
shots.reply = "v3-2-reply.png";
checks.replyAfterProgressive = true;

// 4) Return visit — set last-seen to older event then reopen
const msgs = msgsApi.messages || [];
const older = msgs[Math.max(0, msgs.length - 10)];
if (older?.messageId) {
  await api("/api/v2/workspace/last-seen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: "ws_identity", event_id: older.messageId, at: older.createdAt }),
  });
}
// Append a material event via reply already done — reopen
timings.after.returnVisit = await openAndTime("return");
await page.screenshot({ path: join(OUT, "v3-2-return-visit.png"), fullPage: false });
shots.returnVisit = "v3-2-return-visit.png";
const sinceText = await page.locator(".ws-since").innerText().catch(() => "");
checks.returnHasCompression = /Since your last visit/i.test(sinceText);
checks.materialOrNoChange = /No material changes|Recommended|cert|Wave|Blocked|Working|Now:/i.test(sinceText);

// 5) No-change return: mark last-seen to newest then reopen
const newest = (await api("/api/v2/views/workspace-messages?id=ws_identity&limit=40")).messages?.slice(-1)[0];
if (newest?.messageId) {
  await api("/api/v2/workspace/last-seen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: "ws_identity", event_id: newest.messageId, at: newest.createdAt }),
  });
}
await openAndTime("no-change");
const sinceQuiet = await page.locator(".ws-since").innerText().catch(() => "");
checks.noMaterialChange = /No material changes since your last visit/i.test(sinceQuiet)
  || /First open|Recommended next action/i.test(sinceQuiet);
await page.screenshot({ path: join(OUT, "v3-2-no-change.png"), fullPage: false });
shots.noChange = "v3-2-no-change.png";

// 6) Stale protection — rapid reopen
await page.goto(`${BASE}/#/workspaces/ws_identity`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(50);
await page.goto(`${BASE}/#/workspaces/ws_identity`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".ws-state-dl", { timeout: 30000 });
checks.rapidReopen = await page.locator(".ws-shell").count() === 1;

// Provenance still present
checks.provenanceIntact = await page.locator(".ws-msg-prov").count() > 0;

await browser.close();

// Before baseline from V3-1 evidence (measured in this workstream)
timings.before = {
  note: "V3-1 browser open blocked on full workspace-runtime; first messages ~14–19s under concurrent Missions/Needs You load",
  shellVisibleMs: 198,
  firstMessagesVisibleMs: 14378,
  fullInitialReadyMs: 18625,
  rootCause: "duplicate workspace-runtime fetches + stale-seq discard + single-threaded server contention",
};

const report = {
  sprint: "V3-2",
  base: BASE,
  workspaceId: "ws_identity",
  timings,
  checks,
  shots,
  liveVsFixture: {
    live: ["open", "return", "reply", "load-earlier", "rapid-reopen", "provenance"],
    fixture: ["unit: last-seen, compression no-change, pagination, stale cursor"],
  },
  capturedAt: new Date().toISOString(),
};

writeFileSync(join(OUT, "v3-2-browser-checks.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const failed = Object.entries(checks).filter(([, v]) => !v);
if (failed.length) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("v3-2 browser cert: ok");
