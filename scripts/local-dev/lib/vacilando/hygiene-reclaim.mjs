/**
 * The reclamation ledger — making partial completion detectable instead of invisible.
 *
 * THE PROBLEM §12 NAMES. Git, the filesystem and Vacilando's own metadata are
 * three stores with no shared transaction. `git worktree remove` touches two of
 * them; a toolkit prune touches one and a directory tree; a log rewrite touches
 * a file whose writer may still be attached. Any of those can be interrupted,
 * and the dangerous outcome is not the interruption — it is an interruption
 * nobody can later distinguish from "never started".
 *
 * SO THIS DOES NOT PRETEND TO BE A TRANSACTION. There is no rollback here and
 * no two-phase commit, because inventing one across git and the filesystem
 * would be a lie with a nice API. What there is instead: an append-only
 * intention record written BEFORE anything is touched, an outcome record
 * written after, and a reconciler that re-measures reality for every intention
 * that has no outcome. A crash leaves a question, and the question has a
 * documented answer procedure.
 *
 * ORDERING, STATED ONCE. Audit first, act second, verify third, record fourth.
 * Metadata is never updated before the filesystem action it describes: a
 * registration that says "retired" over a worktree still on disk is worse than
 * no record, because the next cycle believes it.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export const RECLAMATION_SCHEMA = "vacilando.hygiene_reclamation.v1";

/** Phases a reclamation record can carry. `intended` with no outcome is the interesting one. */
export const RECLAMATION_PHASES = Object.freeze([
  "intended", "verified", "failed", "reconciled_completed", "reconciled_not_performed", "reconciled_partial",
]);

/** Outcome phases. An intention with none of these is open. */
export const OUTCOME_PHASES = Object.freeze([
  "verified", "failed", "reconciled_completed", "reconciled_not_performed", "reconciled_partial",
]);

/**
 * How many resources one cycle may reclaim, per kind.
 *
 * NOT a performance limit. A classification defect that turns fifteen safe
 * worktrees into fifteen wrong ones destroys fifteen worktrees in one sweep and
 * two in a bounded one, and the second is recoverable by a human who notices.
 * The bound is the blast radius, and it is why it is small.
 */
export const MAX_PER_CYCLE = Object.freeze({
  worktree: 2,
  artifact: 10,
  registration: 5,
});

/**
 * Kinds whose bound is enforced by their own certified owner, not here.
 *
 * The toolkit is the only one. Its prune is a single delegated call to
 * `vac-toolkit-prune --yes`, which recomputes the whole plan from live state
 * and removes exactly what that plan says. There is no interface for "remove
 * twenty-five of the fifty-seven", and inventing one would mean this module
 * choosing which versions die — precisely the decision the toolkit planner
 * exists to own. Its bound is real but different in kind: `current` and every
 * live pin are untouchable, an unresolved pin blocks the whole run, the
 * minimum-retention floor holds, and the result is verified before it is
 * reported.
 *
 * Stated here rather than expressed as a number, because a number would have
 * implied an enforcement that does not exist.
 */
export const DELEGATED_BOUND_KINDS = Object.freeze(["toolkit"]);

export function reclamationLedgerPath(root) {
  return join(root, "vacilando", "hygiene", "reclamations.jsonl");
}

function appendRecord(root, record) {
  const p = reclamationLedgerPath(root);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

/** Every record in the ledger, oldest first. An unreadable line is reported, never skipped silently. */
export function readLedger(root) {
  const p = reclamationLedgerPath(root);
  if (!existsSync(p)) return { ok: true, records: [], unreadable: 0 };
  let text;
  try { text = readFileSync(p, "utf8"); }
  catch (e) { return { ok: false, error: "ledger_unreadable", detail: String(e?.message || e), records: [], unreadable: null }; }
  const records = [];
  let unreadable = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch { unreadable += 1; }
  }
  return { ok: true, records, unreadable };
}

/** A stable id for one reclamation attempt on one resource. */
export function reclamationId({ kind, resourceId, nowMs = Date.now() } = {}) {
  return `rcl_${createHash("sha256").update(`${kind}:${resourceId}:${nowMs}:${process.pid}`).digest("hex").slice(0, 14)}`;
}

/**
 * Record the INTENTION to reclaim, before anything is touched.
 *
 * `before` must describe reality precisely enough for the reconciler to tell,
 * later and without context, whether the action happened. "The path existed and
 * git listed it" is such a description; "it was safe" is not.
 */
export function recordIntent({
  root,
  kind,
  resourceId,
  action,
  mechanism = null,
  evidence = null,
  before = null,
  bytes = null,
  nowMs = Date.now(),
} = {}) {
  if (!root) return { ok: false, error: "missing_runtime_root" };
  if (!kind || !resourceId || !action) return { ok: false, error: "missing_reclamation_identity" };
  if (before == null) {
    // Without a before-state there is nothing to reconcile against, so a
    // reclamation that omits one is refused rather than written.
    return { ok: false, error: "missing_before_state" };
  }
  const id = reclamationId({ kind, resourceId, nowMs });
  const record = {
    schema_version: RECLAMATION_SCHEMA,
    reclamation_id: id,
    phase: "intended",
    kind,
    resource_id: String(resourceId),
    action,
    mechanism,
    evidence,
    before,
    estimated_bytes: bytes ?? null,
    at: new Date(nowMs).toISOString(),
    pid: process.pid,
  };
  try { appendRecord(root, record); }
  catch (e) { return { ok: false, error: "ledger_unwritable", detail: String(e?.message || e) }; }
  return { ok: true, reclamation_id: id, record };
}

/** Record the measured outcome. `after` is measured, never assumed from the action's return value. */
export function recordOutcome({
  root, reclamationId: id, ok, after = null, bytesReclaimed = null,
  error = null, detail = null, nowMs = Date.now(),
} = {}) {
  if (!root || !id) return { ok: false, error: "missing_reclamation_identity" };
  const record = {
    schema_version: RECLAMATION_SCHEMA,
    reclamation_id: id,
    phase: ok ? "verified" : "failed",
    after,
    bytes_reclaimed: ok ? (bytesReclaimed ?? null) : 0,
    error, detail,
    at: new Date(nowMs).toISOString(),
  };
  try { appendRecord(root, record); }
  catch (e) { return { ok: false, error: "ledger_unwritable", detail: String(e?.message || e) }; }
  return { ok: true, record };
}

/** Intentions with no outcome — every one is a possible partial completion. */
export function openReclamations(root) {
  const read = readLedger(root);
  if (!read.ok) return { ok: false, error: read.error, detail: read.detail };
  const intents = new Map();
  for (const r of read.records) {
    if (r.phase === "intended") intents.set(r.reclamation_id, r);
    else if (OUTCOME_PHASES.includes(r.phase)) intents.delete(r.reclamation_id);
  }
  return { ok: true, open: [...intents.values()], unreadable_lines: read.unreadable };
}

/**
 * Reconcile every open intention by RE-MEASURING.
 *
 * `measure(intent)` returns the current reality for that resource, in the same
 * shape as the recorded `before`. This never repeats the action and never
 * finishes it: an interrupted reclamation is resolved into a fact, and acting
 * on that fact is the next cycle's decision made from fresh evidence.
 *
 * Three outcomes, and the third is the one that must not be lost:
 *
 *   completed      — reality already matches the intended end state.
 *   not_performed  — reality still matches `before`; nothing happened.
 *   partial        — neither. Reported, and the resource is marked as needing
 *                    attention rather than retried.
 */
export function reconcileInterrupted({ root, measure, nowMs = Date.now() } = {}) {
  const open = openReclamations(root);
  if (!open.ok) return { ok: false, error: open.error, detail: open.detail };
  if (typeof measure !== "function") return { ok: false, error: "no_measure_function" };

  const resolved = [];
  for (const intent of open.open) {
    let now;
    try { now = measure(intent); }
    catch (e) { now = { unmeasurable: true, detail: String(e?.message || e) }; }

    let phase;
    let why;
    if (now?.unmeasurable) {
      // Unmeasurable stays OPEN. Closing it would be inventing an outcome, and
      // the whole point of the ledger is that we do not do that.
      resolved.push({ reclamation_id: intent.reclamation_id, phase: "still_open", why: "the resource could not be measured", detail: now.detail ?? null });
      continue;
    }
    if (now?.matches_intended_end_state === true) { phase = "reconciled_completed"; why = "reality already matches the intended end state"; }
    else if (now?.matches_before === true) { phase = "reconciled_not_performed"; why = "reality still matches the recorded before-state; the action did not run"; }
    else { phase = "reconciled_partial"; why = "reality matches neither the before-state nor the intended end state"; }

    const record = {
      schema_version: RECLAMATION_SCHEMA,
      reclamation_id: intent.reclamation_id,
      phase,
      kind: intent.kind,
      resource_id: intent.resource_id,
      after: now,
      why,
      at: new Date(nowMs).toISOString(),
    };
    try { appendRecord(root, record); resolved.push({ reclamation_id: intent.reclamation_id, phase, why }); }
    catch (e) { resolved.push({ reclamation_id: intent.reclamation_id, phase: "still_open", why: "the ledger could not be written", detail: String(e?.message || e) }); }
  }
  return {
    ok: true,
    examined: open.open.length,
    resolved,
    // A partial is never automatically retried. It is a fact for a human.
    needs_attention: resolved.filter((r) => r.phase === "reconciled_partial"),
    still_open: resolved.filter((r) => r.phase === "still_open"),
  };
}

/**
 * Perform one reclamation with the ledger around it.
 *
 * The ordering is the contract: intent is durable BEFORE `perform` is called,
 * and `verify` re-measures rather than trusting what `perform` returned. A
 * `perform` that reports success over a path still present is caught here.
 */
export async function reclaimOne({
  root, kind, resourceId, action, mechanism = null, evidence = null,
  before = null, bytes = null, perform = null, verify = null, nowMs = Date.now(),
} = {}) {
  if (typeof perform !== "function") return { ok: false, error: "no_perform_function" };
  const intent = recordIntent({ root, kind, resourceId, action, mechanism, evidence, before, bytes, nowMs });
  if (!intent.ok) return { ok: false, error: intent.error, detail: intent.detail };

  let performed;
  try { performed = await perform(); }
  catch (e) { performed = { ok: false, error: "perform_threw", detail: String(e?.message || e) }; }

  let after = null;
  let verified = null;
  if (typeof verify === "function") {
    try { after = await verify(); verified = after?.ok === true; }
    catch (e) { after = { ok: false, error: "verify_threw", detail: String(e?.message || e) }; verified = false; }
  } else {
    // No verifier means no verification. That is recorded as such and treated
    // as failure, never as success by omission.
    after = { ok: false, error: "no_verifier" };
    verified = false;
  }

  const ok = performed?.ok === true && verified === true;
  recordOutcome({
    root, reclamationId: intent.reclamation_id, ok, after,
    bytesReclaimed: ok ? (after?.bytes_reclaimed ?? bytes ?? null) : 0,
    error: ok ? null : (performed?.error || after?.error || "postcondition_not_verified"),
    detail: performed?.detail || after?.detail || null,
    nowMs,
  });
  return {
    ok,
    reclamation_id: intent.reclamation_id,
    kind, resource_id: String(resourceId), action,
    performed, after,
    bytes_reclaimed: ok ? (after?.bytes_reclaimed ?? bytes ?? 0) : 0,
  };
}

/** Apply the per-kind blast-radius bound to a list of candidates. */
export function boundCandidates(kind, candidates = [], limits = MAX_PER_CYCLE) {
  if (DELEGATED_BOUND_KINDS.includes(kind)) {
    return {
      selected: candidates, deferred: [], limit: "delegated",
      reason: candidates.length ? `bounding is delegated to the ${kind} planner, which recomputes and verifies its own plan` : null,
    };
  }
  const max = limits[kind];
  if (!Number.isFinite(max)) return { selected: [], deferred: candidates, limit: null, reason: `no bound is defined for kind ${kind}; nothing is selected` };
  return {
    selected: candidates.slice(0, max),
    deferred: candidates.slice(max),
    limit: max,
    reason: candidates.length > max ? `bounded to ${max} per cycle; ${candidates.length - max} deferred to the next cycle` : null,
  };
}

/** What the last cycle actually reclaimed, for the scoreboard. */
export function lastCycleSummary(root) {
  const read = readLedger(root);
  if (!read.ok) return null;
  const outcomes = read.records.filter((r) => OUTCOME_PHASES.includes(r.phase));
  if (!outcomes.length) return null;
  const intentsById = new Map(read.records.filter((r) => r.phase === "intended").map((r) => [r.reclamation_id, r]));
  const last = outcomes[outcomes.length - 1];
  const sameDay = outcomes.filter((r) => String(r.at).slice(0, 10) === String(last.at).slice(0, 10));
  return {
    ended_at: last.at,
    reclaimed: sameDay.filter((r) => r.phase === "verified").map((r) => intentsById.get(r.reclamation_id)?.resource_id ?? r.reclamation_id),
    bytes_reclaimed: sameDay.reduce((s, r) => s + (Number(r.bytes_reclaimed) || 0), 0),
    failed: sameDay.filter((r) => r.phase === "failed").map((r) => ({
      resource_key: intentsById.get(r.reclamation_id)?.resource_id ?? r.reclamation_id,
      error: r.error ?? null,
    })),
  };
}

/**
 * Read-only posture for the Steward's status surface. Probes nothing.
 *
 * It lives beside the ledger rather than in the cycle module on purpose: the
 * cycle imports the Steward for cooldown bookkeeping, so a Steward status that
 * imported the cycle would close a loop between the two files. The ledger
 * depends on nobody, so both can read it.
 */
export function hygienePosture(root) {
  try {
    return {
      schema_version: RECLAMATION_SCHEMA,
      last_cycle: lastCycleSummary(root),
      open_reclamations: (openReclamations(root).open || []).length,
      // Deliberately no scoreboard: computing one costs a `du` over a 29 GB
      // estate, and a status call must never do that as a side effect.
      scoreboard_available_via: "vac hygiene --json",
    };
  } catch { return { schema_version: RECLAMATION_SCHEMA, unavailable: true }; }
}
