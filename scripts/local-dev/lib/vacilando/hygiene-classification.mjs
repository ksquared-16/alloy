/**
 * The hygiene classification contract — one vocabulary over owners that already exist.
 *
 * WHAT THIS IS. A translator and a scoreboard. Worktree safety is decided by
 * `worktree-retirement.mjs`, toolkit retention by `toolkit-retention.mjs`,
 * artefact retention by `artifact-retention.mjs`, and registration truth by
 * `worktree-registration.mjs`. Each of those is mature and certified, and each
 * speaks its own dialect: `candidate`, `prunable`, `RECENT_DIAGNOSTIC`,
 * `archived`. The Director cannot compare four dialects, and a fifth classifier
 * would only add a fifth.
 *
 * WHAT THIS IS NOT. It re-measures nothing and re-decides nothing. Every state
 * below is derived from a verdict some other owner reached, and the evidence
 * that owner produced is carried through unchanged. If this module and an owner
 * ever disagree, the owner is right and this is broken.
 *
 * THE TWO STATES THAT LOOK ALIKE. HEALTHY and EXPECTED both mean "do nothing",
 * and collapsing them loses the reason. HEALTHY is a resource in active correct
 * use — a running toolkit, a worktree with a live provider. EXPECTED is a
 * resource nothing is using that policy retains anyway — a rollback target, a
 * protected branch, an audit ledger. The difference matters the moment someone
 * asks why the estate is not smaller: one answer is "it is working", the other
 * is "we decided to keep it", and only the second is ever worth revisiting.
 */

export const HYGIENE_SCHEMA = "vacilando.hygiene_classification.v1";

/** Every managed resource ends in exactly one of these. There is no default. */
export const HYGIENE_STATES = Object.freeze([
  "HEALTHY",
  "EXPECTED",
  "RECONCILE",
  "RECLAIMABLE",
  "NEEDS_ATTENTION",
  "UNKNOWN",
]);

/** The only state an automatic cycle may act on destructively. */
export const ACTIONABLE_STATE = "RECLAIMABLE";
/** States that mean a human owes a decision. */
export const ATTENTION_STATES = Object.freeze(["NEEDS_ATTENTION"]);

/**
 * Gates whose failure means the worktree is BUSY, not broken.
 *
 * A worktree held by a live provider is the system working. Reporting it beside
 * a worktree holding unpushed commits, both as "blocked", is how a real problem
 * gets lost in a list of non-problems.
 */
const ACTIVE_USE_GATES = new Set([
  "no_live_provider",
  "no_live_dev_server",
  "no_active_execution_run",
  "no_active_governed_action",
  "no_active_lane",
  "not_self_retirement",
]);

/** Gates whose failure means WORK exists that nothing durable owns yet. */
const WORK_AT_RISK_GATES = new Set([
  "tree_clean_or_handled",
  "branch_durability_proven",
  "unique_commits_recoverable",
  "no_untracked_unreproducible",
]);

const result = (state, reason, extra = {}) => ({
  schema_version: HYGIENE_SCHEMA,
  hygiene_state: state,
  reason,
  ...extra,
});

/**
 * Classify one worktree from an `evaluateRetirementSafety` result.
 *
 * The safety evaluation is the evidence; this only names it. Note that an
 * unmeasured gate reaches here as `blocked`, and it must NOT be reported as a
 * blocked worktree — "we could not measure it" and "we measured it and it
 * failed" are different facts and only the first is UNKNOWN.
 */
export function classifyWorktreeHygiene(safety, { operatorHold = false, managed = null, provenance = null } = {}) {
  if (!safety || typeof safety !== "object") {
    return result("UNKNOWN", "no safety evaluation was produced for this worktree");
  }
  const evidence = {
    path: safety.path ?? null,
    branch: safety.branch ?? null,
    durability: safety.durability ?? "unknown",
    state: safety.state ?? null,
    blocked_by: safety.blocked_by ?? [],
    unmeasured: safety.unmeasured ?? [],
    gates: safety.gates ?? [],
    managed: managed ?? safety.managed ?? null,
    provenance: provenance ?? safety.provenance ?? null,
  };

  if (operatorHold === true) {
    return result("EXPECTED", "an explicit operator hold retains this worktree", evidence);
  }
  if (safety.protected_branch) {
    return result("EXPECTED", `${safety.branch} is a protected branch and is never retired`, evidence);
  }
  if (safety.state === "candidate") {
    /*
     * INTENTIONALLY RETAINED — the case §3 names and nothing implemented.
     *
     * A managed worktree is the checkout half of a durable slot configuration:
     * `metadata/<name>.env` names its path, its slot and its port, and retiring
     * the checkout does not surrender the slot. So the retirement gates can all
     * pass on a managed worktree and the outcome is still wrong — a slot whose
     * configured path no longer exists.
     *
     * This was not hypothetical. On the live host `troubleshooting` (slot 8,
     * port 3018) and `wt3-communications-inbound-sms` (slot 3, port 3013) both
     * scored a clean `candidate`: idle, clean, merged into origin/staging, no
     * live reference. Every git fact about them was true and retiring them
     * would still have broken two managed slots.
     *
     * IT ONLY OVERRIDES RECLAIMABLE. Placed ahead of the other branches it also
     * swallowed NEEDS_ATTENTION, so a managed worktree holding unique local
     * commits reported EXPECTED and the work at risk in it vanished from the
     * scoreboard. Being intentionally retained answers "may this be removed",
     * not "is there unheld work in it".
     */
    if (evidence.managed === true) {
      return result("EXPECTED", "intentionally retained: a managed slot's worktree is part of a durable configuration, and releasing the slot is not a hygiene decision", evidence);
    }
    return result("RECLAIMABLE", "every safety gate was measured and passed", evidence);
  }
  if (safety.state === "operator_review") {
    return result("NEEDS_ATTENTION", safety.reason || "the work is durable but has not landed", evidence);
  }
  // Unmeasured before failed: an unmeasured gate is not a failed gate, and
  // reporting it as one invents a defect that was never observed.
  if ((safety.unmeasured || []).length) {
    return result("UNKNOWN", `not measured: ${safety.unmeasured.join(", ")}`, evidence);
  }
  const failed = safety.blocked_by || [];
  if (failed.length && failed.every((g) => ACTIVE_USE_GATES.has(g))) {
    return result("HEALTHY", `in active use: ${failed.join(", ")}`, evidence);
  }
  if (failed.some((g) => WORK_AT_RISK_GATES.has(g))) {
    return result("NEEDS_ATTENTION", `work is present that retained history does not yet hold: ${failed.filter((g) => WORK_AT_RISK_GATES.has(g)).join(", ")}`, evidence);
  }
  if (failed.length) {
    return result("NEEDS_ATTENTION", `gates failed: ${failed.join(", ")}`, evidence);
  }
  return result("UNKNOWN", safety.reason || "the safety evaluation reached no usable conclusion", evidence);
}

/**
 * Classify one toolkit version from a `buildInventory` record and its plan.
 *
 * A blocked plan makes EVERY version unknown, not merely the unresolved ones:
 * if we cannot say what a running process is executing, any candidate could be
 * it. That is the plan's own rule, restated here so a caller reading only the
 * classification cannot lose it.
 */
export function classifyToolkitHygiene(record, plan = null) {
  if (!record || typeof record !== "object") {
    return result("UNKNOWN", "no inventory record for this toolkit version");
  }
  const evidence = {
    version: record.version ?? null,
    disk_bytes: record.disk_bytes ?? null,
    protection_reasons: record.protection_reasons ?? [],
    live_pids: (record.live_process_references || []).map((p) => p.pid),
  };
  if (plan?.execution_blocked) {
    return result("UNKNOWN", plan.blocked_reason || "toolkit pins could not be fully resolved", evidence);
  }
  const reasons = record.protection_reasons || [];
  if (reasons.includes("current") || reasons.includes("live_process")) {
    return result("HEALTHY", `in use: ${reasons.filter((r) => r === "current" || r === "live_process").join(", ")}`, evidence);
  }
  if (reasons.includes("unknown_provenance") || reasons.includes("unknown_reference_state")) {
    return result("UNKNOWN", `retained because it cannot be accounted for: ${reasons.join(", ")}`, evidence);
  }
  if (reasons.length) {
    return result("EXPECTED", `retained by policy: ${reasons.join(", ")}`, evidence);
  }
  if (record.prunable === true) {
    return result("RECLAIMABLE", "no protection reason applies to this version", evidence);
  }
  return result("UNKNOWN", "the version carries no protection reason and is not marked prunable", evidence);
}

/** Classify one artefact from a `classifyArtifactPath` result. */
export function classifyArtifactHygiene(classification) {
  if (!classification || typeof classification !== "object") {
    return result("UNKNOWN", "no retention classification for this path");
  }
  const evidence = {
    path: classification.path ?? null,
    retention_class: classification.retention_class ?? "UNKNOWN",
    rule: classification.rule ?? null,
    bytes: classification.bytes ?? null,
    blocked_by: classification.blocked_by ?? [],
    mechanism: classification.mechanism ?? null,
  };
  if (classification.retention_class === "UNKNOWN") {
    return result("UNKNOWN", classification.why || "no rule covers this path", evidence);
  }
  if (classification.reclaimable === true) {
    return result("RECLAIMABLE", `${classification.retention_class} outside its retention window with no live reference`, evidence);
  }
  const blockers = classification.blocked_by || [];
  // A live writer or an active reference is the resource being USED.
  if (blockers.some((b) => /live writer|active session|active run/.test(b))) {
    return result("HEALTHY", blockers.join("; "), evidence);
  }
  return result("EXPECTED", blockers.length ? blockers.join("; ") : (classification.why || "retained by policy"), evidence);
}

/**
 * Classify one git worktree registration.
 *
 * RECONCILE exists for exactly this: metadata that disagrees with reality where
 * the correction touches only metadata. It is deliberately NOT reclaimable —
 * reconciling a registration is not removing a worktree, and merging the two
 * words is how "stale registration" becomes "delete branch".
 */
export function classifyRegistrationHygiene({ path = null, pathExists = null, prunableByGit = null } = {}) {
  const evidence = { path, path_exists: pathExists, git_reports_prunable: prunableByGit };
  if (pathExists === null && prunableByGit === null) {
    return result("UNKNOWN", "neither the filesystem nor git could be read for this registration", evidence);
  }
  if (prunableByGit === true || pathExists === false) {
    return result("RECONCILE", "the registration names a path that is not present; git metadata can be reconciled without touching any ref", evidence);
  }
  return result("HEALTHY", "the registration matches a present worktree", evidence);
}

/**
 * The scoreboard (§17).
 *
 * Every number here is a count of classified resources. There is no
 * "approximately" and no derived estimate: a byte total that could not be
 * measured is reported as unmeasured rather than as zero.
 */
export function hygieneScoreboard({
  worktrees = [],
  toolkits = [],
  artifacts = [],
  registrations = [],
  toolkitPlan = null,
  lastCycle = null,
  findings = [],
  now = Date.now(),
} = {}) {
  const tally = (items) => {
    const out = Object.fromEntries(HYGIENE_STATES.map((s) => [s, 0]));
    for (const i of items) out[i.hygiene_state] = (out[i.hygiene_state] || 0) + 1;
    return out;
  };
  const bytesWhere = (items, pred) => {
    let sum = 0;
    let unmeasured = 0;
    for (const i of items) {
      if (!pred(i)) continue;
      const b = i.bytes ?? i.disk_bytes ?? i.evidence?.bytes ?? i.evidence?.disk_bytes ?? null;
      if (b == null) unmeasured += 1; else sum += Number(b);
    }
    return { bytes: sum, unmeasured };
  };

  const wt = tally(worktrees);
  const tk = tally(toolkits);
  const ar = tally(artifacts);
  const reg = tally(registrations);

  // Read the top-level field first and the evidence copy second. The observer
  // lifts these onto the row; reading only through `evidence` silently reported
  // zero unique-commit-protected worktrees on a host that had eight.
  const field = (w, k) => (w?.[k] !== undefined ? w[k] : w?.evidence?.[k]);
  const dirty = worktrees.filter((w) => (field(w, "blocked_by") || []).includes("tree_clean_or_handled")).length;
  const unique = worktrees.filter((w) => field(w, "durability") === "unique_local_commits").length;

  const wtBytes = bytesWhere(worktrees, () => true);
  const wtReclaim = bytesWhere(worktrees, (w) => w.hygiene_state === "RECLAIMABLE");
  const arBytes = bytesWhere(artifacts, () => true);
  const arReclaim = bytesWhere(artifacts, (a) => a.hygiene_state === "RECLAIMABLE");

  return {
    schema_version: HYGIENE_SCHEMA,
    observed_at: new Date(now).toISOString(),
    worktrees: {
      total: worktrees.length,
      by_state: wt,
      active_or_expected: wt.HEALTHY + wt.EXPECTED,
      reclaimable: wt.RECLAIMABLE,
      needs_attention: wt.NEEDS_ATTENTION,
      unknown: wt.UNKNOWN,
      dirty_protected: dirty,
      unique_commit_protected: unique,
      estate_bytes: wtBytes.bytes,
      estate_bytes_unmeasured: wtBytes.unmeasured,
      safely_reclaimable_bytes: wtReclaim.bytes,
    },
    registrations: {
      total: registrations.length,
      by_state: reg,
      stale: reg.RECONCILE,
    },
    toolkits: {
      total: toolkits.length,
      by_state: tk,
      retained: tk.HEALTHY + tk.EXPECTED + tk.UNKNOWN,
      reclaimable: tk.RECLAIMABLE,
      bytes_retained: toolkitPlan?.bytes_retained ?? null,
      bytes_reclaimable: toolkitPlan?.bytes_reclaimable ?? null,
      policy_version: toolkitPlan?.policy_version ?? null,
      execution_blocked: toolkitPlan?.execution_blocked ?? null,
    },
    artifacts: {
      total: artifacts.length,
      by_state: ar,
      by_retention_class: artifactClassTally(artifacts),
      estate_bytes: arBytes.bytes,
      estate_bytes_unmeasured: arBytes.unmeasured,
      safely_reclaimable_bytes: arReclaim.bytes,
    },
    last_cycle: lastCycle
      ? {
        cycle_id: lastCycle.cycle_id ?? null,
        ended_at: lastCycle.ended_at ?? null,
        reclaimed: lastCycle.reclaimed ?? [],
        bytes_reclaimed: lastCycle.bytes_reclaimed ?? 0,
        failed: lastCycle.failed ?? [],
      }
      : null,
    findings_affecting_hygiene: findings,
    // The single line a Director should be able to read instead of a directory.
    headline: `${wt.RECLAIMABLE} worktree(s), ${tk.RECLAIMABLE} toolkit version(s) and ${ar.RECLAIMABLE} artefact(s) are provably reclaimable; ${wt.NEEDS_ATTENTION + ar.NEEDS_ATTENTION} item(s) need attention; ${wt.UNKNOWN + tk.UNKNOWN + ar.UNKNOWN} preserved as unknown`,
  };
}

function artifactClassTally(artifacts) {
  const out = {};
  for (const a of artifacts) {
    const k = a.retention_class ?? a.evidence?.retention_class ?? "UNKNOWN";
    out[k] ||= { count: 0, bytes: 0, reclaimable: 0 };
    out[k].count += 1;
    const b = a.bytes ?? a.evidence?.bytes;
    if (b != null) out[k].bytes += Number(b);
    if (a.hygiene_state === "RECLAIMABLE") out[k].reclaimable += 1;
  }
  return out;
}

/**
 * What the Director is owed (§15).
 *
 * Routine success is silent. Only these reach a notification, and each names
 * the decision being asked for rather than the resource that prompted it.
 */
export function hygieneDirectorAttention(scoreboard, { cycles = [] } = {}) {
  const items = [];
  const wt = scoreboard?.worktrees;
  if (wt?.unique_commit_protected > 0) {
    items.push({
      kind: "ATTENTION",
      why: `${wt.unique_commit_protected} worktree(s) hold commits no retained history contains`,
      decision: "decide where that work belongs, or accept it as debt; hygiene will not land it and will not remove it",
    });
  }
  if (wt?.unknown > 0) {
    items.push({
      kind: "ATTENTION",
      why: `${wt.unknown} worktree(s) could not be classified`,
      decision: "ownership cannot be resolved from host evidence alone",
    });
  }
  const repeatedFailures = (cycles || []).flatMap((c) => c.failed || [])
    .reduce((m, f) => { m[f.resource_key] = (m[f.resource_key] || 0) + 1; return m; }, {});
  for (const [key, n] of Object.entries(repeatedFailures)) {
    if (n >= 3) items.push({ kind: "STUCK", why: `reclamation of ${key} failed ${n} times`, decision: "the failure is systemic, not transient" });
  }
  if (scoreboard?.toolkits?.execution_blocked === true) {
    items.push({
      kind: "ATTENTION",
      why: "toolkit retention cannot be executed: a live process could not be resolved to a version",
      decision: "no toolkit version may be pruned until the pin is resolved",
    });
  }
  return items;
}
