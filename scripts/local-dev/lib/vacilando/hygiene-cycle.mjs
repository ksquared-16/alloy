/**
 * The hygiene cycle — reconcile, observe, classify, bound, act, verify, audit.
 *
 * WHY THIS IS NOT A DAEMON. §13 is explicit that a second resident hygiene
 * process must not exist where the Steward cycle is the proper driver. This is
 * a function the Steward calls as one stage of its own bounded loop. It holds
 * no timer, opens no socket, and survives nothing on its own.
 *
 * THE FIRST STAGE IS RECONCILIATION, NOT OBSERVATION. Anything left open by a
 * previous interrupted cycle is resolved into a fact before a new plan is
 * built. Planning on top of an unresolved partial is how one interruption
 * becomes a repeated one.
 *
 * WHAT MAKES A RESOURCE ELIGIBLE. Classification is necessary and not
 * sufficient. A resource is acted on only when its state is RECLAIMABLE or
 * RECONCILE, its kind has an autonomous policy, it is outside its cooldown, it
 * has not exhausted its attempts, and it fits inside the per-kind bound. Any
 * one of those missing means it waits for the next cycle, which is not a
 * failure.
 */
import { inCooldown, attemptsExhausted, recordAction } from "./host-steward-cycle.mjs";
import { AUTONOMOUS_ACTIONS, OPERATOR_ONLY_ACTIONS } from "./host-steward.mjs";
import { boundCandidates, lastCycleSummary, reconcileInterrupted } from "./hygiene-reclaim.mjs";
import {
  defaultCanonicalRoot, defaultWorktreeParent, observeHygiene, readGitWorktrees,
} from "./hygiene-observe.mjs";
import { reclaimLog, reclaimRegistrations, reclaimToolkitVersions, reclaimWorktree, runToolkitPrune } from "./hygiene-execute.mjs";
import { hygieneDirectorAttention } from "./hygiene-classification.mjs";
import { existsSync, statSync } from "node:fs";

export const HYGIENE_CYCLE_SCHEMA = "vacilando.hygiene_cycle.v1";

/**
 * Which hygiene actions may run without a human, and what each one is.
 *
 * The action names match the Steward's own allowlist so there is one place to
 * read, and this module refuses any action that is not in it — a policy check
 * that reads the other owner's list rather than restating it cannot drift from
 * it.
 */
export const HYGIENE_ACTIONS = Object.freeze({
  worktree: "retire_worktree",
  registration: "reconcile_stale_worktree_registration",
  artifact: "reclaim_diagnostic_log",
  toolkit: "prune_policy_eligible_toolkit",
});

/** A kind may be acted on only if its action is autonomous AND not operator-only. */
export function actionPermitted(kind) {
  const action = HYGIENE_ACTIONS[kind];
  if (!action) return { ok: false, reason: `no hygiene action is defined for ${kind}` };
  if (OPERATOR_ONLY_ACTIONS.includes(action)) return { ok: false, reason: `${action} is operator-only` };
  if (!AUTONOMOUS_ACTIONS.includes(action)) return { ok: false, reason: `${action} is not in the autonomous allowlist` };
  return { ok: true, action };
}

const key = (kind, id) => `hygiene:${kind}:${id}`;

/**
 * Re-measure one interrupted intent.
 *
 * Every branch answers the same two questions and nothing else: does reality
 * still match the before-state, and does it match the intended end state?
 * Anything that answers neither is a partial, and a partial is never guessed at.
 */
export function measureIntent(intent, { canonicalRoot = defaultCanonicalRoot() } = {}) {
  try {
    if (intent.kind === "worktree") {
      const rows = readGitWorktrees(canonicalRoot);
      if (rows == null) return { unmeasurable: true, detail: "git worktree list could not be read" };
      const path = intent.before?.path ?? null;
      const registered = path ? rows.some((r) => r.path === path) : rows.some((r) => r.path.endsWith(`/${intent.resource_id}`));
      const onDisk = path ? existsSync(path) : null;
      return {
        registered, path_exists: onDisk,
        matches_intended_end_state: registered === false && onDisk === false,
        matches_before: registered === true && onDisk === true,
      };
    }
    if (intent.kind === "registration") {
      const rows = readGitWorktrees(canonicalRoot);
      if (rows == null) return { unmeasurable: true, detail: "git worktree list could not be read" };
      const present = rows.some((r) => r.path === intent.resource_id);
      return { registered: present, matches_intended_end_state: !present, matches_before: present };
    }
    if (intent.kind === "artifact") {
      const path = intent.before?.path ?? null;
      const before = intent.before?.bytes ?? null;
      if (!path || !existsSync(path)) return { exists: false, matches_intended_end_state: false, matches_before: false };
      const now = statSync(path).size;
      return {
        bytes: now,
        matches_intended_end_state: before != null && now < before,
        matches_before: before != null && now === before,
      };
    }
    if (intent.kind === "toolkit") {
      // A partially completed prune is safe by construction — each version is
      // removed independently — so it is reported as completed-enough and the
      // next observation picks up whatever survived.
      return { matches_intended_end_state: true, matches_before: false, note: "toolkit removals are independent; the next plan re-derives what remains" };
    }
    return { unmeasurable: true, detail: `no measurement is defined for kind ${intent.kind}` };
  } catch (e) {
    return { unmeasurable: true, detail: String(e?.message || e) };
  }
}

function eligible({ root, kind, resource, nowMs }) {
  const permitted = actionPermitted(kind);
  if (!permitted.ok) return { ok: false, why: permitted.reason };
  const k = key(kind, resource.resource_id);
  if (inCooldown({ root, resourceKey: k, nowMs })) return { ok: false, why: "cooldown" };
  if (attemptsExhausted({ root, resourceKey: k })) return { ok: false, why: "repeated failure; parked for the operator" };
  return { ok: true, action: permitted.action, resource_key: k };
}

/**
 * One hygiene cycle.
 *
 * `dryRun` runs every stage except the mutations, using the same selection
 * logic, so a preview and a real cycle can never disagree about what would
 * happen — the same property the Steward's own dry run has.
 */
export async function runHygieneCycle({
  root,
  canonicalRoot = defaultCanonicalRoot(),
  worktreeParent = defaultWorktreeParent(),
  requestingWorktree = null,
  toolkitRoot = null,
  dryRun = false,
  nowMs = Date.now(),
  withBytes = true,
  observation = null,
  only = null,
} = {}) {
  if (!root) return { ok: false, error: "missing_runtime_root" };

  // 1 — resolve anything a previous cycle left open.
  const reconciled = reconcileInterrupted({
    root, nowMs, measure: (intent) => measureIntent(intent, { canonicalRoot }),
  });

  // 2 — observe.
  const obs = observation || observeHygiene({
    root, canonicalRoot, worktreeParent, requestingWorktree, toolkitRoot, now: nowMs, withBytes,
  });

  // 3 — select, per kind, with the reasons for every exclusion kept.
  const selected = { worktree: [], registration: [], artifact: [], toolkit: [] };
  const excluded = [];
  // The toolkit is targeted as a PLAN, never as a version.
  //
  // Its prune is one delegated call that recomputes the whole plan, so naming
  // one version and watching fifty-seven disappear would be a surface that lies
  // about its own scope. `--target plan` is the honest unit; a version id is
  // refused rather than silently widened.
  if (only?.kind === "toolkit" && String(only.resourceId) !== "plan") {
    return {
      ok: false,
      error: "toolkit_target_must_be_plan",
      detail: "the toolkit prune is one delegated call that recomputes its whole plan; target `plan`, not a version",
    };
  }
  const consider = (kind, items, wanted) => {
    for (const r of items) {
      // An explicit target NARROWS the selection and never widens it: the
      // resource still has to earn its place through classification, policy,
      // cooldown and bounds. `--target` is not an override.
      if (only && only.kind !== kind) continue;
      if (only && kind !== "toolkit" && String(only.resourceId) !== String(r.resource_id)) continue;
      if (!wanted.includes(r.hygiene_state)) continue;
      const e = eligible({ root, kind, resource: r, nowMs });
      if (!e.ok) { excluded.push({ kind, resource_id: r.resource_id, why: e.why }); continue; }
      selected[kind].push({ ...r, resource_key: e.resource_key, action: e.action });
    }
  };
  consider("worktree", obs.worktrees.filter((w) => w.safety_state === "candidate"), ["RECLAIMABLE"]);
  consider("registration", obs.registrations, ["RECONCILE"]);
  consider("artifact", obs.artifacts.filter((a) => a.mechanism === "truncate_to_tail"), ["RECLAIMABLE"]);
  consider("toolkit", obs.toolkits, ["RECLAIMABLE"]);

  // 4 — bound the blast radius per kind.
  const bounds = {};
  for (const kind of Object.keys(selected)) {
    const b = boundCandidates(kind, selected[kind]);
    bounds[kind] = { limit: b.limit, deferred: b.deferred.length, reason: b.reason };
    selected[kind] = b.selected;
  }

  const planned = Object.entries(selected).flatMap(([kind, items]) =>
    items.map((r) => ({ kind, resource_id: r.resource_id, action: r.action, bytes: r.bytes ?? null, reason: r.reason })));

  if (dryRun) {
    return {
      ok: true, dry_run: true, schema_version: HYGIENE_CYCLE_SCHEMA,
      reconciled, planned, excluded, bounds,
      scoreboard: obs.scoreboard,
      director_attention: hygieneDirectorAttention(obs.scoreboard),
    };
  }

  // 5 — act, one resource at a time. One failure never stops the others.
  const executed = [];
  const failed = [];
  const record = (kind, r, out) => {
    recordAction({ root, resourceKey: r.resource_key, action: r.action, result: { ok: out.ok }, nowMs });
    (out.ok ? executed : failed).push({
      kind, resource_id: r.resource_id, action: r.action, ok: out.ok,
      bytes_reclaimed: out.bytes_reclaimed ?? 0, error: out.ok ? null : (out.error || out.after?.error || out.performed?.error || "unverified"),
      reclamation_id: out.reclamation_id ?? null,
    });
  };

  for (const r of selected.registration) {
    record("registration", r, await reclaimRegistrations({ root, canonicalRoot, resource: r, nowMs }));
  }
  for (const r of selected.artifact) {
    record("artifact", r, await reclaimLog({ root, resource: r, nowMs }));
  }
  for (const r of selected.worktree) {
    record("worktree", r, await reclaimWorktree({
      root, resource: r, canonicalRoot, worktreeParent, requestingWorktree, nowMs,
    }));
  }
  if (selected.toolkit.length) {
    const out = await reclaimToolkitVersions({
      root, versions: selected.toolkit, toolkitRoot, nowMs,
      inventoryAfter: () => {
        const after = observeHygiene({ root, canonicalRoot, worktreeParent, requestingWorktree, toolkitRoot, now: Date.now(), withBytes: false });
        return { versions: after.toolkits, plan: after.toolkit_plan };
      },
    });
    if (out.skipped) { /* nothing prunable */ }
    else record("toolkit", { resource_id: out.resource_id, resource_key: key("toolkit", "batch"), action: HYGIENE_ACTIONS.toolkit }, out);
  }

  return {
    ok: true,
    schema_version: HYGIENE_CYCLE_SCHEMA,
    cycle_at: new Date(nowMs).toISOString(),
    reconciled,
    planned, executed, failed, excluded, bounds,
    bytes_reclaimed: executed.reduce((s, e) => s + (Number(e.bytes_reclaimed) || 0), 0),
    scoreboard: obs.scoreboard,
    director_attention: hygieneDirectorAttention(obs.scoreboard, { cycles: [{ failed }] }),
    last_cycle: lastCycleSummary(root),
  };
}

export { hygienePosture } from "./hygiene-reclaim.mjs";

export { runToolkitPrune };
