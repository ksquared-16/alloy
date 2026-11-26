#!/usr/bin/env node
/**
 * Mac mini residuals.
 *
 *  1. A known benign provider onboarding interstitial is answered deterministically
 *     so a trusted managed worktree never needs a human at a terminal. Everything
 *     else still blocks.
 *  2. Shared-host mutation (the toolkit/current flip) is exclusive: two runs
 *     cannot both own it, and it is released on success, failure and abandonment.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BENIGN_ONBOARDING_ANSWERS,
  benignOnboardingAnswer,
} from "../lib/vacilando/provider-prompt-readiness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = mkdtempSync(join(tmpdir(), "vac-resid-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// ------------------------------------------------ 1. onboarding boundary

const REAL_ONBOARDING = [
  "  Teach auto mode about your environment?",
  "",
  "  Auto mode works better when it knows your environment. Takes about a minute.",
  "",
  "  ❯ 1. Yes",
  "    2. Not now",
  "    3. Don't show again",
  "",
  "  Enter to confirm · Esc to cancel",
].join("\n");

await test("the known benign onboarding screen has a deterministic DECLINING answer", () => {
  const out = benignOnboardingAnswer(REAL_ONBOARDING, { provider: "claude" });
  assert.ok(out, "must be classified");
  assert.equal(out.id, "claude_auto_mode_environment_onboarding");
  assert.equal(out.answer, "Not now", "we decline; we never opt in");
  assert.deepEqual(out.keys, ["2"]);
});

await test("an UNKNOWN provider prompt still blocks", () => {
  const unknown = "  Reconfigure the widget pipeline?\n\n  ❯ 1. Yes\n    2. Not now\n";
  assert.equal(benignOnboardingAnswer(unknown, { provider: "claude" }), null);
});

await test("permission prompts are never auto-answered", () => {
  const p = "  Allow Claude to run `rm -rf build`?\n\n  ❯ 1. Yes\n    2. Not now\n";
  assert.equal(benignOnboardingAnswer(p, { provider: "claude" }), null);
});

await test("workspace-trust prompts are never auto-answered", () => {
  const t = "  Do you trust the files in this folder?\n\n  ❯ 1. Yes\n    2. Not now\n";
  assert.equal(benignOnboardingAnswer(t, { provider: "claude" }), null);
});

await test("authentication and credential prompts are never auto-answered", () => {
  for (const text of [
    "  Sign in to continue\n  2. Not now\n",
    "  Paste your API key\n  2. Not now\n",
    "  Enter your password\n  2. Not now\n",
  ]) assert.equal(benignOnboardingAnswer(text, { provider: "claude" }), null, text);
});

await test("destructive, privilege and side-effect prompts are never auto-answered", () => {
  for (const text of [
    "  Teach auto mode about your environment?\n  Delete the existing config?\n  2. Not now\n",
    "  Teach auto mode about your environment?\n  Run with sudo?\n  2. Not now\n",
    "  Teach auto mode about your environment?\n  Push to origin?\n  2. Not now\n",
    "  Teach auto mode about your environment?\n  Approve governed action?\n  2. Not now\n",
  ]) assert.equal(benignOnboardingAnswer(text, { provider: "claude" }), null, text);
});

await test("a layout change without the decline affordance refuses to press anything", () => {
  const moved = "  Teach auto mode about your environment?\n\n  ❯ 1. Yes\n    2. Sure\n";
  assert.equal(benignOnboardingAnswer(moved, { provider: "claude" }), null);
});

await test("REGRESSION: unrelated scrollback above the modal cannot veto it", () => {
  // A real transcript mentioning "push"/"merge" three lines up refused a screen
  // that was itself clean, sending the operator to a terminal anyway.
  const withHistory = [
    "  Branch pushed to origin; merge is pending review.",
    "  Deleted the stale worktree and reset the index.",
    "  ─────────────────────────",
    REAL_ONBOARDING,
  ].join("\n");
  const out = benignOnboardingAnswer(withHistory, { provider: "claude" });
  assert.ok(out, "history above the modal is not the screen being answered");
  assert.equal(out.answer, "Not now");
});

await test("danger INSIDE the modal region still blocks", () => {
  const mixed = "  Teach auto mode about your environment?\n  Allow push to origin?\n    2. Not now\n";
  assert.equal(benignOnboardingAnswer(mixed, { provider: "claude" }), null);
});

await test("the answer table only ever declines", () => {
  for (const e of BENIGN_ONBOARDING_ANSWERS) {
    assert.match(e.answer, /not now|no|skip|later|dismiss/i, `${e.id} must decline`);
  }
});

await test("a screen for another provider is not answered on this provider", () => {
  assert.equal(benignOnboardingAnswer(REAL_ONBOARDING, { provider: "cursor" }), null);
});

// --------------------------------------- 2. shared host mutation exclusivity

const { createDurableLane, resetDevelopmentLanesForTests } = await import("../lib/vacilando/development-lane.mjs");
const { createQueuedRun, transitionExecutionRun, resetExecutionRunsForTests } = await import("../lib/vacilando/execution-run.mjs");
const {
  acquireGatewayHostMutation,
  releaseGatewayHostMutation,
  assertGatewayHostMutationAllowed,
  gatewayHostMutationHolder,
} = await import("../lib/vacilando/gateway-host-mutation.mjs");
const { cleanupRunResources } = await import("../lib/vacilando/execution-resource.mjs");

// Distinct worktrees per lane: a durable lane is identified by its binding, so
// two lanes sharing one path are ONE lane and cannot model two competing runs.
function lane(name) {
  const wt = join(ROOT, `wt-${name}`);
  mkdirSync(join(wt, ".git"), { recursive: true });
  writeFileSync(join(wt, ".git", "HEAD"), "ref: refs/heads/x\n");
  return createDurableLane({
    name,
    binding: { worktree_path: wt, worktree_name: `wt-${name}`, branch: "x", provider: "claude", tmux_session: `alloy-${name}` },
    origin: "adopted",
    root: ROOT,
  }).lane;
}

await test("two concurrent runs cannot both own gateway_host_mutation", async () => {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  const a = lane("alpha");
  const b = lane("beta");
  assert.notEqual(a.lane_id, b.lane_id, "fixture must model two DIFFERENT lanes");
  const ra = createQueuedRun({ laneId: a.lane_id, instruction: "install", root: ROOT }).run;
  const rb = createQueuedRun({ laneId: b.lane_id, instruction: "install", root: ROOT }).run;
  assert.notEqual(ra.run_id, rb.run_id, "fixture must model two DIFFERENT runs");

  const first = acquireGatewayHostMutation({ runId: ra.run_id, laneId: a.lane_id, reason: "toolkit install", root: ROOT });
  assert.equal(first.granted, true, "first run owns the host");

  const second = acquireGatewayHostMutation({ runId: rb.run_id, laneId: b.lane_id, reason: "toolkit install", root: ROOT });
  assert.equal(second.granted, false, "second run must NOT own it concurrently");
  assert.equal(second.state, "QUEUED", "it waits explicitly");
  assert.ok(second.holder, "and can see who holds it");
  assert.equal(second.holder.run_id, ra.run_id);
});

await test("an unowned run is refused the flip while another holds it", async () => {
  const holder = gatewayHostMutationHolder(ROOT);
  assert.ok(holder, "precondition: held");
  const denied = assertGatewayHostMutationAllowed({ runId: "erun_someone_else", root: ROOT });
  assert.equal(denied.ok, false);
  assert.equal(denied.error, "gateway_host_mutation_held");
  const allowed = assertGatewayHostMutationAllowed({ runId: holder.run_id, root: ROOT });
  assert.equal(allowed.ok, true, "the owner itself may proceed");
});

await test("release hands the host to the waiting run, which may then proceed", async () => {
  const before = gatewayHostMutationHolder(ROOT);
  assert.ok(before, "precondition: someone holds it");
  const rel = releaseGatewayHostMutation({ runId: before.run_id, root: ROOT });
  assert.equal(rel.ok, true, `release failed: ${rel.error || ""}`);

  // The queued second run is promoted by the ordinary governor grant path —
  // "when ownership releases, queued mutation may proceed".
  const after = gatewayHostMutationHolder(ROOT);
  assert.ok(after, "the waiting run must now own it");
  assert.notEqual(after.run_id, before.run_id, "ownership actually moved");
  assert.equal(
    assertGatewayHostMutationAllowed({ runId: after.run_id, root: ROOT }).ok,
    true,
    "the new owner may mutate the host",
  );
  // And it is still exclusive: nobody else may.
  assert.equal(assertGatewayHostMutationAllowed({ runId: "erun_anyone", root: ROOT }).ok, false);

  // Fully drain so later cases start from a free host.
  releaseGatewayHostMutation({ runId: after.run_id, root: ROOT });
  assert.equal(gatewayHostMutationHolder(ROOT), null, "host is free once fully drained");
});

await test("an ABANDONED owner does not strand the host", async () => {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  const a = lane("gamma");
  const ra = createQueuedRun({ laneId: a.lane_id, instruction: "install", root: ROOT }).run;
  const got = acquireGatewayHostMutation({ runId: ra.run_id, laneId: a.lane_id, root: ROOT });
  assert.equal(got.granted, true);
  transitionExecutionRun(ra.run_id, "ABANDONED", { reason: "died", origin: "governor", root: ROOT });
  cleanupRunResources(ra.run_id, { origin: "governor", root: ROOT });
  assert.equal(gatewayHostMutationHolder(ROOT), null, "a dead owner must not hold the host forever");
});

await test("alloy-toolkit refuses to flip toolkit/current while another run holds the host", async () => {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  const a = lane("delta");
  const ra = createQueuedRun({ laneId: a.lane_id, instruction: "install", root: ROOT }).run;
  acquireGatewayHostMutation({ runId: ra.run_id, laneId: a.lane_id, root: ROOT });

  let code = 0;
  let stderr = "";
  try {
    execFileSync(join(HERE, "..", "alloy-toolkit"), ["rollback", "deadbeef"], {
      env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT, ALLOY_TOOLKIT_ROOT: join(ROOT, "tk") },
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    code = e.status;
    stderr = String(e.stderr || "");
  }
  assert.notEqual(code, 0, "the flip must be refused, not silently performed");
  assert.ok(
    /gateway_host_mutation|no installed version/.test(stderr),
    `expected a host-mutation refusal, got: ${stderr.slice(0, 200)}`,
  );
  releaseGatewayHostMutation({ runId: ra.run_id, root: ROOT });
});

await test("REGRESSION: the guard CLI works when invoked through a symlink", async () => {
  // Every real caller reaches this module through toolkit/current, a symlink.
  // Comparing import.meta.url to argv[1] made the CLI block never run, so
  // `check` exited 0 and reported a free host no matter who held it.
  const { symlinkSync, mkdirSync: mkd } = await import("node:fs");
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  const a = lane("symlinkowner");
  const ra = createQueuedRun({ laneId: a.lane_id, instruction: "install", root: ROOT }).run;
  const got = acquireGatewayHostMutation({ runId: ra.run_id, laneId: a.lane_id, root: ROOT });
  assert.equal(got.granted, true);

  const linkDir = join(ROOT, "linkdir");
  mkd(linkDir, { recursive: true });
  const link = join(linkDir, "current-lib");
  try { symlinkSync(join(HERE, "..", "lib", "vacilando"), link); } catch { /* exists */ }
  const viaSymlink = join(link, "gateway-host-mutation.mjs");

  let code = 0;
  try {
    execFileSync(process.execPath, [viaSymlink, "check"], {
      env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT },
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) { code = e.status; }
  assert.equal(code, 3, "a held host must REFUSE even when reached through a symlink");
  releaseGatewayHostMutation({ runId: ra.run_id, root: ROOT });
});

await test("a continuation links to its predecessor without rewriting it", async () => {
  const { patchRunFields, getExecutionRun } = await import("../lib/vacilando/execution-run.mjs");
  const { createHash } = await import("node:crypto");
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  const l = lane("continuation");
  const first = createQueuedRun({ laneId: l.lane_id, instruction: "PRESERVED OPERATOR TEXT", root: ROOT }).run;
  transitionExecutionRun(first.run_id, "EXECUTING", { reason: "d", origin: "system", root: ROOT });
  transitionExecutionRun(first.run_id, "FAILED", { reason: "verification_failed", origin: "governor", root: ROOT });

  const sha = createHash("sha256").update("PRESERVED OPERATOR TEXT", "utf8").digest("hex");
  const next = createQueuedRun({ laneId: l.lane_id, instruction: "PRESERVED OPERATOR TEXT", root: ROOT }).run;
  patchRunFields(next.run_id, {
    continuation_of: { run_id: first.run_id, reason: "preserved operator instruction re-sent", instruction_sha256: sha },
  }, { root: ROOT });

  const successor = getExecutionRun(next.run_id, ROOT);
  assert.equal(successor.continuation_of.run_id, first.run_id, "successor points at the historical run");
  assert.equal(successor.continuation_of.instruction_sha256, sha);

  const historical = getExecutionRun(first.run_id, ROOT);
  assert.equal(historical.state, "FAILED", "the historical run stays terminal");
  assert.equal(historical.instruction, "PRESERVED OPERATOR TEXT", "and keeps its instruction verbatim");
  assert.equal(historical.continuation_of, undefined, "history is not rewritten");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
