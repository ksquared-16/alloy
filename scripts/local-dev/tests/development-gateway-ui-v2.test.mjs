#!/usr/bin/env node
/**
 * Vacilando UI V2 — foundation, data maturity, and the provider progress contract.
 *
 * These tests exist to keep three promises that are easy to break silently:
 *
 *   1. NO INVENTED NUMBER EVER REACHES PRODUCTION. Placeholder values are
 *      opt-in, flagged, and impossible for a LIVE field.
 *   2. PROGRESS IS AN ESTIMATE, and a stale or absent one renders as words
 *      rather than as a zero-width bar.
 *   3. DESKTOP AND MOBILE ARE ONE PRODUCT — one navigation declaration, one
 *      state vocabulary, one visual system.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DATA_STATE,
  DEMO,
  HEALTH,
  MATURITY,
  PLACEHOLDER_ELIGIBLE,
  PRIMARY_NAV,
  buildActivityViewModel,
  buildEffectivenessModel,
  buildHomeViewModel,
  buildLaneResources,
  buildNeedsYou,
  buildSystemHealth,
  buildSystemViewModel,
  buildUsageModel,
  collectFields,
  field,
  healthDot,
  laneProgress,
  metric,
  GOVERNED_ACTIONABLE_STATUSES,
  isActionableGovernedAction,
  laneReturnTarget,
  messageRow,
  resolveApprovalLane,
  needsYouControl,
  needsYouPanel,
  needsYouTray,
  operationalLanes,
  progress as renderProgress,
  readPlaceholderMode,
  renderActivity,
  renderGatewayShell,
  renderHome,
  renderLaneInspector,
  renderMobileNav,
  renderPrimaryNav,
  railHtml as renderRail,
  renderSystem,
  surfaceHasPlaceholders,
} from "../apps/vacilando/public/gateway-view.mjs";

import {
  PROGRESS_CONFIDENCES,
  PROGRESS_SOURCES,
  PROGRESS_STALE_MS,
  createQueuedRun,
  getExecutionRun,
  normalizeProgressEstimate,
  progressEstimateIsStale,
  publicExecutionRun,
  reportRunState,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";

import { classifyEvent } from "../lib/vacilando/ui-v2-views.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUB = join(HERE, "..", "apps", "vacilando", "public");
const css = readFileSync(join(PUB, "styles.css"), "utf8");
const html = readFileSync(join(PUB, "index.html"), "utf8");
const gwSrc = readFileSync(join(PUB, "gateway.js"), "utf8");
const viewSrc = readFileSync(join(PUB, "gateway-view.mjs"), "utf8");
const kitSrc = readFileSync(join(PUB, "vacilando-ui-kit.mjs"), "utf8");
const cliSrc = readFileSync(join(HERE, "..", "vac-run-status.mjs"), "utf8");

/* =========================================================================
 * 1. DATA MATURITY
 * ====================================================================== */

test("a LIVE field can never be replaced by a placeholder", () => {
  // THE FAILURE THIS PREVENTS. If a demo value could stand in for a missing
  // LIVE reading, a genuine telemetry outage would look like a healthy machine.
  assert.equal(PLACEHOLDER_ELIGIBLE.includes(MATURITY.LIVE), false);
  const f = field(null, MATURITY.LIVE, { demo: 42, placeholders: true, absent: "No CPU reading" });
  assert.equal(f.state, DATA_STATE.UNAVAILABLE);
  assert.equal(f.value, null);
  assert.equal(f.display, "No CPU reading");
});

test("production shows copy, never a number, for an absent value", () => {
  for (const mat of Object.values(MATURITY)) {
    const f = field(null, mat, { demo: 87, unit: "%", placeholders: false });
    assert.equal(f.state, DATA_STATE.UNAVAILABLE, `${mat} must not render a value`);
    assert.equal(f.value, null);
    assert.equal(/\d/.test(f.display), false, `${mat} rendered a digit: ${f.display}`);
  }
});

test("placeholder mode is opt-in, and every value it produces is flagged", () => {
  const f = field(null, MATURITY.INSTRUMENTATION_REQUIRED, { demo: 75, unit: "%", placeholders: true });
  assert.equal(f.state, DATA_STATE.PLACEHOLDER);
  assert.equal(f.display, "75%");
  const markup = metric(f, { label: "Autonomous" });
  assert.match(markup, /is-placeholder/);
  assert.match(markup, /vmetric-flag/);
  assert.match(markup, />sample</);
  assert.match(markup, /data-maturity="INSTRUMENTATION_REQUIRED"/);
});

test("a real value is live even on a not-yet-wired field", () => {
  // Classification describes the plumbing, not the individual reading. A field
  // that has actually been wired must stop rendering as a placeholder.
  const f = field(1234, MATURITY.AVAILABLE_NOT_WIRED, { placeholders: true, demo: 1 });
  assert.equal(f.state, DATA_STATE.LIVE);
  assert.equal(f.value, 1234);
});

test("placeholder mode is one switch, off by default, and announces itself", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  assert.equal(readPlaceholderMode(storage, ""), false);
  assert.equal(readPlaceholderMode(storage, "?placeholders=1"), true);
  assert.equal(readPlaceholderMode(storage, ""), true, "the choice persists");
  assert.equal(readPlaceholderMode(storage, "?placeholders=0"), false);
  // While it is on, every page paints a banner, so a screenshot taken in this
  // mode can never be mistaken for runtime truth.
  assert.match(kitSrc, /export function placeholderBanner/);
  assert.match(viewSrc, /\$\{placeholderBanner\(placeholders\)\}/);
  assert.match(css, /\.vplaceholder-banner\{/);
});

test("components take fields, not numbers, so a raw value cannot be printed", () => {
  // metric() reads .display and .state off its argument. Handing it a bare
  // number produces nothing rather than an unlabelled figure.
  assert.equal(metric(null), "");
  assert.match(viewSrc, /import \{[\s\S]*?\} from "\.\/vacilando-ui-model\.mjs"/);
  // Every demo value in the product comes from ONE declaration.
  assert.ok(DEMO.usage && DEMO.effectiveness && DEMO.host);
  const kitBody = kitSrc.slice(kitSrc.indexOf("export function renderHome"));
  assert.equal(/:\s*\d{2,}\s*[,)]/.test(kitBody.replace(/width:\d+/g, "")), false,
    "no bare numeric literal may be rendered from a page function");
});

test("effectiveness is unbacked, and says so rather than guessing", () => {
  const m = buildEffectivenessModel({ effectiveness: {}, placeholders: false });
  for (const [k, f] of Object.entries(m)) {
    assert.equal(f.state, DATA_STATE.UNAVAILABLE, `${k} must not invent a value`);
    assert.ok(f.note || f.maturity, `${k} must carry provenance`);
  }
  assert.equal(m.autonomous_pct.maturity, MATURITY.INSTRUMENTATION_REQUIRED);
});

test("a view model can be audited field by field", () => {
  const vm = buildHomeViewModel({ placeholders: true });
  const fields = collectFields(vm);
  assert.ok(fields.length > 15, "the home model must expose its fields");
  assert.equal(surfaceHasPlaceholders(vm), true);
  assert.equal(surfaceHasPlaceholders(buildHomeViewModel({ placeholders: false })), false,
    "production must contain no placeholder anywhere on Home");
});

/* =========================================================================
 * 2. PROVIDER PROGRESS CONTRACT
 * ====================================================================== */

test("the progress contract normalizes, clamps and defaults", () => {
  assert.deepEqual(PROGRESS_CONFIDENCES, ["low", "medium", "high"]);
  assert.deepEqual(PROGRESS_SOURCES, ["provider_estimate", "deterministic", "operator", "derived"]);
  const e = normalizeProgressEstimate({ percent: 62, confidence: "medium", summary: "E2E driver built", source: "provider_estimate" });
  assert.equal(e.percent, 62);
  assert.equal(e.confidence, "medium");
  assert.equal(e.source, "provider_estimate");
  assert.ok(e.updated_at);
  assert.equal(normalizeProgressEstimate({ percent: 180 }).percent, 100);
  assert.equal(normalizeProgressEstimate({ percent: -5 }).percent, 0);
  assert.equal(normalizeProgressEstimate({ percent: 50, confidence: "certain" }).confidence, "low",
    "an unknown confidence must degrade, never be trusted");
  assert.equal(normalizeProgressEstimate({}), null, "nothing reported is nothing stored");
});

test("a stale estimate is unavailable, not a frozen bar", () => {
  const fresh = normalizeProgressEstimate({ percent: 62, nowMs: Date.now() });
  assert.equal(progressEstimateIsStale(fresh), false);
  const old = normalizeProgressEstimate({ percent: 62, nowMs: Date.now() - PROGRESS_STALE_MS - 1000 });
  assert.equal(progressEstimateIsStale(old), true);
  const p = laneProgress({ progress_estimate: old });
  assert.equal(p.available, false);
  assert.equal(p.label, "Progress estimate unavailable");
  assert.equal(p.percent, null);
});

test("the UI renders an estimate as an estimate, and never an ETA", () => {
  const p = laneProgress({
    progress_estimate: {
      percent: 62, confidence: "medium", summary: "E2E driver built; certification in progress",
      source: "provider_estimate", updated_at: new Date().toISOString(),
    },
  });
  assert.equal(p.available, true);
  assert.equal(p.label, "Provider estimate: ~62% complete");
  const markup = renderProgress(p);
  assert.match(markup, /~62% complete/);
  assert.match(markup, /aria-valuenow="62"/);
  assert.match(markup, /width:62%/);
  assert.equal(/\bETA\b/i.test(markup), false);
  assert.equal(/remaining|finish(es)? (at|by)/i.test(markup), false,
    "no completion time may be derived from a percentage");

  // No estimate → words, and NO bar. A zero-width track reads as "0% done".
  const none = renderProgress(laneProgress(null));
  assert.match(none, /Progress estimate unavailable/);
  assert.equal(none.includes("vprogress-fill"), false);
  assert.equal(none.includes("progressbar"), false);
});

test("a deterministic or operator source is labelled as such", () => {
  const at = new Date().toISOString();
  assert.match(laneProgress({ progress_estimate: { percent: 100, source: "deterministic", updated_at: at } }).label, /^Measured: ~100%/);
  assert.match(laneProgress({ progress_estimate: { percent: 40, source: "operator", updated_at: at } }).label, /^Operator estimate: ~40%/);
  assert.match(laneProgress({ progress_estimate: { percent: 40, source: "derived", updated_at: at } }).label, /^Derived estimate: ~40%/);
});

test("progress rides the existing run reporter — there is no parallel system", () => {
  const root = mkdtempSync(join(tmpdir(), "vac-uiv2-"));
  const created = createQueuedRun({ laneId: "lane_aaaabbbbcccc", instruction: "certify the runtime", worktreePath: process.cwd(), root });
  assert.equal(created.ok, true);
  const runId = created.run.run_id;

  // A milestone report with NO state is legal: "I am 62% through" is not a
  // transition, and forcing a restated EXECUTING would make every milestone one.
  const only = reportRunState(runId, null, {
    cwd: process.cwd(), root,
    progress_percent: 62, progress_confidence: "medium", progress_summary: "E2E driver built",
  });
  assert.equal(only.ok, true);
  assert.equal(only.progress_only, true);
  assert.equal(getExecutionRun(runId, root).progress_estimate.percent, 62);

  // A state report may carry one too.
  const both = reportRunState(runId, "executing", { cwd: process.cwd(), root, progress_percent: 80, progress_summary: "tests underway" });
  assert.equal(both.ok, true);
  assert.equal(getExecutionRun(runId, root).progress_estimate.percent, 80);

  // The estimate is projected to the browser.
  assert.equal(publicExecutionRun(getExecutionRun(runId, root)).progress_estimate.percent, 80);

  // A FINISHED RUN HAS NO ESTIMATE TO MAKE. Leaving 80% on a COMPLETE run is
  // exactly the false precision this contract exists to refuse.
  transitionExecutionRun(runId, "COMPLETE", { root, origin: "agent" });
  const done = getExecutionRun(runId, root).progress_estimate;
  assert.equal(done.percent, 100);
  assert.equal(done.source, "deterministic");
});

test("a failed run drops its estimate rather than freezing it", () => {
  const root = mkdtempSync(join(tmpdir(), "vac-uiv2-fail-"));
  const created = createQueuedRun({ laneId: "lane_ddddeeeeffff", instruction: "do the thing", worktreePath: process.cwd(), root });
  const runId = created.run.run_id;
  reportRunState(runId, "executing", { cwd: process.cwd(), root, progress_percent: 55 });
  transitionExecutionRun(runId, "FAILED", { root, origin: "agent", reason: "build broke" });
  assert.equal(getExecutionRun(runId, root).progress_estimate, null);
});

test("the worker CLI exposes the milestone flags and echoes what landed", () => {
  for (const flag of ["--progress", "--progress-confidence", "--progress-summary", "--progress-source", "--remaining-work"]) {
    assert.ok(cliSrc.includes(`"${flag}"`), `vac run-status must accept ${flag}`);
  }
  assert.match(cliSrc, /const state = args\.length && !args\[0\]\.startsWith\("-"\) \? args\.shift\(\) : null;/,
    "the state argument must be optional for a progress-only report");
  assert.match(cliSrc, /progress \$\{pct\} \(\$\{pe\.confidence\} confidence, \$\{pe\.source\}\)/,
    "a worker must be shown the estimate that landed");
  assert.match(cliSrc, /milestones/i, "the CLI must say progress is reported at milestones");
});

test("progress reaches every consumer the contract names", () => {
  // Lane, lane list and Home all read the same helper. Two derivations of one
  // percentage is how two surfaces start disagreeing about the same run.
  assert.match(viewSrc, /laneProgress\(run, \{ nowMs \}\)/);
  assert.match(kitSrc, /l\.progress\?\.available/, "the lane row can show progress");
  const home = renderHome(buildHomeViewModel({
    lanes: [{ lane_id: "lane_x", label: "Trust Runtime", execution_run: { state: "EXECUTING", progress_estimate: { percent: 62, updated_at: new Date().toISOString() } } }],
    laneState: () => ({ label: "Working", key: "working", tone: "run", live: true }),
  }));
  assert.match(home, /vlane-progress-fill/);
});

/* =========================================================================
 * 3. NAVIGATION AND INFORMATION ARCHITECTURE
 * ====================================================================== */

test("desktop and mobile navigate to the same four destinations", () => {
  assert.deepEqual(PRIMARY_NAV.map((n) => n.key), ["home", "lanes", "activity", "system"]);
  const desktop = renderPrimaryNav("home", { needsYou: 2 });
  const mobile = renderMobileNav("home", { needsYou: 2 });
  for (const n of PRIMARY_NAV) {
    assert.ok(desktop.includes(`href="${n.hash}"`), `${n.key} missing from the rail`);
    assert.ok(mobile.includes(`href="${n.hash}"`), `${n.key} missing from the bottom bar`);
  }
  assert.match(desktop, /aria-current="page"/);
  assert.match(mobile, /aria-current="page"/);
  // The mobile bar is NOT the rail squeezed narrow: it carries no lane list, no
  // section headings and no account chrome.
  assert.equal(mobile.includes("gw-lanes"), false);
  assert.equal(mobile.includes("Development Lanes"), false);
  assert.match(html, /id="primary-nav"/);
  assert.match(html, /id="mobile-nav"/);
});

test("navigation carries only a genuine Needs You count", () => {
  const nav = renderPrimaryNav("lanes", { needsYou: 3 });
  assert.match(nav, /vnav-badge/);
  assert.match(nav, />3</);
  for (const f of ["Context", "ahead", "behind", "Slot", "branch"]) {
    assert.equal(nav.includes(f), false, `${f} must not appear in navigation`);
  }
  assert.equal(renderPrimaryNav("home", { needsYou: 0 }).includes("vnav-badge"), false);
});

test("the lane rail carries no diagnostics and invents no grouping", () => {
  // THE FAILURES THIS ENCODES, both found by reading the certification captures.
  //
  //   · Every rail row read "Claude · Context 38%". Neither changes which lane
  //     you open, and diagnostic text under every name is what makes the one
  //     surface that has to stay scannable unscannable.
  //   · With a single repository the rail rendered an "UNATTRIBUTED 4" heading
  //     above every lane — a grouping header that groups nothing, made of
  //     implementation vocabulary, at the top of the primary navigation. It is
  //     the repository equivalent of prominently rendering "No folder".
  const lanes = [
    { lane_id: "lane_a", label: "Trust Runtime", last_activity_ms: Date.now() - 60_000, tmux: { alive: true }, binding: { provider: "claude" } },
    { lane_id: "lane_b", label: "Payments", last_activity_ms: Date.now() - 600_000 },
  ];
  const tel = { lane_a: { available: true, context: { percent_used: 38 } } };
  const rail = renderRail(lanes, null, {}, tel, { repositories: [] });
  assert.equal(rail.includes("Context 38%"), false, "context belongs in the lane, not in navigation");
  assert.equal(rail.includes("gw-rail-repo-h"), false, "no grouping header for a single group");
  assert.equal(rail.includes("is-unattributed"), false, "and no treatment for a header that is not there");
  // Visible text only — a class name is not something the operator reads.
  const visible = rail.replace(/<[^>]*>/g, " ");
  assert.equal(/unattributed|no folder/i.test(visible), false, "one group is not an organisation");
  assert.match(rail, /Trust Runtime/);
  assert.match(rail, /mission-rail-meta">1m ago/, "recency is navigation information");
});

test("absent optional organisation is not reported as a problem", () => {
  // "No folder" and "Not attributed" shouted from the inspector's always-visible
  // area — the latter in red — on every lane that simply had no folder and no
  // repository. Folders are OPTIONAL organisation.
  const insp = renderLaneInspector({ lane_id: "lane_abc123abc123", label: "Trust Runtime" }, { asideInert: false });
  const alwaysVisible = insp.slice(0, insp.indexOf('<details'));
  assert.equal(/No folder|Not attributed/.test(alwaysVisible), false,
    "absent organisation must not be reported in the always-visible panel");
  assert.match(insp, /data-v-inspector="organisation"/, "it is available, folded");
});

test("the lane rail is a Lanes affordance, hidden on the other destinations", () => {
  assert.match(html, /id="rail-lanes"/);
  assert.match(gwSrc, /railLanes\.hidden = G\.page !== "lanes"/);
});

test("Home, Activity and System are standalone destinations", () => {
  for (const page of ["home", "activity", "system"]) {
    const out = renderGatewayShell({ page, lanes: [], listReady: true });
    assert.match(out, new RegExp(`data-gw-mode="${page}"`));
    assert.match(out, new RegExp(`data-v-page="${page}"`));
    // They are not a mode of the lane view: no composer, no lane thread.
    assert.equal(out.includes("gw-composer"), false, `${page} must not render a lane composer`);
  }
});

/* =========================================================================
 * 4. NEEDS YOU
 * ====================================================================== */

test("Needs You holds only genuine blockers, never routine status", () => {
  const lanes = [
    { lane_id: "l1", label: "Working lane", execution_run: { state: "EXECUTING" } },
    { lane_id: "l2", label: "Finished lane", execution_run: { state: "COMPLETE" } },
    { lane_id: "l3", label: "Blocked lane", execution_run: { state: "NEEDS_INPUT", state_reason: "Loopback or Tailscale?" } },
  ];
  const state = (l) => ({ key: l.execution_run.state === "NEEDS_INPUT" ? "needs_input" : "working" });
  const m = buildNeedsYou({ lanes, approvals: [], laneState: state });
  assert.equal(m.count, 1);
  assert.equal(m.items[0].lane_label, "Blocked lane");
  assert.match(m.items[0].request, /Loopback or Tailscale/);
});

test("a governed action and its lane's NEEDS_INPUT are one blocker, not two", () => {
  const lanes = [{ lane_id: "l1", label: "Trust Runtime", execution_run: { state: "NEEDS_INPUT", state_reason: "waiting" } }];
  const m = buildNeedsYou({
    lanes,
    approvals: [{ lane_id: "l1", title: "Read-only database census", requested_at: new Date().toISOString() }],
    laneState: () => ({ key: "needs_input" }),
  });
  assert.equal(m.count, 1);
  assert.equal(m.items[0].kind, "governed_action");
});

test("the lane tray is one line, and many requests collapse into one", () => {
  // THE TRAY IS ONE LINE, AND IT DECIDES NOTHING.
  //
  // It carried the request plus Review AND Authorize, wrapped to ~138px on a
  // phone, and the full governed proposal rendered separately at 591px. Between
  // them they pushed the composer off screen at exactly the moment a decision
  // was waiting. The tray now states WHAT is waiting and offers ONE way in;
  // Review opens the canonical governed surface, which is where a proposal
  // belongs and where approving actually happens.
  const one = needsYouTray([{ kind: "governed_action", request: "Read-only database census", lane_id: "l1" }], { laneId: "l1" });
  assert.match(one, /Needs you/);
  assert.match(one, /Read-only database census/);
  assert.match(one, /data-v-needs-review/);
  assert.equal(one.includes("data-v-needs-authorize"), false,
    "the tray must not approve anything itself");
  assert.equal(one.includes("vneeds-copy"), false, "one line, not a stacked block");

  // THREE REQUESTS DO NOT BECOME THREE CARDS.
  const many = needsYouTray([{ request: "a" }, { request: "b" }, { request: "c" }]);
  assert.match(many, /Needs you/);
  assert.match(many, /3 requests/);
  assert.equal((many.match(/vneeds-tray/g) || []).length, 1, "one tray, not three cards");
  assert.equal((many.match(/data-v-needs-review/g) || []).length, 1, "one way in, not three");

  assert.equal(needsYouTray([]), "", "no tray when nothing needs the operator");
});

test("the tray sits at the human interaction boundary", () => {
  const lane = {
    lane_id: "lane_abc123abc123",
    label: "Trust Runtime",
    execution_run: { state: "NEEDS_INPUT", state_reason: "Loopback or Tailscale?", instruction: "certify" },
  };
  const out = renderGatewayShell({ page: "lanes", lanes: [lane], selectedId: lane.lane_id, lane, listReady: true, outputText: "ok" });
  const trayAt = out.indexOf("vneeds-tray");
  const composerAt = out.indexOf("gw-composer");
  const threadAt = out.indexOf("vcard-thread");
  assert.ok(trayAt > 0 && composerAt > trayAt, "the tray is immediately above the composer");
  // CONVERSATION -> HUMAN ACTION.
  //
  // The Current Work card is gone: it printed the operator's own latest
  // instruction as a titled card directly above the thread that prints the same
  // instruction as their message. Two renderings of one sentence, and the
  // duplicate owned the top of every phone screen. Progress moved into the
  // lane's status line; the run's metadata is untouched in Details and Runs.
  assert.equal(out.includes("vcard-work"), false, "no standalone Current Work card");
  assert.ok(threadAt > 0, "the conversation is the lane body");
  assert.ok(trayAt > threadAt, "the tray must never interrupt the conversation");
});

/* =========================================================================
 * 5. LANE
 * ====================================================================== */

test("the lane header carries identity, not implementation", () => {
  const lane = {
    lane_id: "lane_abc123abc123", label: "Trust Runtime", slot: 6, tmux: { alive: true },
    binding: { provider: "claude" },
    execution_run: { state: "EXECUTING", started_at: new Date().toISOString(), instruction: "Certify the runtime" },
  };
  const out = renderGatewayShell({
    page: "lanes", lanes: [lane], selectedId: lane.lane_id, lane, listReady: true, outputText: "ok",
    telemetry: { available: true, agent: { model: "claude-opus-5" }, context: { percent_used: 38 } },
  });
  assert.match(out, /class="vcrumb vlane-crumb"/);
  assert.match(out, />Lanes<\/a>/);
  assert.match(out, /vlane-title">Trust Runtime</);
  assert.match(out, /claude-opus-5/);
  assert.match(out, /Slot 6/);
  assert.match(out, /Stop lane/);
  assert.match(out, /Lane details/);
  for (const tab of ["Overview", "Activity", "Files", "Commits", "Runs", "Settings"]) {
    assert.ok(out.includes(`>${tab}</a>`), `the ${tab} tab must exist`);
  }
});

test("an unimplemented tab renders the shell and names its future owner", () => {
  const lane = { lane_id: "lane_abc123abc123", label: "Trust Runtime" };
  const out = renderGatewayShell({ page: "lanes", tab: "commits", lanes: [lane], selectedId: lane.lane_id, lane, listReady: true });
  assert.match(out, /Not implemented/);
  assert.match(out, /source-control\.mjs/);
  assert.equal(/\d+ commits/.test(out), false, "an unbuilt tab must not fabricate content");
});

test("the inspector is quiet by default and folds everything but Run", () => {
  const lane = {
    lane_id: "lane_abc123abc123", label: "Trust Runtime", slot: 6, tmux: { alive: true },
    git: { state: "clean", ahead: 2, behind: 0, branch: "agent/trust" },
    execution_run: { state: "EXECUTING", started_at: new Date(Date.now() - 18 * 60000).toISOString() },
  };
  const insp = renderLaneInspector(lane, {
    telemetry: { available: true, context: { percent_used: 38 }, agent: { model: "claude-opus-5" } },
    executionCapacity: { total: 8 },
    asideInert: false,
  });
  assert.match(insp, /vinsp-run/);
  assert.match(insp, /18m active/);
  assert.match(insp, /6 \/ 8/);
  assert.match(insp, /38%/);
  // Nothing but Run is open.
  const opened = insp.match(/<details class="vinsp-sec"[^>]*open/g) || [];
  assert.equal(opened.length, 0, "a healthy lane opens no folded section");
  assert.match(insp, /data-v-inspector="git"/);
  assert.match(insp, /data-v-inspector="diagnostics"/);
});

/* =========================================================================
 * 6. ACTIVITY AND SYSTEM
 * ====================================================================== */

test("activity is history, and its kinds are the product's own", () => {
  assert.equal(classifyEvent("execution_run.complete").kind, "work");
  assert.equal(classifyEvent("execution_run.failed").outcome, "failed");
  assert.equal(classifyEvent("execution_run.needs_input").kind, "governance");
  assert.equal(classifyEvent("scm.push").kind, "git");
  assert.equal(classifyEvent("scm.promote").kind, "promotion");
  // An unknown type is kept and labelled, never dropped: silently discarding
  // history is worse than a generic label.
  assert.equal(classifyEvent("something.new").kind, "system");
});

test("activity filters narrow without hiding the total", () => {
  const events = [
    { at: "2026-09-03T10:00:00Z", lane_id: "l1", kind: "work", summary: "Work completed", outcome: "ok" },
    { at: "2026-09-03T09:00:00Z", lane_id: "l2", kind: "git", summary: "Branch pushed", outcome: "ok" },
  ];
  const lanes = [{ lane_id: "l1", label: "Trust Runtime" }, { lane_id: "l2", label: "Payments" }];
  const all = buildActivityViewModel({ events, lanes });
  assert.equal(all.rows.length, 2);
  assert.equal(all.rows[0].lane_label, "Trust Runtime", "newest first");
  const filtered = buildActivityViewModel({ events, lanes, filters: { kind: "git" } });
  assert.equal(filtered.rows.length, 1);
  assert.equal(filtered.total, 2);
  const markup = renderActivity(filtered);
  assert.match(markup, /1 of 2/);
  assert.match(markup, /Branch pushed/);
  // Needs You is never used for history.
  assert.equal(markup.includes("vneeds"), false);
});

test("system health reads its owners and never averages an unknown", () => {
  const h = buildSystemHealth({
    resources: { overall: { cpu_load_pct: 40, mem_used_pct: 95, swap: { used_mb: 2048 }, slots: { pressure: "high", total: 6, occupied: 5 } } },
  });
  assert.equal(h.cpu.state, DATA_STATE.LIVE);
  assert.equal(h.memory_health, HEALTH.PROBLEM);
  assert.equal(h.overall, HEALTH.PROBLEM, "the worst signal wins");
  assert.equal(h.swap_trend.state, DATA_STATE.UNAVAILABLE, "trajectory is not measured");
  assert.equal(h.swap_trend.maturity, MATURITY.DERIVABLE);
  const empty = buildSystemHealth({ resources: null });
  assert.equal(empty.overall, HEALTH.UNKNOWN);
  assert.equal(empty.cpu.state, DATA_STATE.UNAVAILABLE);
});

test("the System surface renders every intended area", () => {
  const out = renderSystem(buildSystemViewModel({ resources: null, placeholders: false }));
  for (const area of ["Host", "Capacity", "Runtime", "Providers", "Environment", "Health history"]) {
    assert.ok(out.includes(`>${area}</h2>`), `System must render ${area}`);
  }
  assert.match(out, /No health history yet/, "an honest empty state, not a blank panel");
});

test("usage says which window it can actually answer", () => {
  const m = buildUsageModel({ usage: { providers: [] }, window: "30d" });
  assert.equal(m.window_supported, false);
  assert.match(renderHome(buildHomeViewModel({ usage: { providers: [], window: "30d" } })), /not aggregated yet/);
});

/* =========================================================================
 * 7. VISUAL SYSTEM
 * ====================================================================== */

test("semantic colour is the brand, and red is reserved", () => {
  const root = css.slice(css.indexOf(":root{"), css.indexOf("}", css.indexOf("--shadow-sm")));
  // Declarations only. The comment above them names the retired colours on
  // purpose, so the record of what changed survives.
  const decls = root.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(root, /--ok:var\(--vacilando-juniper\)/, "healthy/active is pine");
  assert.match(root, /--green:var\(--vacilando-juniper\)/, "the legacy success token is now pine");
  assert.match(root, /--attn:var\(--vacilando-terracotta\)/, "attention is desert");
  assert.match(root, /--run:var\(--vacilando-river\)/, "progress is river");
  assert.match(root, /--plan:var\(--vacilando-sage\)/, "quiet secondary state is sage");
  // The off-brand semantics are gone.
  for (const retired of ["#3a8a5b", "#5f7c9a", "#c98a2e", "#cf5a3a"]) {
    assert.equal(decls.includes(retired), false, `${retired} is not an approved colour`);
  }
  // RED IS ONLY DESTRUCTIVE/ERROR. Busy, waiting and high-number are not errors.
  assert.match(css, /\.vhealth\.is-problem \.vhealth-dot\{background:var\(--danger\);?\}/);
  assert.match(css, /\.vstate\.is-failed \.vstate-dot\{background:var\(--danger\);?\}/);
  assert.equal(/\.vstate\.is-run [^{]*\{[^}]*--danger/.test(css), false, "a running lane is never red");
});

test("the brand mark and the navigation share one ground", () => {
  // The exact mismatch V2 was asked to resolve: a cream plate inside a white
  // rail put the logo on a visibly different background from its own shell.
  const rail = css.match(/\n\.rail\{[^}]*\}/)?.[0] || "";
  const mark = css.match(/\.brand-mark\{[^}]*\}/)?.[0] || "";
  assert.match(rail, /background:var\(--bg\)/);
  assert.match(mark, /background:transparent/);
  assert.equal(mark.includes("border-radius"), false, "no plate means no plate corners");
});

test("there are four grounds, not six competing creams", () => {
  const root = css.slice(css.indexOf(":root{"), css.indexOf("}", css.indexOf("--shadow-sm")));
  const grounds = new Set((root.match(/--(?:bg|bg-tint|card|card-2):(#[0-9a-f]{3,6}|var\([^)]*\)|\w+)/g) || []));
  assert.equal(grounds.size, 4, `expected exactly four ground tokens, saw ${[...grounds]}`);
  assert.match(root, /--bg:#f4efe6/);
  assert.match(root, /--card:#fff/);
});

test("one radius scale and one elevation scale", () => {
  const root = css.slice(css.indexOf(":root{"), css.indexOf("}", css.indexOf("--shadow-sm")));
  assert.match(root, /--radius:12px; --radius-sm:9px; --radius-lg:16px/);
  assert.match(root, /--shadow:/);
  assert.match(root, /--shadow-sm:/);
  // The V2 components use the tokens, never a literal.
  const v2 = css.slice(css.indexOf("VACILANDO UI V2"));
  assert.equal(/border-radius:\s*\d+px/.test(v2.replace(/border-radius:4px/g, "")), false,
    "V2 components must use the radius tokens");
});

/* =========================================================================
 * 8. MOBILE
 * ====================================================================== */

test("mobile is designed, not compressed", () => {
  const mob = css.slice(css.indexOf("@media (max-width: 860px)"));
  // The desktop primary nav is replaced, not shrunk.
  assert.match(mob, /\.rail-primary\{display:none;\}/);
  assert.match(mob, /\.rail-mobile\{display:block/);
  // Multi-column layouts stack rather than squeeze.
  assert.match(mob, /\.vhome-grid,\.vsys-grid\{grid-template-columns:minmax\(0,1fr\)/);
  // Dense rows reflow to two lines instead of four squeezed columns.
  assert.match(mob, /grid-template-areas:"kind lane when" "sum sum sum"/);
});

test("mobile tap targets are real", () => {
  assert.match(css, /\.vtab\{[^}]*min-height:56px/, "the bottom bar clears 56px");
  assert.match(css, /\.vtab\{[^}]*env\(safe-area-inset-bottom/, "and clears the home indicator");
  const mob = css.slice(css.indexOf("@media (max-width: 860px)"));
  for (const rule of [/\.vinsp-sum\{min-height:44px;\}/, /\.vtab-lane\{[^}]*min-height:42px/, /\.vneeds-acts \.btn\{[^}]*min-height:40px/]) {
    assert.match(mob, rule);
  }
  assert.match(css, /\.vfilter select\{[^}]*min-height:38px/);
});

test("nothing may scroll sideways at a narrow width", () => {
  const narrow = css.slice(css.indexOf("@media (max-width: 380px)"));
  assert.ok(narrow.length > 200, "a 380px breakpoint must exist");
  // Every V2 grid is minmax(0, …) so a long value cannot force the track wider
  // than its column — the single most common cause of horizontal overflow.
  const v2 = css.slice(css.indexOf("VACILANDO UI V2"));
  const gridCols = v2.match(/grid-template-columns:repeat\([^)]*\)/g) || [];
  for (const g of gridCols) {
    assert.ok(g.includes("minmax(0,") || g.includes("1fr)"), `${g} must not have an implicit min-content floor`);
  }
  // break-word, not anywhere: `anywhere` split "responsive" into
  // "responsiv / e". A value breaks between words, and inside one only when it
  // genuinely cannot fit.
  assert.match(v2, /\.vmetric-value\{[^}]*overflow-wrap:break-word/);
  assert.equal(/\.vmetric-value\{[^}]*overflow-wrap:anywhere/.test(v2), false);
  assert.match(v2, /\.vact-summary\{[^}]*overflow-wrap:anywhere/);
  assert.match(v2, /\.vtabs-lane\{[^}]*overflow-x:auto/, "lane tabs scroll inside themselves");
});

test("the composer stays reachable with the keyboard open", () => {
  // The app tracks the VISUAL viewport; the interaction zone is pinned inside
  // that box, not the layout viewport a phone keyboard pushes off-screen.
  assert.match(css, /--gw-vvh/);
  assert.match(css, /\.vlane-interaction\{[^}]*env\(safe-area-inset-bottom/);
  const mob = css.slice(css.indexOf("@media (max-width: 860px)"));
  assert.match(mob, /\.app:has\(\.gw\.is-detail\) \.rail-mobile\{display:none;\}/,
    "the bottom bar yields to the composer on a lane");
});

test("health and state have exactly one colour vocabulary", () => {
  assert.match(healthDot(HEALTH.HEALTHY), /vhealth is-healthy/);
  assert.match(healthDot("nonsense"), /is-unknown/, "an unknown condition is never drawn as healthy");
  // Only the kit turns a condition into a colour class.
  const pages = kitSrc.slice(kitSrc.indexOf("export function renderHome"));
  assert.equal(/style="[^"]*(#[0-9a-f]{3,6}|rgb\()/.test(pages), false,
    "no page function may inline a colour");
});

/* =========================================================================
 * 9. THE FINAL CONVERGENCE PASS
 * ====================================================================== */

test("the global control is silent when nothing is pending", () => {
  const quiet = needsYouControl(0);
  assert.equal(quiet.includes("vneeds-ctl-badge"), false, "no badge with nothing to say");
  assert.equal(quiet.includes("has-items"), false, "and no attention colour");
  const loud = needsYouControl(3);
  assert.match(loud, /vneeds-ctl-badge">3</);
  assert.match(loud, /has-items/);
});

test("the interruption centre says so when nothing needs you", () => {
  const empty = needsYouPanel({ items: [] });
  assert.match(empty, /Nothing needs you/);
  assert.equal(empty.includes("vneeds-row"), false);
});

test("the interruption centre summarises; it does not render the proposal", () => {
  const html = needsYouPanel({ items: [{
    lane_id: "l1", lane_label: "Financials", request: "Executable transport required",
    detail: "The lane holds no credentials.", at_ms: Date.now() - 60_000,
    href: "#/lanes/l1", severity: "authorize",
  }] });
  assert.match(html, /Financials/);
  assert.match(html, /Executable transport required/);
  assert.match(html, /The lane holds no credentials/);
  assert.match(html, /data-v-needs-review-link/);
  // Approve/Deny belong on the lane, behind Review, with the request's context.
  assert.equal(/Approve|Deny|content_fingerprint/.test(html), false);
});

test("Home takes the lanes that are doing something, not the directory", () => {
  const summaries = [
    { lane_id: "a", state_key: "ready", at_ms: 900 },
    { lane_id: "b", state_key: "working", at_ms: 100 },
    { lane_id: "c", state_key: "needs_you", at_ms: 50 },
    { lane_id: "d", state_key: "failed", at_ms: 80 },
    { lane_id: "e", state_key: "ready", at_ms: 999 },
  ];
  const out = operationalLanes(summaries);
  assert.deepEqual(out.map((l) => l.lane_id), ["c", "d", "b"], "attention first, then recency");
  assert.equal(out.some((l) => l.state_key === "ready"), false, "a Ready lane is not news");
  assert.equal(operationalLanes(summaries, { limit: 2 }).length, 2, "and it is bounded");
});

test("return context is the origin, and the fallback is never a guess", () => {
  assert.equal(laneReturnTarget({ page: "home" }).hash, "#/home");
  assert.equal(laneReturnTarget({ page: "activity" }).label, "Activity");
  assert.equal(laneReturnTarget({ page: "lanes" }).hash, "#/lanes");
  // A deep link has no journey; the directory is the honest fallback.
  assert.equal(laneReturnTarget(null).hash, "#/lanes");
  assert.equal(laneReturnTarget({ page: "settings" }).hash, "#/lanes");
  assert.equal(laneReturnTarget({ page: "home", scrollY: 420 }).scrollY, 420);
});

test("Copy carries the whole message, not the rendered excerpt", () => {
  const body = ["First paragraph.", "", "Second paragraph, much longer, the part a four-line clamp hides."].join("\n");
  const html = messageRow({ id: "m1", role: "provider", author: "Claude", body, clock: "9:19 PM" });
  const m = html.match(/data-v-copy-text="([^"]*)"/);
  assert.ok(m, "provider output must carry a copy control");
  // The attribute is the underlying message; the clamp is CSS over the same text.
  assert.match(m[1], /Second paragraph/);
  assert.equal(m[1].includes("Claude"), false, "the byline is chrome, not what was said");
  assert.equal(m[1].includes("9:19 PM"), false);
});

test("a message with no body offers nothing to copy", () => {
  const html = messageRow({ id: "m2", role: "provider", author: "Claude", body: "" });
  assert.equal(html.includes("data-v-msg-copy"), false);
});

test("lane resources are honest field by field", () => {
  const wired = buildLaneResources({ resource_use: {
    attribution: "ancestry", process_count: 6, memory_mb: 1743, complete: true,
    sampled_at: new Date().toISOString(),
  } });
  assert.equal(wired.available, true);
  assert.equal(wired.memory.maturity, MATURITY.LIVE);
  assert.equal(wired.memory.state, "live");
  assert.equal(wired.memory.display, "1.7 GB");
  // The two that have no source must never render a number.
  assert.equal(wired.cpu.maturity, MATURITY.INSTRUMENTATION_REQUIRED);
  assert.equal(wired.cpu.state, "unavailable");
  assert.equal(/\d/.test(wired.cpu.display), false, "CPU must not show a figure it did not measure");
  assert.equal(wired.peak_memory.maturity, MATURITY.AVAILABLE_NOT_WIRED);
  assert.equal(wired.peak_memory.state, "unavailable");
  assert.match(wired.cpu.note, /lifetime average/);

  // A lane with no seat is UNKNOWN, and must not read as an idle lane.
  const none = buildLaneResources({});
  assert.equal(none.available, false);
  assert.equal(none.memory.state, "unavailable");
  assert.equal(/^0/.test(none.memory.display), false, "unmeasured must never render as zero");
});

test("a governed action's lane reference is resolved, never pasted into a route", () => {
  // MEASURED ON THE RUNNING HOST. gar_3368b11eb1b1ce carried lane_id "ui-vac" —
  // the worktree NAME — while its lane is lane_9b9082778292. Trusting it built
  // #/lanes/ui-vac, and the operator got "Lane unavailable" from the one control
  // that exists to take them to what needs them.
  const lanes = [{
    lane_id: "lane_9b9082778292",
    label: "UI-Vac",
    worktree_path: { name: "ui-vac", path: "/Users/vacilando/Code/alloy-worktrees/ui-vac" },
  }];
  const approval = {
    request_id: "gar_3368b11eb1b1ce",
    lane_id: "ui-vac",
    worktree_path: "/Users/vacilando/Code/alloy-worktrees/ui-vac",
    action_key: "database.read_census",
    title: "Read-only database census",
    requested_at: new Date(Date.now() - 45 * 60_000).toISOString(),
  };
  assert.equal(resolveApprovalLane(approval, lanes)?.lane_id, "lane_9b9082778292");

  const m = buildNeedsYou({ lanes, approvals: [approval] });
  assert.equal(m.count, 1);
  assert.equal(m.items[0].lane_id, "lane_9b9082778292");
  assert.equal(m.items[0].lane_label, "UI-Vac", "the row names the lane, not the worktree");
  assert.equal(m.items[0].href, "#/lanes/lane_9b9082778292");
  assert.equal(m.items[0].lane_resolved, true);
});

test("a reference that names no lane offers no route at all", () => {
  const approval = { lane_id: "a-lane-that-does-not-exist", action_key: "repository.push" };
  const m = buildNeedsYou({ lanes: [], approvals: [approval] });
  assert.equal(m.items[0].href, null, "never #/lanes/<invalid id>");
  assert.equal(m.items[0].lane_resolved, false);
  const panel = needsYouPanel(m);
  assert.equal(/href="#\/lanes\/a-lane-that-does-not-exist"/.test(panel), false);
  assert.match(panel, /vneeds-row-unresolved/, "it says so rather than linking nowhere");
});

test("resolution falls back through path then name, and refuses a blank reference", () => {
  const lanes = [{ lane_id: "lane_x", label: "X", worktree_path: { name: "wt-x", path: "/tmp/wt-x" } }];
  assert.equal(resolveApprovalLane({ lane_id: "lane_x" }, lanes)?.lane_id, "lane_x");
  assert.equal(resolveApprovalLane({ lane_id: "nope", worktree_path: "/tmp/wt-x" }, lanes)?.lane_id, "lane_x");
  assert.equal(resolveApprovalLane({ lane_id: "wt-x" }, lanes)?.lane_id, "lane_x");
  assert.equal(resolveApprovalLane({}, lanes), null);
  assert.equal(resolveApprovalLane({ lane_id: "" }, lanes), null);
});

test("compose mode reserves the bottom safe-area inset exactly zero times", () => {
  // THE CHECK THE GEOMETRY CANNOT MAKE.
  //
  // Desktop Chromium reports every safe-area inset as 0, so the browser probes
  // measured 8 + 6 + 4 = 18px of padding under the composer and passed. On an
  // iPhone the same three rules resolve to the home-indicator inset instead —
  // 34 + 34 + 34 = 102px of blank, application-owned band between the composer
  // and the keyboard. No amount of measuring on this machine can see that, so
  // it is asserted against the stylesheet.
  //
  // While the keyboard is open there is no home indicator to avoid: the
  // keyboard covers it. The compose block must therefore reserve the inset
  // nowhere, and say so in pixels where it wants a gap.
  const block = css.slice(css.indexOf("THE KEYBOARD IS THE BOTTOM INSET"));
  assert.ok(block, "the compose anchor block must exist");
  // DECLARATIONS ONLY. The comment above deliberately NAMES the three rules it
  // replaces, so a slice that begins inside it would fail the very check it
  // explains. Start at the @media that follows the prose.
  const start = block.indexOf("@media");
  const composeRules = block
    .slice(start, block.indexOf("\n}\n", start) + 3)
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/safe-area-inset-bottom/.test(composeRules), false,
    "compose mode must not reserve the bottom inset — the keyboard is the inset");
  for (const sel of ["body", ".view:has(.gw.is-detail)", ".vlane-interaction"]) {
    const re = new RegExp(`:root\\[data-gw-compose\\]\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}]*padding-bottom:0`);
    assert.match(composeRules, re, `${sel} must not reserve a band under the composer`);
  }
  // body stops padding the bottom, so the app must stop subtracting it, or the
  // app ends short of the viewport and the gap reopens from the other side.
  assert.match(composeRules, /:root\[data-gw-compose\] \.app\{[^}]*height:calc\(var\(--gw-vvh[^}]*\)/);
  assert.equal(/:root\[data-gw-compose\] \.app\{[^}]*safe-area-inset-bottom/.test(composeRules), false);
});

test("a resolved governed action can never re-enter Needs You", () => {
  // THE DEFECT THIS ENCODES. A lane payload carries a SNAPSHOT of its governed
  // action, so a decided one stays embedded in the record long after the
  // decision. The UI had its own idea of what "still needs you" meant —
  // `awaiting_operator || pending` — where `pending` is a status the governed
  // lifecycle never produces, and the three states that genuinely precede an
  // operator decision were missing. A whitelist keeps terminal states out by
  // construction rather than by remembering to list them.
  assert.deepEqual([...GOVERNED_ACTIONABLE_STATUSES], [
    "requested", "awaiting_director", "awaiting_control_plane_refresh", "awaiting_operator",
  ]);
  for (const status of ["complete", "failed", "denied", "cancelled", "expired", "superseded", "executing"]) {
    assert.equal(isActionableGovernedAction({ status }), false, `${status} must not be actionable`);
  }
  for (const status of GOVERNED_ACTIONABLE_STATUSES) {
    assert.equal(isActionableGovernedAction({ status }), true, `${status} must be actionable`);
  }
  assert.equal(isActionableGovernedAction(null), false);
  assert.equal(isActionableGovernedAction({}), false);
  // `pending` was invented by the old UI check and is not a real status.
  assert.equal(isActionableGovernedAction({ status: "pending" }), false);

  // And end to end: a lane whose run still carries the DENIED census must not
  // appear, while the same lane with it still awaiting must.
  const denied = {
    lane_id: "l1", label: "UI-Vac",
    execution_run: { state: "EXECUTING", governed_action: { request_id: "gar_x", status: "failed", action_key: "database.read_census" } },
  };
  const awaiting = {
    lane_id: "l1", label: "UI-Vac",
    execution_run: { state: "EXECUTING", governed_action: { request_id: "gar_x", status: "awaiting_operator", action_key: "database.read_census" } },
  };
  const state = () => ({ key: "executing", group: "active", live: true });
  assert.equal(buildNeedsYou({ lanes: [denied], approvals: [], laneState: state }).count, 0,
    "a decided request must leave Needs You");
  assert.equal(buildNeedsYou({ lanes: [awaiting], approvals: [], laneState: state }).count, 1,
    "and an undecided one must still be there");
});

test("the badge counts exactly what the panel renders", () => {
  // The nav badge read the notification store's own actionable number while the
  // control, the panel heading and the rows came from buildNeedsYou. Two stores,
  // free to disagree — a badge insisting something needs you over a panel that
  // says nothing does. paintNav now reads needsYouVm().count; this asserts the
  // three numbers a reader can see all come from the one model.
  const model = buildNeedsYou({
    lanes: [],
    approvals: [
      { lane_id: "l1", action_key: "repository.push", status: "awaiting_operator", requested_at: new Date().toISOString() },
      { lane_id: "l2", action_key: "database.read_census", status: "awaiting_operator", requested_at: new Date().toISOString() },
    ],
  });
  const panel = needsYouPanel(model);
  // `vneeds-row-mark`, `-copy`, `-lane` … all start with the row's own class,
  // so count the list items rather than any element whose name begins with it.
  const rendered = (panel.match(/<li class="vneeds-row /g) || []).length;
  const heading = panel.match(/vneeds-panel-count">(\d+)</)?.[1];
  const badge = needsYouControl(model.count).match(/vneeds-ctl-badge">(\d+)</)?.[1];
  assert.equal(model.count, 2);
  assert.equal(rendered, 2, "rows rendered");
  assert.equal(heading, "2", "panel heading");
  assert.equal(badge, "2", "global badge");
  const gwSrc = readFileSync(join(PUB, "gateway.js"), "utf8");
  assert.match(gwSrc, /const needs = needsYouVm\(\)\.count;/,
    "the nav badge must count the rendered set, not a second store");
});

test("an emptied canonical list is an answer, not a missing one", () => {
  // THE HAZARD THIS CLOSES. needsYouVm fell back to the Home projection whenever
  // the canonical pending list was EMPTY — treating "nothing is pending" as "not
  // loaded yet". The moment the last request is resolved that list legitimately
  // empties, and the fallback would re-present whatever the other projection
  // still held: a decided request, back from the dead, on the one surface whose
  // whole job is to say what is still open.
  const gwSrc = readFileSync(join(PUB, "gateway.js"), "utf8");
  assert.match(gwSrc, /const approvals = G\.approvalsLoaded \? \(G\.approvals \|\| \[\]\) : \(G\.home\?\.approvals \|\| \[\]\);/,
    "the canonical list is authoritative once it has answered, however short the answer");
  assert.equal(/G\.approvals && G\.approvals\.length\) \? G\.approvals/.test(gwSrc), false,
    "length must never stand in for loadedness");
  assert.match(gwSrc, /G\.approvalsLoaded = true;/, "the fetch must record that it answered");
});
