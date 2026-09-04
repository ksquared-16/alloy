/**
 * The durable Director Operating Authorization.
 *
 * WHAT THIS FIXES. Before this, the answer to "what has the Director already
 * authorized?" existed only as DELEGATED_POLICIES_V1 — a list of the action
 * keys someone had got round to writing a policy for. That list answers "is
 * this request allowed", which is the evaluator's question. It does not answer
 * the Director's question, which is "what have I signed up to, what is still
 * mine, and when did that last change". Those are different documents and
 * conflating them is why the operator kept re-establishing the same consent:
 * there was nothing durable to point at that said it had already been given.
 *
 * DERIVED, NEVER COPIED. Everything here is built FROM the live constants in
 * director-authority.mjs. A second hand-maintained copy of the policy set is
 * the obvious way to write this file and it is the wrong one: the copy drifts,
 * and a governance document that disagrees with the evaluator is worse than no
 * document, because people believe it. The inventory below adds only what the
 * policies cannot know — the tier, and the classes that are not governed
 * actions at all — and a structural test asserts the two stay reconciled.
 *
 * ONE DOCUMENT, INHERITED. There is no per-lane copy. Every lane evaluates the
 * same authorization because every lane imports the same module; a lane that
 * needs different treatment gets a NARROWER override, validated as narrower.
 * "Inheritance" here is not a mechanism to build, it is a property to protect:
 * the way to break it is to let a lane hold its own widened copy.
 */
import {
  DELEGATED_POLICIES_V1,
  DIRECTOR_POLICY_VERSION,
  OPERATOR_OWNED_ACTION_KEYS,
  SELF_EXPANSION_ACTION_KEYS,
  DIRECTOR_ELIGIBLE_ENVIRONMENTS,
  OPERATOR_ONLY_ENVIRONMENTS,
} from "./director-authority.mjs";

export const OPERATING_AUTHORIZATION_VERSION = "director_operating_authorization_v1";

/** The date the Director accepted this envelope, not the date the file changed. */
export const EFFECTIVE_FROM = "2026-09-04";

/**
 * Four tiers, named for who decides rather than for how the system feels about
 * the action. "Governed" is not a tier: every action here is governed, and
 * that is precisely why governed must stop implying a human click.
 */
export const TIERS = Object.freeze({
  A: "autonomous_routine",
  B: "autonomous_within_bounded_policy",
  C: "director_judgement_required",
  D: "never_automatic",
});

export const TIER_MEANING = Object.freeze({
  [TIERS.A]: "Executes when machine guards pass. No approval, no notification, activity and audit only.",
  [TIERS.B]: "Executes automatically only inside explicit bounds. Outside the bounds it is tier C.",
  [TIERS.C]: "A human judgement changes the outcome. Needs You is correct here and nowhere else.",
  [TIERS.D]: "Never automatic under any policy or preference. Refusal, not escalation.",
});

const A = TIERS.A, B = TIERS.B, C = TIERS.C, D = TIERS.D;

/**
 * The action-class inventory.
 *
 * `action_key` is set only where the class really is a governed trusted-host
 * action. Most of what the Director experiences as interruption is not: a
 * checkpoint, a dev-server restart and a lane pause are executed by the lane
 * or the supervisor, and they earn a tier here so the notification model can
 * ask the same question of every class rather than only of the governed ones.
 *
 * `bounds` is what makes a B a B. A tier B row with no bounds is a mis-filed
 * tier A, and a bound nobody measures is a mis-filed tier C.
 */
export const ACTION_CLASS_INVENTORY = Object.freeze([
  // ── Repository ───────────────────────────────────────────────────────────
  Object.freeze({
    class_id: "repository.checkpoint", surface: "repository", action_key: null, tier: A,
    executes_via: "vac checkpoint-create (lane)",
    why: "Commits only the named manifest inside the lane's own worktree, refuses paths dirty before the run, and records content-bound adoption. Nothing leaves the machine.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "repository.push", surface: "repository", action_key: "repository.push", tier: A,
    executes_via: "trusted host",
    why: "Publishing a managed branch deploys nothing and merges nothing. Ownership is measured from the requesting worktree, not inferred from the branch name.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "promotion.open_pr", surface: "repository", action_key: "promotion.open_pr", tier: A,
    executes_via: "trusted host",
    why: "Opening a PR is the mechanism by which review and CI happen; it changes nothing in staging. Certification is required at merge, where content lands.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "repository.merge_pull_request", surface: "repository", action_key: "repository.merge_pull_request", tier: B,
    executes_via: "trusted host",
    why: "Merge is where content becomes everyone else's problem, so it is bounded rather than routine — but every bound is machine-measurable, which is what took it out of tier C.",
    bounds: "Exact expected head, base staging, mergeable, checks green, certification suite passed, zero unresolved findings. Any one unmeasured escalates.",
  }),
  Object.freeze({
    class_id: "repository.close_pull_request", surface: "repository", action_key: "repository.close_pull_request", tier: A,
    executes_via: "trusted host",
    why: "Closing an unmerged PR changes no branch and no environment, and a PR can be reopened.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "repository.delete_remote_branch", surface: "repository", action_key: "repository.delete_remote_branch", tier: B,
    executes_via: "trusted host",
    why: "Recoverable only while the commits are reachable, so recoverability is measured rather than assumed. Age is never evidence of disposability.",
    bounds: "Branch unprotected, remote head matches expected, no open PR depends on it, no active lane references it, no unique work lost.",
  }),
  Object.freeze({
    class_id: "repository.force_push", surface: "repository", action_key: "repository.force_push", tier: D,
    executes_via: "operator only",
    why: "History rewriting can destroy work that no measurement can recover afterwards. Separate action key from push precisely so push's tier cannot be borrowed.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "repository.delete", surface: "repository", action_key: "repository.delete", tier: D,
    executes_via: "operator only",
    why: "Irreversible at a scope no gate can bound.",
    bounds: null,
  }),

  // ── Runtime ──────────────────────────────────────────────────────────────
  Object.freeze({
    class_id: "runtime.dev_server_start", surface: "runtime", action_key: null, tier: A,
    executes_via: "alloy-dev-start (canonical lifecycle)",
    why: "Starting a slot-bound server through the canonical lifecycle affects one port this lane owns.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "runtime.dev_server_stop", surface: "runtime", action_key: null, tier: A,
    executes_via: "alloy-dev-stop (canonical lifecycle)",
    why: "Stopping a server this lane owns is reversible by starting it again.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "runtime.dev_server_recycle", surface: "runtime", action_key: null, tier: B,
    executes_via: "supervisor",
    why: "Restarting a desired-RUNNING server that died is restoring intent, not changing it. Restarting one that was deliberately stopped is changing it.",
    bounds: "Ownership proven, desired state RUNNING, restart budget not exhausted.",
  }),
  Object.freeze({
    class_id: "runtime.supervisor_recovery", surface: "runtime", action_key: null, tier: B,
    executes_via: "supervisor",
    why: "Bounded recovery is routine; exhausted recovery is a STUCK notification, because at that point something outside the machine has to change.",
    bounds: "Within the recovery budget. restart_exhausted leaves tier B and notifies STUCK.",
  }),

  // ── Lane lifecycle ───────────────────────────────────────────────────────
  Object.freeze({
    class_id: "lane.create", surface: "lane", action_key: null, tier: A,
    executes_via: "gateway", why: "Creating a lane commits no work and holds no resource until it is admitted.", bounds: null,
  }),
  Object.freeze({
    class_id: "lane.place", surface: "lane", action_key: null, tier: A,
    executes_via: "gateway", why: "Placement is scheduling. It is reversible and it decides nothing about content.", bounds: null,
  }),
  Object.freeze({
    class_id: "lane.pause", surface: "lane", action_key: null, tier: A,
    executes_via: "gateway", why: "Pausing loses nothing and is undone by resuming.", bounds: null,
  }),
  Object.freeze({
    class_id: "lane.resume", surface: "lane", action_key: null, tier: A,
    executes_via: "gateway", why: "Resuming restores an intent the operator already expressed.", bounds: null,
  }),
  Object.freeze({
    class_id: "lane.park", surface: "lane", action_key: null, tier: B,
    executes_via: "gateway",
    why: "Parking frees a seat. It is safe when idleness is positively proven and wrong when it is merely not disproven.",
    bounds: "Idle eligibility positively measured. Absence of recent activity is not proof of idleness.",
  }),
  Object.freeze({
    class_id: "lane.close", surface: "lane", action_key: null, tier: B,
    executes_via: "gateway",
    why: "Closing a lane whose work is reachable from the remote destroys nothing. Closing one holding the only copy destroys it.",
    bounds: "Branch durability proven. Unprovable durability, or unique unmerged work, is tier C.",
  }),
  Object.freeze({
    class_id: "lane.stale_run_reconciliation", surface: "lane", action_key: "vacilando.apply_reconciliation_plan", tier: B,
    executes_via: "trusted host",
    why: "The corrections describe observed reality rather than change it, which is what makes metadata reconciliation reversible.",
    bounds: "Allowlisted corrections only, plan fingerprint current, zero destructive corrections, no foreign or ambiguous owner mutation, no live process affected.",
  }),

  // ── Worktree ─────────────────────────────────────────────────────────────
  Object.freeze({
    class_id: "worktree.create", surface: "worktree", action_key: null, tier: A,
    executes_via: "alloy-worktree-create", why: "Additive and independently removable.", bounds: null,
  }),
  Object.freeze({
    class_id: "worktree.provision", surface: "worktree", action_key: null, tier: A,
    executes_via: "toolkit", why: "Worktree-local dependencies affect nothing outside the slot.", bounds: null,
  }),
  Object.freeze({
    class_id: "worktree.retire", surface: "worktree", action_key: "vacilando.retire_worktree", tier: B,
    executes_via: "trusted host",
    why: "A worktree is a checkout, not the work. Removing one whose commits are reachable from the canonical remote destroys nothing — and that basis collapses the moment durability is unproven.",
    bounds: "Safety measured, state candidate, tree clean, no live references, durability proven, no unique work at risk, not self-retirement, fingerprint-bound, branch never deleted along with it.",
  }),
  Object.freeze({
    class_id: "worktree.remove_orphaned", surface: "worktree", action_key: null, tier: B,
    executes_via: "host steward",
    why: "Same basis as retirement. An orphan whose ownership cannot be established is not an orphan, it is an unknown.",
    bounds: "Ownership proven and durability proven. Either one unmeasured makes it tier C.",
  }),

  // ── QA / browser identity ────────────────────────────────────────────────
  Object.freeze({
    class_id: "environment.restore_qa_session", surface: "qa_identity", action_key: "environment.restore_qa_session", tier: C,
    executes_via: "operator only",
    why: "Reserved to the operator in V1. Session material is credential-adjacent, and the boundary is kept at the class rather than at the value.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "environment.provision_qa_identity", surface: "qa_identity", action_key: "environment.provision_qa_identity", tier: C,
    executes_via: "operator only",
    why: "Creating an identity creates a principal that can then be granted access. That is an authority boundary, not a fixture.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "environment.assign_qa_identity_access", surface: "qa_identity", action_key: "environment.assign_qa_identity_access", tier: C,
    executes_via: "operator only",
    why: "Granting application access widens what a principal may reach. Authority expansion is explicit by construction.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "qa.browser_sign_in", surface: "qa_identity", action_key: null, tier: C,
    executes_via: "operator (human sign-in)",
    why: "The agent cannot sign in and must not be able to. This is tier C because a human is the only party who can resolve it, not because judgement is being sought.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "qa.director_auth_routing", surface: "qa_identity", action_key: null, tier: C,
    executes_via: "operator",
    why: "Routing Director-facing authentication changes who can act as the Director.",
    bounds: null,
  }),

  // ── Capacity ─────────────────────────────────────────────────────────────
  Object.freeze({
    class_id: "capacity.server_admission", surface: "capacity", action_key: null, tier: B,
    executes_via: "gateway",
    why: "Admission inside a certified envelope is arithmetic, not judgement.",
    bounds: "Normal 8 concurrent dev servers, burst 10 while pressure is healthy, memory-pressure knee 11.",
  }),
  Object.freeze({
    class_id: "capacity.provider_admission", surface: "capacity", action_key: null, tier: B,
    executes_via: "gateway",
    why: "Same basis as server admission, against the certified provider ceiling rather than the server one.",
    bounds: "Within the live certified provider ceiling.",
  }),
  Object.freeze({
    class_id: "capacity.browser_admission", surface: "capacity", action_key: null, tier: B,
    executes_via: "gateway",
    why: "Bounded by the certified automated-browser limit.",
    bounds: "Automated browser concurrency 2.",
  }),
  Object.freeze({
    class_id: "capacity.set_provider_ceiling", surface: "capacity", action_key: "capacity.set_provider_ceiling", tier: B,
    executes_via: "trusted host",
    why: "One key, inside a window whose ends the operator chose, from a value the caller correctly predicted, with the restore value named in the same request. Reversal is the same call with the numbers swapped.",
    bounds: "ALLOY_MAX_ACTIVE_PROVIDERS only, 4..8 inclusive, compare-and-set against the live value, rollback declared, host headroom measured, no unvalidated ceiling already active.",
  }),
  Object.freeze({
    class_id: "capacity.expand_beyond_window", surface: "capacity", action_key: null, tier: C,
    executes_via: "operator",
    why: "Moving the ends of the window is not using the window. Widening the tested envelope is the operator's decision every time.",
    bounds: null,
  }),

  // ── Host / toolkit ───────────────────────────────────────────────────────
  Object.freeze({
    class_id: "host.install_toolkit", surface: "host", action_key: "host.install_toolkit", tier: A,
    executes_via: "trusted host (canonical alloy-toolkit install)",
    why: "Installing the commit that is already promoted staging carries no content decision — that was taken at merge. What is left is mechanical and measurable, and a human clicking yes to it supplies a measurement rather than a judgement. Reversibility is structural: one immutable tree per commit, and `current` is a symlink.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "host.install_arbitrary_ref", surface: "host", action_key: null, tier: C,
    executes_via: "operator",
    why: "Installing a commit that is not promoted staging is choosing what the host runs, which is the decision the merge gates exist to make. The governed action refuses a ref input for exactly this reason.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "host.gateway_reconcile", surface: "host", action_key: null, tier: B,
    executes_via: "gateway",
    why: "Restarting the Gateway onto a toolkit that was just verified restores intent rather than changing it.",
    bounds: "Bounded restart budget per convergence; health verified after. An exhausted budget is STUCK, not another restart.",
  }),

  Object.freeze({
    class_id: "lane.dispatch_measurement_instruction", surface: "lane",
    action_key: "lane.dispatch_measurement_instruction", tier: B,
    executes_via: "trusted host (composes createQueuedRun)",
    why: "The refused version of this is 'a lane may instruct other lanes', which is remote control. What is delegated is one sentence: an authorized capacity mission may place ONE bounded read-only analysis task into a lane that is idle and eligible. Nothing is committed, pushed or configured, so undoing it is cancelling a queued run.",
    bounds: "Allowlisted purpose only, authorized mission only, target idle and eligible, instruction carries the read-only banner and is scanned for mutation verbs, bound to a named measurement, origin forced to certification.",
  }),
  Object.freeze({
    class_id: "lane.instruct_arbitrary", surface: "lane", action_key: null, tier: D,
    executes_via: "never",
    why: "Unbounded cross-lane instruction is impersonation. The governed action refuses a free-text purpose and a mutating payload precisely so this never becomes reachable by widening a field.",
    bounds: null,
  }),

  // ── Data and credentials ─────────────────────────────────────────────────
  Object.freeze({
    class_id: "database.read_census", surface: "data", action_key: "database.read_census", tier: B,
    executes_via: "trusted host",
    why: "Read-only against a deployed database. Bounded because the query is the risk surface, not the read.",
    bounds: "Allowlisted query artifact matching its expected hash.",
  }),
  Object.freeze({
    class_id: "database.apply_migration", surface: "data", action_key: "database.apply_migration", tier: C,
    executes_via: "operator only",
    why: "Schema change against a deployed environment. Reversibility depends on the migration's own content, which no generic gate can measure.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "credential.provision", surface: "credential", action_key: "credential.provision", tier: D,
    executes_via: "operator only", why: "Creating credential material is never automatic.", bounds: null,
  }),
  Object.freeze({
    class_id: "credential.bind_trusted_secret", surface: "credential", action_key: "credential.bind_trusted_secret", tier: D,
    executes_via: "operator only", why: "Binding a secret expands what the executor can do with it. Self-expansion.", bounds: null,
  }),
  Object.freeze({
    class_id: "spend.activate_paid_service", surface: "spend", action_key: "spend.activate_paid_service", tier: C,
    executes_via: "operator only", why: "Committing money is the Director's, at any amount.", bounds: null,
  }),

  // ── Governance itself ────────────────────────────────────────────────────
  Object.freeze({
    class_id: "governance.update_policy", surface: "governance", action_key: "governance.update_policy", tier: D,
    executes_via: "operator only",
    why: "The delegate cannot enlarge its own delegation. Checked before policy matching so a self-expansion can never find a policy that permits it.",
    bounds: null,
  }),
  Object.freeze({
    class_id: "governance.delegate_authority", surface: "governance", action_key: "governance.delegate_authority", tier: D,
    executes_via: "operator only", why: "Same basis: this is the authority to grant authority.", bounds: null,
  }),
  Object.freeze({
    class_id: "executor.grant_authority", surface: "governance", action_key: "executor.grant_authority", tier: D,
    executes_via: "operator only", why: "Same basis, at the executor rather than the policy.", bounds: null,
  }),
]);

/** Version history. Expansion is a recorded event or it did not happen. */
export const AUTHORIZATION_HISTORY = Object.freeze([
  Object.freeze({
    version: OPERATING_AUTHORIZATION_VERSION,
    effective_from: EFFECTIVE_FROM,
    change: "widening",
    summary:
      "First durable authorization. Enables certified_staging_merge_v1 after building the gate collector it "
      + "depends on, and replaces managed_agent_branch name-matching with measured worktree ownership for push "
      + "and open-PR.",
    authorized_by: "operator",
    audit_ref: "docs/platform/governance/director-attention-model.md",
  }),
]);

const byActionKey = new Map(
  ACTION_CLASS_INVENTORY.filter((r) => r.action_key).map((r) => [r.action_key, r]),
);
const byClassId = new Map(ACTION_CLASS_INVENTORY.map((r) => [r.class_id, r]));

/** Tier for a class id or a governed action key. Unknown is never tier A. */
export function tierOf(idOrActionKey) {
  const row = byClassId.get(idOrActionKey) || byActionKey.get(idOrActionKey);
  return row ? row.tier : null;
}

/**
 * The document the Director reads.
 *
 * Built at call time from whatever the policy constants currently say, so it
 * cannot describe an envelope the evaluator is not enforcing.
 */
export function buildOperatingAuthorization({
  policies = DELEGATED_POLICIES_V1,
  inventory = ACTION_CLASS_INVENTORY,
  nowMs = Date.now(),
} = {}) {
  const enabled = policies.filter((p) => p.enabled === true);
  const disabled = policies.filter((p) => p.enabled !== true);
  return {
    schema_version: "vacilando.director_operating_authorization.v1",
    version: OPERATING_AUTHORIZATION_VERSION,
    policy_version: DIRECTOR_POLICY_VERSION,
    effective_from: EFFECTIVE_FROM,
    generated_at: new Date(nowMs).toISOString(),
    inherited_by: "every lane, existing and future — there is no per-lane copy",

    authorized_action_classes: enabled.map((p) => ({
      policy_id: p.policy_id,
      action_key: p.action_key,
      label: p.label,
      tier: tierOf(p.action_key),
      consequence_class: p.consequence_class,
      environments: [...p.environments],
      gates: [...p.gates],
    })),

    // Written but off. Naming these is the point: a policy that exists and is
    // not enabled is a decision the operator has not yet taken, and it should
    // be visible as that rather than absent.
    written_but_not_enabled: disabled.map((p) => ({
      policy_id: p.policy_id, action_key: p.action_key, label: p.label,
    })),

    bounded_values: inventory
      .filter((r) => r.tier === TIERS.B && r.bounds)
      .map((r) => ({ class_id: r.class_id, bounds: r.bounds })),

    requires_human_judgement: inventory
      .filter((r) => r.tier === TIERS.C)
      .map((r) => ({ class_id: r.class_id, why: r.why })),

    never_automatic: inventory
      .filter((r) => r.tier === TIERS.D)
      .map((r) => ({ class_id: r.class_id, why: r.why })),

    environments: {
      director_eligible: [...DIRECTOR_ELIGIBLE_ENVIRONMENTS],
      operator_only: [...OPERATOR_ONLY_ENVIRONMENTS],
    },
    operator_owned_action_keys: [...OPERATOR_OWNED_ACTION_KEYS],
    self_expansion_action_keys: [...SELF_EXPANSION_ACTION_KEYS],
    history: AUTHORIZATION_HISTORY.map((h) => ({ ...h })),
  };
}

const keySet = (doc) => new Set(doc.authorized_action_classes.map((r) => r.action_key));
const gateSet = (doc) => {
  const m = new Map();
  for (const r of doc.authorized_action_classes) m.set(r.policy_id, new Set(r.gates));
  return m;
};

/**
 * Is the move from `prev` to `next` a widening?
 *
 * The asymmetry is deliberate. Narrowing may happen silently — removing an
 * authorization or adding a gate can only reduce what runs unattended. Widening
 * may not: it is the operator's decision every time, and section 12 is explicit
 * that approval HISTORY must never be read as consent to a new class.
 */
export function classifyAuthorizationChange(prev, next) {
  const added = [...keySet(next)].filter((k) => !keySet(prev).has(k));
  const removed = [...keySet(prev)].filter((k) => !keySet(next).has(k));
  const prevGates = gateSet(prev);
  const nextGates = gateSet(next);
  const droppedGates = [];
  for (const [policyId, gates] of prevGates) {
    const now = nextGates.get(policyId);
    if (!now) continue;
    for (const g of gates) if (!now.has(g)) droppedGates.push(`${policyId}:${g}`);
  }
  const widening = added.length > 0 || droppedGates.length > 0;
  return {
    widening,
    // A change can widen and narrow at once; widening is what gates the decision.
    kind: widening ? "widening" : (removed.length || droppedGates.length === 0 && prevGates.size !== nextGates.size ? "narrowing" : "equivalent"),
    added_action_keys: added,
    removed_action_keys: removed,
    dropped_gates: droppedGates,
    requires_explicit_operator_decision: widening,
  };
}

/**
 * A lane override must be strictly narrower than the inherited authorization.
 *
 * This is the one place a per-lane policy is allowed to exist, so it is also
 * the one place inheritance can be broken. A widening override is refused
 * rather than merged — the failure mode is a lane that quietly grants itself
 * more than the fleet, and it would be invisible precisely because per-lane
 * policy is where nobody looks.
 */
export function validateLaneOverride(base, override = {}) {
  const allowed = keySet(base);
  const requested = new Set(override.authorized_action_keys || []);
  const widened = [...requested].filter((k) => !allowed.has(k));
  if (widened.length) {
    return {
      ok: false,
      error: "lane_override_widens_authorization",
      widened_action_keys: widened,
      detail: "A lane override may only narrow the inherited authorization. Widening is an operator decision at the fleet level.",
    };
  }
  const extraGates = override.additional_gates || {};
  for (const [policyId, gates] of Object.entries(extraGates)) {
    if (!Array.isArray(gates) || !gates.length) {
      return { ok: false, error: "lane_override_empty_gate_list", detail: `additional_gates.${policyId} must name at least one gate` };
    }
  }
  return {
    ok: true,
    lane_id: override.lane_id || null,
    authorized_action_keys: [...requested],
    additional_gates: extraGates,
    narrower_than: base.version,
  };
}
