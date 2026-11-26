/**
 * Governed Artifact Filing Contract V1.
 *
 * One invariant: if execution needs an artifact, the PERSISTED request carries
 * the reference execution actually reads. Every test below is a way that used to
 * be untrue.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = mkdtempSync(join(tmpdir(), "vac-artifact-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const COMBINED = "scripts/local-dev/tests/fixtures/q15-combined-query.json";

const {
  ACTION_TYPES, getActionDefinition, artifactContractFor, listActionDefinitions,
} = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const { requestGovernedAction } = await import("../lib/vacilando/governed-action-request.mjs");
const { createMission } = await import("../lib/vacilando/commands/missions.mjs");
const { createDurableLane, bindLaneMission } = await import("../lib/vacilando/development-lane.mjs");
const { createQueuedRun, transitionExecutionRun } = await import("../lib/vacilando/execution-run.mjs");

let seq = 0;
function laneAndRun() {
  seq += 1;
  const mission = createMission({ slot: 1, title: `Artifact ${seq}`, objective: "census", status: "running" });
  const created = createDurableLane({
    name: `Artifact Lane ${seq}`, origin: "test", root: ROOT, mission_id: mission.mission_id,
  });
  assert.equal(created.ok, true, created.error);
  const queued = createQueuedRun({
    laneId: created.lane.lane_id, instruction: "census", worktreePath: REPO, origin: "operator", root: ROOT,
  });
  assert.equal(queued.ok, true, queued.error);
  const moved = transitionExecutionRun(queued.run.run_id, "EXECUTING", {
    origin: "system", root: ROOT, reason: "delivered", worktreePath: REPO,
  });
  return { lane: created.lane, run: moved.run, mission };
}

const base = (overrides = {}) => ({
  action_key: "database.read_census",
  target: "alloy_deployed_primary",
  purpose: "Prove role coverage before removing a compatibility path.",
  requested_mode: "read_only",
  reason_worker_cannot_execute: "no hosted credentials; worker cannot execute database.read_census",
  ...overrides,
});

function file(overrides) {
  const { lane, run } = laneAndRun();
  return requestGovernedAction(
    { ...base(overrides), lane_id: lane.lane_id, run_id: run.run_id, worktree_path: REPO },
    { root: ROOT },
  );
}

/* ── A · the canonical filing path still works ──────────────────────────── */
test("CASE A — artifact_refs supplied canonically persists and is what execution reads", () => {
  const out = file({ artifact_refs: [COMBINED] });
  assert.equal(out.ok, true, out.error || out.detail);
  assert.deepEqual(out.request.artifact_refs, [COMBINED]);
  // The executor resolves from artifact_refs; the persisted record has it.
  assert.ok(out.request.artifact_refs.length, "the persisted request carries the reference execution consumes");
});

/* ── K · THE REAL INCIDENT ──────────────────────────────────────────────── */
test("the incident shape — queryArtifactPath in inputs, artifact_refs empty — now normalises", () => {
  // gar_ba8bf10667c02e and gar_23153a44c824cb were filed exactly like this and
  // refused with "queryArtifactPath required", naming the field they had set.
  const out = file({ inputs: { queryArtifactPath: COMBINED } });
  assert.equal(out.ok, true, `${out.error || ""} ${out.detail || ""}`);
  assert.deepEqual(out.request.artifact_refs, [COMBINED],
    "the supplied path is promoted into the canonical reference before persistence");
});

test("the snake_case spelling normalises too", () => {
  const out = file({ inputs: { query_artifact_path: COMBINED } });
  assert.equal(out.ok, true, out.error || out.detail);
  assert.deepEqual(out.request.artifact_refs, [COMBINED]);
});

test("a canonical ref wins over an input path and is not double-counted", () => {
  const out = file({ artifact_refs: [COMBINED], inputs: { queryArtifactPath: "some/other/path.sql" } });
  assert.equal(out.ok, true, out.error || out.detail);
  assert.deepEqual(out.request.artifact_refs, [COMBINED], "the explicit canonical reference is authoritative");
});

/* ── C · missing artifact refuses AT FILING ─────────────────────────────── */
test("CASE C — no artifact at all refuses at filing, naming the canonical field", () => {
  const out = file({});
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_canonical_artifact_reference");
  assert.match(out.detail, /artifact_refs/);
  assert.match(out.detail, /queryArtifactPath/, "and names the input spellings that would have been accepted");
});

test("CASE B — the refusal happens at filing, not as an executor surprise", () => {
  const out = file({ inputs: { somethingElse: "x" } });
  assert.equal(out.ok, false);
  assert.equal(out.failure_code, "missing_canonical_artifact_reference");
  // No request is persisted, so nothing can later be approved into execution.
  assert.equal(out.request, undefined, "a request that cannot execute is never persisted as executable");
});

test("an empty or whitespace path is not a reference", () => {
  for (const v of ["", "   ", null]) {
    const out = file({ inputs: { queryArtifactPath: v } });
    assert.equal(out.ok, false, `${JSON.stringify(v)} must not normalise`);
    assert.equal(out.error, "missing_canonical_artifact_reference");
  }
});

/* ── D · normalisation is not a default ─────────────────────────────────── */
test("normalisation promotes only what the caller named, and invents nothing", () => {
  const src = readFileSync(join(HERE, "..", "lib", "vacilando", "governed-action-request.mjs"), "utf8");
  const fn = src.slice(src.indexOf("NORMALISE THE ARTIFACT AT THE FILING BOUNDARY"), src.indexOf("const inputs = sanitizeActionInputs") + 4000);
  // The Q15 fallback must not return: a privileged read whose subject is guessed
  // is not a governed action.
  assert.ok(!/Q15_CENSUS_ARTIFACT/.test(fn), "no default artifact may be substituted");
  assert.ok(!/fallback:/.test(fn.slice(0, fn.indexOf("artifactContract"))), "no fallback into the refs");
});

/* ── D · boundary and integrity guards still refuse ─────────────────────── */
test("CASE D — an artifact outside the worktree is refused", () => {
  const out = file({ inputs: { queryArtifactPath: "../../../etc/passwd" } });
  assert.equal(out.ok, false, "a path escaping the worktree must not file");
  assert.notEqual(out.error, undefined);
});

test("CASE E — a path that does not exist is refused before execution", () => {
  const out = file({ inputs: { queryArtifactPath: "scripts/local-dev/tests/fixtures/does-not-exist.json" } });
  assert.equal(out.ok, false);
  assert.notEqual(out.error, "missing_canonical_artifact_reference", "it normalised, then failed validation on its merits");
});

/* ── F · policy and executor see the same artifact ──────────────────────── */
test("CASE F — the persisted reference is the single source both layers read", () => {
  const out = file({ inputs: { queryArtifactPath: COMBINED } });
  assert.equal(out.ok, true, out.error || out.detail);
  const persisted = out.request.artifact_refs[0];

  // The executor's resolution and the registry validation both derive from the
  // same persisted refs, so they cannot disagree about which SQL runs.
  const def = getActionDefinition(ACTION_TYPES.DATABASE_READ_CENSUS);
  const validated = def.validateInputs({
    queryArtifactPath: persisted,
    databaseTarget: "alloy_deployed_primary",
    worktreePath: REPO,
  });
  assert.equal(validated.ok, true, validated.detail || validated.code);
});

/* ── G · Governance V1 census gates survive ─────────────────────────────── */
test("CASE G — the census artifact gates still evaluate the artifact that executes", () => {
  /*
   * SCOPED TO THIS BASE. The named `census_*` delegation gates ship with the
   * Governance V1 candidate (16601e54f), which is NOT an ancestor of this chain
   * — verified, rather than assumed from another mission's notes. So the gates
   * this base actually applies to a census artifact are the registry's own, and
   * those are what must keep seeing the same artifact the executor runs.
   */
  const def = getActionDefinition(ACTION_TYPES.DATABASE_READ_CENSUS);
  const src = readFileSync(join(HERE, "..", "lib", "vacilando", "trusted-host-action-registry.mjs"), "utf8");
  for (const guard of [
    "missing_query_artifact",      // a named artifact is required
    "query_artifact_missing",      // and must exist
    "path_escape",                 // inside the originating worktree
    "json_missing_sql",            // the artifact must actually carry SQL
  ]) {
    assert.ok(src.includes(guard), `${guard} must still gate a census artifact`);
  }
  // Hash pinning is the integrity half and must still refuse a changed artifact.
  assert.ok(src.includes("Committed query hash does not match artifact contents."),
    "the artifact must still be pinned by hash");

  // And the gates run against the SAME path the executor resolves from refs.
  const out = file({ inputs: { queryArtifactPath: COMBINED } });
  assert.equal(out.ok, true, out.error || out.detail);
  const persisted = out.request.artifact_refs[0];
  const validated = def.validateInputs({
    queryArtifactPath: persisted, databaseTarget: "alloy_deployed_primary", worktreePath: REPO,
  });
  assert.equal(validated.ok, true, validated.detail || validated.code);
});

test("the normalisation carries the census through the read-only mode it was filed in", () => {
  const out = file({ inputs: { queryArtifactPath: COMBINED } });
  assert.equal(out.ok, true, out.error || out.detail);
  assert.equal(out.request.requested_mode, "read_only", "normalising an artifact must not change the mode");
  assert.equal(out.request.target, "alloy_deployed_primary", "nor the target the gates bind to");
});

/* ── the structural guard for future actions ────────────────────────────── */
test("every action whose executor reads artifact_refs declares the contract", () => {
  const src = readFileSync(join(HERE, "..", "lib", "vacilando", "governed-action-request.mjs"), "utf8");
  // Find the action keys the executor resolves from artifact_refs.
  const consumers = new Set();
  if (/queryArtifactPath: artifactPathFrom\(rec\.artifact_refs\)/.test(src)) {
    consumers.add(ACTION_TYPES.DATABASE_READ_CENSUS);
  }
  assert.ok(consumers.size > 0, "at least one artifact consumer must be found, or this control is asleep");
  for (const key of consumers) {
    const def = getActionDefinition(key);
    const contract = artifactContractFor(def);
    assert.ok(contract, `${key} executes from artifact_refs and must declare requiresArtifactRef`);
    assert.ok(contract.inputKeys.length, `${key} must declare the input spellings it normalises from`);
  }
});

test("a declared contract without input keys is not a contract", () => {
  assert.equal(artifactContractFor({ actionType: "x", requiresArtifactRef: true }), null);
  assert.equal(artifactContractFor({ actionType: "x", requiresArtifactRef: true, artifactInputKeys: [] }), null);
  assert.equal(artifactContractFor({ actionType: "x" }), null);
  assert.equal(artifactContractFor(null), null);
});

/* ── J · a non-artifact action is unaffected ────────────────────────────── */
test("CASE J — an action that consumes no artifact files without one", () => {
  const { lane, run } = laneAndRun();
  const out = requestGovernedAction({
    action_key: "repository.merge_pull_request",
    target: "staging",
    purpose: "Promote the certified candidate.",
    requested_mode: "mutation",
    reason_worker_cannot_execute: "worker may not merge",
    inputs: { repository: "ksquared-16/alloy", pull_request_number: 900, expected_head_sha: "a".repeat(40) },
    lane_id: lane.lane_id, run_id: run.run_id, worktree_path: REPO,
  }, { root: ROOT });
  // It must not be refused for a missing artifact it never needed.
  assert.notEqual(out.error, "missing_canonical_artifact_reference");
});

test("no second artifact registry or store is created", () => {
  const reg = readFileSync(join(HERE, "..", "lib", "vacilando", "trusted-host-action-registry.mjs"), "utf8");
  const fn = reg.slice(reg.indexOf("export function artifactContractFor"), reg.indexOf("const DEFAULT_TARGET"));
  for (const f of ["writeFileSync", "mkdirSync", "copyFileSync", "new Map(", "cache"]) {
    assert.ok(!fn.includes(f), `artifactContractFor must not ${f}`);
  }
  // It reads a declaration and returns it. Nothing more.
  assert.ok(fn.includes("def.requiresArtifactRef"), "it reads the declaration on the definition itself");
});

/* ── H · async acceptance cannot outrun the artifact ────────────────────── */
test("CASE H — an accepted async action cannot exist without its artifact reference", () => {
  // Acceptance happens after filing. A request refused at filing is never
  // persisted, so there is no record for an approval to accept later.
  const refused = file({});
  assert.equal(refused.ok, false);
  assert.equal(refused.request, undefined);

  // And a filed one carries the reference from the moment it is persisted.
  const filed = file({ inputs: { queryArtifactPath: COMBINED } });
  assert.equal(filed.ok, true, filed.error || filed.detail);
  assert.ok(filed.request.artifact_refs.length,
    "durability of the reference precedes any acceptance, so approval cannot outrun it");
});

/* ── I · observability ──────────────────────────────────────────────────── */
test("the refusal says which field is canonical rather than which one is missing", () => {
  const out = file({});
  assert.match(out.detail, /executes from artifact_refs/);
  assert.ok(!/^queryArtifactPath required$/.test(out.detail || ""),
    "the old message named the one field the filer had actually set");
});
