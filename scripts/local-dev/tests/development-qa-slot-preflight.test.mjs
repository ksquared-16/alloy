#!/usr/bin/env node
/**
 * A GOVERNED QA ACTION GETS ITS LANE A DEVELOPMENT SLOT FIRST.
 *
 * DIRECTOR DECISION — OPTION C. Safe Development Slot acquisition is
 * infrastructure scheduling, consistent with the promoted dev-server path, and
 * needs no approval of its own. The QA actions themselves stay governed exactly
 * as they were: provisioning, access assignment and session restore keep their
 * authorization, identity, tenant and secret controls untouched.
 *
 * The boundary these controls hold:
 *
 *     validate QA request
 *       -> ensureLaneSlot(target lane)
 *         -> assert managed lane environment
 *           -> the governed QA action
 *
 * `ensureLaneSlot` stays the SOLE allocator. There is no QA-specific allocator,
 * no second ranking and no reclaim approval flow, and the source-level controls
 * below fail if one appears.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-qa-preflight-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.ALLOY_MAX_AGENTS = "3";
mkdirSync(join(ROOT, "metadata"), { recursive: true });
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");
const P = await import("../lib/vacilando/qa-slot-preflight.mjs");
const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const { createDurableLane, bindDurableLane, getDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");

const QA = ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY;

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  L.resetRegisterImplForTests();
  rmSync(join(ROOT, "metadata"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "metadata"), { recursive: true });
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const metaPath = (n) => join(ROOT, "metadata", `${n}.env`);
function reg(name, slot) {
  writeFileSync(metaPath(name), [
    `ALLOY_WORKTREE_NAME="${name}"`,
    ...(slot == null ? [] : [`ALLOY_WORKTREE_SLOT="${slot}"`, `PORT="${3010 + slot}"`]),
    `ALLOY_WORKTREE_PATH="${join(ROOT, name)}"`,
    `ALLOY_WORKTREE_BRANCH="agent/${name}"`, `ALLOY_AGENT="claude"`,
    `ALLOY_WORKER_LIFECYCLE="active"`, "",
  ].join("\n"), "utf8");
}
function lane(name, worktree, slot) {
  const made = createDurableLane({ name, root: ROOT });
  const id = made.lane?.lane_id || made.lane_id;
  const p = join(ROOT, worktree);
  mkdirSync(p, { recursive: true });
  bindDurableLane(id, {
    type: "alloy_local", worktree_path: p, worktree_name: worktree,
    branch: `agent/${worktree}`, tmux_session: `alloy-${worktree}`, slot, provider: "claude",
  }, { root: ROOT });
  reg(worktree, slot);
  return id;
}
function adoptSeam() {
  L.setRegisterImplForTests((cmd, args) => {
    reg(args[1], args[0] === "--no-slot" ? null : Number(args[0]));
    return { status: 0, stdout: "" };
  });
}
const idle = { activeRun: () => false, sessionAlive: () => false, leaseHeld: () => false, environmentInUse: () => false };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const decommented = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── what the preflight applies to at all ─────────────────────────────────────
await test("Q0. it applies to the three governed QA actions and to nothing else", async () => {
  for (const k of [
    ACTION_TYPES.ENVIRONMENT_PROVISION_QA_IDENTITY,
    ACTION_TYPES.ENVIRONMENT_ASSIGN_QA_IDENTITY_ACCESS,
    ACTION_TYPES.ENVIRONMENT_RESTORE_QA_SESSION,
  ]) assert.equal(P.qaActionNeedsDevelopmentSlot(k), true, `${k} resolves a slot at execution`);
  for (const k of [
    ACTION_TYPES.ENVIRONMENT_RESTORE_DEPLOYED_QA_SESSION,
    ACTION_TYPES.DATABASE_READ_CENSUS,
    ACTION_TYPES.REPOSITORY_PUSH,
    ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
  ]) assert.equal(P.qaActionNeedsDevelopmentSlot(k), false, `${k} must not move capacity`);
  // A deployed target has no lane, no slot and no port — inventing one is how a
  // deployed request gets answered with a loopback session.
  const none = await P.ensureQaDevelopmentSlot("lane_whatever", {
    actionKey: ACTION_TYPES.ENVIRONMENT_RESTORE_DEPLOYED_QA_SESSION, root: ROOT,
  });
  assert.deepEqual(none, { ok: true, required: false, moved: false });
});

// ── the three acquisition routes, through the QA door ────────────────────────
await test("Q1. a QA action on an already-slotted lane moves nothing", async () => {
  const id = lane("Has", "wt-has", 1);
  lane("Neighbour", "wt-n", 2);
  adoptSeam();
  const got = await P.ensureQaDevelopmentSlot(id, { actionKey: QA, root: ROOT, ...idle });
  assert.equal(got.ok, true);
  assert.equal(got.slot, 1);
  assert.equal(got.acquired, "already_held");
  assert.equal(got.moved, false, "an already-placed lane is not a reason to disturb anybody");
  assert.equal(got.movement, undefined, "and there is no movement to report");
  assert.match(readFileSync(metaPath("wt-n"), "utf8"), /ALLOY_WORKTREE_SLOT="2"/);
});

await test("Q2. a slotless QA lane takes a FREE slot automatically", async () => {
  lane("Donor", "wt-donor", 1);           // idle, and would be reclaimable
  const id = lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await P.ensureQaDevelopmentSlot(id, { actionKey: QA, root: ROOT, ...idle });
  assert.equal(got.ok, true);
  assert.equal(got.acquired, "free", "an unused slot always wins over a reclaim");
  assert.equal(got.moved, true);
  assert.equal(got.movement.classification, "free");
  assert.notEqual(got.slot, 1, "and it is not the donor's");
  assert.match(readFileSync(metaPath("wt-donor"), "utf8"), /ALLOY_WORKTREE_SLOT="1"/, "the donor is untouched");
});

await test("Q3. with no free slot, an INACTIVE donor is reclaimed safely", async () => {
  for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
  const id = lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await P.ensureQaDevelopmentSlot(id, { actionKey: QA, root: ROOT, ...idle });
  assert.equal(got.ok, true);
  assert.equal(got.acquired, "reclaimed");
  assert.equal(got.movement.classification, "inactive", "the least costly group, chosen by the ranking");
  assert.ok(got.movement.donor_worktree, "the donor is named");
  assert.ok(got.movement.reason, "and the reason it was safe travels with it");
});

await test("Q4. a WARM resident-but-idle donor may yield to a QA lane", async () => {
  for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
  const id = lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await P.ensureQaDevelopmentSlot(id, {
    actionKey: QA, root: ROOT,
    activeRun: () => false, sessionAlive: () => true,   // resident everywhere
    leaseHeld: () => false, environmentInUse: () => false,
  });
  assert.equal(got.ok, true);
  assert.equal(got.acquired, "reclaimed");
  assert.equal(got.movement.classification, "warm");
});

// ── what it must never do ────────────────────────────────────────────────────
for (const [label, seams] of [
  ["a run in flight", { activeRun: () => true, sessionAlive: () => false, leaseHeld: () => false, environmentInUse: () => false }],
  ["an owned running server", { activeRun: () => false, sessionAlive: () => false, leaseHeld: () => false, environmentInUse: () => "it owns a running dev server on its port" }],
  ["a protected stack lease", { activeRun: () => false, sessionAlive: () => false, leaseHeld: () => true, environmentInUse: () => false }],
  ["an unreadable environment", { activeRun: () => false, sessionAlive: () => false, leaseHeld: () => false, environmentInUse: () => "its local environment could not be read" }],
]) {
  await test(`Q5. ${label} is never taken for a QA action`, async () => {
    for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
    const id = lane("Wanting", "wt-wanting", null);
    adoptSeam();
    const got = await P.ensureQaDevelopmentSlot(id, { actionKey: QA, root: ROOT, ...seams });
    assert.equal(got.ok, false, "a lane that is working keeps its slot");
    assert.equal(got.error, P.NO_DEVELOPMENT_SLOT);
    assert.equal(got.moved, false);
    for (const s of [1, 2, 3]) {
      assert.match(readFileSync(metaPath(`wt-${s}`), "utf8"), new RegExp(`ALLOY_WORKTREE_SLOT="${s}"`), "nothing moved");
    }
  });
}

await test("Q6. no safe donor → the refusal is actionable and nothing is filed", async () => {
  for (const s of [1, 2, 3]) lane(`L${s}`, `wt-${s}`, s);
  const id = lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await P.ensureQaDevelopmentSlot(id, {
    actionKey: QA, root: ROOT,
    activeRun: () => true, sessionAlive: () => true, leaseHeld: () => false, environmentInUse: () => false,
  });
  assert.equal(got.ok, false);
  assert.equal(got.error, "no_development_slot_available", "named the way the dev-server path names it");
  assert.match(got.detail, /instruction is preserved|Development Slot/i, "and it says what to do about it");
  assert.ok(Array.isArray(got.candidates), "with the evidence the refusal was based on");
});

await test("Q7. the donor's lane, session, worktree, branch and history survive", async () => {
  const donorIds = [1, 2, 3].map((s) => lane(`L${s}`, `wt-${s}`, s));
  const id = lane("Wanting", "wt-wanting", null);
  adoptSeam();
  const got = await P.ensureQaDevelopmentSlot(id, { actionKey: QA, root: ROOT, ...idle });
  assert.equal(got.ok, true);
  const donorWorktree = got.movement.donor_worktree;
  const donorLane = donorIds
    .map((d) => getDurableLane(d, ROOT))
    .find((l) => l?.binding?.worktree_name === donorWorktree);
  assert.ok(donorLane, "the donor lane still exists — this is a demotion, never a retirement");
  assert.equal(L.resolveLaneWorktree(donorLane.lane_id, { root: ROOT }).lane_open, true, "and it is still open");
  assert.equal(donorLane.binding.worktree_path, join(ROOT, donorWorktree), "its worktree is where it was");
  assert.equal(donorLane.binding.branch, `agent/${donorWorktree}`, "on the branch it was on");
  assert.equal(donorLane.binding.tmux_session, `alloy-${donorWorktree}`, "with its session intact");
  const meta = readFileSync(metaPath(donorWorktree), "utf8");
  assert.ok(!/ALLOY_WORKTREE_SLOT=/.test(meta), "only the slot is gone");
  assert.match(meta, new RegExp(`ALLOY_WORKTREE_NAME="${donorWorktree}"`), "the registration is kept, not archived");
});

await test("Q8. a lane with no worktree is left to the lifecycle refusal", async () => {
  const made = createDurableLane({ name: "Unbound", root: ROOT });
  const id = made.lane?.lane_id || made.lane_id;
  adoptSeam();
  const got = await P.ensureQaDevelopmentSlot(id, { actionKey: QA, root: ROOT, ...idle });
  assert.equal(got.ok, true, "capacity is not this lane's problem");
  assert.equal(got.moved, false);
  assert.ok(got.deferred_to_lifecycle, "assertManagedLaneEnvironment names the real missing prerequisite");
});

// ── the trigger is wired where the governed QA path actually runs ────────────
await test("Q9. every QA filing path goes through the preflight, not around it", () => {
  for (const [file, needle] of [
    ["../vac-governed-action.mjs", /await fileGovernedActionWithQaSlotPreflight\(/],
    ["../lib/vacilando/v2-api.mjs", /await fileGovernedActionWithQaSlotPreflight\(/],
    ["../vac-browser-auth.mjs", /await fileGovernedActionWithQaSlotPreflight\(/],
  ]) {
    assert.match(src(file), needle, `${file} files through the preflight`);
  }
  // And they AWAIT it. Without await the result is a Promise, which reads to
  // every caller downstream as a malformed refusal.
  assert.ok(!/[^t] requestGovernedAction\(\{\n\s+\.\.\.payload/.test(src("../vac-governed-action.mjs")),
    "the worker CLI no longer files directly");
});

await test("Q10. approval preflights BEFORE anything is minted or spent", () => {
  const s = src("../lib/vacilando/governed-action-request.mjs");
  const fn = s.slice(s.indexOf("export async function approveGovernedAction"));
  const body = fn.slice(0, fn.indexOf("\nexport function denyGovernedAction"));
  const preAt = body.indexOf("ensureQaDevelopmentSlot");
  const mintAt = body.indexOf("mintGrant(");
  const standingAt = body.indexOf("grantMissionAuthorization(");
  const approvalAt = body.indexOf("rec.operator_approval = {");
  assert.ok(preAt > 0, "the approval path preflights the slot");
  assert.ok(preAt < mintAt, "before a grant is minted");
  assert.ok(preAt < standingAt, "before any standing authorization is granted");
  assert.ok(preAt < approvalAt, "and before the decision is recorded");
  assert.match(body, /qaActionNeedsDevelopmentSlot\(rec\.action_key\)/,
    "and only for the actions that actually need a slot");
});

await test("Q11. the movement is visible, and it is not another approval", () => {
  const s = src("../lib/vacilando/governed-action-request.mjs");
  assert.match(s, /slot_preflight: req\.slot_preflight \|\| null/,
    "the request projects what moved on its behalf");
  assert.match(s, /appendAudit\(rec, "development_slot_acquired"/, "and the audit trail records it");
  assert.match(s, /appendAudit\(rec, "development_slot_unavailable"/, "and records the refusal too");
  // Informational only: no approval gate, no decision, no operator prompt is
  // created by a slot movement.
  const fn = s.slice(s.indexOf("if (qaActionNeedsDevelopmentSlot(rec.action_key))"));
  const block = fn.slice(0, fn.indexOf("\n  }\n") + 4);
  assert.ok(!/createDecision|operator_approval_required = true|requestGovernedAction/.test(block),
    "moving a slot must never ask for a second approval");
});

await test("Q12. the preflight delegates every judgement — no second allocator", () => {
  const body = decommented("../lib/vacilando/qa-slot-preflight.mjs");
  assert.match(body, /ensureLaneSlot/, "it calls the sole allocator");
  assert.ok(!/acknowledgeActive/.test(body),
    "and can never override a donor that turned active");
  assert.ok(!/slotReclaimCandidates|reassignSlot|freeSlots/.test(body),
    "it must not re-rank, re-move or re-compute free capacity");
  // The liveness seams are PASSED THROUGH to the allocator, never interpreted
  // here — so the claims themselves must not appear.
  assert.ok(!/ownership_state|owned_running|tmux|has-session|leaseHeld\(|activeRun\(/.test(body),
    "and must not re-implement any protection claim");
});

await test("Q13. the governed QA actions keep their own controls", () => {
  // The preflight must not have weakened authorization, identity, tenant or
  // secret handling on the actions it runs in front of.
  const prov = src("../lib/vacilando/qa-identity-provision-action.mjs");
  assert.match(prov, /assertManagedLaneEnvironment/, "managed environment is still asserted");
  assert.match(prov, /isManagedQaIdentity\(validated\.expected_identity\)/, "identity shape is still checked");
  assert.match(prov, /caller_supplied_forbidden_input/, "callers still cannot name a target");
  const registry = src("../lib/vacilando/trusted-host-action-registry.mjs");
  for (const a of ["defineEnvironmentProvisionQaIdentity", "defineEnvironmentAssignQaIdentityAccess", "defineEnvironmentRestoreQaSession"]) {
    const fn = registry.slice(registry.indexOf(`function ${a}(`));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    assert.match(body, /alwaysRequiresOperatorApproval: true/, `${a} still always requires the operator`);
    assert.match(body, /riskClass: "privileged_write"/, `${a} is still a privileged write`);
  }
});

await test("Q14. dev-server auto-acquire is unchanged", () => {
  const s = src("../lib/vacilando/mission-local-server.mjs");
  const fn = s.slice(s.indexOf("export async function controlMissionLocalServer"));
  assert.match(fn, /ensureLaneSlot/, "the start path still acquires its own slot");
  assert.ok(fn.indexOf("ensureLaneSlot") < fn.indexOf("spawn(bin"), "still before the server is spawned");
  assert.match(fn, /no_development_slot_available/, "and still refuses legibly");
  assert.ok(!/qa-slot-preflight|ensureQaDevelopmentSlot/.test(s),
    "the QA preflight did not reach into the dev-server path");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
