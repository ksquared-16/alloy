/**
 * DevOps 10 — Control Plane Resilience & Host Failover V1.
 *
 * The law under test is one sentence: ambiguous leadership means no mutation.
 * Most of these prove a refusal.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as R from "../lib/vacilando/control-plane-resilience.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const codeOf = (f) => readFileSync(join(LIB, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PRIMARY = "host_macmini";
const STANDBY = "host_macbook";
const lease = (epoch, holder = PRIMARY, extra = {}) => R.leadershipLease({ epoch, holderHostId: holder, ...extra });
const ready = () => R.standbyReadiness({
  checks: Object.fromEntries(R.READINESS_CHECKS.map((k) => [k, true])), replicationLagMs: 60_000,
});
const allProofs = (v = true) => Object.fromEntries([
  "generation_is_new", "epoch_is_current", "old_primary_fenced", "replicated_state_restored",
  "lane_knowledge_intact", "no_stale_generation_ownership", "no_slot_conflicts",
  "critical_invariants", "host_health", "toolchain_identity",
].map((k) => [k, v]));

/* ── 1/2 · the inventory ─────────────────────────────────────────────────── */
test("the inventory covers every canonical store with an owner and a disposition", () => {
  assert.ok(R.STATE_INVENTORY.length >= 15);
  for (const s of R.STATE_INVENTORY) {
    assert.ok(s.owner && !s.owner.includes("control-plane-resilience"), `${s.id} must name an external owner`);
    assert.ok(Object.values(R.DISPOSITION).includes(s.disposition), `${s.id} needs a disposition`);
    assert.ok(s.why, `${s.id} must justify its disposition`);
  }
  for (const id of ["lane_registry", "lane_memory", "execution_runs", "governed_requests", "governed_grants", "host_config", "audit_log"]) {
    assert.equal(R.stateById(id).disposition, R.DISPOSITION.REPLICATE, `${id} cannot be reconstructed`);
  }
});

test("rebuildable state is not replicated, and filesystem mirroring is not the architecture", () => {
  for (const id of ["worktrees", "repository_knowledge", "toolkit_identity", "instruction_baseline"]) {
    assert.equal(R.stateById(id).disposition, R.DISPOSITION.REBUILD, `${id} is reconstructible from the remote`);
  }
  // The worktree row must acknowledge the one thing rebuilding loses.
  assert.match(R.stateById("worktrees").caveat, /unpushed/);
});

test("processes, profiles and generations are never restored as authority", () => {
  assert.equal(R.stateById("owned_processes").disposition, R.DISPOSITION.DO_NOT_RESTORE);
  assert.equal(R.stateById("browser_profiles").disposition, R.DISPOSITION.DO_NOT_RESTORE);
  assert.equal(R.stateById("runtime_generation").disposition, R.DISPOSITION.RECREATE);
  assert.equal(R.stateById("provider_sessions").disposition, R.DISPOSITION.RECREATE);
});

/* ── 3 · secrets stay out of snapshots ───────────────────────────────────── */
test("a snapshot refuses secret-bearing state rather than filtering it silently", () => {
  const m = R.snapshotManifest({ entries: [{ id: "secrets", bytes: 10 }, { id: "browser_profiles", bytes: 10 }], epoch: 1 });
  assert.equal(m.entries.length, 0);
  assert.equal(m.rejected.length, 2);
  for (const r of m.rejected) assert.match(r.why, /secret/);
});

test("a snapshot missing a must-replicate store is not complete", () => {
  const partial = R.snapshotManifest({ entries: [{ id: "lane_registry" }], epoch: 1 });
  assert.equal(partial.complete, false);
  assert.ok(partial.missing.includes("lane_memory"));

  const full = R.snapshotManifest({ entries: R.mustReplicate().map((s) => ({ id: s.id, digest: "d" })), epoch: 1 });
  assert.equal(full.complete, true);
  assert.deepEqual(full.missing, []);
});

test("rebuildable state is refused from a snapshot as not replicated", () => {
  const m = R.snapshotManifest({ entries: [{ id: "worktrees" }], epoch: 1 });
  assert.equal(m.entries.length, 0);
  assert.match(m.rejected[0].why, /REBUILD/);
});

/* ── 4 · three identities, kept apart ────────────────────────────────────── */
test("host identity is not the runtime generation and not a process", () => {
  const h = R.hostIdentity({ hostId: PRIMARY, role: R.ROLE.PRIMARY, runtimeGeneration: "gen_a", epoch: 7 });
  assert.equal(h.host_id, PRIMARY);
  assert.equal(h.runtime_generation, "gen_a");
  assert.equal(h.leadership_epoch, 7);
  assert.notEqual(h.host_id, h.runtime_generation);
  // The same machine across two incarnations keeps its id and changes generation.
  const later = R.hostIdentity({ hostId: PRIMARY, role: R.ROLE.PRIMARY, runtimeGeneration: "gen_b", epoch: 7 });
  assert.equal(later.host_id, h.host_id);
  assert.notEqual(later.runtime_generation, h.runtime_generation);
});

/* ── 5/6 · one epoch has authority ───────────────────────────────────────── */
test("only the lease holder at the current epoch may mutate", () => {
  assert.equal(R.mayMutate({ hostId: PRIMARY, lease: lease(5), observedEpoch: 5 }).allowed, true);
  assert.equal(R.mayMutate({ hostId: STANDBY, lease: lease(5, PRIMARY), observedEpoch: 5 }).allowed, false);
});

test("a standby with no lease cannot mutate", () => {
  const r = R.mayMutate({ hostId: STANDBY, lease: null });
  assert.equal(r.allowed, false);
  assert.equal(r.fenced, true);
  assert.match(r.reason, /no leadership lease/);
});

test("with no external authority configured, nobody may mutate", () => {
  const r = R.mayMutate({ hostId: PRIMARY, lease: lease(1, PRIMARY, { authority: R.LEASE_AUTHORITY.NONE }), observedEpoch: 1 });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /cannot be proven/);
});

test("an expired lease does not authorize mutation", () => {
  const r = R.mayMutate({ hostId: PRIMARY, lease: lease(3, PRIMARY, { expiresAtMs: 1000 }), observedEpoch: 3, nowMs: 5000 });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /expired/);
});

/* ── 7 · heartbeat alone authorizes nothing ─────────────────────────────── */
test("heartbeat loss alone cannot authorize takeover", () => {
  for (const e of R.INSUFFICIENT_EVIDENCE) {
    const d = R.takeoverDecision({ standby: { host_id: STANDBY }, primarySuspected: true, evidence: [e], readiness: ready(), casAvailable: true });
    assert.equal(d.takeover, false, `${e} must not authorize takeover`);
    assert.equal(d.fail_closed, true);
    assert.match(d.reason, /dead host from an unreachable one/);
  }
});

test("no evidence at all fails closed", () => {
  const d = R.takeoverDecision({ standby: { host_id: STANDBY }, primarySuspected: true, evidence: [], readiness: ready(), casAvailable: true });
  assert.equal(d.takeover, false);
  assert.equal(d.fail_closed, true);
});

/* ── 8 · a partition cannot make two primaries ──────────────────────────── */
test("without a reachable CAS authority a takeover is refused, not guessed", () => {
  const d = R.takeoverDecision({
    standby: { host_id: STANDBY }, primarySuspected: true,
    evidence: ["cas_authority_reports_lease_expired"], readiness: ready(), casAvailable: false,
  });
  assert.equal(d.takeover, false);
  assert.equal(d.fail_closed, true);
  assert.equal(d.requires_operator, true);
  assert.match(d.reason, /cannot be proven fenced/);
});

test("a live but partitioned primary is fenced the moment it checks the authority", () => {
  // It still believes it holds epoch 5; the authority has moved to 6.
  const r = R.mayMutate({ hostId: PRIMARY, lease: lease(5), observedEpoch: 6 });
  assert.equal(r.allowed, false);
  assert.equal(r.fenced, true);
  assert.equal(r.superseded_by_epoch, 6);
  assert.match(r.reason, /superseded/);
});

test("two hosts cannot both believe they may mutate at the same observed epoch", () => {
  const observedEpoch = 6;
  const old = R.mayMutate({ hostId: PRIMARY, lease: lease(5, PRIMARY), observedEpoch });
  const neu = R.mayMutate({ hostId: STANDBY, lease: lease(6, STANDBY), observedEpoch });
  assert.equal(old.allowed, false);
  assert.equal(neu.allowed, true);
  assert.notEqual(old.allowed, neu.allowed, "exactly one may mutate");
});

/* ── 9 · old primary rejoin ─────────────────────────────────────────────── */
test("a returning old primary becomes a fenced standby, not the primary", () => {
  const r = R.rejoinDecision({ hostId: PRIMARY, ownEpoch: 5, authorityEpoch: 6, ownRole: R.ROLE.PRIMARY });
  assert.equal(r.role, R.ROLE.STANDBY);
  assert.equal(r.may_mutate, false);
  assert.equal(r.fenced, true);
  assert.equal(r.invalidate_prior_generation, true);
  assert.equal(r.reconcile, "read_only");
});

test("there is no last-boot-wins: a newer boot with an older epoch still loses", () => {
  const r = R.rejoinDecision({ hostId: PRIMARY, ownEpoch: 5, authorityEpoch: 9 });
  assert.equal(r.may_mutate, false);
});

test("a host that cannot read the authority does not lead", () => {
  const r = R.rejoinDecision({ hostId: PRIMARY, ownEpoch: 6, authorityEpoch: null });
  assert.equal(r.role, R.ROLE.FENCED);
  assert.equal(r.may_mutate, false);
});

test("an uncontested primary keeps authority", () => {
  const r = R.rejoinDecision({ hostId: PRIMARY, ownEpoch: 6, authorityEpoch: 6, ownRole: R.ROLE.PRIMARY });
  assert.equal(r.role, R.ROLE.PRIMARY);
  assert.equal(r.may_mutate, true);
});

/* ── 10/11 · in-flight work ─────────────────────────────────────────────── */
test("an accepted-not-started action survives and executes exactly once", () => {
  const c = R.classifyInflight({ action_key: "repository.merge_pull_request", status: "accepted" });
  assert.equal(c.class, R.INFLIGHT_CLASS.ACCEPTED_NOT_STARTED);
  assert.equal(c.action, "execute_once");
  assert.equal(c.owner, "governed-action-request");
});

test("a started-unknown destructive action is NEVER replayed", () => {
  for (const key of ["database.apply_migration", "repository.merge_pull_request", "execution.send_message"]) {
    const c = R.classifyInflight({ action_key: key, status: "executing" });
    assert.equal(c.class, R.INFLIGHT_CLASS.STARTED_UNKNOWN);
    assert.equal(c.replay, false, `${key} must not be replayed`);
    assert.equal(c.action, "settle_as_interrupted");
  }
});

test("a completed action is left alone", () => {
  assert.equal(R.classifyInflight({ status: "complete" }).action, "none");
});

test("every reconciliation domain delegates to an existing owner", () => {
  assert.ok(R.TAKEOVER_RECONCILIATION.length >= 6);
  for (const d of R.TAKEOVER_RECONCILIATION) {
    assert.ok(d.owner && !d.owner.includes("control-plane-resilience"), `${d.domain} must delegate`);
    assert.ok(d.rule, `${d.domain} needs a stated rule`);
  }
  assert.match(R.TAKEOVER_RECONCILIATION.find((d) => d.domain === "migrations").rule, /partial success is a real state/);
});

/* ── 12 · promotion state ───────────────────────────────────────────────── */
test("promotion candidates reconcile against current staging rather than being replicated", () => {
  const p = R.stateById("promotion_candidates");
  assert.equal(p.disposition, R.DISPOSITION.RECONCILE);
  assert.match(p.why, /revalidate/);
});

/* ── 13/14/15 · takeover certification ──────────────────────────────────── */
test("a takeover certifies only when every proof passes", () => {
  const c = R.certifyTakeover({ proofs: allProofs(true) });
  assert.equal(c.certified, true);
  assert.equal(c.admission, "open");
});

test("stale generation ownership blocks admission after takeover", () => {
  const c = R.certifyTakeover({ proofs: { ...allProofs(true), no_stale_generation_ownership: false } });
  assert.equal(c.certified, false);
  assert.equal(c.admission, "constrained");
  assert.ok(c.failed.includes("no_stale_generation_ownership"));
});

test("a takeover that reused the old generation fails certification", () => {
  const c = R.certifyTakeover({ proofs: { ...allProofs(true), generation_is_new: false } });
  assert.equal(c.certified, false);
  assert.ok(c.failed.includes("generation_is_new"));
});

test("Critical Invariants gate admission after takeover, and unmeasured blocks", () => {
  const failed = R.certifyTakeover({ proofs: { ...allProofs(true), critical_invariants: false } });
  assert.equal(failed.certified, false);
  const proofs = allProofs(true); delete proofs.critical_invariants;
  const unmeasured = R.certifyTakeover({ proofs });
  assert.equal(unmeasured.certified, false);
  assert.deepEqual(unmeasured.unmeasured, ["critical_invariants"]);
  assert.equal(unmeasured.admission, "constrained");
});

test("an unfenced old primary blocks takeover certification", () => {
  const c = R.certifyTakeover({ proofs: { ...allProofs(true), old_primary_fenced: false } });
  assert.equal(c.certified, false);
  assert.ok(c.failed.includes("old_primary_fenced"));
});

/* ── 16/17 · standby that cannot be trusted ─────────────────────────────── */
test("an incompatible standby refuses takeover", () => {
  const r = R.standbyReadiness({ checks: { ...Object.fromEntries(R.READINESS_CHECKS.map((k) => [k, true])), toolchain_compatible: false }, replicationLagMs: 1000 });
  assert.equal(r.ready, false);
  assert.ok(r.blocking.includes("toolchain_compatible"));
  const d = R.takeoverDecision({ standby: { host_id: STANDBY }, primarySuspected: true, evidence: ["cas_lease_expired"], readiness: r, casAvailable: true });
  assert.equal(d.takeover, false);
  assert.match(d.reason, /toolchain_compatible/);
});

test("a standby without secret authority is not ready", () => {
  const r = R.standbyReadiness({ checks: { ...Object.fromEntries(R.READINESS_CHECKS.map((k) => [k, true])), secret_references_available: false }, replicationLagMs: 1000 });
  assert.equal(r.ready, false);
  assert.ok(r.blocking.includes("secret_references_available"));
});

test("an unmeasured readiness check blocks exactly as a failed one does", () => {
  const r = R.standbyReadiness({ checks: { repository_identity: true }, replicationLagMs: 1000 });
  assert.equal(r.ready, false);
  assert.ok(r.blocking.includes("toolkit_identity"));
});

test("stale replicated state blocks takeover", () => {
  const stale = R.standbyReadiness({ checks: Object.fromEntries(R.READINESS_CHECKS.map((k) => [k, true])), replicationLagMs: 60 * 60_000 });
  assert.equal(stale.ready, false);
  assert.ok(stale.blocking.includes("replication_lag_exceeded"));
  const unmeasured = R.standbyReadiness({ checks: Object.fromEntries(R.READINESS_CHECKS.map((k) => [k, true])), replicationLagMs: null });
  assert.ok(unmeasured.blocking.includes("replication_lag_unmeasured"));
});

test("a passive standby runs no mutation workers", () => {
  assert.equal(ready().passive, true);
});

/* ── V1 posture: manual fenced failover ─────────────────────────────────── */
test("V1 refuses automatic takeover even when fencing is provable", () => {
  const d = R.takeoverDecision({
    standby: { host_id: STANDBY }, primarySuspected: true, evidence: ["cas_lease_expired"],
    readiness: ready(), casAvailable: true, currentEpoch: 5,
  });
  assert.equal(d.takeover, false);
  assert.equal(d.requires_operator, true);
  assert.equal(d.would_acquire_epoch, 6);
  assert.match(d.reason, /MANUAL_FENCED_FAILOVER/);
});

test("automatic mode advances exactly one epoch when everything is proven", () => {
  const d = R.takeoverDecision({
    standby: { host_id: STANDBY }, primarySuspected: true, evidence: ["cas_lease_expired"],
    readiness: ready(), casAvailable: true, currentEpoch: 5, mode: "AUTOMATIC",
  });
  assert.equal(d.takeover, true);
  assert.equal(d.acquire_epoch, 6);
});

/* ── 18 · bounded, durable failover evidence ────────────────────────────── */
test("the projection names what blocks failover rather than only whether it is ready", () => {
  const none = R.resilienceProjection({ primary: R.hostIdentity({ hostId: PRIMARY }), standby: null });
  assert.match(none.blocked_failover_reason, /no standby host/);

  const noAuth = R.resilienceProjection({
    primary: R.hostIdentity({ hostId: PRIMARY }),
    standby: R.hostIdentity({ hostId: STANDBY, role: R.ROLE.STANDBY }),
    lease: lease(1, PRIMARY, { authority: R.LEASE_AUTHORITY.NONE }),
  });
  assert.match(noAuth.blocked_failover_reason, /fencing authority/);

  const incomplete = R.resilienceProjection({
    primary: R.hostIdentity({ hostId: PRIMARY }),
    standby: R.hostIdentity({ hostId: STANDBY, role: R.ROLE.STANDBY }),
    lease: lease(1), snapshot: R.snapshotManifest({ entries: [{ id: "lane_registry" }] }),
  });
  assert.match(incomplete.blocked_failover_reason, /incomplete/);
});

test("the projection is bounded evidence, not a log", () => {
  const p = R.resilienceProjection({
    primary: R.hostIdentity({ hostId: PRIMARY, runtimeGeneration: "gen_a", lastHeartbeatMs: Date.now() - 5000 }),
    standby: R.hostIdentity({ hostId: STANDBY, role: R.ROLE.STANDBY }),
    lease: lease(6),
    snapshot: R.snapshotManifest({ entries: R.mustReplicate().map((s) => ({ id: s.id })) }),
  });
  assert.equal(p.leadership_epoch, 6);
  assert.equal(p.blocked_failover_reason, null);
  assert.ok(JSON.stringify(p).length < 2048);
});

/* ── 19 · no second system ──────────────────────────────────────────────── */
test("no second lane, slot, promotion or recovery system is introduced", () => {
  const code = codeOf("control-plane-resilience.mjs");
  for (const f of ["child_process", "spawnSync", "execFileSync", "writeFileSync", "readFileSync", "setInterval"]) {
    assert.ok(!code.includes(f), `the resilience module must not use ${f}`);
  }
  for (const w of ["class LaneRegistry", "allocateSlot", "mergePullRequest", "registerOwnedProcess"]) {
    assert.ok(!code.includes(w), `must not reimplement ${w}`);
  }
  const exported = Object.keys(R);
  assert.ok(!exported.some((k) => /^(write|save|persist|install)/.test(k)), `no writer exports: ${exported.join(", ")}`);
});

test("insufficient evidence is enumerated so it cannot be smuggled in as proof", () => {
  for (const e of ["ping_timeout", "pid_absent", "local_heartbeat_stale", "wall_clock_timeout"]) {
    assert.ok(R.INSUFFICIENT_EVIDENCE.includes(e), `${e} must be named as insufficient`);
  }
});

/* ── M · RPO and RTO, measured or null ──────────────────────────────────── */
test("RTO is null rather than guessed when no restore has been timed", () => {
  const o = R.recoveryObjectives({ snapshotIntervalMs: 15 * 60_000 });
  assert.equal(o.rpo_ms, 15 * 60_000);
  assert.equal(o.rto_ms, null);
  assert.equal(o.rto_measured, false);
  assert.match(o.rto_basis, /would be a guess/);
});

test("a measured restore produces an RTO that includes provisioning and certification", () => {
  const warm = R.recoveryObjectives({ replicateBytes: 100_000_000, restoreRateBytesPerMs: 20_000, standbyWarm: true });
  assert.equal(warm.rto_measured, true);
  assert.ok(warm.rto_ms > 5 * 60_000, "certification time is included, not assumed free");
  const cold = R.recoveryObjectives({ replicateBytes: 100_000_000, restoreRateBytesPerMs: 20_000, standbyWarm: false });
  assert.ok(cold.rto_ms > warm.rto_ms, "a cold standby must clone, install and provision first");
});

/* ── Q · design certified is not activation ready ───────────────────────── */
test("passing fixtures does not make live failover ready", () => {
  const a = R.activationReadiness({});
  assert.equal(a.live_activation_ready, false);
  assert.equal(a.mode, "NOT_ACTIVATED");
  assert.ok(a.missing.includes("a second physical host"));
  assert.ok(a.missing.includes("an external fencing authority"));
  assert.ok(a.missing.includes("one controlled failover test"));
});

test("activation readiness names exactly what infrastructure is still missing", () => {
  const a = R.activationReadiness({
    standbyHostPresent: true, standbyReachable: false, replicationConfigured: false,
    fencingAuthority: R.LEASE_AUTHORITY.REMOTE_REF_CAS, secretAuthorityOnStandby: false,
    restoreDrillPassed: true, controlledFailoverTested: false,
  });
  assert.equal(a.live_activation_ready, false);
  assert.deepEqual(a.missing, [
    "continuous connectivity to the standby",
    "configured state replication",
    "secret grants held by the standby in its own right",
    "one controlled failover test",
  ]);
});

test("everything in place yields a manual fenced failover, never an automatic one", () => {
  const a = R.activationReadiness({
    standbyHostPresent: true, standbyReachable: true, replicationConfigured: true,
    fencingAuthority: R.LEASE_AUTHORITY.REMOTE_REF_CAS, secretAuthorityOnStandby: true,
    restoreDrillPassed: true, controlledFailoverTested: true,
  });
  assert.equal(a.live_activation_ready, true);
  assert.equal(a.mode, "MANUAL_FENCED_FAILOVER");
});
