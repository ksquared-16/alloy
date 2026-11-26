/**
 * WHAT EVERY PROMOTION GATE MUST BE ABLE TO SAY ABOUT ITSELF.
 *
 * THIS IS NOT A GATE ENGINE. It evaluates nothing, decides nothing and owns no
 * rule. The gates keep their owners and their logic exactly where they are; this
 * records the four questions each of them must have a declared answer to, and
 * lets a control fail when a new gate arrives without one.
 *
 * WHY IT EXISTS. `hosted_migration_parity` denied a clean, fully certified
 * promotion for a reason that could never be satisfied — the candidate's own
 * unmerged migration had to be on the deployed primary before the candidate
 * could merge — and nothing about the gate made that visible. It looked strict.
 * Strict and impossible read identically from outside, right up until you notice
 * that the "fix" for the denial was to deploy unpromoted schema to production.
 *
 * The defect was not arithmetic. It was a LIFECYCLE BOUNDARY that nobody had
 * written down: which phase of the promotion does this gate judge? Once that is
 * a declared field, "compares the candidate tree against an obligation that only
 * promoted state can carry" is a contradiction a test can find, rather than
 * something that has to be traced through four modules by hand after a week of
 * a lane being stuck.
 */

import { LIFECYCLE } from "./migration-parity.mjs";

export const GATE_CONTRACT_VERSION = "vacilando.promotion_gate_contract.v1";

export { LIFECYCLE };

/** How a gate's evidence can go wrong while a candidate waits. */
export const FRESHNESS_CLASS = Object.freeze({
  /** Re-derived from source at every evaluation; cannot be stale. */
  IMMEDIATE: "immediate",
  /** Read from a recorded measurement that has an age and can be superseded. */
  RECORDED: "recorded",
  /** Supplied by the caller; the gate cannot judge its age. */
  INHERITED: "inherited",
});

/**
 * An obligation's phase: when does the thing this gate demands become true?
 *
 * `requires` is what must hold BEFORE the gate passes. `becomes_due` is the
 * phase at which the demanded state can first legitimately exist. A gate whose
 * `becomes_due` is later than its `requires` is asking for the future — the
 * circular precondition class, detectable without knowing what the gate does.
 */
export function obligation({ requires, becomesDue }) {
  return { requires, becomes_due: becomesDue };
}

const ORDER = [
  LIFECYCLE.PROMOTED_STAGING,
  LIFECYCLE.CANDIDATE,
  LIFECYCLE.POST_MERGE,
];

/**
 * THE CIRCULARITY TEST.
 *
 * An obligation is impossible when the state it demands cannot exist until a
 * phase strictly after the one that must satisfy it. `deployed_primary` is not
 * on the phase line — it is a database, not a step — so it is judged by what it
 * is being asked to carry, which is the `requires` side.
 */
export function isCircular(ob) {
  if (!ob) return false;
  const need = ORDER.indexOf(ob.requires);
  const due = ORDER.indexOf(ob.becomes_due);
  if (need < 0 || due < 0) return false;
  return due > need;
}

/**
 * The canonical deterministic gates on the staging promotion path, each with the
 * four answers the audit demands. Declared here; implemented by their owners.
 */
export const PROMOTION_GATES = Object.freeze([
  Object.freeze({
    id: "hosted_migration_parity",
    question: "Is every migration already promoted on staging present on the deployed primary?",
    lifecycle_boundary: LIFECYCLE.PROMOTED_STAGING,
    canonical_owner: "migration-parity.mjs promotionParityGate",
    evidence_source: "database.read_census / hosted-migration-identity-census.sql",
    freshness: FRESHNESS_CLASS.RECORDED,
    freshness_rule: "24h ceiling AND not superseded by a completed hosted-mutating governed action",
    explains: Object.freeze([
      "expected_revision", "expected_revision_kind", "expected_migration_head",
      "expected_migration_count", "hosted_migration_head", "hosted_migration_count",
      "missing_on_hosted", "unexpected_on_hosted", "candidate_only_migrations",
      "evidence_id", "evidence_timestamp", "evidence_age_ms",
    ]),
    obligation: obligation({ requires: LIFECYCLE.PROMOTED_STAGING, becomesDue: LIFECYCLE.PROMOTED_STAGING }),
    unmeasured_blocks: true,
    revalidated_at_merge: true,
    /*
     * Until 2026-09-12 this read `expected` from the CANDIDATE head. The
     * obligation was therefore { requires: promoted_staging, becomes_due:
     * post_merge } — circular, and isCircular() returns true for it. The entry is
     * kept because a contract that cannot express the defect it was built from
     * cannot prove it is gone.
     */
    historical_defect: Object.freeze({
      was: obligation({ requires: LIFECYCLE.PROMOTED_STAGING, becomesDue: LIFECYCLE.POST_MERGE }),
      symptom: "hosted_migration_behind on every migration-bearing candidate",
      measured: "PR #848, staging=hosted=20260912010000, candidate-only 20260912020000",
    }),
  }),
  Object.freeze({
    id: "expected_head_sha",
    question: "Is the PR head still the exact revision that was approved?",
    lifecycle_boundary: LIFECYCLE.CANDIDATE,
    canonical_owner: "trusted-host-merge.mjs evaluateMergeReadiness",
    evidence_source: "gh pr view headRefOid, read at merge time",
    freshness: FRESHNESS_CLASS.IMMEDIATE,
    freshness_rule: "re-read from GitHub within the merge call; no cached value is accepted",
    explains: Object.freeze(["expected_head_sha", "actual_head_sha"]),
    obligation: obligation({ requires: LIFECYCLE.CANDIDATE, becomesDue: LIFECYCLE.CANDIDATE }),
    unmeasured_blocks: true,
    revalidated_at_merge: true,
  }),
  Object.freeze({
    id: "required_checks",
    question: "Has every required status check concluded successfully on this head?",
    lifecycle_boundary: LIFECYCLE.CANDIDATE,
    canonical_owner: "trusted-host-merge.mjs summarizeCheckRollup",
    evidence_source: "gh statusCheckRollup for the PR head",
    freshness: FRESHNESS_CLASS.IMMEDIATE,
    freshness_rule: "rollup is fetched for the head under evaluation; pending is not passing",
    explains: Object.freeze(["required_names", "failing", "pending", "missing"]),
    obligation: obligation({ requires: LIFECYCLE.CANDIDATE, becomesDue: LIFECYCLE.CANDIDATE }),
    unmeasured_blocks: true,
    revalidated_at_merge: true,
  }),
  Object.freeze({
    id: "mergeable_state",
    question: "Does GitHub consider this PR mergeable into the target branch right now?",
    lifecycle_boundary: LIFECYCLE.POST_MERGE,
    canonical_owner: "trusted-host-merge.mjs evaluateMergeReadiness",
    evidence_source: "gh pr view mergeable / mergeStateStatus",
    freshness: FRESHNESS_CLASS.IMMEDIATE,
    freshness_rule: "read at evaluation; GitHub recomputes it when either side moves",
    explains: Object.freeze(["mergeable", "mergeStateStatus"]),
    // Judges the RESULT of merging, which is why its boundary is post_merge —
    // and it is satisfiable now, because GitHub computes the result without
    // performing it. A demand about a merge is not the same as a demand that the
    // merge already happened.
    obligation: obligation({ requires: LIFECYCLE.POST_MERGE, becomesDue: LIFECYCLE.POST_MERGE }),
    unmeasured_blocks: true,
    revalidated_at_merge: true,
  }),
  Object.freeze({
    id: "target_branch_allowlist",
    question: "Is the merge target a branch this authority may write?",
    lifecycle_boundary: LIFECYCLE.CANDIDATE,
    canonical_owner: "trusted-host-merge.mjs validateMergeInputs",
    evidence_source: "ALLOWED_TARGET_BRANCHES / BLOCKED_TARGET_BRANCHES",
    freshness: FRESHNESS_CLASS.IMMEDIATE,
    freshness_rule: "a constant; nothing can make it stale",
    explains: Object.freeze(["target_branch", "allowed"]),
    obligation: obligation({ requires: LIFECYCLE.CANDIDATE, becomesDue: LIFECYCLE.CANDIDATE }),
    unmeasured_blocks: true,
    revalidated_at_merge: true,
  }),
  Object.freeze({
    id: "live_merge_permitted",
    question: "Is this host allowed to perform remote mutations at all?",
    lifecycle_boundary: LIFECYCLE.CANDIDATE,
    canonical_owner: "trusted-host-remote-guard.mjs liveMergePermitted",
    evidence_source: "gateway runtime root identity",
    freshness: FRESHNESS_CLASS.IMMEDIATE,
    freshness_rule: "resolved per call from the runtime root",
    explains: Object.freeze(["canonical_root", "actual_root"]),
    obligation: obligation({ requires: LIFECYCLE.CANDIDATE, becomesDue: LIFECYCLE.CANDIDATE }),
    unmeasured_blocks: true,
    revalidated_at_merge: true,
  }),
]);

export function gateById(id) {
  return PROMOTION_GATES.find((g) => g.id === id) || null;
}

/**
 * Audit the declared contracts. Returns findings; decides nothing.
 *
 * Five defect classes, each expressed against the DECLARATION rather than
 * against any named gate — so a gate added next year is audited by the same
 * code, which is the only way this does not rot into a test about one bug.
 */
export function auditPromotionGates(gates = PROMOTION_GATES) {
  const findings = [];
  for (const g of gates) {
    if (!g.lifecycle_boundary) {
      findings.push({ gate: g.id, defect: "undeclared_lifecycle_boundary",
        detail: "the gate does not say which phase of the promotion it judges" });
    }
    if (!g.canonical_owner) {
      findings.push({ gate: g.id, defect: "undeclared_owner",
        detail: "no canonical owner is named, so the fact may be reconstructed rather than obtained" });
    }
    if (!g.freshness || !Object.values(FRESHNESS_CLASS).includes(g.freshness)) {
      findings.push({ gate: g.id, defect: "undeclared_freshness",
        detail: "evidence may go stale while a candidate waits and nothing says so" });
    }
    if (g.freshness === FRESHNESS_CLASS.RECORDED && !g.freshness_rule) {
      findings.push({ gate: g.id, defect: "recorded_evidence_without_freshness_rule",
        detail: "recorded evidence with no stated rule is stale evidence served as current" });
    }
    if (!Array.isArray(g.explains) || g.explains.length < 2) {
      findings.push({ gate: g.id, defect: "not_explainable",
        detail: "a failed gate must report expected, actual and their difference, not only true/false" });
    }
    if (isCircular(g.obligation)) {
      findings.push({ gate: g.id, defect: "circular_precondition",
        detail: `requires ${g.obligation.requires} state but the demand only becomes satisfiable at ${g.obligation.becomes_due}` });
    }
    if (g.unmeasured_blocks !== true) {
      findings.push({ gate: g.id, defect: "unmeasured_may_pass",
        detail: "a gate that treats 'could not measure' as 'fine' is fail-open" });
    }
  }
  return { version: GATE_CONTRACT_VERSION, gates: gates.length, findings, clean: findings.length === 0 };
}
