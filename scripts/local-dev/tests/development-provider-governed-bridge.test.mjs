/**
 * Decision Delivery V1.1 — the provider prompt → governed action bridge.
 *
 * The product rule: a provider-native permission prompt is EVIDENCE that a
 * provider is attempting an action, never the governance object itself. Where
 * the attempted action has a registered home, Vacilando must carry it there —
 * and must never carry it there by guessing.
 *
 * Most of what follows is negative. The dangerous failure is not "the bridge
 * did not fire"; it is a bridge that fires on prose, files a request for content
 * nobody can read, or answers a provider's raw privileged command because an
 * approval happened to exist.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const B = await import("../lib/vacilando/provider-governed-bridge.mjs");
const A = await import("../lib/vacilando/provider-prompt-authority.mjs");
const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const root = () => mkdtempSync(join(tmpdir(), "bridge-"));
const REPO = "/Users/Kelly/Code/alloy-worktrees/wt6-surfaces-faacca";

/** The real Trust Runtime command, verbatim from the blocked session. */
const MIGRATION_CMD =
  "docker exec -i supabase_db_alloy-cert psql -U postgres -d postgres -f - < supabase/migrations/20260826120000_h1_person_health_facts.sql";

// ── Capability resolution ────────────────────────────────────────────────────

test("the Trust Runtime migration resolves to the registered capability", () => {
  const r = B.resolveProviderCapability({
    classification: "unsafe_or_unknown_provider_prompt",
    command: MIGRATION_CMD,
  });
  assert.equal(r.resolution, "registered_governed_capability");
  assert.equal(r.action_key, "database.apply_migration");
  assert.equal(r.required_capability, "trusted_host.database.migrate");
  assert.deepEqual(r.required_inputs, ["environment", "expectedSha", "migrations"]);
});

test("V1's own classification of that command is unchanged", () => {
  // The bridge is a SECOND stage. It must not soften the first: the raw command
  // is still un-auto-answerable, and that is what makes the bridge necessary.
  const pane = `
 Bash command

   ${MIGRATION_CMD}
   Apply the health migration

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don't ask again for this project
   3. No
`;
  const cls = A.classifyProviderPrompt({ paneText: pane, sessionId: "s1", runId: "r1" });
  assert.equal(cls.auto_answerable, false);
  assert.notEqual(cls.classification, "routine_tool_permission");
});

test("prose cannot manufacture a capability", () => {
  // The description says "migration" in as many words. The command is a read.
  const r = B.resolveProviderCapability({
    classification: "unsafe_or_unknown_provider_prompt",
    command: "echo 'apply the database migration to staging now'",
  });
  assert.equal(r.resolution, "still_unknown");
});

test("a privileged command with no registered home says so, and does not guess", () => {
  for (const cmd of ["sudo rm -rf /var/lib/postgresql", "ssh prod-host 'systemctl restart pg'", "npm publish"]) {
    const r = B.resolveProviderCapability({ classification: "unsafe_or_unknown_provider_prompt", command: cmd });
    assert.equal(r.resolution, "unsupported_privileged_action", cmd);
    assert.equal(r.action_key, undefined);
  }
});

test("an unregistered action key can never be resolved to", () => {
  // The registry is the authority. A shape whose key is not registered on this
  // host is unsupported, not "registered".
  const keys = B.registeredActionKeys();
  assert.ok(keys.includes("database.apply_migration"));
  assert.ok(!keys.includes("database.arbitrary_sql"));
});

test("starting a stack is not applying a migration", () => {
  const r = B.resolveProviderCapability({ classification: "unsafe_or_unknown_provider_prompt", command: "supabase start" });
  assert.notEqual(r.resolution, "registered_governed_capability");
});

// ── Executor selection ───────────────────────────────────────────────────────

test("a trusted-host capability never authorizes the provider's raw command", () => {
  const e = B.selectExecutor("database.apply_migration");
  assert.equal(e.executor, "trusted_host");
  assert.equal(e.provider_raw_command_authorized, false);
  assert.equal(e.continuation_mode, "governed_action_replaces_command");
});

test("no registered action currently declares the managed provider as its executor", () => {
  // The exception exists so it can be declared deliberately. If this ever fails,
  // someone has granted a provider the right to run a privileged command itself
  // and that must be a reviewed decision, not a diff nobody read.
  for (const key of B.registeredActionKeys()) {
    const e = B.selectExecutor(key);
    assert.equal(e.provider_raw_command_authorized, false, key);
  }
});

test("an unregistered key selects no executor at all", () => {
  const e = B.selectExecutor("database.arbitrary_sql");
  assert.equal(e.ok, false);
  assert.equal(e.error, "unregistered_action_key");
});

// ── Canonical identity ───────────────────────────────────────────────────────

test("the migration identity is exact, and its environment is read off the command", () => {
  const op = B.extractAttemptedOperation({ command: MIGRATION_CMD });
  const id = B.canonicalIdentityFor(op, { repoRoot: REPO });
  assert.equal(id.ok, true);
  assert.match(id.inputs.expectedSha, /^[a-f0-9]{40}$/);
  assert.equal(id.inputs.migrations[0].path, "supabase/migrations/20260826120000_h1_person_health_facts.sql");
  assert.equal(id.inputs.migrations[0].version, "20260826120000");
  // The container is `alloy-cert`, a LOCAL stack. Calling it `certification`
  // would point the operator's approval at the ambient hosted DATABASE_URL.
  assert.equal(id.inputs.environment, "development_certification");
  assert.match(id.content_fingerprint, /^[a-f0-9]{64}$/);
});

test("content that does not exist at a canonical SHA cannot be filed", () => {
  const op = B.extractAttemptedOperation({
    command: "psql -f supabase/migrations/29991231000000_not_a_real_migration.sql",
  });
  const id = B.canonicalIdentityFor(op, { repoRoot: REPO });
  assert.equal(id.ok, false);
  assert.equal(id.code, "migration_content_unresolvable");
});

test("a migration command naming no file is refused rather than approximated", () => {
  const op = B.extractAttemptedOperation({ command: "psql -U postgres -c 'select 1'" });
  const id = B.canonicalIdentityFor(op, { repoRoot: REPO });
  assert.equal(id.ok, false);
  assert.equal(id.code, "migration_path_unreadable");
});

test("the same content produces the same fingerprint, different content does not", () => {
  const a = B.canonicalIdentityFor(B.extractAttemptedOperation({ command: MIGRATION_CMD }), { repoRoot: REPO });
  const b = B.canonicalIdentityFor(B.extractAttemptedOperation({ command: MIGRATION_CMD }), { repoRoot: REPO });
  const c = B.canonicalIdentityFor(
    B.extractAttemptedOperation({
      command: "docker exec -i supabase_db_alloy-cert psql -f - < supabase/migrations/20260826121000_m1_health_grain_correction.sql",
    }),
    { repoRoot: REPO },
  );
  assert.equal(a.content_fingerprint, b.content_fingerprint);
  assert.notEqual(a.content_fingerprint, c.content_fingerprint);
});

// ── Environment authority ────────────────────────────────────────────────────

test("the live Trust Runtime case is recognized and refused, with the prerequisite named", () => {
  const op = B.extractAttemptedOperation({ command: MIGRATION_CMD });
  const id = B.canonicalIdentityFor(op, { repoRoot: REPO });
  const ex = B.assertBridgeExecutable(id);
  assert.equal(ex.ok, false);
  assert.equal(ex.refusal, "environment_unprovisioned");
  assert.ok(ex.must_be_provisioned.length >= 1);
});

test("the blocked operator card shows the work and its prerequisite, never the modal", () => {
  const op = B.extractAttemptedOperation({ command: MIGRATION_CMD });
  const id = B.canonicalIdentityFor(op, { repoRoot: REPO });
  const card = B.bridgeApprovalCard({
    bridge: { prompt_fingerprint: "fp", lane_id: "lane_trust", governed_action_key: id.action_key, attempted_operation: op },
    identity: id,
    executable: B.assertBridgeExecutable(id),
    laneName: "Trust Runtime",
  });
  assert.match(card.headline, /^Apply .* — blocked$/);
  assert.equal(card.decision, null);
  assert.ok(card.prerequisite.steps.length >= 1);
  // The provider's sentence is diagnostics, not the governance object.
  assert.ok(!/Do you want to proceed/.test(card.headline));
  assert.equal(card.diagnostics.provider_command, MIGRATION_CMD);
});

// ── Bridge records ───────────────────────────────────────────────────────────

function openMigrationBridge(r, over = {}) {
  const op = B.extractAttemptedOperation({ command: MIGRATION_CMD });
  const res = B.resolveProviderCapability({ classification: "unsafe_or_unknown_provider_prompt", command: MIGRATION_CMD });
  const id = B.canonicalIdentityFor(op, { repoRoot: REPO });
  return B.openBridge({
    root: r, promptFingerprint: "fp-migration", laneId: "lane_trust", runId: "run_1", sessionId: "sess_1",
    attemptedOperation: op, resolution: res, identity: id, executor: B.selectExecutor(res.action_key), ...over,
  });
}

test("one prompt produces at most one live bridge", () => {
  const r = root();
  const a = openMigrationBridge(r);
  const b = openMigrationBridge(r);
  assert.equal(a.reused, false);
  assert.equal(b.reused, true);
  assert.equal(B.listBridges({ root: r }).length, 1);
});

test("a bridge survives a Gateway restart", () => {
  const r = root();
  openMigrationBridge(r);
  // A restart is a new process reading the same durable path. Nothing is cached.
  const reread = JSON.parse(readFileSync(B.bridgeStorePath(r), "utf8"));
  assert.equal(reread.bridges.length, 1);
  assert.equal(reread.bridges[0].governed_action_key, "database.apply_migration");
  assert.equal(reread.bridges[0].provider_raw_command_authorized, false);
  assert.equal(B.getBridge({ root: r, fingerprint: "fp-migration" }).state, "governed");
});

test("bridge states cannot be skipped", () => {
  const r = root();
  openMigrationBridge(r);
  const illegal = B.advanceBridge({ root: r, fingerprint: "fp-migration", to: "resolved" });
  assert.equal(illegal.ok, false);
  assert.equal(illegal.error, "illegal_bridge_transition");
  assert.equal(B.advanceBridge({ root: r, fingerprint: "fp-migration", to: "waiting_decision" }).ok, true);
  assert.equal(B.advanceBridge({ root: r, fingerprint: "fp-migration", to: "executing_elsewhere" }).ok, true);
  assert.equal(B.advanceBridge({ root: r, fingerprint: "fp-migration", to: "resolved" }).ok, true);
});

test("a terminal bridge is terminal", () => {
  const r = root();
  openMigrationBridge(r);
  B.advanceBridge({ root: r, fingerprint: "fp-migration", to: "dismissed" });
  assert.equal(B.advanceBridge({ root: r, fingerprint: "fp-migration", to: "waiting_decision" }).ok, false);
});

// ── Dedupe ───────────────────────────────────────────────────────────────────

const FP = "c".repeat(64);

test("an exact pending request is attached to, never duplicated", () => {
  const d = B.dedupeDecision({
    identity: { content_fingerprint: FP },
    governedActions: [{ request_id: "gar_1", content_fingerprint: FP, status: "awaiting_operator" }],
  });
  assert.equal(d.action, "attach_pending");
  assert.equal(d.request_id, "gar_1");
});

test("an exact complete-and-effective request is reused", () => {
  const d = B.dedupeDecision({
    identity: { content_fingerprint: FP },
    governedActions: [{ request_id: "gar_2", content_fingerprint: FP, status: "complete", effective: true }],
  });
  assert.equal(d.action, "reuse_result");
});

test("complete but NOT effective is not reuse — it is unverified", () => {
  const d = B.dedupeDecision({
    identity: { content_fingerprint: FP },
    governedActions: [{ request_id: "gar_3", content_fingerprint: FP, status: "complete", effective: false }],
  });
  assert.equal(d.action, "await_verification");
});

test("a failed request surfaces the failure and never re-asks for approval", () => {
  const d = B.dedupeDecision({
    identity: { content_fingerprint: FP },
    governedActions: [{ request_id: "gar_4", content_fingerprint: FP, status: "failed" }],
  });
  assert.equal(d.action, "surface_failure");
});

test("a different fingerprint files its own exact request", () => {
  const d = B.dedupeDecision({
    identity: { content_fingerprint: "d".repeat(64) },
    governedActions: [{ request_id: "gar_5", content_fingerprint: FP, status: "awaiting_operator" }],
  });
  assert.equal(d.action, "file_new");
});

// ── Continuation ─────────────────────────────────────────────────────────────

const trustedBridge = { prompt_fingerprint: "fp", resolution_mode: "governed_action_replaces_command" };

test("a completed, effective trusted-host action does NOT answer the provider yes", () => {
  const c = B.planProviderContinuation({
    bridge: trustedBridge,
    governedAction: { status: "complete", effective: true, result: { applied: 1 } },
    executor: B.selectExecutor("database.apply_migration"),
  });
  assert.equal(c.provider_answer, "decline");
  assert.equal(c.dismissal, "cancel_without_affirmative");
  assert.equal(c.bridge_state, "resolved");
  assert.equal(c.run_outcome, "completed_elsewhere");
});

test("a denied action never produces an affirmative", () => {
  const c = B.planProviderContinuation({ bridge: trustedBridge, governedAction: { status: "denied" } });
  assert.equal(c.provider_answer, "decline");
  assert.equal(c.run_outcome, "denied");
  assert.equal(c.bridge_state, "dismissed");
});

test("a failed execution does not return to awaiting_operator", () => {
  const c = B.planProviderContinuation({ bridge: trustedBridge, governedAction: { status: "failed" } });
  assert.equal(c.bridge_state, "failed");
  assert.equal(c.run_outcome, "execution_failed");
  assert.notEqual(c.run_outcome, "awaiting_decision");
});

test("complete-but-unverified leaves the provider blocked on the real dependency", () => {
  const c = B.planProviderContinuation({ bridge: trustedBridge, governedAction: { status: "complete", effective: false } });
  assert.equal(c.provider_answer, "none");
  assert.equal(c.run_outcome, "awaiting_verification");
  assert.notEqual(c.bridge_state, "resolved");
});

test("a pending decision sends the provider nothing at all", () => {
  const c = B.planProviderContinuation({ bridge: trustedBridge, governedAction: { status: "awaiting_operator" } });
  assert.equal(c.provider_answer, "none");
  assert.equal(c.bridge_state, "waiting_decision");
});

test("only a provider-local capability may ever answer affirmative", () => {
  const c = B.planProviderContinuation({
    bridge: { prompt_fingerprint: "fp", resolution_mode: "governed_approval_authorizes_provider" },
    governedAction: { status: "complete", effective: true },
    executor: { continuation_mode: "governed_approval_authorizes_provider" },
  });
  assert.equal(c.provider_answer, "narrow_affirmative");
  // …and the trusted-host path can never reach that branch, whatever is passed.
  const t = B.planProviderContinuation({
    bridge: trustedBridge,
    governedAction: { status: "complete", effective: true },
    executor: B.selectExecutor("database.apply_migration"),
  });
  assert.notEqual(t.provider_answer, "narrow_affirmative");
});

// ── Health ───────────────────────────────────────────────────────────────────

test("a governed prompt with no filed request is a control-plane failure", () => {
  const h = B.reconcileProviderBridges({
    bridges: [{ prompt_fingerprint: "fp", state: "governed", governed_request_id: null, created_at: new Date().toISOString() }],
  });
  assert.equal(h.consistent, false);
  assert.ok(h.violations.some((v) => v.kind === "governed_prompt_without_governed_request"));
});

test("a completed effective request with a still-blocked provider is a control-plane failure", () => {
  const h = B.reconcileProviderBridges({
    bridges: [{ prompt_fingerprint: "fp", state: "waiting_decision", governed_request_id: "gar_9", created_at: new Date().toISOString() }],
    governedActions: [{ request_id: "gar_9", status: "complete", effective: true }],
  });
  assert.ok(h.violations.some((v) => v.kind === "governed_request_complete_provider_still_blocked"));
});

test("a dismissed prompt whose run never heard the outcome is a control-plane failure", () => {
  const h = B.reconcileProviderBridges({
    bridges: [{ prompt_fingerprint: "fp", state: "dismissed", continuation_state: "pending", created_at: new Date().toISOString() }],
  });
  assert.ok(h.violations.some((v) => v.kind === "prompt_dismissed_without_continuation"));
});

test("duplicate live bridges for one prompt are reported", () => {
  const now = new Date().toISOString();
  const h = B.reconcileProviderBridges({
    bridges: [
      { prompt_fingerprint: "fp", state: "governed", governed_request_id: "g1", created_at: now },
      { prompt_fingerprint: "fp", state: "waiting_decision", governed_request_id: "g1", created_at: now },
    ],
    governedActions: [{ request_id: "g1", status: "awaiting_operator" }],
  });
  assert.ok(h.violations.some((v) => v.kind === "duplicate_active_bridges"));
});

test("a stale live bridge is reported", () => {
  const h = B.reconcileProviderBridges({
    bridges: [{ prompt_fingerprint: "fp", state: "waiting_decision", governed_request_id: "g1", created_at: new Date(Date.now() - 48 * 3600_000).toISOString() }],
    governedActions: [{ request_id: "g1", status: "awaiting_operator" }],
    nowMs: Date.now(),
  });
  assert.ok(h.violations.some((v) => v.kind === "stale_bridge"));
});

test("a healthy resolved bridge reports nothing", () => {
  const h = B.reconcileProviderBridges({
    bridges: [{ prompt_fingerprint: "fp", state: "resolved", governed_request_id: "g1", continuation_state: "delivered", created_at: new Date().toISOString() }],
    governedActions: [{ request_id: "g1", status: "complete", effective: true }],
  });
  assert.equal(h.consistent, true);
});

// ── Negative controls the bridge must hold on its own ────────────────────────

test("a continuation is refused for a different session or run", () => {
  const b = { prompt_fingerprint: "fp", session_id: "sess_1", run_id: "run_1" };
  assert.equal(B.assertBridgeSession({ bridge: b, observed: { session_id: "sess_1", run_id: "run_1" } }).ok, true);
  assert.equal(B.assertBridgeSession({ bridge: b, observed: { session_id: "sess_2", run_id: "run_1" } }).refusal, "session_mismatch");
  assert.equal(B.assertBridgeSession({ bridge: b, observed: { session_id: "sess_1", run_id: "run_9" } }).refusal, "run_mismatch");
});

test("a stale prompt cannot receive a decision minted for the old one", () => {
  const b = { prompt_fingerprint: "fp-old", session_id: "s", run_id: "r" };
  const r = B.assertBridgeSession({ bridge: b, observed: { session_id: "s", run_id: "r", prompt_fingerprint: "fp-new" } });
  assert.equal(r.ok, false);
  assert.equal(r.refusal, "prompt_fingerprint_mismatch");
});

test("the provider's command cannot widen the governed request", () => {
  const op = B.extractAttemptedOperation({ command: MIGRATION_CMD });
  const id = B.canonicalIdentityFor(op, { repoRoot: REPO });
  // A command flag that is not a registered input must not survive into inputs.
  id.inputs.databaseUrl = "postgres://smuggled";
  id.inputs.sql = "drop table children";
  const g = B.governedInputsFor({ identity: id });
  assert.equal(g.ok, true);
  assert.deepEqual(Object.keys(g.inputs).sort(), ["environment", "expectedSha", "migrations"]);
  assert.ok(g.dropped.includes("databaseUrl"));
  assert.ok(g.dropped.includes("sql"));
});

test("inputs for an unregistered action cannot be built at all", () => {
  const g = B.governedInputsFor({ identity: { inputs: { anything: 1 } }, actionKey: "database.arbitrary_sql" });
  assert.equal(g.ok, false);
  assert.equal(g.error, "unregistered_action_key");
});

test("a worker cannot choose the executor — only the action key is an input", () => {
  // selectExecutor takes a KEY. There is no parameter through which a caller
  // could nominate itself, and the answer comes from the registry either way.
  assert.equal(B.selectExecutor.length, 1);
  const e = B.selectExecutor("database.apply_migration");
  assert.equal(e.executor, "trusted_host");
});

test("the narrow-affirmative rule is preserved: no broad standing permission is ever selectable", () => {
  // The real modal offers a project-wide grant as option 2. V1's chooser takes
  // the narrowest yes; the bridge never introduces a second answering path.
  const pane = `
 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don't ask again for this project
   3. No
`;
  const opt = A.affirmativeOption(pane);
  assert.equal(opt.option, 1);
  assert.equal(opt.widens_permissions, false);
});

test("the routine read-only path is untouched by the bridge", () => {
  // V1's certified case. The bridge must decline to act on it at all — a second
  // stage that reclassifies routine work would re-open a settled decision.
  const r = B.resolveProviderCapability({
    classification: "routine_tool_permission",
    command: "ls /Users/Kelly/.local/share/alloy/toolkit/3c07d1074460/",
  });
  assert.equal(r.resolution, "still_unknown");
  assert.match(r.reason, /does not apply/);
});

test("the registry is the only capability catalog", () => {
  // Every action key the resolver can produce must be a registered one.
  const commands = [
    MIGRATION_CMD,
    "git push origin HEAD",
    "gh pr merge 591 --squash",
    "gh pr close 591",
    "gh pr create --base staging",
    "git push origin --delete agent/claude/6-x",
  ];
  const registered = new Set(B.registeredActionKeys());
  for (const c of commands) {
    const r = B.resolveProviderCapability({ classification: "unsafe_or_unknown_provider_prompt", command: c });
    if (r.resolution !== "registered_governed_capability") continue;
    assert.ok(registered.has(r.action_key), `${c} → ${r.action_key}`);
  }
});
