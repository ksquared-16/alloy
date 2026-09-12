/**
 * TOOLCHAIN CANARY, UPDATE AND ROLLBACK — an update is a candidate.
 *
 * THE LAW THIS ENCODES. A new version existing is not a reason to run it. A
 * toolchain change goes CURRENT KNOWN GOOD → CANDIDATE → CANARY → MEASURE →
 * CERTIFY → ACTIVATE, with a recorded rollback target at every step, exactly as
 * code does. The alternative — update because an update exists — silently
 * changes the behaviour of every lane at once, with nothing to compare against
 * and nowhere to return to.
 *
 * WHAT THIS DOES NOT OWN, and calls instead: the toolkit installer
 * (`host.install_toolkit`), the Gateway restart path
 * (`control-plane-recovery.restartGatewayForConvergence`, launchd), toolkit
 * convergence, maintenance orchestration (DevOps 7), the instruction baseline
 * and effort policy (DevOps 8), health, admission and recovery. It decides
 * whether a change has earned activation; it performs no installation.
 *
 * It imports no `child_process` and executes nothing — a control asserts it.
 * Versions are measured by a caller and passed in, so a canary decision is a
 * pure function of evidence and can be replayed.
 */

import { UPDATE_CLASS } from "./host-maintenance.mjs";
import { SUPPORTED_EFFORT, WORK_CLASS } from "./agent-configuration.mjs";

export const CANARY_SCHEMA = "vacilando.toolchain_canary.v1";

export { UPDATE_CLASS };

/**
 * HOW A COMPONENT GETS BACK TO WHERE IT WAS.
 *
 * This is the field the update class is DERIVED from, rather than a label
 * somebody assigns, because "how risky is this" and "can we undo it" are the
 * same question wearing different clothes.
 *
 * MEASURED on this host, and the asymmetry is stark:
 *
 *   Vacilando toolkit  44 versions retained, `current` is a symlink
 *                      → POINTER_SWAP: atomic, local, instant, offline
 *   Claude Code        one npm-global directory that an install REPLACES
 *                      → REINSTALL: needs the network and the registry to still
 *                        publish the old version. Not atomic. Not guaranteed.
 *   node@22            one Cellar version, /opt/homebrew/bin/node symlinked to it
 *                      → REINSTALL, and the Gateway plist hard-codes that path,
 *                        so the Gateway silently changes runtime at next restart
 *   macOS              → NONE
 */
export const ROLLBACK = Object.freeze({
  POINTER_SWAP: "pointer_swap",
  REINSTALL: "reinstall",
  CONFIG_REVERT: "config_revert",
  NONE: "none",
});

export const RISK = Object.freeze({
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
  SEVERE: "severe",
});

export const SCOPE = Object.freeze({
  ALL_LANES: "all_lanes",
  HOST: "host",
  ONE_ENVIRONMENT: "one_environment",
});

/**
 * THE TOOLCHAIN, as measured on 2026-09-12. Versions are not stored here — a
 * version written into source is stale the day after it is written. What is
 * stored is the part that does not move: who installs it, whether a restart is
 * required, and how to get back.
 */
export const TOOLCHAIN = Object.freeze([
  Object.freeze({
    id: "vacilando_toolkit", probe: "readlink toolkit/current",
    owner: "host.install_toolkit + toolkit-convergence",
    restart_required: true, restart_owner: "control-plane-recovery.restartGatewayForConvergence",
    rollback: ROLLBACK.POINTER_SWAP, rollback_detail: "44 versions retained; `current` relinks atomically and offline",
    risk: RISK.HIGH, scope: SCOPE.ALL_LANES, pinned: true,
  }),
  Object.freeze({
    id: "claude_code", probe: "claude --version",
    owner: "claude install <version>",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.REINSTALL, rollback_detail: "npm-global install replaces the previous build; returning needs the network and the registry still serving that version",
    risk: RISK.HIGH, scope: SCOPE.ALL_LANES, pinned: false,
  }),
  Object.freeze({
    id: "claude_model", probe: "settings / --model",
    owner: "agent-configuration effort and model policy (DevOps 8)",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.CONFIG_REVERT, rollback_detail: "a settings value; reverting is writing the previous value back",
    risk: RISK.HIGH, scope: SCOPE.ALL_LANES, pinned: false,
  }),
  Object.freeze({
    id: "effort_policy", probe: "agent-configuration EFFORT_POLICY",
    owner: "agent-configuration (DevOps 8)",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.CONFIG_REVERT, rollback_detail: "policy constant plus whatever passes --effort",
    risk: RISK.MODERATE, scope: SCOPE.ALL_LANES, pinned: true,
  }),
  Object.freeze({
    id: "subagent_routing", probe: "~/.claude/agents",
    owner: "agent-configuration subagent policy (DevOps 8)",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.CONFIG_REVERT, rollback_detail: "no routing configured today; reverting is removing what was added",
    risk: RISK.MODERATE, scope: SCOPE.ALL_LANES, pinned: true,
  }),
  Object.freeze({
    id: "node", probe: "node --version",
    owner: "homebrew node@22",
    restart_required: true, restart_owner: "launchd com.alloy.vacilando-gateway",
    // The finding that raises node's risk above "a dependency".
    rollback: ROLLBACK.REINSTALL, rollback_detail: "one Cellar version present; /opt/homebrew/bin/node is a symlink and the Gateway plist hard-codes that path, so the Gateway changes runtime at its next restart without being asked",
    risk: RISK.SEVERE, scope: SCOPE.HOST, pinned: false,
  }),
  Object.freeze({
    id: "npm", probe: "npm --version", owner: "bundled with node",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.REINSTALL, rollback_detail: "moves with node",
    risk: RISK.MODERATE, scope: SCOPE.HOST, pinned: false,
  }),
  Object.freeze({
    id: "git", probe: "git --version", owner: "Apple Command Line Tools",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.NONE, rollback_detail: "shipped with the OS toolchain; not independently revertible",
    risk: RISK.HIGH, scope: SCOPE.HOST, pinned: false,
  }),
  Object.freeze({
    id: "supabase_cli", probe: "supabase --version", owner: "homebrew",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.REINSTALL, rollback_detail: "one Cellar version retained",
    risk: RISK.MODERATE, scope: SCOPE.ONE_ENVIRONMENT, pinned: false,
  }),
  Object.freeze({
    id: "stripe_cli", probe: "stripe version", owner: "homebrew",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.REINSTALL, rollback_detail: "reinstall from homebrew",
    risk: RISK.LOW, scope: SCOPE.ONE_ENVIRONMENT, pinned: false,
  }),
  Object.freeze({
    id: "tailscale", probe: "tailscale version", owner: "Tailscale.app",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.REINSTALL, rollback_detail: "reinstall the app build",
    risk: RISK.MODERATE, scope: SCOPE.HOST, pinned: false,
  }),
  Object.freeze({
    id: "macos", probe: "sw_vers -productVersion", owner: "Apple Software Update",
    restart_required: true, restart_owner: "macOS installer",
    rollback: ROLLBACK.NONE, rollback_detail: "a major upgrade cannot be reversed without a restore",
    risk: RISK.SEVERE, scope: SCOPE.HOST, pinned: false,
  }),
  Object.freeze({
    id: "instruction_baseline", probe: "agent-configuration instructionBaselineVersion",
    owner: "git — CLAUDE.md (DevOps 8)",
    restart_required: false, restart_owner: null,
    rollback: ROLLBACK.POINTER_SWAP, rollback_detail: "a commit; reverting is a commit",
    risk: RISK.MODERATE, scope: SCOPE.ALL_LANES, pinned: true,
  }),
]);

export function componentById(id) {
  return TOOLCHAIN.find((c) => c.id === id) || null;
}

/* ── B: classification, derived rather than assigned ─────────────────────── */

/**
 * WHICH UPDATE CLASS DOES THIS COMPONENT'S CHANGE FALL INTO?
 *
 * Derived from rollback capability and blast radius, so the class cannot drift
 * away from the facts that justify it. The rule that matters:
 *
 *   no safe rollback  →  MANUAL_DEFERRED, always
 *
 * Section L asks for exactly this — a tool that cannot be safely rolled back is
 * classified MANUAL_DEFERRED rather than canaried and hoped for. `git` and
 * `macos` land there by construction, not by opinion.
 *
 * An unknown component is MANUAL_DEFERRED: the fail-closed direction for an
 * update is not to apply it.
 */
export function classifyComponentUpdate(componentId, { major = false } = {}) {
  const c = componentById(componentId);
  if (!c) {
    return { component: componentId, class: UPDATE_CLASS.MANUAL_DEFERRED, why: "unknown component; unrecognised updates are never automatic" };
  }
  if (c.rollback === ROLLBACK.NONE) {
    return { component: c.id, class: UPDATE_CLASS.MANUAL_DEFERRED, why: `${c.id} has no rollback mechanism, so an activation cannot be undone`, rollback: c.rollback };
  }
  if (major) {
    return { component: c.id, class: UPDATE_CLASS.MANUAL_DEFERRED, why: `a major version change to ${c.id} is not a maintenance decision`, rollback: c.rollback };
  }
  if (c.risk === RISK.SEVERE) {
    return { component: c.id, class: UPDATE_CLASS.MANUAL_DEFERRED, why: `${c.id} is severe-risk: ${c.rollback_detail}`, rollback: c.rollback };
  }
  if (c.scope === SCOPE.ALL_LANES || c.risk === RISK.HIGH || c.restart_required) {
    return { component: c.id, class: UPDATE_CLASS.CANARY_REQUIRED, why: `${c.id} changes behaviour for ${c.scope === SCOPE.ALL_LANES ? "every lane" : "the host"}`, rollback: c.rollback };
  }
  /*
   * AUTO_SAFE HAS TO BE REACHABLE OR IT IS DECORATION.
   *
   * A first cut required a POINTER_SWAP or CONFIG_REVERT rollback here, which
   * made every remaining component CANARY_REQUIRED and left AUTO_SAFE a class
   * nothing could ever be — a policy with one outcome is not a policy.
   *
   * REINSTALL rollback is weaker than a pointer swap: it needs the network and a
   * registry still serving the old build. That weakness matters in proportion to
   * blast radius, and for a low-risk tool confined to ONE environment that never
   * requires a restart, the worst case is one certification environment behaving
   * oddly until somebody reinstalls. That is the case AUTO_SAFE exists for.
   * Anything touching every lane, the Gateway, or a restart has already been
   * caught above.
   */
  if (c.risk === RISK.LOW && c.scope === SCOPE.ONE_ENVIRONMENT && !c.restart_required) {
    return { component: c.id, class: UPDATE_CLASS.AUTO_SAFE, why: `${c.id} is low-risk, confined to one environment, needs no restart, and reverts by ${c.rollback}`, rollback: c.rollback };
  }
  if (c.rollback === ROLLBACK.POINTER_SWAP || c.rollback === ROLLBACK.CONFIG_REVERT) {
    return { component: c.id, class: UPDATE_CLASS.AUTO_SAFE, why: `${c.id} is low-risk and reverts atomically by ${c.rollback}`, rollback: c.rollback };
  }
  return { component: c.id, class: UPDATE_CLASS.CANARY_REQUIRED, why: `${c.id} reverts only by reinstallation, which needs the network and the old build still being published`, rollback: c.rollback };
}

/* ── C/D: the canary unit and its evaluation pack ───────────────────────── */

/**
 * A CANARY IS A NORMAL LANE, NOT A NEW KIND OF AGENT.
 *
 * Same bootstrap contract, same instruction baseline, same repository and
 * toolkit expectations, no extra authority. The only difference is an isolated
 * candidate configuration and a fixed workload. A special canary agent would
 * measure how a special agent behaves, which is not the question.
 */
export function canaryLaneContract({ laneId, component, candidate, baseline, instructionBaseline = null } = {}) {
  return {
    schema: CANARY_SCHEMA,
    lane_id: laneId,
    component,
    baseline_identity: baseline,
    candidate_identity: candidate,
    // Held constant unless the instruction itself is what is under test.
    instruction_baseline: instructionBaseline,
    same_bootstrap_contract: true,
    authority_expansion: false,
    mutates_production: false,
  };
}

/**
 * THE EVALUATION PACK — eight categories, each naming work Vacilando actually
 * does, and each pointing at evidence that already exists.
 *
 * DELIBERATELY SMALL. The question is not "how good is this model" but "did this
 * change make Vacilando materially better or worse at its own work", and that is
 * answerable with a handful of representative tasks. A benchmark empire would
 * cost more to maintain than the updates it judges.
 */
export const EVAL_PACK = Object.freeze([
  Object.freeze({ id: "EV-INVENTORY", category: "repository/code inventory", proves: "can it find what exists without inventing it", existing_evidence: "lane-bootstrap-contract, worktree-lifecycle inventories" }),
  Object.freeze({ id: "EV-IMPLEMENT", category: "bounded implementation task", proves: "can it make a scoped change that passes its own controls", existing_evidence: "any DevOps mission's own suite" }),
  Object.freeze({ id: "EV-DIAGNOSE", category: "test failure diagnosis", proves: "can it separate a regression from pre-existing debt", existing_evidence: "MEASURED_BASELINE in critical-invariants" }),
  Object.freeze({ id: "EV-GOVERNANCE", category: "governance/authority reasoning", proves: "does it respect authority boundaries under pressure", existing_evidence: "development-exact-authorization" }),
  Object.freeze({ id: "EV-CERTIFY", category: "certification/evidence synthesis", proves: "can it produce bounded evidence bound to an exact SHA", existing_evidence: "lane-knowledge certificationRecord" }),
  Object.freeze({ id: "EV-OWNERSHIP", category: "lane/worktree ownership reasoning", proves: "does it keep lane, slot, worktree and execution distinct", existing_evidence: "INV-RUNTIME-001, INV-RUNTIME-002" }),
  Object.freeze({ id: "EV-RECOVERY", category: "recovery/resume reasoning", proves: "can it resume from durable context without a transcript", existing_evidence: "host-maintenance planSessionRestore" }),
  Object.freeze({ id: "EV-REFUSAL", category: "instruction adherence / refusal boundary", proves: "does it refuse what it should and only what it should", existing_evidence: "lane-dispatch bounded-instruction controls" }),
]);

/* ── E: measurement, honest about what is unavailable ───────────────────── */

/**
 * METRICS THIS SYSTEM CAN ACTUALLY OBTAIN.
 *
 * DevOps 8 established that the installed Claude Code exposes no session token
 * or cost accounting, so `tokens` and `cost` are declared OPTIONAL and are
 * absent. They are listed rather than omitted so a future provider version can
 * fill them without this schema changing shape — and so nobody concludes the
 * omission was an oversight and invents a number.
 */
export const CANARY_METRICS = Object.freeze([
  Object.freeze({ id: "completed", required: true, better: "higher" }),
  Object.freeze({ id: "corrections", required: true, better: "lower" }),
  Object.freeze({ id: "duration_ms", required: true, better: "lower" }),
  Object.freeze({ id: "tool_calls", required: false, better: "lower" }),
  Object.freeze({ id: "subagents", required: false, better: "neutral", note: "more subagents is not success" }),
  Object.freeze({ id: "tests_passed", required: true, better: "higher" }),
  Object.freeze({ id: "invariant_violations", required: true, better: "lower" }),
  Object.freeze({ id: "instruction_violations", required: true, better: "lower" }),
  Object.freeze({ id: "refusal_correct", required: true, better: "higher" }),
  Object.freeze({ id: "human_interventions", required: true, better: "lower" }),
  Object.freeze({ id: "evidence_complete", required: true, better: "higher" }),
  Object.freeze({ id: "tokens", required: false, better: "lower", available: false, why: "this Claude Code build exposes no token accounting to a session" }),
  Object.freeze({ id: "cost", required: false, better: "lower", available: false, why: "this Claude Code build exposes no cost accounting to a session" }),
]);

/**
 * Compare a candidate run against the known-good baseline.
 *
 * REGRESSIONS ARE NOT AVERAGED AWAY. A single instruction violation or invariant
 * violation is a regression regardless of how much faster the candidate was —
 * speed cannot buy correctness, and a scalar score would let it. Duration is
 * reported and never decides.
 *
 * A missing REQUIRED metric makes the comparison UNMEASURED, which blocks, on
 * the same law DevOps 5 set: a comparison that could not be made is not a
 * comparison that passed.
 */
export function compareCanary({ baseline = {}, candidate = {}, metrics = CANARY_METRICS } = {}) {
  const rows = [];
  const missing = [];
  for (const m of metrics) {
    if (m.available === false) continue;
    const b = baseline[m.id];
    const c = candidate[m.id];
    if (b === undefined || b === null || c === undefined || c === null) {
      if (m.required) missing.push(m.id);
      continue;
    }
    const delta = c - b;
    const direction = m.better === "neutral" ? "neutral"
      : m.better === "higher" ? (delta > 0 ? "better" : delta < 0 ? "worse" : "same")
        : (delta < 0 ? "better" : delta > 0 ? "worse" : "same");
    rows.push({ metric: m.id, baseline: b, candidate: c, delta, direction, required: Boolean(m.required) });
  }

  if (missing.length) {
    return { verdict: "UNMEASURED", promote: false, rows, missing, reason: `required metric(s) not measured: ${missing.join(", ")}` };
  }

  const CORRECTNESS = ["invariant_violations", "instruction_violations", "refusal_correct", "tests_passed", "evidence_complete"];
  const regressions = rows.filter((r) => r.direction === "worse" && CORRECTNESS.includes(r.metric));
  if (regressions.length) {
    return {
      verdict: "WORSE", promote: false, rows, missing: [],
      regressions: regressions.map((r) => r.metric),
      reason: `correctness regressed on ${regressions.map((r) => r.metric).join(", ")}; a faster candidate that is less correct is not an improvement`,
    };
  }
  const anyWorse = rows.filter((r) => r.direction === "worse");
  const anyBetter = rows.filter((r) => r.direction === "better");
  const verdict = anyBetter.length && !anyWorse.length ? "BETTER"
    : anyWorse.length ? "MIXED" : "SAME";
  return {
    verdict, promote: verdict !== "WORSE", rows, missing: [],
    regressions: [],
    reason: verdict === "BETTER" ? "no correctness regression and measurable improvement"
      : verdict === "SAME" ? "indistinguishable from the known good"
        : "no correctness regression; some non-correctness metrics moved the wrong way",
  };
}

/* ── H: the known-good snapshot ─────────────────────────────────────────── */

/** Keys that must never appear in a snapshot. */
const SECRET_KEYS = Object.freeze(["token", "secret", "password", "key", "credential", "cookie", "authorization"]);

/**
 * WHAT EXACT ENVIRONMENT ARE WE RETURNING TO?
 *
 * Identities only. A snapshot carrying a secret would put a credential in an
 * evidence record that outlives the reason for it, so `snapshotIsClean` scans
 * for secret-shaped keys and a control asserts a snapshot containing one is
 * rejected rather than sanitised — quietly dropping a field would let a caller
 * believe it had recorded something it had not.
 */
export function knownGoodSnapshot({
  toolkit = null, claudeCode = null, model = null, effort = null, subagents = null,
  node = null, tools = {}, instructionBaseline = null, runtimeGeneration = null,
  secretRefs = [], takenAt = null,
} = {}) {
  return {
    schema: CANARY_SCHEMA,
    kind: "known_good",
    taken_at: takenAt || new Date().toISOString(),
    toolkit, claude_code: claudeCode, model, effort, subagents, node,
    tools: { ...tools },
    instruction_baseline: instructionBaseline,
    runtime_generation: runtimeGeneration,
    // References, never values.
    secret_refs: secretRefs.map((r) => String(r)),
  };
}

export function snapshotIsClean(snapshot = {}) {
  const offenders = [];
  const walk = (obj, path = "") => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      const here = path ? `${path}.${k}` : k;
      if (here === "secret_refs") continue;
      if (SECRET_KEYS.some((s) => k.toLowerCase().includes(s))) offenders.push(here);
      if (v && typeof v === "object") walk(v, here);
    }
  };
  walk(snapshot);
  return { clean: offenders.length === 0, offenders };
}

/** Is this snapshot sufficient to return to, for this component? */
export function snapshotSufficientFor(snapshot, componentId) {
  const need = {
    vacilando_toolkit: ["toolkit"], claude_code: ["claude_code"], claude_model: ["model"],
    effort_policy: ["effort"], subagent_routing: ["subagents"], node: ["node"],
    instruction_baseline: ["instruction_baseline"],
  }[componentId] || [];
  const missing = need.filter((k) => snapshot?.[k] === null || snapshot?.[k] === undefined);
  return { sufficient: missing.length === 0 && need.length > 0, missing, required: need };
}

/* ── I/J: activation and its certification ──────────────────────────────── */

/**
 * The half-applied states an update can be caught in.
 *
 * Named because a reboot, a crash or an interrupted install can land in any of
 * them, and the recovery for each is different. The dangerous one is
 * ACTIVATED_NOT_RESTARTED: the pointer moved, the process still runs the old
 * build, and every version probe disagrees with every behaviour — which is the
 * `gateway_restart_required` shape this host has already produced.
 */
export const ACTIVATION_STATE = Object.freeze({
  NONE: "NONE",
  CANDIDATE_STAGED: "CANDIDATE_STAGED",
  ACTIVATED_NOT_RESTARTED: "ACTIVATED_NOT_RESTARTED",
  ACTIVE_UNCERTIFIED: "ACTIVE_UNCERTIFIED",
  ACTIVE_CERTIFIED: "ACTIVE_CERTIFIED",
  ROLLBACK_IN_PROGRESS: "ROLLBACK_IN_PROGRESS",
  ROLLED_BACK: "ROLLED_BACK",
  CONSTRAINED: "CONSTRAINED",
});

export function recoverInterruptedActivation(state, { snapshot = null } = {}) {
  if (state === ACTIVATION_STATE.CANDIDATE_STAGED) {
    return { action: "discard_candidate", safe: true, reason: "nothing was activated; the staged candidate is inert" };
  }
  if (state === ACTIVATION_STATE.ACTIVATED_NOT_RESTARTED) {
    return {
      action: "restart_through_canonical_owner", safe: true,
      reason: "the pointer moved but the process still runs the old build; version probes and behaviour disagree until it restarts",
    };
  }
  if (state === ACTIVATION_STATE.ACTIVE_UNCERTIFIED) {
    return snapshot
      ? { action: "certify_or_rollback", safe: true, reason: "the candidate is live and unproven; certify it or return to the recorded known good" }
      : { action: "constrain", safe: false, reason: "the candidate is live, unproven, and there is no known-good snapshot to return to" };
  }
  if (state === ACTIVATION_STATE.ROLLBACK_IN_PROGRESS) {
    return snapshot
      ? { action: "resume_rollback", safe: true, reason: "an interrupted rollback resumes toward the same recorded target" }
      : { action: "constrain", safe: false, reason: "a rollback was interrupted and its target is not recorded" };
  }
  if (state === ACTIVATION_STATE.ACTIVE_CERTIFIED || state === ACTIVATION_STATE.ROLLED_BACK || state === ACTIVATION_STATE.NONE) {
    return { action: "none", safe: true, reason: "no activation in flight" };
  }
  // An unrecognised state is not a safe state. Constrain rather than assume.
  return { action: "constrain", safe: false, reason: `unrecognised activation state ${String(state)}` };
}

/**
 * Post-activation certification.
 *
 * FAIL and UNMEASURED are both "not healthy" — the DevOps 5 law, restated at the
 * one boundary where it matters most, because an update that could not be proven
 * is an update nobody can say is safe, and the host is already running it.
 */
export function certifyActivation({ proofs = {} } = {}) {
  const REQUIRED = [
    "tool_versions_expected", "instruction_baseline_expected", "model_effort_expected",
    "gateway_toolkit_identity", "host_health", "lane_bootstrap_consistent",
    "critical_invariants", "configuration_audit", "canary_smoke", "no_stale_ownership",
  ];
  const rows = REQUIRED.map((id) => {
    const v = proofs[id];
    return { id, outcome: v === true ? "PASS" : v === false ? "FAIL" : "UNMEASURED" };
  });
  const failed = rows.filter((r) => r.outcome === "FAIL").map((r) => r.id);
  const unmeasured = rows.filter((r) => r.outcome === "UNMEASURED").map((r) => r.id);
  const healthy = failed.length === 0 && unmeasured.length === 0;
  return {
    healthy, rows, failed, unmeasured,
    requires_rollback: !healthy,
    reason: failed.length ? `activation failed: ${failed.join(", ")}`
      : unmeasured.length ? `activation unproven: ${unmeasured.join(", ")}`
        : "activation certified",
  };
}

/* ── K: automatic rollback ──────────────────────────────────────────────── */

/** How many rollback attempts before the host stops trying and asks for help. */
export const MAX_ROLLBACK_ATTEMPTS = 2;

/**
 * SHOULD WE ROLL BACK, AND CAN WE?
 *
 * THE ANTI-OSCILLATION RULE IS THE IMPORTANT ONE. A system that returns to
 * known-good, fails to certify it, re-applies the candidate and fails again will
 * do that forever, restarting the Gateway each time — turning a bad update into
 * an outage. So a rollback is attempted a bounded number of times and then the
 * host stays CONSTRAINED with the operator told exactly what it could not
 * restore. Ending in a known-bad state that is *stable and described* beats
 * ending in a loop.
 *
 * A component with no rollback mechanism cannot be rolled back at all — which is
 * precisely why `classifyComponentUpdate` refuses to let one be activated
 * automatically in the first place.
 */
export function rollbackDecision({
  certification = null, component = null, snapshot = null, attempts = 0,
  maxAttempts = MAX_ROLLBACK_ATTEMPTS,
} = {}) {
  if (certification?.healthy) {
    return { rollback: false, state: ACTIVATION_STATE.ACTIVE_CERTIFIED, reason: "activation certified; nothing to undo" };
  }
  if (attempts >= maxAttempts) {
    return {
      rollback: false, state: ACTIVATION_STATE.CONSTRAINED, operator_attention: true,
      reason: `rollback attempted ${attempts} time(s) without reaching a certified state; the host stays constrained rather than oscillating between candidate and known good`,
    };
  }
  const c = component ? componentById(component) : null;
  if (c && c.rollback === ROLLBACK.NONE) {
    return {
      rollback: false, state: ACTIVATION_STATE.CONSTRAINED, operator_attention: true,
      reason: `${c.id} has no rollback mechanism; this is why its updates are MANUAL_DEFERRED and must never reach automatic activation`,
    };
  }
  if (!snapshot) {
    return {
      rollback: false, state: ACTIVATION_STATE.CONSTRAINED, operator_attention: true,
      reason: "no known-good snapshot was recorded, so there is no exact environment to return to",
    };
  }
  const sufficiency = component ? snapshotSufficientFor(snapshot, component) : { sufficient: true, missing: [] };
  if (!sufficiency.sufficient) {
    return {
      rollback: false, state: ACTIVATION_STATE.CONSTRAINED, operator_attention: true,
      reason: `the known-good snapshot does not record ${sufficiency.missing.join(", ")}, so the rollback target is incomplete`,
    };
  }
  return {
    rollback: true, state: ACTIVATION_STATE.ROLLBACK_IN_PROGRESS, attempt: attempts + 1,
    target: snapshot, mechanism: c?.rollback || ROLLBACK.CONFIG_REVERT,
    owner: c?.owner || null,
    restart_owner: c?.restart_required ? c.restart_owner : null,
    reason: certification?.reason || "post-activation certification did not pass",
  };
}

/**
 * The rollback outcome, which must itself be certified.
 *
 * A rollback that is not proven is just another uncertified change — the same
 * mistake in the other direction.
 */
export function completeRollback({ certification = null, attempts = 1 } = {}) {
  if (certification?.healthy) {
    return { state: ACTIVATION_STATE.ROLLED_BACK, admission: "restored", attempts, reason: "the known-good environment is restored and certified" };
  }
  return {
    state: ACTIVATION_STATE.CONSTRAINED, admission: "constrained", operator_attention: true, attempts,
    reason: `the rollback target itself did not certify: ${certification?.reason || "unproven"}`,
  };
}

/* ── M: the DevOps 7 maintenance integration ────────────────────────────── */

/**
 * WHAT WEEKLY MAINTENANCE MAY DO WITH AN UPDATE.
 *
 * The division is strict and it is the point: DevOps 9 decides whether a change
 * is good; DevOps 7 carries out a decision already made. Maintenance never judges
 * tool quality — it has no evidence to judge with, and a reboot window is the
 * worst possible moment to start forming an opinion.
 *
 * So CANARY_REQUIRED activates only when a certified canary for THIS EXACT
 * candidate identity already exists. A canary for a different version is not
 * evidence about this one.
 */
export function maintenanceUpdateDecision({ component = null, candidateIdentity = null, certifiedCanaries = [], major = false } = {}) {
  const cls = classifyComponentUpdate(component, { major });
  if (cls.class === UPDATE_CLASS.MANUAL_DEFERRED) {
    return { apply: false, class: cls.class, report_only: true, reason: cls.why };
  }
  if (cls.class === UPDATE_CLASS.AUTO_SAFE) {
    return { apply: true, class: cls.class, reason: `${component} is auto-safe and reversible by ${cls.rollback}` };
  }
  const certified = certifiedCanaries.find((c) => c.component === component
    && c.candidate_identity === candidateIdentity && c.certified === true);
  if (!certified) {
    return {
      apply: false, class: cls.class, report_only: true,
      reason: candidateIdentity
        ? `no certified canary exists for ${component} ${candidateIdentity}; a canary of another version proves nothing about this one`
        : `${component} requires a canary and no candidate identity was given`,
    };
  }
  return { apply: true, class: cls.class, canary: certified.canary_id || null, reason: `a certified canary exists for this exact candidate` };
}

/* ── F/G: effort and subagent canaries ──────────────────────────────────── */

/**
 * An effort-policy canary compares the SAME work at different effort, across the
 * four classes the policy distinguishes. If a policy's classes cannot be told
 * apart by measurement, the policy is decoration.
 */
export function effortCanaryPlan({ classes = [WORK_CLASS.MECHANICAL, WORK_CLASS.ROUTINE, WORK_CLASS.ARCHITECTURE, WORK_CLASS.CERTIFICATION], levels = SUPPORTED_EFFORT } = {}) {
  const unsupported = levels.filter((l) => !SUPPORTED_EFFORT.includes(l));
  return {
    component: "effort_policy",
    arms: classes.map((k) => ({ work_class: k, eval_ids: EVAL_PACK.map((e) => e.id) })),
    levels: levels.filter((l) => SUPPORTED_EFFORT.includes(l)),
    unsupported,
    valid: unsupported.length === 0,
    reason: unsupported.length ? `unsupported effort level(s): ${unsupported.join(", ")}` : null,
  };
}

/**
 * A subagent-routing canary. `subagents` is explicitly a NEUTRAL metric, and a
 * control asserts a candidate that only spawned more subagents does not read as
 * better — otherwise the canary would reward fan-out, which is the behaviour the
 * bounded policy exists to prevent.
 */
export function subagentCanaryPlan({ candidateRouting = null } = {}) {
  return {
    component: "subagent_routing",
    candidate: candidateRouting,
    measures: ["subagents", "duration_ms", "corrections", "tests_passed", "evidence_complete"],
    success_is_not: "more subagents",
    adopt_only_if: "correctness holds and duration or corrections improve",
  };
}

/* ── DevOps 10 / operator surface ───────────────────────────────────────── */

/** A bounded record of one canary, for the knowledge store rather than a log. */
export function canaryRecord({ component, baseline, candidate, comparison, certified = false, canaryId = null, at = null } = {}) {
  return {
    schema: CANARY_SCHEMA,
    canary_id: canaryId,
    component,
    baseline_identity: baseline,
    candidate_identity: candidate,
    verdict: comparison?.verdict ?? "UNMEASURED",
    certified: certified === true && comparison?.verdict !== "UNMEASURED" && comparison?.verdict !== "WORSE",
    regressions: comparison?.regressions ?? [],
    // One line per metric, never raw output.
    metrics: (comparison?.rows || []).map((r) => `${r.metric} ${r.baseline}→${r.candidate} (${r.direction})`),
    at: at || new Date().toISOString(),
  };
}
