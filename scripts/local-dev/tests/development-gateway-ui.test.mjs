#!/usr/bin/env node
/**
 * Gateway V2 Slice 4 — Development Gateway UI helpers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DESKTOP_MIN_PX,
  GATEWAY_HOME,
  LIST_POLL_MS,
  MOBILE_MAX_PX,
  OUTPUT_BURST_POLL_MS,
  OUTPUT_BURST_WINDOW_MS,
  OUTPUT_POLL_MS,
  TELEMETRY_POLL_MS,
  applyFetchedLane,
  applyFetchedOutput,
  outputIsOlder,
  canonicalLaneWorkState,
  sortLanesForIndex,
  gitListState,
  outputBelongsToLane,
  outputBodyText,
  claudeRunStatus,
  contextRefreshStatus,
  contextCompact,
  renderClaudeRunStatus,
  sessionRefreshErrorText,
  buildSendBody,
  copyableOutputText,
  defaultGatewayHash,
  deliveryErrorText,
  deliveryNotice,
  deriveLaneStatus,
  executionRunListHint,
  deriveLaneExecutionPosture,
  isGovernedDirectorWait,
  detailViewKind,
  gitLine,
  isGatewayRoute,
  isPrimaryGatewayHash,
  knownLane,
  laneDetailHash,
  laneMatchesId,
  lastInstructionMeta,
  machineLine,
  notificationClickHash,
  notificationEvent,
  notificationUiState,
  renderNotificationControls,
  outputPollIntervalMs,
  parseGatewayHash,
  presenceLine,
  railHtml,
  renderConnectFlow,
  renderCreateLaneFlow,
  renderCopyControl,
  renderGatewayShell,
  renderLaneList,
  renderLastInstruction,
  renderLaneSessionCallout,
  renderComposer,
  renderCurrentWork,
  renderPreviousWork,
  renderLaneRuntimeControls,
  renderExecutionCapacity,
  summarizeExecutionCapacity,
  renderDevelopmentResources,
  renderOutput,
  outputReviewHint,
  renderOutputChrome,
  renderRecentSystemActivity,
  renderStatus,
  sendPayload,
  shouldPollList,
  shouldPollOutput,
  statusOpenDefault,
  statusSummaryLine,
  writeViewed,
  readViewed,
} from "../apps/vacilando/public/gateway-view.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "../apps/vacilando/public/styles.css"), "utf8");
const viewSrc = readFileSync(join(HERE, "../apps/vacilando/public/gateway-view.mjs"), "utf8");
const gwSrc = readFileSync(join(HERE, "../apps/vacilando/public/gateway.js"), "utf8");
const appSrc = readFileSync(join(HERE, "../apps/vacilando/public/app.js"), "utf8");
const htmlSrc = readFileSync(join(HERE, "../apps/vacilando/public/index.html"), "utf8");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

const identity = {
  lane_id: "alloy-identity",
  label: "Access Identity V2",
  slot: null,
  claude: { presence: "present" },
  tmux: { alive: true, session: "alloy-identity", attached: false },
  git: { branch: "agent/claude/1-access-identity-v2", state: "clean", ahead: 45, behind: 0 },
  worktree: { name: "wt1-access-identity-v2", path: "/x/wt1-access-identity-v2", managed: true },
  last_activity_ms: Date.now() - 180000,
};

await test("lane list renders API lane objects", () => {
  const html = renderLaneList([identity], null);
  assert.match(html, /Access Identity V2/);
  assert.match(html, /Claude/);
  assert.match(html, /Ready/);
  assert.equal(html.includes("slot 1"), false);
  assert.equal(html.includes("Clean · ↑45 · ↓0"), false);
});

await test("slot: null lane renders normally", () => {
  const html = renderGatewayShell({ lanes: [identity], selectedId: "alloy-identity", lane: identity, outputText: "hi" });
  assert.match(html, /Access Identity V2/);
  assert.equal(/<dt>Slot<\/dt>/.test(html), false);
  assert.match(railHtml([identity], "alloy-identity"), /Access Identity V2/);
  assert.match(railHtml([identity], "alloy-identity"), /data-gw-lane="alloy-identity"/);
});

await test("selecting a lane opens the correct detail hash", () => {
  assert.equal(laneDetailHash("alloy-identity"), "#/lanes/alloy-identity");
  const html = renderLaneList([identity], "alloy-identity");
  assert.match(html, /gw-lane is-active/);
  assert.match(html, /href="#\/lanes\/alloy-identity"/);
  const loading = renderGatewayShell({
    lanes: [identity],
    selectedId: "alloy-identity",
    lane: null,
    loading: true,
    outputText: "",
  });
  assert.match(loading, /Loading lane/);
  assert.equal(loading.includes("Session unavailable"), false);
  assert.equal(loading.includes("Lane unavailable"), false);
});

await test("list and detail share one lane_id existence contract", () => {
  assert.deepEqual(parseGatewayHash("#/lanes/alloy-identity"), { name: "lanes", sub: "alloy-identity" });
  assert.deepEqual(parseGatewayHash("#/lanes/alloy-identity?_=1"), { name: "lanes", sub: "alloy-identity" });
  assert.equal(parseGatewayHash("#/lanes").sub, null);
  assert.equal(detailViewKind({ selectedId: "alloy-identity", lanes: [identity], lane: null, loading: true, listReady: false }), "loading");
  assert.equal(detailViewKind({ selectedId: "alloy-identity", lanes: [identity], lane: null, loading: false, listReady: true }), "load_error");
  assert.equal(detailViewKind({ selectedId: "alloy-identity", lanes: [identity], lane: identity, loading: false, listReady: true }), "detail");
  assert.equal(detailViewKind({ selectedId: "alloy-identity", lanes: [], lane: null, loading: false, listReady: true }), "missing");
  assert.equal(detailViewKind({ selectedId: "alloy-identity", lanes: [identity], lane: null, loading: false, listReady: false }), "loading");
  const listedNotInspected = renderGatewayShell({
    lanes: [identity],
    selectedId: "alloy-identity",
    lane: null,
    loading: false,
    listReady: true,
  });
  assert.equal(listedNotInspected.includes("Lane unavailable"), false);
  assert.match(listedNotInspected, /Lane not loaded|Loading lane/);
  const missing = renderGatewayShell({
    lanes: [identity],
    selectedId: "alloy-missing",
    lane: null,
    loading: false,
    listReady: true,
  });
  assert.match(missing, /Lane unavailable/);
  assert.match(missing, /could not be resolved/);
  assert.match(missing, /href="#\/lanes"/);
});

await test("output renders as raw preformatted terminal text", () => {
  const raw = "❯ prompt\n⏺ VACILANDO_GATEWAY_V2_RECEIVED\nauto mode on";
  const html = renderOutput(raw);
  assert.match(html, /<pre class="gw-output"/);
  assert.match(html, /❯ prompt/);
  assert.match(html, /⏺ VACILANDO_GATEWAY_V2_RECEIVED/);
  assert.equal(html.includes("gw-msg"), false);
  assert.equal(html.includes("chat-bubble"), false);
  assert.equal((html.match(/<pre /g) || []).length, 1);
});

await test("no fake chat parsing of TUI chrome", () => {
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: "❯ hello\n⏺ world",
  });
  assert.equal(html.includes("data-role=\"assistant\""), false);
  assert.equal(html.includes("Working"), false);
  assert.equal(html.includes("Waiting"), false);
  assert.match(html, /Claude connected/);
  assert.match(html, /<pre class="gw-output"/);
});

await test("composer send payload is lane_id + instruction, and may include provider", () => {
  const body = buildSendBody("hello `code`; $HOME");
  assert.deepEqual(Object.keys(body), ["instruction"]);
  const withProvider = buildSendBody("hello", { provider: "cursor" });
  assert.deepEqual(Object.keys(withProvider).sort(), ["instruction", "provider"]);
  assert.equal(withProvider.provider, "cursor");
  const payload = sendPayload("alloy-identity", "hello `code`; $HOME");
  assert.deepEqual(Object.keys(payload).sort(), ["instruction", "lane_id"]);
  assert.equal(payload.lane_id, "alloy-identity");
  assert.equal("session" in payload, false);
  assert.equal("pane" in payload, false);
  assert.equal("target" in payload, false);
  assert.match(gwSrc, /buildSendBody\(instruction/);
  assert.equal(gwSrc.includes("send-keys"), false);
});

await test("composer handles delivery success without claiming a Claude reply", () => {
  const n = deliveryNotice({ ok: true, status: "delivered" });
  assert.equal(n.kind, "ok");
  assert.match(n.text, /Delivered/);
  assert.equal(/responded/i.test(n.text), false);
});

await test("composer handles failure/refusal", () => {
  assert.match(deliveryErrorText("delivery_failed"), /not submitted/);
  assert.match(deliveryErrorText("pane_unavailable"), /unavailable/);
  const n = deliveryNotice({ ok: false, error: "target_mismatch" });
  assert.equal(n.kind, "err");
});

await test("duplicate and in-flight refusals are understandable", () => {
  assert.match(deliveryErrorText("duplicate_send"), /just sent/i);
  assert.match(deliveryErrorText("send_in_progress"), /already in progress/i);
});

await test("desktop layout uses a wide multi-column gateway grid", () => {
  assert.equal(DESKTOP_MIN_PX > MOBILE_MAX_PX, true);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 248px/);
  assert.match(css, /@media \(max-width:1180px\)/);
});

await test("mobile layout collapses to a single column without forcing horizontal scroll", () => {
  assert.match(css, /@media \(max-width:860px\)/);
  assert.match(css, /\.app\{grid-template-columns:1fr;\}/);
  assert.match(css, /\.rail\{display:none;\}/);
  assert.match(css, /\.gw\.is-detail \.gw-lanes\{display:none;\}/);
  assert.match(css, /\.gw-output\{[^}]*max-height:none/);
  assert.match(css, /\.gw:not\(\.is-detail\) \.gw-main-empty\{display:none;\}/);
  assert.match(css, /white-space:pre-wrap/);
  assert.match(css, /overflow-wrap:anywhere/);
  const html = renderGatewayShell({ lanes: [identity], selectedId: identity.lane_id, lane: identity, outputText: "x".repeat(400) });
  assert.match(html, /gw-back/);
  assert.match(html, /gw-composer/);
  assert.match(html, /gw-composer-provider/);
  assert.match(html, />Claude</);
  assert.match(html, />Cursor</);
  assert.match(html, /data-gw-notify/);
});

await test("old Mission Director is not the default primary experience", () => {
  assert.equal(defaultGatewayHash(), "#/lanes");
  assert.equal(GATEWAY_HOME, "#/lanes");
  assert.equal(isGatewayRoute("lanes"), true);
  assert.equal(isGatewayRoute("missions"), false);
  assert.equal(isPrimaryGatewayHash(""), true);
  assert.equal(isPrimaryGatewayHash("#/lanes/alloy-identity"), true);
  assert.match(htmlSrc, /Development Gateway/);
  assert.equal(htmlSrc.includes("Vacilando<b>OS</b>"), false);
  assert.equal(htmlSrc.includes("Engineering Operating System"), false);
  assert.match(appSrc, /name: p\[0\] \|\| "lanes"/);
  assert.match(appSrc, /location\.hash = GATEWAY_HOME/);
  assert.match(htmlSrc, /Missions \(legacy\)/);
  assert.match(htmlSrc, /manifest\.webmanifest/);
  assert.match(htmlSrc, /apple-touch-icon/);
  assert.match(htmlSrc, /viewport-fit=cover/);
  assert.match(htmlSrc, /apple-mobile-web-app-capable/);
});

await test("resource/status calls do not introduce expensive polling fan-out", () => {
  assert.equal(OUTPUT_POLL_MS >= 8000, true);
  assert.match(gwSrc, /outInflight/);
  assert.match(gwSrc, /listInflight/);
  assert.equal(LIST_POLL_MS >= 15000, true);
  assert.equal(TELEMETRY_POLL_MS >= 15000, true);
  assert.equal(viewSrc.includes('fetch("/api/resources")'), false);
  assert.equal(viewSrc.includes('fetch("/api/state")'), false);
  assert.equal(gwSrc.includes('fetch("/api/resources")'), false);
  assert.equal(gwSrc.includes('fetch("/api/state")'), false);
  assert.match(appSrc, /if \(parseRoute\(\)\.name === "lanes"\)/);
  assert.equal(shouldPollOutput({ hidden: true, routeName: "lanes", laneId: "alloy-identity" }), false);
  assert.equal(shouldPollOutput({ hidden: false, routeName: "lanes", laneId: "alloy-identity" }), true);
  assert.equal(shouldPollList({ hidden: false, routeName: "missions" }), false);
  assert.equal(machineLine({ overall: { running_servers: 0, slots: { pressure: "ok" } } }), "No local app server · Machine healthy");
  assert.match(presenceLine(identity), /Claude connected/);
  assert.match(gitLine(identity.git), /Clean · ↑45 · ↓0/);
});

await test("login overlay is pasteable and submits without a password field", () => {
  assert.match(htmlSrc, /id="gw-login"/);
  assert.match(htmlSrc, /data-gw-login/);
  assert.match(htmlSrc, /id="gw-token"/);
  assert.match(htmlSrc, /type="text"/);
  assert.equal(htmlSrc.includes('id="gw-token"') && /id="gw-token"[^>]*type="password"/.test(htmlSrc), false);
  assert.match(htmlSrc, /data-gw-login-submit/);
  assert.match(htmlSrc, /type="submit"/);
  assert.match(css, /\.gw-login\{[^}]*z-index:400/);
  assert.match(css, /\.gw-login\[hidden\]\{display:none !important;\}/);
  assert.match(gwSrc, /\/api\/gateway\/session/);
  assert.match(gwSrc, /submitGatewayLogin/);
  assert.match(gwSrc, /stopImmediatePropagation/);
  assert.match(gwSrc, /That token was refused/);
  assert.equal(gwSrc.includes("input.disabled = true"), false);
  assert.match(appSrc, /if \(e\.target\.closest\("#gw-login"\)\) return;/);
});

await test("selecting a known lane commits identity immediately", () => {
  assert.equal(knownLane([identity], "alloy-identity")?.label, "Access Identity V2");
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: "alloy-identity",
    lane: identity,
    outputText: "",
    outputPending: true,
    listReady: true,
    loading: false,
  });
  assert.match(html, /Access Identity V2/);
  assert.equal(html.includes("Loading lane"), false);
  assert.equal(html.includes("data-gw-loading"), false);
  assert.match(html, /Refreshing output/);
  assert.match(html, /data-gw-output-pending/);
  assert.match(gwSrc, /commitKnownLane/);
});

await test("output hydrates separately from lane identity", () => {
  const pending = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: "",
    outputPending: true,
    listReady: true,
  });
  assert.match(pending, /gw-chat-title/);
  assert.match(pending, /gw-aside-id/);
  assert.match(pending, /Refreshing output/);
  const ready = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: "visible pane",
    outputPending: false,
    listReady: true,
  });
  assert.match(ready, /visible pane/);
  assert.equal(ready.includes("Refreshing output"), false);
});

await test("stale detail cannot replace a newer selected lane", () => {
  const current = { lane_id: "alloy-b", label: "B" };
  const stale = { lane_id: "alloy-a", label: "A" };
  assert.deepEqual(applyFetchedLane("alloy-b", "alloy-a", current, stale), current);
  assert.deepEqual(applyFetchedLane("alloy-a", "alloy-a", current, stale), stale);
  assert.match(gwSrc, /applyFetchedLane\(G\.selected, next\?\.lane_id \|\| id, G\.lane/);
  assert.match(gwSrc, /applyFetchedOutput\(G\.selected, id, G\.output/);
  assert.deepEqual(applyFetchedOutput("alloy-comms", "lane_abc", null, { lane_id: "alloy-comms", text: "hi" }), { lane_id: "alloy-comms", text: "hi" });
  assert.deepEqual(applyFetchedOutput("alloy-b", "alloy-a", { lane_id: "alloy-b" }, { lane_id: "alloy-a" }), { lane_id: "alloy-b" });
  const lane = { lane_id: "alloy-comms", aliases: ["lane_abc"] };
  assert.equal(outputBelongsToLane({ lane_id: "alloy-comms" }, "lane_abc", lane), true);
  assert.equal(outputBelongsToLane({ lane_id: "alloy-other" }, "lane_abc", lane), false);
});

await test("direct deep-link still works", () => {
  assert.deepEqual(parseGatewayHash("#/lanes/alloy-identity"), { name: "lanes", sub: "alloy-identity" });
  const cold = renderGatewayShell({
    lanes: [],
    selectedId: "alloy-identity",
    lane: null,
    loading: true,
    listReady: false,
  });
  assert.match(cold, /Loading lane/);
  assert.match(cold, /data-gw-loading/);
});

await test("send target still re-resolves authoritatively", () => {
  assert.match(gwSrc, /\/api\/lanes\/\$\{encodeURIComponent\(id\)\}\/instruction/);
  assert.deepEqual(Object.keys(buildSendBody("x")), ["instruction"]);
  assert.equal(gwSrc.includes("tmux_target"), false);
  assert.equal(gwSrc.includes("pane_id"), false);
});

await test("successful send records latest instruction; failed send does not", () => {
  const rec = {
    instruction: "Reconcile the remaining Access & Identity tests.",
    delivered_at: new Date(Date.now() - 120000).toISOString(),
    status: "delivered",
    instruction_size: 40,
  };
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: "ok",
    lastInstruction: rec,
    listReady: true,
  });
  assert.match(html, />You</);
  assert.match(html, /data-gw-thread[\s\S]*data-gw-last/);
  assert.match(html, /Reconcile the remaining Access/);
  assert.match(html, /Delivered/);
  const failed = renderLastInstruction({ instruction: "nope", status: "failed" });
  assert.equal(failed, "");
  const queued = renderLastInstruction({
    instruction: "resume closure",
    status: "queued",
    queued_at: "2026-08-22T00:44:08.360Z",
  });
  assert.match(queued, />You</);
  assert.match(queued, /resume closure/);
  assert.match(queued, /Queued/);
  assert.match(gwSrc, /result\?\.ok && \(result\.status === "delivered" \|\| result\.status === "queued"\)/);
  assert.match(gwSrc, /last_instruction/);
});

await test("latest instruction is lane-scoped and bounded", () => {
  const a = { ...identity, last_instruction: { instruction: "only A", status: "delivered", delivered_at: new Date().toISOString() } };
  const b = { ...identity, lane_id: "alloy-other", label: "Other", last_instruction: { instruction: "only B", status: "delivered", delivered_at: new Date().toISOString() } };
  const htmlA = renderGatewayShell({ lanes: [a, b], selectedId: "alloy-identity", lane: a, lastInstruction: a.last_instruction, outputText: "x", listReady: true });
  assert.match(htmlA, /only A/);
  assert.equal(htmlA.includes("only B"), false);
  assert.match(lastInstructionMeta(a.last_instruction) || "", /Delivered/);
});

await test("activity after send uses output fingerprint, not TUI chrome", () => {
  const last = { instruction: "go", status: "delivered", delivered_at: new Date().toISOString(), output_fingerprint_at_send: "aaa111" };
  const after = deriveLaneStatus({
    lane: identity,
    output: { ok: true, fingerprint: "bbb222", captured_at: new Date().toISOString() },
    lastInstruction: last,
    viewing: true,
  });
  assert.equal(after.activity, "after_instruction");
  assert.match(after.headline, /activity after your instruction/);
  assert.equal(/working/i.test(after.headline), false);
  assert.equal(/waiting/i.test(after.headline), false);

  const unchanged = deriveLaneStatus({
    lane: identity,
    output: { ok: true, fingerprint: "aaa111", captured_at: new Date().toISOString() },
    lastInstruction: last,
    viewing: true,
  });
  assert.equal(unchanged.activity, "output_updated");
  assert.equal(unchanged.activity === "after_instruction", false);

  const dead = deriveLaneStatus({
    lane: { ...identity, tmux: { ...identity.tmux, alive: false }, claude: { presence: "absent" } },
  });
  assert.equal(dead.session, "unavailable");
  assert.match(dead.headline, /unavailable/i);

  const start = viewSrc.indexOf("export function deriveLaneStatus");
  const end = viewSrc.indexOf("export function notificationEvent");
  const fn = viewSrc.slice(start, end).replace("Does not parse TUI chrome (❯ / ⏺) and does not claim Working / Waiting.", "");
  assert.equal(/❯|⏺/.test(fn), false);
  assert.equal(/Working|Waiting/.test(fn), false);
});

await test("viewed / new-output attention behaves correctly", () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, v); },
  };
  writeViewed("alloy-identity", { fingerprint: "old", activity_ms: 1, viewed_at: 1 }, storage);
  assert.equal(readViewed("alloy-identity", storage).fingerprint, "old");
  const unseen = deriveLaneStatus({
    lane: identity,
    output: { ok: true, fingerprint: "new" },
    lastInstruction: { instruction: "x", status: "delivered", delivered_at: new Date().toISOString(), output_fingerprint_at_send: "old" },
    viewed: { fingerprint: "old", activity_ms: 1 },
    viewing: false,
  });
  assert.equal(unseen.attention, "new_output");
  assert.equal(unseen.listHint, "New output");
  const looking = deriveLaneStatus({
    lane: identity,
    output: { ok: true, fingerprint: "new" },
    viewed: { fingerprint: "old" },
    viewing: true,
  });
  assert.equal(looking.attention, "none");
  const html = renderLaneList([identity], null, { attentionByLane: { "alloy-identity": unseen } });
  assert.match(html, /New output/);
  const ev = notificationEvent({
    status: unseen,
    viewingSelected: false,
    lastInstruction: { instruction: "x", status: "delivered" },
    laneLabel: "Access Identity V2",
  });
  assert.equal(ev.type, "lane_unseen_after_instruction");
  assert.equal(ev.body, "New Claude output is available.");
  assert.equal(ev.title, "Access Identity V2");
  assert.equal(notificationEvent({ status: unseen, viewingSelected: true, lastInstruction: { instruction: "x" } }), null);
});

await test("Development Status collapse/expand and mobile compact default", () => {
  assert.equal(statusOpenDefault({ widthPx: 390 }), false);
  assert.equal(statusOpenDefault({ widthPx: 1440 }), true);
  assert.equal(statusOpenDefault({ widthPx: 390, stored: "open" }), true);
  const closed = renderStatus(identity, null, { open: false, summary: statusSummaryLine(identity) });
  assert.match(closed, /<details class="gw-status"/);
  assert.equal(/\sopen/.test(closed), false);
  assert.match(closed, /Clean · ↑45 · ↓0/);
  const opened = renderStatus(identity, null, { open: true });
  assert.match(opened, / open/);
  assert.match(opened, /wt1-access-identity-v2/);
  const shell = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: "pane",
    lastInstruction: { instruction: "keep me", status: "delivered", delivered_at: new Date().toISOString() },
    statusOpen: false,
    listReady: true,
  });
  assert.match(shell, /data-gw-output/);
  assert.match(shell, /gw-composer/);
  assert.match(shell, /keep me/);
  assert.match(css, /max-height:none/);
});

await test("post-send burst polling does not raise idle cadence or fan out", () => {
  assert.equal(OUTPUT_POLL_MS >= 8000, true);
  assert.equal(OUTPUT_BURST_POLL_MS >= 1500, true);
  assert.equal(OUTPUT_BURST_WINDOW_MS <= 30000, true);
  assert.equal(outputPollIntervalMs({ burstUntil: 0, nowMs: 50_000 }), OUTPUT_POLL_MS);
  assert.equal(outputPollIntervalMs({ burstUntil: 60_000, nowMs: 50_000 }), OUTPUT_BURST_POLL_MS);
  assert.match(gwSrc, /burstUntil/);
  assert.equal(gwSrc.includes("/api/lanes/") && /for \(.*lanes.*output/.test(gwSrc), false);
  assert.equal((gwSrc.match(/\/output/g) || []).length >= 1, true);
});

const tel = {
  available: true,
  lane_id: "alloy-identity",
  provider: "claude",
  agent: { session_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", model: "claude-opus-5", started_at: "2026-08-17T10:00:00.000Z" },
  context: { used_tokens: 412000, max_tokens: 1000000, percent_used: 41 },
  usage: { input_tokens: 12, output_tokens: 1800, cache_read_tokens: 50000, cache_write_tokens: 900 },
  cost: { reported_usd: null, estimated_usd: null, billing_mode: "claude_max_subscription" },
};

await test("telemetry does not block instant lane shell", () => {
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: "",
    outputPending: true,
    listReady: true,
    loading: false,
  });
  assert.match(html, /Access Identity V2/);
  assert.equal(html.includes("data-gw-loading"), false);
  assert.equal(html.includes("data-gw-context"), false);
  assert.match(gwSrc, /fetchTelemetry\(hydrateId\)/);
  assert.equal(/Promise\.all\(\[[^\]]*fetchTelemetry/.test(gwSrc), false);
});

await test("context hydrates quietly; mobile status stays compact", () => {
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: "pane",
    telemetry: tel,
    telemetryByLane: { "alloy-identity": tel },
    statusOpen: false,
    listReady: true,
  });
  assert.match(html, /data-gw-context/);
  assert.match(html, /Context 41%/);
  assert.match(html, /claude-opus-5/);
  assert.match(html, /Session cost/);
  assert.match(html, /Not reported · Claude Max subscription/);
  assert.equal(/\$0/.test(html), false);
  const sum = statusSummaryLine(identity, tel);
  assert.match(sum, /Clean · ↑45 · ↓0/);
  assert.match(sum, /Context 41%/);
  assert.equal(sum.includes("Cache read"), false);
  const list = renderLaneList([identity], null, { telemetryByLane: { "alloy-identity": tel } });
  assert.match(list, /Claude/);
  assert.equal(list.includes("Context 41%"), false);
  const closed = renderStatus(identity, null, { open: false, telemetry: tel, summary: sum });
  assert.equal(/\sopen/.test(closed), false);
  assert.match(closed, /Context 41%/);
});

const swSrc = readFileSync(join(HERE, "../apps/vacilando/public/sw.js"), "utf8");

await test("Copy copies active lane output text only", () => {
  const last = { instruction: "do not copy me", status: "delivered", delivered_at: new Date().toISOString() };
  const output = { ok: true, lane_id: "alloy-identity", text: "VISIBLE_PANE_OUTPUT\nline 2" };
  const text = copyableOutputText({ selectedId: "alloy-identity", output, outputText: "stale" });
  assert.equal(text, "VISIBLE_PANE_OUTPUT\nline 2");
  assert.equal(text.includes("do not copy me"), false);
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: { ...identity, last_instruction: last },
    output,
    outputText: output.text,
    lastInstruction: last,
    listReady: true,
  });
  assert.match(html, /VISIBLE_PANE_OUTPUT/);
  assert.match(html, /data-gw-copy/);
  assert.equal(html.includes("do not copy me") && html.includes("data-gw-copy"), true);
  const copyBtn = html.slice(html.indexOf("data-gw-copy") - 80, html.indexOf("data-gw-copy") + 80);
  assert.equal(copyBtn.includes("do not copy me"), false);
  assert.equal(copyBtn.includes("wt1-access-identity"), false);
  assert.equal(copyableOutputText({
    selectedId: "alloy-identity",
    output: { ok: true, lane_id: "alloy-other", text: "OTHER_LANE" },
  }), null);
  assert.equal(copyableOutputText({ selectedId: "alloy-identity", output: { ok: false, lane_id: "alloy-identity", text: "nope" } }), null);
  assert.equal(copyableOutputText({ selectedId: "alloy-identity", output: { ok: true, lane_id: "alloy-identity", text: "   " } }), null);
  const empty = renderCopyControl({ text: null });
  assert.match(empty, /disabled/);
  const copied = renderCopyControl({ text: "x", feedback: "copied" });
  assert.match(copied, />Copied</);
  const failed = renderCopyControl({ text: "x", feedback: "failed" });
  assert.match(failed, /Copy failed/);
  assert.match(gwSrc, /copyActiveOutput/);
  // Copy must yield the COMPLETE assistant response. In "recent" mode the
  // visible text is a bounded pane snapshot, so copying it handed over a
  // fragment; the copy path now fetches the complete text for the SELECTED lane
  // only. It still never re-captures a pane and never touches another lane.
  const copyFn = gwSrc.slice(gwSrc.indexOf("async function completeCopyText"), gwSrc.indexOf("async function registerPushSubscription"));
  assert.equal(copyFn.includes("capture-pane"), false);
  assert.match(copyFn, /copyableOutputText/);
  assert.match(copyFn, /copySourcePlan/);
  assert.match(copyFn, /outputBelongsToLane/);
  assert.match(copyFn, /encodeURIComponent\(id\)/);
  assert.match(copyFn, /const id = G\.selected/);
  assert.equal(copyFn.includes("G.lanes"), false);
  assert.match(css, /\.gw-copy\{[^}]*min-height:44px/);
});

await test("notification permission is never requested automatically on Gateway", () => {
  const before = gwSrc.slice(0, gwSrc.indexOf("async function enableGatewayNotifications"));
  assert.equal(before.includes("requestPermission"), false);
  assert.match(gwSrc.slice(gwSrc.indexOf("async function enableGatewayNotifications")), /requestPermission/);
  assert.match(appSrc, /h\.startsWith\("#\/lanes"\)\) return/);
  const off = notificationUiState({ permission: "default", enabled: false, secureContext: true, standalone: true, isIOS: false });
  assert.equal(off.kind, "off");
  assert.equal(off.action, "enable");
  const blocked = notificationUiState({ permission: "denied", secureContext: true });
  assert.equal(blocked.kind, "blocked");
  const blockedIos = notificationUiState({ permission: "denied", secureContext: true, isIOS: true, standalone: true });
  assert.match(blockedIos.label, /iPhone settings/);
  const https = notificationUiState({ permission: "default", secureContext: false, isIOS: true, standalone: false });
  assert.equal(https.kind, "https");
  assert.match(https.label, /https:\/\//);
  const install = notificationUiState({ permission: "default", secureContext: true, isIOS: true, standalone: false });
  assert.equal(install.kind, "install");
  const on = notificationUiState({ permission: "granted", enabled: true, subscribed: true, secureContext: true, standalone: true, isIOS: false });
  assert.equal(on.kind, "on");
  const partial = notificationUiState({ permission: "granted", enabled: true, subscribed: false, secureContext: true, standalone: true, isIOS: false });
  assert.equal(partial.kind, "needs");
  assert.equal(partial.action, "repair");
  assert.match(partial.label, /not subscribed to the current Vacilando address/);
  const onHtml = renderNotificationControls({ permission: "granted", enabled: true, subscribed: true, secureContext: true, standalone: true, isIOS: false });
  assert.match(onHtml, /Enabled/);
  assert.match(onHtml, /Permission/);
  assert.match(onHtml, /data-gw-notify-test/);
  assert.match(onHtml, /Send test notification/);
  const lie = notificationUiState({ permission: "default", enabled: true, subscribed: true, secureContext: true, standalone: true, isIOS: false });
  assert.notEqual(lie.kind, "on");
  const loopback = notificationUiState({
    permission: "granted", enabled: true, subscribed: true, secureContext: true, standalone: true, isIOS: false,
    originKind: "http_loopback",
  });
  assert.equal(loopback.kind, "origin");
  assert.match(loopback.label, /re-enabled on this device/);
  assert.equal(loopback.action, null);
  const migrate = notificationUiState({
    permission: "granted", enabled: true, subscribed: false, secureContext: true, standalone: true, isIOS: false,
    originKind: "origin_mismatch",
  });
  assert.equal(migrate.kind, "origin");
  assert.equal(migrate.action, "repair");
  const err = notificationUiState({ permission: "granted", enabled: true, subscribed: false, secureContext: true, error: "subscribe_failed" });
  assert.equal(err.kind, "error");
  assert.equal(err.action, "retry");
  assert.equal(notificationClickHash("alloy-identity"), "#/lanes/alloy-identity");
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: "pane",
    listReady: true,
    notify: { permission: "default", enabled: false, secureContext: true, standalone: true, isIOS: false },
  });
  assert.match(html, /data-gw-notify-enable/);
  assert.match(html, /Get notified when managed work completes or needs you/);
  assert.match(html, /<details class="gw-notify"/);
  assert.match(html, /gw-notify-pop/);
  assert.match(html, /gw-notify-sum/);
  assert.match(html, /aria-label="Notifications"/);
  assert.match(html, /gw-aside-body/);
  assert.match(css, /\.gw-notify:hover \.gw-notify-pop/);
  const enableFn = gwSrc.slice(gwSrc.indexOf("async function enableGatewayNotifications"));
  assert.match(gwSrc, /if \(!saved\.ok \|\| body\?\.ok === false\)/);
  assert.equal(/catch[\s\S]*NOTIFY_ENABLED_KEY[\s\S]*subscribed = true/.test(enableFn), false);
  assert.match(gwSrc, /addEventListener\("click", async \(e\) => \{[\s\S]*\}, true\)/);
  assert.match(gwSrc, /\/api\/gateway\/push\/test/);
  assert.match(gwSrc, /origin: location\.origin/);
  assert.equal(swSrc.includes("caches"), false);
  assert.equal(swSrc.includes("cache.put"), false);
  assert.equal(/addEventListener\(\s*["']fetch["']/.test(swSrc), false);
  assert.match(swSrc, /showNotification/);
  assert.match(swSrc, /vacilando-open-lane/);
  assert.match(swSrc, /\/#\/lanes\/\$\{encodeURIComponent\(laneId\)\}/);
  assert.equal(swSrc.includes("api-token"), false);
});

await test("lane list shows current execution run state without becoming a board", () => {
  const executing = { ...identity, execution_run: { state: "EXECUTING", instruction: "Finish Records/Roster" } };
  const needs = { ...identity, lane_id: "alloy-comms", label: "Communications", execution_run: { state: "NEEDS_INPUT", state_reason: "Which ingress?" } };
  const html = renderLaneList([executing, needs], null);
  assert.match(html, /Working/);
  assert.match(html, /Needs input/);
  assert.match(html, /gw-lane-posture is-run/);
  assert.match(html, /gw-lane-posture is-needs/);
  assert.equal(html.includes("Kanban"), false);
  assert.equal(html.includes("% complete"), false);
  assert.equal(executionRunListHint(needs.execution_run), "Needs input");
});

await test("lane detail shows current work; needs input, complete, and failed are obvious", () => {
  const now = Date.parse("2026-08-18T15:18:00.000Z");
  const run = {
    state: "EXECUTING",
    instruction: "Complete the remaining Communications ingress certification",
    started_at: "2026-08-18T15:00:00.000Z",
  };
  const html = renderGatewayShell({
    lanes: [{ ...identity, execution_run: run }],
    selectedId: identity.lane_id,
    lane: { ...identity, execution_run: run },
    outputText: "ok",
    listReady: true,
    nowMs: now,
  });
  assert.match(html, /Current work/);
  assert.match(html, /Complete the remaining Communications ingress/);
  assert.match(html, /Working/);
  assert.match(html, /Started 18m ago/);
  assert.equal(html.includes("%"), false);
  assert.match(html, /data-gw-aside/);
  assert.match(html, /data-gw-stage-status/);
  assert.match(css, /grid-template-columns:minmax\(0, 66fr\) minmax\(0, 33fr\)/);
  assert.equal(css.includes("minmax(240px, 28%)"), false);

  const needHtml = renderCurrentWork({
    state: "NEEDS_INPUT",
    instruction: "Which fixture?",
    state_reason: "Loopback or Tailscale?",
    completion_report: { summary: "Loopback or Tailscale?" },
  });
  assert.match(needHtml, /Needs input/);
  assert.match(needHtml, /is-needs/);
  assert.match(needHtml, /Loopback or Tailscale/);

  const done = renderCurrentWork({
    state: "COMPLETE",
    instruction: "certify",
    completion_report: { summary: "EXECUTION_RUN_CERTIFIED" },
  });
  assert.match(done, /Complete/);
  assert.match(done, /EXECUTION_RUN_CERTIFIED/);
  assert.equal(done.includes("Started"), false);

  const failed = renderCurrentWork({
    state: "FAILED",
    instruction: "certify",
    completion_report: { summary: "delivery_failed" },
  });
  assert.match(failed, /Failed/);
  assert.match(failed, /is-failed/);
  assert.match(failed, /delivery_failed/);
});

await test("lane list shows resource wait and queue position; ready-to-resume is distinct", () => {
  const records = {
    ...identity,
    lane_id: "alloy-records",
    label: "Records / Roster",
    execution_run: {
      state: "WAITING_RESOURCE",
      resource_wait: {
        label: "Browser certification",
        request_state: "GRANTED",
        ready_to_resume: true,
      },
    },
  };
  const comms = {
    ...identity,
    lane_id: "alloy-comms",
    label: "Communications",
    execution_run: {
      state: "WAITING_RESOURCE",
      resource_wait: {
        label: "Browser certification",
        request_state: "QUEUED",
        queue_position: 1,
        ready_to_resume: false,
      },
    },
  };
  const runtime = {
    ...identity,
    lane_id: "alloy-runtime",
    label: "Runtime Performance",
    execution_run: {
      state: "WAITING_RESOURCE",
      resource_wait: {
        label: "Exclusive machine timing",
        request_state: "QUEUED",
        queue_position: 1,
        ready_to_resume: false,
      },
    },
  };
  const html = renderLaneList([records, comms, runtime], null);
  assert.match(html, /Ready to resume/);
  assert.match(html, /Waiting for Browser certification/);
  assert.match(html, /#1 in queue/);
  assert.match(html, /Waiting for Exclusive machine timing/);
  assert.match(html, /gw-lane-posture is-ready/);
  assert.equal(html.includes("% complete"), false);
  assert.equal(executionRunListHint(records.execution_run), "Ready to resume");
});

await test("lane detail distinguishes waiting vs resource available / ready to resume", () => {
  const waiting = renderCurrentWork({
    state: "WAITING_RESOURCE",
    instruction: "Communications ingress certification",
    resource_wait: {
      label: "Browser certification",
      queue_position: 1,
      ready_to_resume: false,
    },
  });
  assert.match(waiting, /Waiting for resource/);
  assert.match(waiting, /Browser certification/);
  assert.match(waiting, /#1 in queue/);
  assert.equal(waiting.includes("Ready to resume"), false);

  const ready = renderCurrentWork({
    state: "WAITING_RESOURCE",
    instruction: "Communications ingress certification",
    resource_wait: {
      label: "Browser certification",
      ready_to_resume: true,
    },
  });
  assert.match(ready, /Ready to resume/);
  assert.match(ready, /Browser certification available/);
  assert.match(ready, /data-ready-to-resume/);
  assert.match(ready, /is-ready/);
  assert.equal(ready.includes("#1 in queue"), false);
});

await test("compact resource overview is operator copy, not lease filenames or PIDs", () => {
  const snap = {
    resources: [
      { key: "browser_certification", label: "Browser certification", held_count: 1, holders: [{ lane_id: "alloy-records" }], queue: [{ lane_id: "alloy-comms" }], health: "held", capacity: 1 },
      { key: "validate", label: "Heavy validation", held_count: 0, holders: [], queue: [], health: "available", capacity: 1 },
      { key: "dev_servers", label: "Dev servers", held_count: 2, holders: [{ holder: "wt5" }], queue: [], health: "available", capacity: 3 },
      { key: "runtime_timing_certification", label: "Exclusive machine timing", held_count: 0, holders: [], queue: [{ lane_id: "alloy-runtime" }], health: "reserving", capacity: 1, exclusive: { phase: "RESERVING_EXCLUSIVE", detail: "Preparing exclusive timing" } },
    ],
  };
  const lanes = [
    { lane_id: "alloy-records", label: "Records / Roster" },
    { lane_id: "alloy-comms", label: "Communications" },
  ];
  const html = renderDevelopmentResources(snap, lanes);
  assert.match(html, /Resources/);
  assert.match(html, /Browser certification/);
  assert.match(html, /Records \/ Roster/);
  assert.match(html, /1 waiting/);
  assert.match(html, /Heavy validation/);
  assert.match(html, /Available/);
  assert.match(html, /Dev servers/);
  assert.match(html, /2 \/ 3/);
  assert.match(html, /Exclusive machine timing/);
  assert.equal(html.includes("Not configured"), false);
  assert.equal(html.includes(".permit"), false);
  assert.equal(html.includes("PID"), false);
  const shell = renderGatewayShell({
    lanes: [{ ...identity, label: "Communications", lane_id: "alloy-comms" }],
    selectedId: "alloy-comms",
    lane: { ...identity, label: "Communications", lane_id: "alloy-comms" },
    outputText: "ok",
    listReady: true,
    developmentResources: snap,
  });
  assert.match(shell, /data-gw-resources/);
  assert.equal(css.includes(".gw-lane-queue"), true);
});

await test("lane list shows resuming vs validating; last instruction stays the operator's", () => {
  const resuming = {
    ...identity,
    lane_id: "alloy-comms",
    label: "Communications",
    execution_run: {
      state: "WAITING_RESOURCE",
      resource_wait: {
        label: "Browser certification",
        ready_to_resume: true,
        resuming: true,
      },
    },
  };
  const validating = {
    ...identity,
    lane_id: "alloy-records",
    label: "Records / Roster",
    execution_run: {
      state: "VALIDATING",
      resource_wait: {
        label: "Browser certification",
        request_state: "GRANTED",
        continuation_state: "DELIVERED",
        resume_event: { summary: "Browser certification granted. Vacilando resumed this run automatically." },
      },
    },
  };
  const html = renderLaneList([resuming, validating], null);
  assert.match(html, /Browser certification available/);
  assert.match(html, /Resuming…/);
  assert.match(html, /Validating/);
  const work = renderCurrentWork(validating.execution_run);
  assert.match(work, /Validating/);
  assert.match(work, /Vacilando resumed this run automatically/);
  const last = renderLastInstruction({
    status: "delivered",
    instruction: "Communications ingress certification",
    delivered_at: "2026-08-18T15:00:00.000Z",
  });
  assert.match(last, /Communications ingress certification/);
  assert.equal(last.includes("Vacilando execution update"), false);
});

await test("lane list shows exclusive preparing, quiesced waiters, and compact machine signal", () => {
  const runtime = {
    ...identity,
    lane_id: "alloy-runtime",
    label: "Runtime Performance",
    runtime_posture: { state: "EXCLUSIVE_OWNER", reason: "Preparing exclusive timing window" },
    execution_run: {
      state: "WAITING_RESOURCE",
      runtime_posture: { state: "EXCLUSIVE_OWNER" },
      resource_wait: {
        label: "Exclusive machine timing",
        request_state: "QUEUED",
        exclusive_phase: "DRAINING_CONFLICTS",
        exclusive_detail: "Waiting for 1 browser certification to finish",
        ready_to_resume: false,
      },
    },
  };
  const comms = {
    ...identity,
    lane_id: "alloy-comms",
    label: "Communications",
    runtime_posture: { state: "QUIESCED", reason: "Runtime Performance timing certification" },
    execution_run: {
      state: "WAITING_RESOURCE",
      runtime_posture: { state: "QUIESCED", reason: "Runtime Performance timing certification" },
      resource_wait: {
        label: "Browser certification",
        request_state: "QUEUED",
        queue_position: 1,
        ready_to_resume: false,
      },
    },
  };
  const html = renderLaneList([runtime, comms], null);
  assert.match(html, /Preparing exclusive timing/);
  assert.match(html, /Waiting for 1 browser certification to finish/);
  assert.match(html, /Quiesced/);
  assert.match(html, /Runtime Performance timing certification/);
  assert.equal(html.includes("PID"), false);
  const snap = {
    machine_exclusive: {
      phase: "DRAINING_CONFLICTS",
      owner_lane_id: "alloy-runtime",
      conflict_count: 1,
      blockers: [{ type: "browser_certification", reason: "Browser certification still held" }],
    },
    resources: [
      { key: "runtime_timing_certification", label: "Exclusive machine timing", health: "draining", held_count: 0, holders: [], queue: [], exclusive: { detail: "Waiting for 1 browser certification to finish" } },
    ],
  };
  const machine = renderDevelopmentResources(snap, [{ lane_id: "alloy-runtime", label: "Runtime Performance" }]);
  assert.match(machine, /data-gw-machine-ex/);
  assert.match(machine, /Preparing exclusive timing/);
  assert.match(machine, /1 conflict draining/);
  assert.match(machine, /Release exclusive window/);
  assert.equal(machine.includes("4242"), false);
});

await test("lane list shows compact recovering posture and recent system activity; no stack traces or PIDs", () => {
  const comms = {
    ...identity,
    lane_id: "alloy-comms",
    label: "Communications",
    runtime_posture: { state: "RECOVERING", reason: "Browser certification ownership" },
    execution_run: {
      state: "VALIDATING",
      runtime_posture: { state: "RECOVERING", reason: "Browser certification ownership" },
      instruction: "Communications ingress certification",
      started_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      resource_wait: { label: "Browser certification", request_state: "GRANTED" },
    },
    recent_system_activity: [
      { summary: "Recovered stale browser-cert ownership" },
      { summary: "Verified resource available" },
    ],
  };
  const html = renderLaneList([comms], null);
  assert.match(html, /Recovering/);
  assert.match(html, /Browser certification ownership/);
  assert.equal(html.includes("PID"), false);
  assert.equal(html.includes("stack"), false);
  const work = renderCurrentWork(comms.execution_run);
  assert.match(work, /Recovering/);
  assert.match(work, /Browser certification ownership/);
  assert.equal(executionRunListHint(comms.execution_run), "Recovering");
  const sys = renderRecentSystemActivity(comms.recent_system_activity);
  assert.match(sys, /Recent system activity/);
  assert.match(sys, /Recovered stale browser-cert ownership/);
  assert.equal(notificationEvent({
    status: { attention: null, activity: "executing" },
    viewingSelected: false,
    lastInstruction: { instruction: "x" },
    laneLabel: "Communications",
  }), null);
});

await test("current-run-active refusal is understandable; no fake progress percentages", () => {
  assert.match(deliveryErrorText("current_run_active"), /still has an open run/);
  assert.match(css, /\.gw-work\.is-needs/);
  assert.match(css, /\.gw-work-text\{[^}]*text-overflow:ellipsis/);
  assert.equal(viewSrc.includes("percent_complete"), false);
  assert.equal(viewSrc.includes("fake progress"), false);
  const fn = viewSrc.slice(viewSrc.indexOf("export function renderCurrentWork"), viewSrc.indexOf("export function lastInstructionMeta"));
  assert.equal(fn.includes("%"), false);
});

await test("session rotation overlay and refresh control stay in Development Status", () => {
  const rotating = {
    ...identity,
    runtime_posture: { state: "SESSION_ROTATING", reason: "Refreshing Claude context" },
    execution_run: {
      state: "EXECUTING",
      runtime_posture: { state: "SESSION_ROTATING", reason: "Refreshing Claude context" },
      instruction: "Finish remaining Records/Roster certification",
      started_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    },
    agent_session: { state: "HANDOFF", provider: "claude" },
    session_rotation: { need: "in_progress", hint: "Refreshing Claude context" },
    recent_system_activity: [{ summary: "Claude context refreshed automatically." }],
  };
  const html = renderLaneList([rotating], null);
  assert.match(html, /Refreshing Claude context/);
  assert.equal(executionRunListHint(rotating.execution_run), "Refreshing Claude context");
  const work = renderCurrentWork(rotating.execution_run);
  assert.match(work, /Refreshing Claude context/);
  assert.match(work, /Preserving current Execution Run/);
  const tel = {
    available: true,
    agent: { model: "claude-opus-5", started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    context: { percent_used: 61, used_tokens: 610000, max_tokens: 1000000 },
    usage: {},
    cost: { billing_mode: "claude_max_subscription" },
  };
  const rotatingStatus = renderStatus(rotating, {}, { open: true, telemetry: tel });
  assert.match(rotatingStatus, /Refreshing Claude context/);
  const ready = {
    ...identity,
    agent_session: { state: "ACTIVE", provider: "claude", lane_economics: { session_count: 2, lifetime_cost: { reported_usd: null, note: "Not reported · Claude Max subscription" } } },
    session_rotation: { need: "pending", hint: "Refresh pending · waiting for a safe checkpoint" },
    execution_run: { state: "EXECUTING", instruction: "Finish remaining Records/Roster certification" },
  };
  const readyStatus = renderStatus(ready, {}, { open: true, telemetry: { ...tel, context: { percent_used: 88, used_tokens: 880000, max_tokens: 1000000 } } });
  assert.match(readyStatus, /Refresh Claude Context/);
  assert.match(readyStatus, /Refresh pending · waiting for a safe checkpoint/);
  const readyShell = renderGatewayShell({
    lanes: [ready],
    selectedId: ready.lane_id,
    lane: ready,
    outputText: "ok",
    listReady: true,
    laneFoldOpen: false,
  });
  // One details panel, not an inline <details> plus a second "Lane details"
  // fold that showed a different subset of the same lane.
  assert.match(readyShell, /data-gw-aside/);
  assert.match(readyShell, /data-gw-aside-toggle/);
  assert.equal(readyShell.includes("data-gw-lane-fold"), false);
  assert.equal(readyShell.includes("Lane details"), false);
  assert.match(readyShell, /data-gw-session-refresh/);
  assert.match(css, /gw-lane-aside/);
  assert.equal(css.includes("max-height:22vh"), false);
  assert.ok(css.includes(".gw-claude-run{display:none;}"));
  assert.equal(css.includes(".gw-stage-status,.gw-claude-run{display:none;}"), false);
  const rotatingShell = renderGatewayShell({
    lanes: [rotating],
    selectedId: rotating.lane_id,
    lane: rotating,
    outputText: "ok",
    listReady: true,
  });
  assert.match(rotatingShell, /Refreshing Claude context/);
  assert.match(rotatingShell, /Current work preserved/);
  assert.match(rotatingShell, /data-refresh="progress"/);
  assert.match(rotatingShell, /data-gw-context-refresh/);
  assert.equal(contextRefreshStatus(rotating).kind, "progress");
  assert.equal(contextRefreshStatus({
    ...identity,
    agent_session: { state: "ROTATION_PENDING" },
    session_rotation: { need: "pending" },
  }).kind, "pending");
  assert.match(renderClaudeRunStatus({
    ...identity,
    agent_session: { state: "ROTATION_PENDING" },
    session_rotation: { need: "pending" },
  }, { available: true, context: { percent_used: 87 } }), /Refresh pending · waiting for a safe checkpoint/);
  assert.match(renderClaudeRunStatus({
    ...identity,
    session_rotation: { need: "in_progress" },
    agent_session: { state: "HANDOFF" },
  }), /Refreshing Claude context/);
  assert.match(renderClaudeRunStatus({
    ...identity,
    session_rotation: { need: "in_progress" },
    agent_session: { state: "HANDOFF" },
  }), /Current work preserved/);
  assert.match(contextCompact({ available: true, context: { used_tokens: 412000 } }), /Context unavailable/);
  assert.match(contextCompact({ available: true, context: { percent_used: 63 } }), /Context 63%/);
  assert.match(renderClaudeRunStatus({
    ...identity,
    recent_system_activity: [{ summary: "Claude context refreshed automatically." }],
  }), /Context refreshed automatically/);
  assert.equal(contextRefreshStatus({
    ...identity,
    recent_system_activity: [{ summary: "Claude session refresh failed" }],
  }).kind, "err");
  assert.match(sessionRefreshErrorText({ error: "unsafe_checkpoint" }), /protected checkpoint/);
  assert.match(sessionRefreshErrorText({
    error: "unsafe_checkpoint",
    blockers: [{ code: "unsafe_resource_phase", detail: "browser_certification is GRANTED during VALIDATING" }],
  }), /browser_certification is GRANTED during VALIDATING/);
  assert.match(gwSrc, /Claude context refresh started/);
  assert.match(gwSrc, /Claude context refreshed/);
  assert.match(gwSrc, /watchRefresh/);
  assert.match(gwSrc, /agent-session\/refresh/);
  assert.match(gwSrc, /confirm: true/);
  assert.equal(notificationEvent({
    status: { attention: null, activity: "executing" },
    viewingSelected: false,
    lastInstruction: { instruction: "x" },
    laneLabel: "Access Identity V2",
  }), null);
});

await test("durable name dominates list presentation", () => {
  const lane = { ...identity, lane_id: "lane_abc123abc123", label: "Access & Identity", aliases: ["alloy-identity"] };
  const html = renderLaneList([lane], lane.lane_id);
  assert.match(html, /Access &amp; Identity/);
  assert.match(html, /\+ Add Lane/);
  assert.match(html, /#\/lanes\/connect/);
});

await test("knownLane matches aliases and redirects hash", () => {
  const lane = { ...identity, lane_id: "lane_abc123abc123", label: "Access & Identity", aliases: ["alloy-identity"], binding: { tmux_session: "alloy-identity" } };
  assert.equal(laneMatchesId(lane, "alloy-identity"), true);
  assert.equal(knownLane([lane], "alloy-identity")?.lane_id, "lane_abc123abc123");
  assert.deepEqual(parseGatewayHash("#/lanes/connect"), { name: "lanes", sub: "connect", candidateId: null });
  assert.deepEqual(parseGatewayHash("#/lanes/create"), { name: "lanes", sub: "create" });
  assert.equal(detailViewKind({ selectedId: "connect", lanes: [lane], lane: null, loading: false, listReady: true }), "connect");
  assert.equal(detailViewKind({ selectedId: "create", lanes: [lane], lane: null, loading: false, listReady: true }), "create");
});

await test("rename control is on desktop and mobile detail", () => {
  const html = renderGatewayShell({ lanes: [identity], selectedId: identity.lane_id, lane: identity, outputText: "hi" });
  assert.match(html, /data-gw-rename/);
  assert.match(html, /Rename Lane/);
  assert.match(gwSrc, /\/rename/);
});

await test("Connect Existing Work flow is renderable without path entry", () => {
  const chooser = renderConnectFlow({ step: "chooser" });
  assert.match(chooser, /Create New Lane/);
  assert.match(chooser, /Connect Existing Work/);
  assert.equal(chooser.includes("Coming later"), false);
  const pick = renderConnectFlow({
    step: "pick",
    candidates: [{
      candidate_id: "cand_wt3-communications-inbound-sms",
      suggested_name: "Communications",
      worktree_name: "wt3-communications-inbound-sms",
      branch: "agent/claude/3-communications-inbound-sms",
      git: { state: "dirty", ahead: 18, behind: 0 },
      claude_presence: "absent",
    }],
  });
  assert.match(pick, /Communications/);
  assert.equal(pick.includes("type=\"file\""), false);
  assert.equal(pick.includes("filesystem"), false);
  const preview = renderConnectFlow({
    step: "preview",
    candidate: {
      candidate_id: "cand_wt3-communications-inbound-sms",
      suggested_name: "Communications",
      worktree_name: "wt3-communications-inbound-sms",
      branch: "agent/claude/3-communications-inbound-sms",
      git: { state: "dirty" },
      claude_presence: "absent",
      slot: 3,
    },
    name: "Communications",
  });
  assert.match(preview, /Connect this work/);
  assert.match(preview, /Vacilando will not modify/);
  assert.match(preview, /Lane name/);
  const already = renderConnectFlow({
    step: "preview",
    candidate: {
      candidate_id: "cand_wt3-communications-inbound-sms",
      already_connected: true,
      connected_name: "Communications",
      connected_lane_id: "lane_abc123abc123",
    },
  });
  assert.match(already, /Already connected/);
  assert.match(already, /Open Communications/);
});

await test("starting a lane exposes no substrate fields", () => {
  // The guard that matters: the operator never picks a worktree, a tmux session
  // or a slot. The surface around it changed — it is a chat composer now, not a
  // Name/Provider/Initial-work form — so the label assertions moved with it.
  const html = renderCreateLaneFlow({});
  assert.equal(html.includes("worktree"), false);
  assert.equal(html.includes("tmux"), false);
  assert.equal(html.includes("slot"), false);
  assert.match(html, /gw-create-instruction/);
  assert.match(html, /gw-create-provider/);
  assert.match(html, /Claude/);
  assert.match(html, /Cursor/);
  assert.match(gwSrc, /\/api\/lanes\/create/);
});

await test("viewed fingerprint migrates from alias keys", () => {
  const store = {
    data: { "vac.gw.viewed.alloy-identity": JSON.stringify({ fingerprint: "abc", viewed_at: 1 }) },
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = v; },
  };
  const rec = readViewed("lane_abc123abc123", store, ["alloy-identity"]);
  assert.equal(rec.fingerprint, "abc");
  assert.equal(JSON.parse(store.getItem("vac.gw.viewed.lane_abc123abc123")).fingerprint, "abc");
});

await test("Start Session callout names occupying Claude lanes at capacity", () => {
  const html = renderLaneSessionCallout({
    lane_id: "lane_2cea84351d90",
    label: "Trust Runtime",
    durable: true,
    runtime: "offline",
    claude: { presence: "absent" },
    tmux: { alive: false, session: null },
    worktree: { name: "wt4-enrollment", path: "/x/wt4" },
    binding: { worktree_path: "/x/wt4", provider: "claude" },
    admission: { state: "QUEUED", queue_position: 5 },
    execution_run: { state: "QUEUED", state_reason: "waiting_for_agent_session" },
    start_session: { available: true, implemented: true },
  }, {
    executionCapacity: {
      max_active: 3,
      active: 3,
      available: 0,
      running: [
        { name: "Access & Identity" },
        { name: "Communications" },
        { name: "Runtime Performance" },
      ],
    },
  });
  assert.match(html, /Start Session/);
  assert.match(html, /Claude is at 3\/3/);
  assert.match(html, /Access &amp; Identity/);
  assert.match(html, /Communications/);
  assert.match(html, /Runtime Performance/);
});

await test("offline bound lane shows Start Session without failing work", () => {
  const comms = {
    lane_id: "lane_336af3bdc474",
    label: "Communications",
    durable: true,
    runtime: "offline",
    claude: { presence: "absent" },
    tmux: { alive: false, session: null },
    worktree: { name: "wt3-communications-inbound-sms", path: "/x/wt3-communications-inbound-sms", managed: true },
    binding: { worktree_path: "/x/wt3-communications-inbound-sms" },
    git: { branch: "agent/claude/3-communications", state: "clean", ahead: 0, behind: 0 },
    start_session: { available: true, implemented: true },
  };
  const html = renderGatewayShell({ lanes: [comms], selectedId: comms.lane_id, lane: comms, outputText: "", listReady: true });
  assert.match(html, /No agent session/);
  assert.match(html, /Existing worktree is connected/);
  assert.match(html, /Start Session/);
  assert.match(html, /data-gw-session-start/);
  assert.equal(executionRunListHint(null, comms), "No agent session");
  const st = deriveLaneStatus({ lane: comms, viewing: true });
  assert.equal(st.headline, "No agent session running");
  const n = deliveryNotice({ ok: true, status: "queued", session_required: true, admission_queued: true });
  assert.equal(n.kind, "ok");
  assert.match(n.text, /No agent session/);
  const replaced = deliveryNotice({
    ok: true,
    status: "queued",
    session_required: true,
    admission_queued: true,
    replaced: true,
  });
  assert.match(replaced.text, /Instruction updated/);
  const composer = renderComposer({ queueUntilSession: true });
  assert.match(composer, /queue until a session starts/);
  assert.doesNotMatch(composer, /data-gw-send[^>]*disabled/);
  assert.doesNotMatch(composer, /<textarea[^>]*disabled/);
  assert.match(composer, /data-gw-provider-opt="cursor"[^>]*disabled/);
});

await test("online lane still shows Orienting Claude while VERIFYING", () => {
  const html = renderLaneSessionCallout({
    lane_id: "lane_336af3bdc474",
    durable: true,
    runtime: "online",
    claude: { presence: "present" },
    worktree: { path: "/x/wt3" },
    agent_session: { state: "VERIFYING" },
  });
  assert.match(html, /Orienting Claude/);
  assert.doesNotMatch(html, /Start Session/);
});

await test("live executing lane is not labeled no agent session because of leftover admission", () => {
  const hint = executionRunListHint(
    { state: "EXECUTING" },
    {
      durable: true,
      runtime: "online",
      claude: { presence: "present" },
      admission: { state: "QUEUED", queue_position: 2 },
      binding: { worktree_path: "/x/wt3" },
    },
  );
  assert.equal(hint, "Executing");
});

await test("idle unbound lane is Idle, not failed", () => {
  const billing = {
    lane_id: "lane_73a897409906",
    label: "Billing",
    durable: true,
    runtime: "offline",
    claude: { presence: "absent" },
    tmux: { alive: false },
    binding: null,
    git: { branch: null, state: "unknown" },
  };
  assert.equal(executionRunListHint(null, billing), "Idle");
  const html = renderLaneSessionCallout(billing);
  assert.equal(html, "");
  const processing = {
    lane_id: "lane_69151a515d83",
    label: "Processing",
    durable: true,
    admission: { state: "QUEUED", queue_position: 1 },
    execution_run: { state: "QUEUED", admission: { state: "QUEUED", queue_position: 1 } },
  };
  assert.match(executionRunListHint(processing.execution_run, processing), /Queued for capacity/);
});

await test("six-lane representation keeps lane / run / admission / session distinct", () => {
  const lanes = [
    { lane_id: "lane_a", label: "Access & Identity", durable: true, claude: { presence: "present" }, tmux: { alive: true }, execution_run: { state: "EXECUTING" }, git: { state: "clean", ahead: 0, behind: 0 } },
    { lane_id: "lane_c", label: "Communications", durable: true, runtime: "offline", claude: { presence: "absent" }, tmux: { alive: false }, worktree: { path: "/x/c" }, binding: { worktree_path: "/x/c" }, execution_run: { state: "WAITING_RESOURCE", resource_wait: { label: "browser certification" } }, git: { state: "clean", ahead: 0, behind: 0 } },
    { lane_id: "lane_r", label: "Records / Roster", durable: true, claude: { presence: "present" }, tmux: { alive: true }, execution_run: { state: "VALIDATING" }, git: { state: "clean", ahead: 0, behind: 0 } },
    { lane_id: "lane_p", label: "Processing", durable: true, admission: { state: "QUEUED", queue_position: 1 }, execution_run: { state: "QUEUED", admission: { state: "QUEUED", queue_position: 1 } }, git: { state: "unknown", ahead: 0, behind: 0 } },
    { lane_id: "lane_b", label: "Billing", durable: true, claude: { presence: "absent" }, tmux: { alive: false }, git: { state: "unknown", ahead: 0, behind: 0 } },
    { lane_id: "lane_s", label: "Another specialist", durable: true, claude: { presence: "present" }, tmux: { alive: true }, execution_run: { state: "EXECUTING" }, git: { state: "clean", ahead: 0, behind: 12 }, source_control: { posture: "SYNC_RECOMMENDED" } },
  ];
  const html = renderLaneList(lanes, null);
  assert.match(html, /Access &amp; Identity/);
  assert.match(html, /Working/);
  assert.match(html, /Waiting for browser certification/);
  assert.match(html, /Validating/);
  assert.match(html, /Queued for capacity/);
  assert.match(html, /Idle/);
  assert.match(gwSrc, /agent-session\/start/);
});

await test("idle lane shows No active work / Ready for instruction", () => {
  const html = renderCurrentWork(null);
  assert.match(html, /Current work/);
  assert.match(html, /No active work/);
  assert.match(html, /Ready for instruction/);
  const shell = renderGatewayShell({ lanes: [identity], selectedId: identity.lane_id, lane: identity, outputText: "hi" });
  assert.match(shell, /No active work/);
  assert.match(shell, /Ready for instruction/);
});

await test("governed wait shows Waiting on Director, not Ready for instruction", () => {
  const run = {
    state: "WAITING_RESOURCE",
    resource_wait: {
      resource_key: "director_governed_action",
      label: "Director",
      summary: "Q15 census requested",
      governed_request_id: "gar_test",
    },
    governed_action: {
      request_id: "gar_test",
      status: "awaiting_director",
      title: "Q15 census requested",
      action_key: "database.read_census",
      target: "alloy_deployed_primary",
      reason_worker_cannot_execute: "Worker cannot access deployed tenant credentials by design.",
    },
  };
  const html = renderCurrentWork(run);
  assert.match(html, /Waiting on Director/);
  assert.equal(html.includes("Authorize census"), false);
  assert.match(html, /Q15 census requested/);
  assert.match(html, /Worker cannot access deployed tenant credentials by design/);
  assert.match(html, /Director is handling database\.read_census/);
  assert.equal(html.includes("Ready for instruction"), false);
  const lane = { ...identity, execution_run: run, durable: true };
  const cap = deriveLaneExecutionPosture(lane);
  assert.equal(cap.state, "WAITING_ON_DIRECTOR");
  assert.match(cap.headline, /Waiting on Director/);
  const runtime = renderLaneRuntimeControls(lane, cap);
  assert.match(runtime, /Waiting on Director/);
  assert.equal(runtime.includes("Start work"), false);
  const shell = renderGatewayShell({ lanes: [lane], selectedId: lane.lane_id, lane, outputText: "hi" });
  assert.match(shell, /Waiting on Director/);
  assert.equal(shell.includes("Ready for instruction"), false);
  assert.equal(shell.includes("Start work — write an instruction"), false);
});

await test("governed operator wait shows Needs approval and Authorize merge", () => {
  const run = {
    state: "WAITING_RESOURCE",
    resource_wait: {
      resource_key: "director_governed_action",
      label: "Director",
      summary: "Merge PR #475 into staging",
      governed_request_id: "gar_merge",
    },
    governed_action: {
      request_id: "gar_merge",
      status: "awaiting_operator",
      title: "Merge PR #475 into staging",
      action_key: "repository.merge_pull_request",
      target: "staging",
      approve_label: "Authorize merge",
      deny_label: "Deny",
      detail: "Merge PR #475 into staging · expected SHA f1cb105e01de",
      reason_worker_cannot_execute: "Development Lane has no GitHub token by design.",
    },
  };
  const html = renderCurrentWork(run);
  assert.match(html, /Needs approval/);
  assert.match(html, /Authorize merge/);
  assert.match(html, /data-gw-governed-approve/);
  assert.equal(html.includes("Ready for instruction"), false);
  const lane = { ...identity, execution_run: run, durable: true };
  const cap = deriveLaneExecutionPosture(lane);
  assert.equal(cap.state, "NEEDS_APPROVAL");
  assert.match(cap.headline, /Needs approval/);
});

await test("mobile detail keeps Authorize and Deny above the composer", () => {
  const run = {
    state: "WAITING_RESOURCE",
    resource_wait: {
      resource_key: "director_governed_action",
      label: "Director",
      summary: "Merge PR #475 into staging",
      governed_request_id: "gar_merge",
    },
    governed_action: {
      request_id: "gar_merge",
      status: "awaiting_operator",
      title: "Merge PR #475 into staging",
      action_key: "repository.merge_pull_request",
      target: "staging",
      approve_label: "Authorize merge",
      deny_label: "Deny",
      detail: "Merge PR #475 into staging · expected SHA f1cb105e01de",
    },
  };
  const lane = { ...identity, execution_run: run, durable: true };
  const html = renderGatewayShell({
    lanes: [lane],
    selectedId: lane.lane_id,
    lane,
    outputText: "hi",
    listReady: true,
    laneFoldOpen: false,
  });
  assert.match(html, /data-gw-decision-bar/);
  assert.match(html, /data-kind="approval"/);
  assert.match(html, /data-gw-governed-approve/);
  assert.match(html, /data-gw-governed-deny/);
  assert.match(html, /Authorize merge/);
  assert.match(html, /data-gw-composer/);
  const approveAt = html.indexOf("data-gw-governed-approve");
  const composerAt = html.indexOf("data-gw-composer");
  const decisionAt = html.indexOf("data-gw-decision-bar");
  assert.equal(decisionAt >= 0 && approveAt >= 0 && composerAt >= 0, true);
  assert.equal(decisionAt < composerAt, true);
  assert.equal(approveAt < composerAt, true);
  assert.match(css, /\.gw-decision-bar\{display:none/);
  assert.match(css, /\.gw-decision-bar\{display:block;\}/);
  assert.match(css, /\.gw-decision-bar \.btn\{width:100%;min-height:44px/);
  assert.match(css, /\.gw-send\{min-height:44px;min-width:88px;width:auto/);
  assert.ok(css.includes(".gw-claude-run{display:none;}"));
  assert.equal(css.includes(".gw-stage-status,.gw-claude-run{display:none;}"), false);
});

await test("Director refresh wait shows Updating Director, not idle or authorization error", () => {
  const run = {
    state: "WAITING_RESOURCE",
    resource_wait: {
      resource_key: "director_governed_action",
      label: "Director",
      summary: "Updating governed capabilities",
      governed_request_id: "gar_5a35817f1c5028",
    },
    governed_action: {
      request_id: "gar_5a35817f1c5028",
      status: "awaiting_control_plane_refresh",
      title: "Merge PR #475 into staging",
      action_key: "repository.merge_pull_request",
      target: "staging",
      wait_label: "Waiting on Director — updating governed capabilities",
      mission_need: "Updating Director",
    },
  };
  const html = renderCurrentWork(run);
  assert.match(html, /Updating Director/);
  assert.equal(html.includes("Ready for instruction"), false);
  assert.equal(html.includes("unauthorized_action_key"), false);
  assert.equal(/\bPID\b/.test(html), false);
  const lane = { ...identity, execution_run: run, durable: true };
  const cap = deriveLaneExecutionPosture(lane);
  assert.equal(cap.state, "UPDATING_DIRECTOR");
  assert.match(cap.headline, /Updating Director/);
});

await test("governed complete EXECUTING is not Waiting on Director", () => {
  const run = {
    state: "EXECUTING",
    state_reason: "governed_action_complete",
    resource_wait: {
      resource_key: "director_governed_action",
      governed_request_id: "gar_test",
    },
    governed_action: {
      request_id: "gar_test",
      status: "complete",
      action_key: "database.read_census",
    },
  };
  const html = renderCurrentWork(run);
  assert.equal(html.includes("Waiting on Director"), false);
  assert.equal(html.includes("Authorize census"), false);
  assert.match(html, /Executing/);
  const shell = renderGatewayShell({
    lanes: [{ ...identity, execution_run: run }],
    selectedId: identity.lane_id,
    lane: { ...identity, execution_run: run },
    outputText: "ok",
    listReady: true,
  });
  assert.match(shell, /Working/);
  assert.equal(shell.includes("Waiting on Director"), false);
});

await test("failed governed wait is not Waiting on Director", () => {
  const run = {
    state: "WAITING_RESOURCE",
    resource_wait: {
      resource_key: "director_governed_action",
      governed_request_id: "gar_test",
    },
    governed_action: {
      request_id: "gar_test",
      status: "failed",
      action_key: "database.apply_migration",
      failure_reason: "input_validation_failed",
    },
  };
  assert.equal(isGovernedDirectorWait(run), false);
  const html = renderCurrentWork(run);
  assert.equal(html.includes("Waiting on Director"), false);
});

await test("previous abandoned run is compact and not listed as Executing", () => {
  const html = renderPreviousWork({ state: "ABANDONED", state_reason: "stale_certification_run" });
  assert.match(html, /Previous run/);
  assert.match(html, /Abandoned/);
  assert.equal(html.includes("Executing"), false);
  const shell = renderGatewayShell({
    lanes: [{ ...identity, previous_run: { state: "ABANDONED" } }],
    selectedId: identity.lane_id,
    lane: { ...identity, previous_run: { state: "ABANDONED" } },
    outputText: "hi",
  });
  assert.match(shell, /Previous run/);
  assert.match(shell, /Abandoned/);
  const list = renderLaneList([{ ...identity, previous_run: { state: "ABANDONED" } }], null);
  assert.equal(list.includes("Abandoned"), false);
  assert.equal(list.includes("Executing"), false);
});

await test("ambiguous stale run offers close without claiming active-work refusal", () => {
  const html = renderCurrentWork({
    state: "EXECUTING",
    run_id: "erun_test",
    instruction: "Finish Records/Roster",
    run_lifecycle: { class: "ambiguous" },
  });
  assert.match(html, /Previous work may not have completed/);
  assert.match(html, /Close stale run and continue/);
  assert.match(html, /Review run/);
  assert.match(gwSrc, /run\/close-stale/);
  const notice = deliveryNotice({
    ok: true,
    status: "delivered",
    stale_run_closed: true,
  });
  assert.match(notice.text, /Previous run was stale and was closed/);
});

await test("recent output chrome is honest; latest response is a separate loaded model", () => {
  const viewport = outputReviewHint({
    ok: true,
    mode: "recent",
    truncated: false,
    viewport_only: true,
    alternate_screen: true,
    history_size: 0,
    line_count: 24,
    text: "tail",
  });
  assert.equal(viewport.kind, "viewport_only");
  assert.match(viewport.text, /Earlier output is not currently shown/);
  assert.equal(viewport.showExtended, false);
  assert.equal(viewport.showLatest, true);
  const chrome = renderOutputChrome({
    ok: true,
    mode: "recent",
    truncated: true,
    viewport_only: false,
    history_size: 400,
    returned_lines: 120,
    text: "recent",
  });
  assert.match(chrome, /Earlier output is not currently shown/);
  assert.match(chrome, /data-gw-output-more/);
  assert.match(chrome, /data-gw-output-latest/);
  const latest = {
    ok: true,
    available: true,
    lane_id: "alloy-identity",
    mode: "latest_response",
    text: "# Grant repair — complete assistant reply",
  };
  assert.equal(copyableOutputText({ selectedId: "alloy-identity", output: latest }), latest.text);
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    output: latest,
    outputText: latest.text,
    listReady: true,
  });
  // The panel is named for what it shows, not for who produced it: one panel
  // serves both Claude and Cursor lanes.
  assert.match(html, /Latest assistant response/);
  assert.equal(html.includes("Latest Claude Response"), false);
  assert.match(html, /data-gw-output-recent/);
  // The agent name IS provider-aware in sentences about the agent.
  assert.match(html, /Claude is running/);
  assert.match(html, /data-gw-claude-run/);
  assert.equal(html.includes("data-gw-output-latest>"), false);
  assert.equal(claudeRunStatus(identity).running, true);
  assert.equal(claudeRunStatus({ ...identity, claude: { presence: "absent" }, runtime: "offline" }).label, "Claude is not running");
  assert.match(renderClaudeRunStatus({ ...identity, claude: { presence: "absent" } }), /Claude is not running/);
  assert.match(outputBodyText({ ok: true, mode: "latest_response", available: false, text: null }, ""), /Output unavailable/);
  const missingLatest = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    output: { ok: true, available: false, mode: "latest_response", lane_id: identity.lane_id, text: null },
    outputText: "",
    listReady: true,
  });
  assert.match(missingLatest, /Output unavailable/);
  assert.match(gwSrc, /outputMode: "recent"/);
  assert.match(gwSrc, /fetchOutput\(hydrateId, \{ mode: "recent" \}\)/);
  const copyFn = gwSrc.slice(gwSrc.indexOf("async function copyActiveOutput"), gwSrc.indexOf("async function registerPushSubscription"));
  assert.equal(copyFn.includes("fetchOutput"), false);
  assert.equal(copyFn.includes("/output"), false);
  assert.match(gwSrc, /data-gw-output-latest/);
  assert.match(gwSrc, /data-gw-output-more/);
});

await test("output poll stays on recent and does not recapture for Copy", () => {
  const outPoll = gwSrc.slice(gwSrc.indexOf("function startOutputPoll"), gwSrc.indexOf("function startListPoll"));
  assert.match(outPoll, /mode: "recent"/);
  assert.equal(outPoll.includes("latest_response"), false);
  assert.equal(outPoll.includes("mode: \"extended\""), false);
});

await test("lane detail pins composer; green output pane owns scroll", () => {
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: identity,
    outputText: `${"line\n".repeat(80)}latest output`,
    listReady: true,
  });
  assert.match(html, /data-gw-thread/);
  assert.match(html, /data-gw-composer/);
  assert.match(html, /data-gw-output/);
  assert.match(html, /data-gw-stage/);
  // The toggle button also carries a data-gw-aside* attribute, so anchor on the
  // panel itself.
  const asideIdx = html.indexOf('id="gw-details-panel"');
  const stageIdx = html.indexOf("data-gw-stage");
  const threadIdx = html.indexOf("data-gw-thread");
  const composerIdx = html.indexOf("data-gw-composer");
  const outputIdx = html.indexOf("data-gw-output");
  const claudeIdx = html.indexOf("data-gw-claude-run");
  const messageIdx = html.indexOf("data-gw-report");
  // The stage is the conversation and nothing else: thread, then the structured
  // assistant message, then the composer. The raw pane is no longer part of the
  // conversation at all — it is diagnostics inside the one details panel, which
  // comes after the whole stage.
  assert.equal(stageIdx > 0 && threadIdx > stageIdx && messageIdx > threadIdx && composerIdx > messageIdx, true);
  assert.equal(asideIdx > composerIdx && claudeIdx > asideIdx && outputIdx > asideIdx, true);
  assert.match(css, /\.gw-thread\{[^}]*overflow:auto/);
  assert.match(css, /\.gw-output\{[^}]*overflow:auto/);
  assert.match(css, /\.gw\.is-detail \.gw-main\{[^}]*minmax\(0, 66fr\) minmax\(0, 33fr\)/);
  assert.match(css, /\.gw\.is-detail \.gw-composer\{[^}]*flex:0 0 auto/);
  assert.match(css, /\.gw\.is-detail \.gw-main\{[^}]*overflow:hidden/);
  assert.match(css, /\.gw\.is-detail \.gw-composer\{[^}]*position:static/);
  assert.equal(css.includes("position:sticky;bottom:env(safe-area-inset-bottom"), false);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /--gw-vvh/);
  assert.match(gwSrc, /visualViewport/);
  assert.match(gwSrc, /data-gw-output/);
  assert.match(gwSrc, /outputScroll/);
  assert.match(css, /max-height:min\(28vh, 220px\)/);
  assert.match(html, /Enter to send/);
  assert.match(gwSrc, /t\.id !== "gw-instruction"/);
  assert.match(gwSrc, /e\.key !== "Enter"/);
  assert.match(gwSrc, /if \(listed\) G.lane = listed;/);
  assert.match(gwSrc, /liveRun/);
  assert.match(gwSrc, /--gw-composer-h/);
});

await test("lane execution posture is not Execution Run state", () => {
  const running = deriveLaneExecutionPosture({
    label: "Access & Identity",
    claude: { presence: "present" },
    slot: 1,
    execution_run: { state: "EXECUTING" },
  });
  assert.equal(running.state, "RUNNING");
  assert.match(running.label, /Executing/);
  const queued = deriveLaneExecutionPosture({
    label: "Processing",
    durable: true,
    admission: { state: "QUEUED", queue_position: 1 },
    execution_run: { state: "QUEUED", admission: { state: "QUEUED", queue_position: 1 } },
  });
  assert.equal(queued.state, "QUEUED_FOR_CAPACITY");
  assert.match(queued.hint, /#1/);
  const idle = deriveLaneExecutionPosture({ label: "Billing", durable: true });
  assert.equal(idle.state, "IDLE");
  const ready = deriveLaneExecutionPosture({
    label: "Communications",
    claude: { presence: "present" },
    slot: 3,
    execution_run: { state: "COMPLETE" },
  });
  assert.equal(ready.state, "READY_TO_RELEASE");
  const html = renderLaneRuntimeControls({
    lane_id: "lane_abcabcabcabc",
    label: "Communications",
    claude: { presence: "present" },
    slot: 3,
    execution_run: { state: "COMPLETE" },
  }, ready);
  assert.match(html, /Keep lane running/);
  assert.match(html, /Release execution capacity/);
  assert.equal(html.includes("type=\"number\""), false);
  const idleHtml = renderLaneRuntimeControls({ lane_id: "lane_bbbbbbbbbbbb", label: "Billing", durable: true });
  assert.match(idleHtml, /Start work/);
  assert.match(idleHtml, /data-gw-start-work/);
});

await test("capacity summary names lanes, not slot pickers", () => {
  const summary = summarizeExecutionCapacity([
    { lane_id: "a", label: "Access & Identity", claude: { presence: "present" }, execution_run: { state: "EXECUTING" } },
    { lane_id: "c", label: "Communications", claude: { presence: "present" }, execution_run: { state: "COMPLETE" } },
    { lane_id: "p", label: "Processing", admission: { state: "QUEUED", queue_position: 1 }, execution_run: { state: "QUEUED", admission: { state: "QUEUED", queue_position: 1 } } },
  ], { max_providers: 3 });
  assert.equal(summary.active, 1);
  assert.equal(summary.available, 2);
  const html = renderExecutionCapacity(summary);
  assert.match(html, /Execution capacity/);
  assert.match(html, /Access &amp; Identity/);
  assert.match(html, /Processing #1/);
  assert.equal(html.includes("Slot 1"), false);
  assert.match(gwSrc, /\/runtime\/release/);
  assert.equal(viewSrc.includes("Runtime adoption"), false);
});

await test("queued and connected lanes are not collapsed to Idle or Running", () => {
  const queued = {
    lane_id: "lane_queuedqueued",
    label: "Processing",
    durable: true,
    admission: { state: "QUEUED", queue_position: 2 },
    execution_run: { state: "QUEUED", admission: { state: "QUEUED", queue_position: 2 } },
    claude: { presence: "absent" },
    tmux: { alive: false },
  };
  const idleHint = deriveLaneStatus({ lane: queued, viewing: false });
  assert.equal(idleHint.listHint, "Queued for capacity");
  const rail = railHtml([queued], queued.lane_id, { [queued.lane_id]: { listHint: "Idle" } });
  assert.match(rail, /Queued for capacity/);
  assert.doesNotMatch(rail, />○ Idle</);
  const executing = deriveLaneExecutionPosture({
    claude: { presence: "present" },
    execution_run: { state: "EXECUTING" },
  });
  const connected = deriveLaneExecutionPosture({
    claude: { presence: "present" },
  });
  const validating = deriveLaneExecutionPosture({
    claude: { presence: "present" },
    execution_run: { state: "VALIDATING" },
  });
  assert.equal(executing.label, "Executing");
  assert.equal(connected.state, "CONNECTED");
  assert.equal(connected.label, "Connected");
  assert.equal(validating.label, "Validating");
  const cursorLive = {
    lane_id: "lane_cursorcursor",
    label: "Vacilando",
    durable: true,
    runtime: "online",
    binding: { provider: "cursor", worktree_path: "/x/wt1" },
    worktree: { path: "/x/wt1" },
    agent_session: { state: "ACTIVE", provider: "cursor" },
    claude: { presence: "absent" },
    tmux: { alive: false },
  };
  assert.equal(deriveLaneExecutionPosture(cursorLive).state, "CONNECTED");
  assert.equal(deriveLaneExecutionPosture(cursorLive).label, "Connected");
  assert.notEqual(canonicalLaneWorkState({
    ...cursorLive,
    execution_run: { state: "QUEUED", state_reason: "waiting_for_agent_session" },
  }).label, "Working");
  assert.match(railHtml([cursorLive], cursorLive.lane_id), /read-only/);
  assert.doesNotMatch(renderLaneSessionCallout(cursorLive), /Start Session/);
  assert.match(railHtml([cursorLive], cursorLive.lane_id), /Cursor/);
  const leftover = deriveLaneExecutionPosture({
    label: "Communications",
    claude: { presence: "present" },
    slot: 3,
    previous_run: { state: "COMPLETE" },
  });
  assert.equal(leftover.state, "READY_TO_RELEASE");
  const cap = summarizeExecutionCapacity([
    { lane_id: "a", label: "Access & Identity", claude: { presence: "present" } },
    { lane_id: "c", label: "Communications", claude: { presence: "present" }, previous_run: { state: "COMPLETE" } },
    cursorLive,
  ], { max_providers: 3 });
  assert.equal(cap.active, 1);
  assert.equal(cap.running.map((r) => r.name).join(","), "Access & Identity");
});

await test("canonical work state maps live execution to Working and stale heartbeats out of Working", () => {
  const now = Date.parse("2026-08-22T12:00:00.000Z");
  const working = canonicalLaneWorkState({
    ...identity,
    execution_run: { state: "EXECUTING" },
    last_activity_ms: now - 5_000,
  }, { nowMs: now });
  assert.equal(working.label, "Working");
  assert.equal(working.group, "active");
  const queued = canonicalLaneWorkState({
    ...identity,
    execution_run: { state: "QUEUED", state_reason: "waiting_for_agent_session" },
  }, { nowMs: now });
  assert.notEqual(queued.label, "Working");
  const validating = canonicalLaneWorkState({
    ...identity,
    execution_run: { state: "VALIDATING" },
    last_activity_ms: now - 1_000,
  }, { nowMs: now });
  assert.equal(validating.label, "Validating");
  const complete = canonicalLaneWorkState({
    ...identity,
    execution_run: { state: "COMPLETE" },
  }, { nowMs: now });
  assert.equal(complete.label, "Complete");
  const idle = canonicalLaneWorkState({
    lane_id: "lane_idleidleidle",
    durable: true,
    previous_run: { state: "COMPLETE" },
  }, { nowMs: now });
  assert.equal(idle.label, "Idle");
  const stale = canonicalLaneWorkState({
    ...identity,
    execution_run: { state: "EXECUTING" },
    last_activity_ms: now - 180_000,
  }, { output: { captured_at: new Date(now - 180_000).toISOString() }, nowMs: now });
  assert.equal(stale.label, "Stale");
  assert.equal(stale.stale, true);
});

await test("lane index sorts operational groups and does not duplicate status", () => {
  const lanes = [
    { lane_id: "idle-1", label: "Idle lane", durable: true },
    { lane_id: "work-1", label: "Active lane", claude: { presence: "present" }, execution_run: { state: "EXECUTING", updated_at: "2026-08-22T12:00:00.000Z" } },
    { lane_id: "need-1", label: "Needs lane", execution_run: { state: "NEEDS_INPUT" } },
    { lane_id: "done-1", label: "Done lane", execution_run: { state: "COMPLETE" } },
  ];
  const ordered = sortLanesForIndex(lanes).map((l) => l.lane_id);
  assert.deepEqual(ordered, ["work-1", "need-1", "idle-1", "done-1"]);
  const html = renderLaneList(lanes, null);
  assert.equal((html.match(/Queued for capacity/g) || []).length <= 1, true);
  assert.equal(html.includes("gw-lane-attn is-run"), false);
  const workIdx = html.indexOf("Active lane");
  const idleIdx = html.indexOf("Idle lane");
  assert.equal(workIdx >= 0 && workIdx < idleIdx, true);
});

await test("conversation detail has user and assistant messages with icon copy, diagnostics in Details", () => {
  const last = { instruction: "Ship the composer", status: "delivered", delivered_at: "2026-08-22T12:00:00.000Z" };
  const html = renderGatewayShell({
    lanes: [identity],
    selectedId: identity.lane_id,
    lane: { ...identity, last_instruction: last, execution_run: { state: "EXECUTING", instruction: last.instruction, started_at: "2026-08-22T11:59:00.000Z" } },
    output: { ok: true, lane_id: identity.lane_id, text: "function ok() {}", revision: 2 },
    outputText: "function ok() {}",
    lastInstruction: last,
    listReady: true,
  });
  assert.match(html, /gw-msg-user/);
  assert.match(html, /Ship the composer/);
  assert.match(html, /gw-msg-assistant/);
  assert.match(html, /function ok\(\) \{\}/);
  assert.match(html, /data-gw-provider-opt="claude"/);
  assert.match(html, /data-gw-provider-opt="cursor"/);
  assert.match(html, /data-gw-provider-opt="cursor"[^>]*disabled/);
  assert.match(html, /data-gw-aside/);
  assert.equal(html.includes("Latest assistant response from the session transcript"), false);
  const copyBtn = html.slice(html.indexOf("data-gw-copy") - 120, html.indexOf("data-gw-copy") + 80);
  assert.equal(copyBtn.includes("Load more"), false);
  assert.match(html, /data-gw-aside/);
  assert.match(css, /data-gw-provider-opt|gw-provider-opt/);
});

await test("stale cached output revisions are rejected", () => {
  const current = { lane_id: "alloy-identity", revision: 200, text: "new" };
  const older = { lane_id: "alloy-identity", revision: 100, text: "old" };
  assert.equal(outputIsOlder(older, current), true);
  const kept = applyFetchedOutput("alloy-identity", "alloy-identity", current, older);
  assert.equal(kept.text, "new");
  const next = applyFetchedOutput("alloy-identity", "alloy-identity", current, { lane_id: "alloy-identity", revision: 300, text: "newer" });
  assert.equal(next.text, "newer");
});

await test("merged historical git is not shown as behind on the lane list", () => {
  const merged = {
    ...identity,
    lane_id: "lane_mergedmerged",
    label: "Historical",
    previous_run: { state: "COMPLETE" },
    execution_run: null,
    claude: { presence: "absent" },
    git: { state: "clean", ahead: 0, behind: 88, head_in_base: true, branch: "agent/old" },
    source_control: { posture: "MERGED", behind: 88 },
  };
  assert.equal(gitListState(merged), null);
  const html = renderLaneList([merged], null);
  assert.equal(html.includes("88 behind"), false);
  assert.equal(html.includes("Sync required"), false);
  assert.match(gitLine(merged.git, merged.source_control), /Merged/);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
