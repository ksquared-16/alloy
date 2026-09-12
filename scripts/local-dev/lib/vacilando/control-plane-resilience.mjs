/**
 * CONTROL PLANE RESILIENCE — one active primary, one warm standby, and a way to
 * prove which is which.
 *
 * THE PROBLEM, STATED EXACTLY. `claimControlPlaneOwnership` writes
 * `control-plane-owner.json` into the runtime root of the machine that wrote it.
 * It is a perfectly good answer to "which process on THIS host owns the control
 * plane" and no answer at all to "which HOST owns it", because the file and the
 * host fail together. Losing the Mac mini therefore loses both Vacilando and the
 * record of who was running it.
 *
 * WHAT THIS ADDS is the smallest thing that fixes that: a leadership epoch held
 * by an authority that is not on either host, and a guard that every mutation
 * passes before acting. What it deliberately does NOT add is a second lane
 * system, a second recovery system, a second slot authority or a distributed
 * database. Recovery, reconciliation, generations, invariants and session
 * restoration all already exist and are called, not rebuilt.
 *
 * NO ACTIVE/ACTIVE, AND AMBIGUITY LOSES. Two hosts may be capable; exactly one
 * may mutate. When leadership cannot be proven the answer is refusal, because a
 * few minutes of unavailability is cheaper than one duplicated migration, merge,
 * message or provider turn — each of which is a thing no recovery pass can undo.
 *
 * This module performs no I/O: it takes observations and returns decisions, so a
 * failover verdict is a pure function of evidence and can be replayed.
 */

import { ACTIVATION_STATE } from "./toolchain-canary.mjs";

export const RESILIENCE_SCHEMA = "vacilando.control_plane_resilience.v1";

/* ── A/B: the durable-state inventory ───────────────────────────────────── */

/**
 * WHAT A SECOND HOST WOULD NEED TO BECOME VACILANDO.
 *
 * Four dispositions, and the distinction that matters most is REPLICATE versus
 * REBUILD. Filesystem mirroring is the tempting failover architecture and the
 * wrong one: it copies 281 MB of which most is reconstructible, it copies
 * processes' leavings as though they were authority, and it makes the standby a
 * photograph of a machine rather than a host that can do the work.
 *
 * Measured on 2026-09-12: the gateway state root is 281 MB, of which
 * execution-runs (44 MB), audit.jsonl (42 MB), trusted-host-actions (13 MB) and
 * attachments (11 MB) are the bulk — and only a thin slice of that is
 * unreconstructable.
 */
export const DISPOSITION = Object.freeze({
  REPLICATE: "REPLICATE",
  REBUILD: "REBUILD",
  RECONCILE: "RECONCILE",
  RECREATE: "RECREATE",
  DO_NOT_RESTORE: "DO_NOT_RESTORE",
});

export const STATE_INVENTORY = Object.freeze([
  Object.freeze({
    id: "lane_registry", owner: "development-lane", location: "vacilando/lanes",
    disposition: DISPOSITION.REPLICATE, secret: false, ordered: true,
    why: "lane identity is the one thing nothing else can reconstruct; a lane is not its branch, slot or worktree",
  }),
  Object.freeze({
    id: "lane_memory", owner: "lane-memory / lane-knowledge (DevOps 4)", location: "vacilando/lane-memory",
    disposition: DISPOSITION.REPLICATE, secret: false, ordered: false,
    why: "durable decisions and next actions; losing them is what makes an operator reconstruct ten lanes by hand",
  }),
  Object.freeze({
    id: "repository_knowledge", owner: "git — docs/platform/planning", location: "the repository",
    disposition: DISPOSITION.REBUILD, secret: false, ordered: false,
    why: "already on the canonical remote; cloning it is the restore",
  }),
  Object.freeze({
    id: "execution_runs", owner: "execution-run", location: "vacilando/execution-runs",
    disposition: DISPOSITION.REPLICATE, secret: false, ordered: true,
    why: "run identity and completion state; an unreplicated run is work whose outcome nobody can determine",
    note: "44 MB — the bulk is historical and may be bounded by retention before replication",
  }),
  Object.freeze({
    id: "governed_requests", owner: "governed-action-request", location: "vacilando/governed-actions",
    disposition: DISPOSITION.REPLICATE, secret: false, ordered: true,
    why: "an accepted action that is lost is either never done or done twice, and nothing can tell which afterwards",
  }),
  Object.freeze({
    id: "governed_grants", owner: "governed-action-request", location: "vacilando/governed-grants.json",
    disposition: DISPOSITION.REPLICATE, secret: false, ordered: true,
    why: "single-use grants; replaying a lost grant is how one approval becomes two executions",
  }),
  Object.freeze({
    id: "recovery_episodes", owner: "control-plane-recovery", location: "vacilando/control-plane-recovery",
    disposition: DISPOSITION.RECONCILE, secret: false, ordered: false,
    why: "an episode describes a host that no longer exists; the new primary opens its own",
  }),
  Object.freeze({
    id: "promotion_candidates", owner: "promotion-train (DevOps 6)", location: "git SHAs + lane records",
    disposition: DISPOSITION.RECONCILE, secret: false, ordered: false,
    why: "candidates are SHAs on the remote; the train must revalidate against whatever staging is after takeover",
  }),
  Object.freeze({
    id: "worktrees", owner: "git + worktree-registration", location: "~/Code/alloy-worktrees",
    disposition: DISPOSITION.REBUILD, secret: false, ordered: false,
    why: "a worktree is a checkout of a pushed branch; mirroring it copies build output and stale state",
    caveat: "unpushed commits are the exception and are the one thing a drill must prove is detected, not silently lost",
  }),
  Object.freeze({
    id: "host_config", owner: "alloy-config / metadata", location: "gateway/metadata",
    disposition: DISPOSITION.REPLICATE, secret: false, ordered: false,
    why: "slot and port topology; the registry that DevOps 8 proved is the authority for which ports exist",
  }),
  Object.freeze({
    id: "toolkit_identity", owner: "toolkit-convergence (DevOps 9)", location: "toolkit/current",
    disposition: DISPOSITION.REBUILD, secret: false, ordered: false,
    why: "a SHA; the standby installs the same one through the canonical installer",
  }),
  Object.freeze({
    id: "instruction_baseline", owner: "git — CLAUDE.md (DevOps 8)", location: "the repository",
    disposition: DISPOSITION.REBUILD, secret: false, ordered: false,
    why: "a content hash of a committed file",
  }),
  Object.freeze({
    id: "secrets", owner: "trusted-secrets / keychain / provider", location: "gateway/vacilando/trusted-secrets, gateway/auth",
    disposition: DISPOSITION.DO_NOT_RESTORE, secret: true, ordered: false,
    why: "secret VALUES are never replicated; the standby holds its own grants or refuses the operations needing them",
  }),
  Object.freeze({
    id: "browser_profiles", owner: "browser-auth", location: "gateway/browser-profiles",
    disposition: DISPOSITION.DO_NOT_RESTORE, secret: true, ordered: false,
    why: "a QA session cannot be revived by copying a profile; it needs an operator sign-in",
  }),
  Object.freeze({
    id: "owned_processes", owner: "execution-recovery", location: "vacilando/owned-processes",
    disposition: DISPOSITION.DO_NOT_RESTORE, secret: false, ordered: false,
    why: "every record is previous-generation by construction the moment the host changes",
  }),
  Object.freeze({
    id: "runtime_generation", owner: "control-plane-health", location: "derived from boot time",
    disposition: DISPOSITION.RECREATE, secret: false, ordered: false,
    why: "a takeover is a new incarnation; carrying the old generation across hosts would make stale ownership look current",
  }),
  Object.freeze({
    id: "provider_sessions", owner: "agent-session-lifecycle", location: "vacilando/execution-sessions",
    disposition: DISPOSITION.RECREATE, secret: false, ordered: false,
    why: "recreated from durable lane and run context, exactly as DevOps 7 does after a reboot",
  }),
  Object.freeze({
    id: "audit_log", owner: "audit.jsonl", location: "vacilando/audit.jsonl",
    disposition: DISPOSITION.REPLICATE, secret: false, ordered: true,
    why: "the authorization basis for past governed actions; 42 MB, append-only, and bounded by retention rather than copied whole",
  }),
]);

export function stateById(id) {
  return STATE_INVENTORY.find((s) => s.id === id) || null;
}

export function inventoryByDisposition() {
  const out = {};
  for (const s of STATE_INVENTORY) (out[s.disposition] ||= []).push(s.id);
  return out;
}

/** Everything that must survive the loss of the primary. */
export function mustReplicate() {
  return STATE_INVENTORY.filter((s) => s.disposition === DISPOSITION.REPLICATE);
}

/* ── C: the snapshot ────────────────────────────────────────────────────── */

/**
 * A snapshot is ordered, versioned, integrity-checked and CARRIES NO SECRETS.
 *
 * `snapshotManifest` builds a manifest of what a snapshot contains, not the
 * bytes. A control asserts that no entry whose inventory row is marked `secret`
 * can appear in one — refused rather than filtered, because silently dropping an
 * entry would let a restore believe it had something it did not.
 */
export function snapshotManifest({ entries = [], epoch = null, takenAt = null, primaryHostId = null } = {}) {
  const rejected = [];
  const kept = [];
  for (const e of entries) {
    const row = stateById(e.id);
    if (!row) { rejected.push({ id: e.id, why: "not in the durable-state inventory" }); continue; }
    if (row.secret) { rejected.push({ id: e.id, why: "secret-bearing state is never placed in a snapshot" }); continue; }
    if (row.disposition !== DISPOSITION.REPLICATE) { rejected.push({ id: e.id, why: `${row.disposition} state is not replicated` }); continue; }
    kept.push({ id: e.id, bytes: e.bytes ?? null, digest: e.digest ?? null, ordered: row.ordered });
  }
  return {
    schema: RESILIENCE_SCHEMA,
    kind: "snapshot_manifest",
    epoch, primary_host_id: primaryHostId,
    taken_at: takenAt || new Date().toISOString(),
    entries: kept,
    rejected,
    // A manifest missing a required store is not a snapshot anyone can restore.
    complete: mustReplicate().every((m) => kept.some((k) => k.id === m.id)),
    missing: mustReplicate().filter((m) => !kept.some((k) => k.id === m.id)).map((m) => m.id),
  };
}

/* ── E: host identity, which is not a generation ────────────────────────── */

export const ROLE = Object.freeze({ PRIMARY: "PRIMARY", STANDBY: "STANDBY", FENCED: "FENCED", UNKNOWN: "UNKNOWN" });

/**
 * THREE IDENTITIES THAT ARE ROUTINELY CONFUSED, kept apart on purpose.
 *
 *   host_id            durable, survives reboots and reinstalls — WHICH MACHINE
 *   runtime_generation minted per control-plane incarnation      — WHICH BOOT
 *   pid                                                          — WHICH PROCESS
 *
 * DevOps 5 made the last two distinct after PID reuse let a stranger inherit
 * ownership. A failover adds the first, and collapsing it into generation is the
 * same mistake one level up: a standby that reused the primary's generation
 * would make every stale ownership record on the replicated state look current.
 */
export function hostIdentity({ hostId, role = ROLE.UNKNOWN, runtimeGeneration = null, epoch = null, lastHeartbeatMs = null } = {}) {
  return {
    schema: RESILIENCE_SCHEMA,
    host_id: hostId,
    role,
    runtime_generation: runtimeGeneration,
    leadership_epoch: epoch,
    last_heartbeat_ms: lastHeartbeatMs,
  };
}

/* ── F: leadership and fencing ──────────────────────────────────────────── */

/**
 * WHY THE LEASE LIVES OFF-HOST, AND WHY IT IS COMPARE-AND-SWAP.
 *
 * Audited before choosing. The only authorities available here that survive the
 * loss of the Mac mini are the GitHub remote and the hosted database; Tailscale
 * is connectivity, not arbitration, and there is no etcd or consul. The remote
 * git ref is the better of the two: it is already the promotion authority this
 * system trusts, it is always-on, and a ref update is atomic server-side, so
 * exactly one claimant can move the epoch from N to N+1.
 *
 * THE INSIGHT THAT MAKES THIS SUFFICIENT. Every mutation Vacilando must not
 * duplicate — a merge, a push, a hosted migration, a message send, a toolkit
 * install — requires the network. A partitioned old primary therefore cannot
 * perform any of them, whatever it believes about its own role. Fencing the
 * remote fences the entire destructive class, and the local writes a partitioned
 * host keeps making are reconciled as an older epoch rather than trusted.
 *
 * WHAT IS EXPLICITLY REFUSED as evidence of death: an unanswered ping, an absent
 * PID, a local heartbeat file, or a wall clock. None of them can distinguish a
 * dead host from an unreachable one, and a takeover authorised by any of them is
 * a split brain waiting for the network to heal.
 */
export const LEASE_AUTHORITY = Object.freeze({
  REMOTE_REF_CAS: "remote_ref_cas",
  HOSTED_DB_CAS: "hosted_db_cas",
  NONE: "none",
});

/** Evidence that does NOT authorize a takeover, named so it cannot be smuggled in. */
export const INSUFFICIENT_EVIDENCE = Object.freeze([
  "ping_timeout", "pid_absent", "local_heartbeat_stale", "wall_clock_timeout", "operator_impatience",
]);

export function leadershipLease({ epoch, holderHostId, authority = LEASE_AUTHORITY.REMOTE_REF_CAS, acquiredAt = null, expiresAtMs = null } = {}) {
  return {
    schema: RESILIENCE_SCHEMA,
    kind: "leadership_lease",
    epoch: Number(epoch),
    holder_host_id: holderHostId,
    authority,
    acquired_at: acquiredAt || new Date().toISOString(),
    expires_at_ms: expiresAtMs,
  };
}

/**
 * MAY THIS HOST MUTATE?
 *
 * The single guard every mutation passes. It is deliberately boring and
 * deliberately total: no lease, a lease held by somebody else, an epoch behind
 * the authority, or an authority of NONE all produce the same answer.
 *
 * `observedEpoch` is what the external authority currently reports. A holder
 * whose own epoch is behind it has already been superseded and does not know —
 * which is exactly the returning-old-primary case, and the reason the check
 * compares against the authority rather than against memory.
 */
export function mayMutate({ hostId, lease = null, observedEpoch = null, nowMs = Date.now() } = {}) {
  if (!lease) return { allowed: false, reason: "no leadership lease is held", fenced: true };
  if (lease.authority === LEASE_AUTHORITY.NONE) {
    return { allowed: false, reason: "no external fencing authority is configured; mutation authority cannot be proven", fenced: true };
  }
  if (lease.holder_host_id !== hostId) {
    return { allowed: false, reason: `the lease is held by ${lease.holder_host_id}, not ${hostId}`, fenced: true };
  }
  if (observedEpoch !== null && Number(observedEpoch) > Number(lease.epoch)) {
    return {
      allowed: false, fenced: true, superseded_by_epoch: Number(observedEpoch),
      reason: `this host holds epoch ${lease.epoch} but the authority is at ${observedEpoch}; it has been superseded`,
    };
  }
  if (lease.expires_at_ms && nowMs > lease.expires_at_ms) {
    return { allowed: false, reason: "the leadership lease has expired and must be renewed against the authority", fenced: true };
  }
  return { allowed: true, epoch: Number(lease.epoch), reason: "this host holds the current leadership epoch" };
}

/**
 * SHOULD THIS STANDBY TAKE OVER?
 *
 * Detection and authorization are separate questions and this only answers the
 * second. Heartbeat loss may open the question; only a successful
 * compare-and-swap against the external authority closes it.
 *
 * `casAvailable` false is the case the mission asks to be honest about: without
 * hard fencing, V1 is MANUAL_FENCED_FAILOVER and this refuses rather than
 * pretending automation is safe.
 */
export function takeoverDecision({
  standby = null, primarySuspected = false, evidence = [],
  currentEpoch = null, casAvailable = false, readiness = null, mode = "MANUAL_FENCED_FAILOVER",
} = {}) {
  if (!primarySuspected) return { takeover: false, reason: "the primary is not suspected unavailable" };

  const onlyInsufficient = evidence.length > 0 && evidence.every((e) => INSUFFICIENT_EVIDENCE.includes(e));
  if (!evidence.length || onlyInsufficient) {
    return {
      takeover: false, fail_closed: true,
      reason: `${evidence.join(", ") || "no evidence"} cannot distinguish a dead host from an unreachable one; it may open the question, never authorize the answer`,
    };
  }
  if (!readiness?.ready) {
    return { takeover: false, fail_closed: true, reason: `the standby is not ready: ${readiness?.blocking?.join(", ") || "readiness not measured"}` };
  }
  if (!casAvailable) {
    return {
      takeover: false, fail_closed: true, requires_operator: true,
      reason: "no external compare-and-swap authority is reachable, so the previous primary cannot be proven fenced; V1 requires an operator-confirmed fenced failover",
    };
  }
  if (mode !== "AUTOMATIC") {
    return {
      takeover: false, requires_operator: true,
      reason: "failover mode is MANUAL_FENCED_FAILOVER; fencing is provable but a human confirms the takeover in V1",
      would_acquire_epoch: Number(currentEpoch ?? 0) + 1,
    };
  }
  return {
    takeover: true, acquire_epoch: Number(currentEpoch ?? 0) + 1, host_id: standby?.host_id ?? null,
    reason: "the standby is ready and the previous primary can be fenced by advancing the epoch at the external authority",
  };
}

/* ── H: standby readiness ───────────────────────────────────────────────── */

/**
 * Can this standby actually be Vacilando?
 *
 * Every check is null-hostile: unmeasured blocks exactly as false does, because
 * a standby that could not prove its toolchain is a standby that might take over
 * into an incompatible runtime — which is worse than not taking over.
 */
export const READINESS_CHECKS = Object.freeze([
  "repository_identity", "toolkit_identity", "toolchain_compatible", "instruction_baseline",
  "host_config_present", "secret_references_available", "replication_current",
  "invariants_available", "gateway_start_path_valid", "health_machinery_available",
]);

export function standbyReadiness({ checks = {}, replicationLagMs = null, maxLagMs = 15 * 60_000 } = {}) {
  const rows = READINESS_CHECKS.map((id) => {
    const v = checks[id];
    return { id, outcome: v === true ? "PASS" : v === false ? "FAIL" : "UNMEASURED" };
  });
  const blocking = rows.filter((r) => r.outcome !== "PASS").map((r) => r.id);
  const lagOk = replicationLagMs !== null && replicationLagMs <= maxLagMs;
  if (replicationLagMs === null) blocking.push("replication_lag_unmeasured");
  else if (!lagOk) blocking.push("replication_lag_exceeded");
  return {
    ready: blocking.length === 0,
    rows, blocking,
    replication_lag_ms: replicationLagMs,
    // A passive standby reads; it does not run mutation workers.
    passive: true,
    reason: blocking.length ? `standby not ready: ${blocking.join(", ")}` : "standby is ready to assume authority",
  };
}

/* ── J: in-flight work at the moment of takeover ────────────────────────── */

/**
 * WHAT THE NEW PRIMARY DOES WITH WORK THE OLD ONE WAS DOING.
 *
 * Every row delegates to an owner that already exists. The one that must never
 * be got wrong is STARTED_UNKNOWN: an action that began and whose outcome cannot
 * be determined is NEVER replayed, because replaying a merge, a migration or a
 * message is how one operation becomes two — and this host has already produced
 * a migration that applied while its ledger row did not, which is exactly the
 * state that looks like "it failed, run it again".
 */
export const INFLIGHT_CLASS = Object.freeze({
  ACCEPTED_NOT_STARTED: "ACCEPTED_NOT_STARTED",
  STARTED_UNKNOWN: "STARTED_UNKNOWN",
  COMPLETED: "COMPLETED",
});

export function classifyInflight(action = {}) {
  const status = String(action.status || "").toLowerCase();
  if (["complete", "failed", "cancelled"].includes(status)) {
    return { class: INFLIGHT_CLASS.COMPLETED, action: "none", owner: null, reason: "the action reached a terminal state before the primary was lost" };
  }
  if (["accepted", "approved", "queued"].includes(status)) {
    return {
      class: INFLIGHT_CLASS.ACCEPTED_NOT_STARTED, action: "execute_once",
      owner: "governed-action-request", idempotency: "single-use grant",
      reason: "authorized and never begun; the grant makes executing it exactly once safe",
    };
  }
  return {
    class: INFLIGHT_CLASS.STARTED_UNKNOWN, action: "settle_as_interrupted", replay: false,
    owner: "governed-action-request settleInterruptedAcceptedExecution",
    reason: "execution began and its outcome cannot be determined from here; it is settled as interrupted and never replayed",
  };
}

/** Per-domain reconciliation at takeover, each naming its existing owner. */
export const TAKEOVER_RECONCILIATION = Object.freeze([
  Object.freeze({ domain: "migrations", owner: "migration-parity + census", rule: "determine hosted truth by measurement before any retry; partial success is a real state" }),
  Object.freeze({ domain: "merges", owner: "trusted-host-merge", rule: "re-read the PR from GitHub; the remote is the authority on whether it merged" }),
  Object.freeze({ domain: "messages", owner: "execution-run-send", rule: "durable acceptance and idempotency decide, never a blind resend" }),
  Object.freeze({ domain: "promotion_train", owner: "promotion-train (DevOps 6)", rule: "rebuild candidates from SHAs and revalidate against whatever staging is now" }),
  Object.freeze({ domain: "provider_turns", owner: "agent-session-lifecycle", rule: "resume if the lifecycle says the session survives, else recreate from durable context" }),
  Object.freeze({ domain: "slots", owner: "managed-slots + worktree-lifecycle", rule: "the registry is authority; pid files from the lost host are not" }),
]);

/* ── I: takeover and its certification ──────────────────────────────────── */

/**
 * Post-takeover certification reuses DevOps 7's shape because it is the same
 * question one host over: did the thing that came up prove itself before it was
 * allowed to admit work?
 *
 * `generation_is_new` is load-bearing here for a different reason than after a
 * reboot: a standby that carried the primary's generation across would make
 * every stale ownership record in the replicated state read as current.
 */
export function certifyTakeover({ proofs = {} } = {}) {
  const REQUIRED = [
    "generation_is_new", "epoch_is_current", "old_primary_fenced", "replicated_state_restored",
    "lane_knowledge_intact", "no_stale_generation_ownership", "no_slot_conflicts",
    "critical_invariants", "host_health", "toolchain_identity",
  ];
  const rows = REQUIRED.map((id) => {
    const v = proofs[id];
    return { id, outcome: v === true ? "PASS" : v === false ? "FAIL" : "UNMEASURED" };
  });
  const failed = rows.filter((r) => r.outcome === "FAIL").map((r) => r.id);
  const unmeasured = rows.filter((r) => r.outcome === "UNMEASURED").map((r) => r.id);
  const healthy = !failed.length && !unmeasured.length;
  return {
    certified: healthy, rows, failed, unmeasured,
    admission: healthy ? "open" : "constrained",
    reason: failed.length ? `takeover failed: ${failed.join(", ")}`
      : unmeasured.length ? `takeover unproven: ${unmeasured.join(", ")}`
        : "takeover certified; admission opens",
  };
}

/* ── L: the old primary comes back ──────────────────────────────────────── */

/**
 * NO "LAST BOOT WINS".
 *
 * A returning primary sees an epoch newer than its own and becomes STANDBY,
 * fenced, reconciling read-only. It does not get authority back by having been
 * the primary yesterday, by having the larger state directory, or by booting
 * most recently — only through an explicit transfer that advances the epoch
 * again.
 */
export function rejoinDecision({ hostId, ownEpoch = null, authorityEpoch = null, ownRole = ROLE.PRIMARY } = {}) {
  if (authorityEpoch === null) {
    return { role: ROLE.FENCED, may_mutate: false, reason: "the leadership authority could not be read; a host that cannot prove it leads does not lead" };
  }
  if (Number(ownEpoch ?? -1) < Number(authorityEpoch)) {
    return {
      role: ROLE.STANDBY, may_mutate: false, fenced: true,
      invalidate_prior_generation: true, reconcile: "read_only",
      reason: `this host held epoch ${ownEpoch}; the authority is at ${authorityEpoch}. Another host took over and this one is now the standby.`,
    };
  }
  if (Number(ownEpoch) === Number(authorityEpoch) && ownRole === ROLE.PRIMARY) {
    return { role: ROLE.PRIMARY, may_mutate: true, reason: "this host still holds the current epoch; nothing took over" };
  }
  return { role: ROLE.STANDBY, may_mutate: false, reason: "this host does not hold the current epoch" };
}

/* ── M: RPO and RTO, from measurement ───────────────────────────────────── */

/**
 * Targets derived from state volume and snapshot cadence rather than chosen to
 * sound impressive. The mission is explicit that correctness beats a thirty
 * second takeover, and the numbers below say so: an RPO equal to the snapshot
 * interval is the honest bound, because anything written between snapshots is
 * gone if the disk is.
 */
export function recoveryObjectives({ snapshotIntervalMs = 15 * 60_000, replicateBytes = null, restoreRateBytesPerMs = null, standbyWarm = false } = {}) {
  const rpoMs = snapshotIntervalMs;
  const restoreMs = replicateBytes && restoreRateBytesPerMs ? Math.round(replicateBytes / restoreRateBytesPerMs) : null;
  // A warm standby has the repository, toolkit and dependencies already present;
  // a cold one must clone, install and provision before it can certify.
  const provisionMs = standbyWarm ? 2 * 60_000 : 30 * 60_000;
  const certifyMs = 5 * 60_000;
  return {
    rpo_ms: rpoMs,
    rpo_basis: "anything written between snapshots is lost with the disk; the snapshot interval is the honest bound",
    rto_ms: restoreMs === null ? null : restoreMs + provisionMs + certifyMs,
    rto_measured: restoreMs !== null,
    rto_basis: restoreMs === null
      ? "unmeasured: no restore has been timed, so an RTO would be a guess"
      : `restore ${Math.round(restoreMs / 1000)}s + provision ${provisionMs / 60000}m + certification ${certifyMs / 60000}m`,
    standby_warm: standbyWarm,
  };
}

/* ── P: observability ───────────────────────────────────────────────────── */

export function resilienceProjection({ primary = null, standby = null, lease = null, snapshot = null, lastFailover = null, nowMs = Date.now() } = {}) {
  const heartbeatAgeMs = primary?.last_heartbeat_ms ? nowMs - primary.last_heartbeat_ms : null;
  const snapshotAgeMs = snapshot?.taken_at ? nowMs - Date.parse(snapshot.taken_at) : null;
  return {
    schema: RESILIENCE_SCHEMA,
    primary_host: primary?.host_id ?? null,
    standby_host: standby?.host_id ?? null,
    leadership_epoch: lease?.epoch ?? null,
    fencing_authority: lease?.authority ?? LEASE_AUTHORITY.NONE,
    heartbeat_age_ms: heartbeatAgeMs,
    replication_age_ms: snapshotAgeMs,
    snapshot_complete: snapshot?.complete ?? null,
    standby_role: standby?.role ?? ROLE.UNKNOWN,
    runtime_generation: primary?.runtime_generation ?? null,
    last_failover: lastFailover,
    // The field an operator actually needs: not "are we HA" but "what stops us".
    blocked_failover_reason: blockedReason({ standby, lease, snapshot }),
  };
}

function blockedReason({ standby, lease, snapshot }) {
  if (!standby?.host_id) return "no standby host is registered";
  if (!lease || lease.authority === LEASE_AUTHORITY.NONE) return "no external fencing authority is configured";
  if (!snapshot?.complete) return `the latest snapshot is incomplete: ${(snapshot?.missing || []).join(", ") || "unknown"}`;
  if (standby.role !== ROLE.STANDBY) return `the second host is ${standby.role}, not a warm standby`;
  return null;
}

/* ── Q: activation posture ──────────────────────────────────────────────── */

/**
 * DESIGN CERTIFIED IS NOT ACTIVATION READY, and the mission asks for these to be
 * reported apart. Fixtures passing proves the contracts hold; it proves nothing
 * about whether a second machine exists, is reachable, holds its own secret
 * grants, or has ever been restored into.
 */
export function activationReadiness({
  standbyHostPresent = false, standbyReachable = false, replicationConfigured = false,
  fencingAuthority = LEASE_AUTHORITY.NONE, secretAuthorityOnStandby = false,
  restoreDrillPassed = false, controlledFailoverTested = false,
} = {}) {
  const missing = [];
  if (!standbyHostPresent) missing.push("a second physical host");
  if (!standbyReachable) missing.push("continuous connectivity to the standby");
  if (!replicationConfigured) missing.push("configured state replication");
  if (fencingAuthority === LEASE_AUTHORITY.NONE) missing.push("an external fencing authority");
  if (!secretAuthorityOnStandby) missing.push("secret grants held by the standby in its own right");
  if (!restoreDrillPassed) missing.push("a passing isolated restore drill");
  if (!controlledFailoverTested) missing.push("one controlled failover test");
  return {
    live_activation_ready: missing.length === 0,
    missing,
    mode: missing.length === 0 ? "MANUAL_FENCED_FAILOVER" : "NOT_ACTIVATED",
    reason: missing.length ? `live failover requires: ${missing.join("; ")}` : "infrastructure is in place for an operator-confirmed fenced failover",
  };
}
