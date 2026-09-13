/**
 * AGENT CONFIGURATION HYGIENE — a read-only audit of the instructions and
 * settings a development agent actually receives.
 *
 * THIS IS NOT A PROMPT SYSTEM. It generates no CLAUDE.md, stores no prompts,
 * owns no lane instruction and writes nothing. The instruction baseline already
 * has a canonical owner — the repository, through git — and the mission overlay
 * already has one: the Gateway's dispatched run instruction. This inspects both
 * and reports where they disagree with the code that owns the same fact.
 *
 * WHY THAT DISTINCTION IS THE WHOLE MISSION. Measured on this host: the root
 * CLAUDE.md is byte-identical across all 39 lane worktrees (one SHA-256), so
 * there is no per-lane prompt drift to fix. What there is instead is DRIFT
 * AGAINST REALITY — prose that states values the system computes differently —
 * and shortening prompts would not have found a single instance of it.
 *
 * VERIFIED CAPABILITIES, NOT ASSUMED ONES. Everything this module says Claude
 * Code supports was read from `claude --help` on the installed build (2.1.269)
 * before being written down. There is no `prompt-audit` command and no cost
 * command on this build, so none is wrapped and none is pretended.
 */

export const AGENT_CONFIG_SCHEMA = "vacilando.agent_configuration.v1";

/**
 * THE INSTRUCTION BASELINE VERSION.
 *
 * Deliberately the CONTENT HASH of the canonical instruction file rather than a
 * hand-maintained number. A version somebody has to remember to bump is a
 * version that silently stops moving, and the failure mode — a lane believing it
 * is current because nobody edited a constant — is exactly the drift this is
 * supposed to make observable.
 */
export function instructionBaselineVersion(content) {
  if (content === null || content === undefined) return null;
  // A tiny, stable, dependency-free digest. Identity is all that is needed here:
  // two lanes either read the same bytes or they did not.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = String(content);
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return `ib_${h1.toString(36)}${h2.toString(36)}`;
}

/* ── A: the precedence map ───────────────────────────────────────────────── */

/**
 * EVERY LAYER THAT CAN CHANGE WHAT AN AGENT DOES, IN ORDER.
 *
 * Order is the point. Until this was written down, "which instruction wins" was
 * answerable only by experiment, and two of the layers below turn out to state
 * the same fact differently.
 *
 * `injected` is the field that surprises people: the toolkit's
 * AGENT-INSTRUCTIONS.md and CHEAT-SHEET.md are NOT automatically placed in front
 * of any agent — grepped across the toolkit and the Vacilando library, nothing
 * reads them at dispatch. They are documentation an agent may open. Treating
 * them as active instruction is how a stale line in one of them is assumed
 * harmless, and it is exactly where a duplicated port range is currently hiding.
 */
export const INSTRUCTION_LAYERS = Object.freeze([
  Object.freeze({
    id: "claude_system_prompt",
    precedence: 1,
    owner: "Anthropic / Claude Code build",
    scope: "every session on this host",
    injected: true,
    mutable_by_us: false,
    kind: "workflow_contract",
  }),
  Object.freeze({
    id: "repository_claude_md",
    precedence: 2,
    owner: "git — CLAUDE.md at the repository root",
    scope: "every agent working in any checkout of this repository",
    injected: true,
    mutable_by_us: true,
    kind: "durable_policy",
    note: "the canonical instruction baseline; identical in all 39 lane worktrees by construction",
  }),
  Object.freeze({
    id: "nested_claude_md",
    precedence: 3,
    owner: "git — CLAUDE.md below the root",
    scope: "the subtree containing it",
    injected: true,
    mutable_by_us: true,
    kind: "durable_policy",
    note: "none exist in this repository; the layer is declared so that adding one is a visible act",
  }),
  Object.freeze({
    id: "project_settings_hooks",
    precedence: 4,
    owner: ".claude/settings.json",
    scope: "every agent in this checkout",
    injected: false,
    mutable_by_us: true,
    kind: "enforcement",
    note: "hooks ENFORCE; they do not instruct. A hook is the thing a prompt should stop restating.",
  }),
  Object.freeze({
    id: "vacilando_run_instruction",
    precedence: 5,
    owner: "Gateway — lane-dispatch, per run",
    scope: "one execution run",
    injected: true,
    mutable_by_us: true,
    kind: "mission_overlay",
    note: "the mission overlay; bounded to 4000 characters by lane-dispatch and treated as untrusted input",
  }),
  Object.freeze({
    id: "toolkit_agent_docs",
    precedence: null,
    owner: "installed toolkit — AGENT-INSTRUCTIONS.md, CHEAT-SHEET.md",
    scope: "read on demand",
    injected: false,
    mutable_by_us: true,
    kind: "guidance",
    note: "NOT auto-injected: nothing in the toolkit or the Vacilando library reads these at dispatch",
  }),
]);

export function layerById(id) {
  return INSTRUCTION_LAYERS.find((l) => l.id === id) || null;
}

/**
 * Resolve which layer wins for a fact claimed by several.
 *
 * Deterministic and boring on purpose: lowest precedence number wins, a layer
 * that is not injected cannot win anything, and a tie is impossible because
 * precedence is unique. A resolver that had to guess would be a sixth authority.
 */
export function resolvePrecedence(claims = []) {
  const active = claims
    .map((c) => ({ ...c, layer: layerById(c.layer_id) }))
    .filter((c) => c.layer && c.layer.injected && c.layer.precedence != null);
  if (!active.length) return { winner: null, reason: "no injected layer claims this fact", claims };
  active.sort((a, b) => a.layer.precedence - b.layer.precedence);
  const winner = active[0];
  const overridden = active.slice(1);
  return {
    winner: { layer_id: winner.layer_id, value: winner.value, precedence: winner.layer.precedence },
    overridden: overridden.map((c) => ({ layer_id: c.layer_id, value: c.value })),
    // Two layers agreeing is duplication; two layers disagreeing is a conflict.
    // Both are findings, and they are not the same finding.
    duplicated: overridden.filter((c) => c.value === winner.value).map((c) => c.layer_id),
    conflicting: overridden.filter((c) => c.value !== winner.value).map((c) => c.layer_id),
    reason: `precedence ${winner.layer.precedence} (${winner.layer.owner})`,
  };
}

/* ── B: classification ──────────────────────────────────────────────────── */

export const INSTRUCTION_CLASS = Object.freeze({
  DURABLE_POLICY: "DURABLE_POLICY",
  WORKFLOW_CONTRACT: "WORKFLOW_CONTRACT",
  MODEL_TUNING: "MODEL_TUNING",
  HISTORICAL_WORKAROUND: "HISTORICAL_WORKAROUND",
  REDUNDANT: "REDUNDANT",
  CONFLICTING: "CONFLICTING",
});

/**
 * A finding about one instruction.
 *
 * `keep` is separate from `class` because the two most valuable outcomes of this
 * audit are "this is emphatic AND correct, leave it alone" and "this is calm and
 * wrong". Collapsing them into a single severity would produce the blind
 * shortening the mission explicitly forbids.
 */
export function instructionFinding({
  id, source, line = null, quote = null, klass, keep = true,
  why = null, enforced_by = null, replaced_by = null, severity = "watch",
}) {
  return {
    id,
    source,
    line,
    quote: quote ? String(quote).slice(0, 200) : null,
    class: klass,
    keep,
    why,
    // The field that makes "code enforces, prompt explains" checkable rather
    // than aspirational: a prompt rule claiming enforcement must name it.
    enforced_by,
    replaced_by,
    severity,
  };
}

/**
 * IS THIS PROMPT RULE ALREADY ENFORCED BY CODE, AND IS THAT CODE ACTUALLY WIRED?
 *
 * THE SECOND HALF IS THE POINT, and it is where this audit earns its keep.
 * `guard-push.sh` exists, is tested, and is registered NOWHERE — not in
 * `.claude/settings.json` and not as a git hook. A hygiene pass that saw the
 * file and concluded "pushing is code-enforced, the prompt can stop saying it"
 * would have removed the only thing actually preventing a push.
 *
 * So enforcement is only credited when a wiring reference is supplied. An
 * unwired guard makes the prompt rule MORE necessary, not less.
 */
export function enforcementStatus({ guardFile = null, wiredIn = [] } = {}) {
  if (!guardFile) return { enforced: false, reason: "no guard named" };
  if (!wiredIn.length) {
    return {
      enforced: false,
      guard: guardFile,
      reason: "the guard exists but is registered nowhere; the prompt rule is the only enforcement",
      finding: "unwired_guard",
    };
  }
  return { enforced: true, guard: guardFile, wired_in: wiredIn, reason: `invoked by ${wiredIn.join(", ")}` };
}

/* ── E: model and effort policy ─────────────────────────────────────────── */

/**
 * EFFORT LEVELS SUPPORTED BY THE INSTALLED BUILD.
 *
 * Read from `claude --help` on 2.1.269: `--effort <level>` accepts
 * low, medium, high, xhigh, max. Written down here so that a policy naming
 * anything else is a detectable error rather than a silently ignored flag.
 */
export const SUPPORTED_EFFORT = Object.freeze(["low", "medium", "high", "xhigh", "max"]);

export const WORK_CLASS = Object.freeze({
  MECHANICAL: "mechanical",
  ROUTINE: "routine",
  ARCHITECTURE: "architecture",
  GOVERNANCE: "governance",
  CERTIFICATION: "certification",
  RECOVERY: "recovery",
});

/**
 * EFFORT BY WORK CLASS, NOT ONE LEVEL FOR EVERYTHING.
 *
 * MEASURED STARTING POINT: no effort setting exists anywhere on this host today
 * — not in `~/.claude/settings.json` (theme and notifications only), not in the
 * project settings (schema and hooks only). Every lane runs at the session
 * default, which means a slot renaming inventory and a promotion-gate
 * correctness trace are given identical budget.
 *
 * The classes below are a POLICY, not an enforcement: nothing here sets a flag.
 * A caller that wants to honour it passes `--effort` when it launches a session.
 * That boundary is deliberate — silently changing how much thinking another
 * lane's work receives is not a thing an audit module should be able to do.
 */
export const EFFORT_POLICY = Object.freeze({
  [WORK_CLASS.MECHANICAL]: "low",
  [WORK_CLASS.ROUTINE]: "medium",
  [WORK_CLASS.ARCHITECTURE]: "high",
  [WORK_CLASS.GOVERNANCE]: "high",
  [WORK_CLASS.CERTIFICATION]: "high",
  [WORK_CLASS.RECOVERY]: "high",
});

/**
 * Resolve effort for a work class, optionally overridden per model.
 *
 * An unknown work class resolves to `medium` rather than to the cheapest option:
 * the failure mode of guessing low on work you did not recognise is worse than
 * the cost of a medium run.
 */
export function resolveEffort(workClass, { model = null, byModel = {} } = {}) {
  const override = model && byModel[model] && byModel[model][workClass];
  const level = override || EFFORT_POLICY[workClass] || "medium";
  const supported = SUPPORTED_EFFORT.includes(level);
  return {
    work_class: workClass,
    model: model || null,
    effort: supported ? level : null,
    supported,
    source: override ? "model_override" : (EFFORT_POLICY[workClass] ? "policy" : "default"),
    reason: supported ? null : `effort "${level}" is not supported by this build (${SUPPORTED_EFFORT.join(", ")})`,
  };
}

/* ── F: subagent policy ─────────────────────────────────────────────────── */

/**
 * WHAT SUBAGENTS ARE FOR, AND WHAT THEY ARE NOT FOR.
 *
 * MEASURED: there are no custom agent definitions on this host at all —
 * `~/.claude/agents/` does not exist and the project defines none. So subagent
 * behaviour today is entirely whatever a mission's prose asks for, which is the
 * least controllable arrangement available.
 *
 * The policy is bounded deliberately. A subagent is worth its cost when the work
 * is a WIDE, SHALLOW read whose output is a conclusion rather than a file dump.
 * It is not worth its cost when the main agent would have to re-derive the
 * reasoning anyway — and delegating the reasoning is how an agent ends up
 * summarising a conclusion it cannot defend.
 */
export const SUBAGENT_SUITABLE = Object.freeze([
  "targeted_search",
  "narrow_inventory",
  "isolated_proof",
  "mechanical_validation",
]);

export const SUBAGENT_UNSUITABLE = Object.freeze([
  "synthesis",
  "design_decision",
  "governance_judgement",
  "final_certification",
  "anything_the_main_agent_must_defend",
]);

export const SUBAGENT_POLICY = Object.freeze({
  /** Fan-out is opt-in per task, never a default posture. */
  default_posture: "none",
  /** A ceiling, so a prompt cannot turn into a swarm by accident. */
  max_concurrent: 4,
  suitable: SUBAGENT_SUITABLE,
  unsuitable: SUBAGENT_UNSUITABLE,
  /**
   * Model routing per subagent IS supported by this build (`--agents` accepts
   * definitions and the Agent tool takes a model), so a narrow search need not
   * pay for the most capable model. No routing is configured today.
   */
  model_routing_supported: true,
  model_routing_configured: false,
});

export function subagentDecision(taskKind, { concurrent = 0, policy = SUBAGENT_POLICY } = {}) {
  if (policy.unsuitable.includes(taskKind)) {
    return { delegate: false, reason: `${taskKind} is work the main agent must own and be able to defend` };
  }
  if (!policy.suitable.includes(taskKind)) {
    // Unknown work is not delegated. The default posture is "none", so silence
    // means do it yourself rather than spawn something.
    return { delegate: false, reason: `${taskKind} is not an enumerated delegable kind; default posture is ${policy.default_posture}` };
  }
  if (concurrent >= policy.max_concurrent) {
    return { delegate: false, reason: `subagent ceiling ${policy.max_concurrent} reached` };
  }
  return { delegate: true, reason: `${taskKind} is a bounded read whose output is a conclusion` };
}

/* ── G/H: baseline and drift ────────────────────────────────────────────── */

/**
 * The instruction baseline a lane resolved, recorded where DevOps 1 already
 * records bootstrap facts rather than in a new store.
 *
 * It is a POINTER plus a hash: which file, which version, when observed. The
 * content never travels — a copy of the instruction in every lane record is a
 * second instruction system wearing a different hat.
 */
export function laneInstructionBaseline({ laneId, source = "CLAUDE.md", version, observedAt = null, overlay = null } = {}) {
  return {
    schema: AGENT_CONFIG_SCHEMA,
    lane_id: laneId,
    source,
    baseline_version: version,
    overlay: overlay ? { mission_id: overlay.mission_id || null, run_id: overlay.run_id || null } : null,
    observed_at: observedAt || new Date().toISOString(),
  };
}

/**
 * Has the baseline moved under a lane?
 *
 * Reports; it does not rewrite. DevOps 4's model is explicit that a durable
 * decision is not invalidated because state moved, and an instruction version
 * bump is state moving — so a resumed lane is told to revalidate, and its
 * knowledge is left exactly where it is.
 */
export function detectInstructionDrift({ lanes = [], currentVersion = null } = {}) {
  const rows = [];
  for (const lane of lanes) {
    const seen = lane.instruction_baseline?.baseline_version ?? null;
    if (!currentVersion) { rows.push({ lane_id: lane.lane_id, state: "UNKNOWN", reason: "current baseline not measured" }); continue; }
    if (!seen) { rows.push({ lane_id: lane.lane_id, state: "UNRECORDED", reason: "this lane never recorded which baseline it used" }); continue; }
    if (seen !== currentVersion) {
      rows.push({
        lane_id: lane.lane_id, state: "DRIFTED", seen, current: currentVersion,
        requires_revalidation: true,
        reason: "the canonical instruction changed since this lane last resolved it",
        // Stated explicitly so no consumer infers the opposite.
        durable_knowledge_action: "none — a changed prompt version does not invalidate recorded decisions",
      });
      continue;
    }
    rows.push({ lane_id: lane.lane_id, state: "CURRENT", seen });
  }
  const by = {};
  for (const r of rows) by[r.state] = (by[r.state] || 0) + 1;
  return { current_version: currentVersion, lanes: rows.length, by_state: by, drifted: rows.filter((r) => r.state === "DRIFTED").length, rows };
}

/* ── J: behaviour baseline for DevOps 9 ─────────────────────────────────── */

/**
 * What can honestly be measured about agent behaviour on this host.
 *
 * `available: false` entries are as important as the true ones. This build
 * exposes no cost command and no token accounting to a session, so a cost
 * baseline cannot be produced — and inventing one would give DevOps 9 a canary
 * that compares two fabrications.
 */
export function behaviourBaseline({ instructionBytes = null, runs = [], claudeVersion = null } = {}) {
  const durations = runs.map((r) => {
    const a = Date.parse(r.created_at || r.started_at || "");
    const b = Date.parse(r.ended_at || r.updated_at || "");
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? b - a : null;
  }).filter((n) => n != null).sort((a, b) => a - b);

  return {
    schema: AGENT_CONFIG_SCHEMA,
    claude_version: claudeVersion,
    metrics: [
      { id: "instruction_bytes", available: instructionBytes != null, value: instructionBytes, source: "canonical CLAUDE.md on disk" },
      { id: "runs_observed", available: runs.length > 0, value: runs.length, source: "execution-run records" },
      { id: "median_run_ms", available: durations.length > 0, value: durations.length ? durations[Math.floor(durations.length / 2)] : null, source: "execution-run timestamps" },
      { id: "effort_configured", available: true, value: false, source: "no effort setting exists in user or project settings" },
      { id: "subagent_definitions", available: true, value: 0, source: "~/.claude/agents absent; project defines none" },
      { id: "token_cost", available: false, value: null, source: "this Claude Code build exposes no cost or token accounting to a session" },
      { id: "model_used_per_run", available: false, value: null, source: "Vacilando records the provider, not the model, on a run" },
    ],
  };
}

/* ── K: the DevOps 7 audit seam ─────────────────────────────────────────── */

/**
 * THE READ-ONLY AUDIT, shaped for DevOps 7's `configurationAuditSeam`.
 *
 * It never gates maintenance. DevOps 7 declares `gates_admission: false` for
 * this seam, and the severities here are chosen to match that promise: the worst
 * this can do is colour a health check, and failing a reboot on prompt hygiene
 * would be a category error.
 *
 * Everything is passed in. The module opens no file, so "read-only" is a
 * property of its construction rather than a claim in its documentation.
 */
export function auditAgentConfiguration({
  baselineVersion = null,
  instructionFindings = [],
  drift = null,
  effortConfigured = false,
  subagentPolicy = SUBAGENT_POLICY,
  unsupportedSettings = [],
  claudeVersion = null,
} = {}) {
  const conflicts = instructionFindings.filter((f) => f.class === INSTRUCTION_CLASS.CONFLICTING);
  const redundant = instructionFindings.filter((f) => f.class === INSTRUCTION_CLASS.REDUNDANT);
  const historical = instructionFindings.filter((f) => f.class === INSTRUCTION_CLASS.HISTORICAL_WORKAROUND);
  const unwired = instructionFindings.filter((f) => f.severity === "problem");

  const findings = [
    ...conflicts.map((f) => ({ id: f.id, kind: "conflicting_instruction", detail: f.why, severity: "problem" })),
    ...unwired.filter((f) => !conflicts.includes(f)).map((f) => ({ id: f.id, kind: "unenforced_rule", detail: f.why, severity: "problem" })),
    ...redundant.map((f) => ({ id: f.id, kind: "duplicated_instruction", detail: f.why, severity: "watch" })),
    ...historical.map((f) => ({ id: f.id, kind: "historical_workaround", detail: f.why, severity: "watch" })),
    ...unsupportedSettings.map((s) => ({ id: s, kind: "unsupported_setting", detail: `${s} is not supported by this build`, severity: "problem" })),
  ];
  if (drift?.drifted) findings.push({ id: "instruction_drift", kind: "baseline_drift", detail: `${drift.drifted} lane(s) on an older instruction baseline`, severity: "watch" });
  if (!effortConfigured) findings.push({ id: "effort_unconfigured", kind: "model_tuning", detail: "no effort level is configured; all work classes share the session default", severity: "watch" });

  const problems = findings.filter((f) => f.severity === "problem");
  return {
    schema: AGENT_CONFIG_SCHEMA,
    claude_version: claudeVersion,
    baseline_version: baselineVersion,
    // The contract DevOps 7's seam expects.
    clean: findings.length === 0,
    findings,
    counts: {
      total: findings.length,
      problems: problems.length,
      conflicts: conflicts.length,
      redundant: redundant.length,
      historical: historical.length,
    },
    drift: drift ? { drifted: drift.drifted, lanes: drift.lanes, by_state: drift.by_state } : null,
    model_effort: { configured: effortConfigured, policy: EFFORT_POLICY, supported_levels: SUPPORTED_EFFORT },
    subagents: { default_posture: subagentPolicy.default_posture, max_concurrent: subagentPolicy.max_concurrent, model_routing_configured: subagentPolicy.model_routing_configured },
    // Stated in the payload, not only in prose, so a consumer cannot wire this
    // into a gate without noticing it was told not to.
    gates_maintenance: false,
    severity: problems.length ? "problem" : findings.length ? "watch" : "healthy",
  };
}

/* ── M: DevOps 9 handoff ────────────────────────────────────────────────── */

/**
 * What DevOps 9 needs to canary a model or toolchain change, and what it will
 * NOT find here.
 *
 * The honest half matters more: without per-run model identity and without cost
 * accounting, a canary can compare outcomes and durations but not spend. Saying
 * so is what stops DevOps 9 building a comparison on numbers that were invented.
 */
export function canaryInputs({ audit = null, baseline = null } = {}) {
  return {
    seam: "vacilando.toolchain_canary.v1",
    owner: "DevOps 9",
    provides: {
      instruction_baseline_version: audit?.baseline_version ?? null,
      claude_version: audit?.claude_version ?? null,
      effort_policy: EFFORT_POLICY,
      supported_effort: SUPPORTED_EFFORT,
      subagent_policy: SUBAGENT_POLICY,
      configuration_audit: audit ? { clean: audit.clean, counts: audit.counts, severity: audit.severity } : null,
      behaviour_metrics: baseline?.metrics ?? null,
    },
    not_available: [
      "per-run model identity — Vacilando records the provider, not the model",
      "token or cost accounting — this Claude Code build exposes none to a session",
    ],
    implemented_here: false,
  };
}
