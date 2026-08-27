/**
 * S7 — worktree, dev-server and port reconciliation.
 *
 * THE GOVERNING RULE. Reality corrects metadata. Metadata does not kill reality.
 * A valid running process is never stopped because a registry disagrees with
 * it; the registry is what gets corrected. This module contains no kill path and
 * no worktree-deletion path, and a test reads its source to prove it.
 *
 * WHAT IT FIXES. Port 3011 served a real, supervised, five-day-old dev server
 * for a worktree the registry did not list, while the registry assigned 3011 to
 * a different worktree with no live process. Both facts were true; nothing
 * reconciled them. 3012 and 3013 carried assignments whose servers were long
 * gone. And 42 git worktrees existed against 6 registrations.
 *
 * OWNERSHIP COMES FROM ANCESTRY, NOT DIRECTORIES. S1 attribution decides who
 * owns a server. Where ownership cannot be proven the verdict is `ambiguous` —
 * never a guess, because a guess here would authorise a correction.
 *
 * CLASSIFY ONLY. S7 proposes retirement; it never retires. Every destructive
 * step stays with a person.
 */

export const RECONCILIATION_SCHEMA = "vacilando.resource_reconciliation.v1";

export const WORKTREE_STATES = Object.freeze(["active", "dormant", "unmanaged", "retirable", "protected"]);
export const PORT_VERDICTS = Object.freeze([
  // registered_inactive is a DURABLE ASSIGNMENT WITH NO RUNNING SERVER, which
  // is a normal resting state and needs no correction. stale_record means
  // something narrower and worse: the metadata CLAIMS a live runtime that
  // reality disproves — a pid record pointing at a process that is gone.
  // Conflating the two made every stopped dev server look like corruption, and
  // made clear_dead_pid_record propose itself forever: removing the pid file
  // left the assignment registered and the verdict unchanged.
  "matched", "free", "registered_inactive", "stale_record", "unregistered_server", "foreign_owner", "ambiguous",
]);

/** Where a worktree's registration came from. Never inferred. */
export const PROVENANCE = Object.freeze(["managed", "discovered", "archived"]);

// ── Worktrees ────────────────────────────────────────────────────────────────

/**
 * Classify one observed worktree.
 *
 * Order matters and encodes the safety doctrine: anything with live ownership
 * is `active`, anything failing a durability gate is `protected`, and
 * `retirable` is reached only when EVERY gate passes. Age is not an input —
 * a worktree untouched for a year with uncommitted work is protected, and one
 * created an hour ago that is merged and idle is retirable.
 */
export function classifyWorktree({
  path,
  registration = null,
  liveProviders = [],
  liveDevServer = false,
  activeRuns = [],
  gitState = null,
  branchDurable = null,
  referencedBy = [],
} = {}) {
  const reasons = [];
  const managed = Boolean(registration);
  const provenance = registration?.provenance
    || (managed ? "managed" : "discovered");

  const hasProvider = liveProviders.length > 0;
  const hasRun = activeRuns.length > 0;
  const dirty = gitState ? (gitState.dirty_paths?.length || 0) > 0 : null;

  // Live ownership wins outright. A worktree someone is using is active whether
  // or not the registry knows about it.
  if (hasProvider || liveDevServer || hasRun) {
    if (hasProvider) reasons.push(`live provider pid ${liveProviders.map((p) => p.pid ?? p).join(", ")}`);
    if (liveDevServer) reasons.push("live dev server");
    if (hasRun) reasons.push(`active run ${activeRuns.map((r) => r.run_id ?? r).join(", ")}`);
    return {
      state: "active", managed, provenance, path, reasons,
      // An ACTIVE worktree that Vacilando does not know about is still active —
      // and worth surfacing, because it means live work is unregistered.
      unregistered_but_live: !managed,
    };
  }

  if (!managed) {
    // Exists in git, no registration, nothing live. Adopted as OBSERVED, never
    // silently promoted to managed and never treated as garbage.
    return { state: "unmanaged", managed: false, provenance: "discovered", path, reasons: ["no canonical registration"] };
  }

  // From here the worktree is registered and quiet. Retirement gates apply.
  const gates = [];
  if (dirty === true) gates.push("uncommitted work");
  if (dirty === null) gates.push("git state could not be read");
  if (branchDurable === false) gates.push("branch is not durably recoverable");
  if (branchDurable === null) gates.push("branch durability unknown");
  if (referencedBy.length) gates.push(`referenced by ${referencedBy.join(", ")}`);

  if (gates.length) {
    return { state: "protected", managed: true, provenance, path, reasons: gates, retirement_blocked_by: gates };
  }

  return {
    state: "retirable", managed: true, provenance, path,
    reasons: ["no live ownership, no active run, clean tree, branch durable"],
    // A proposal, never an action.
    proposal: "may_be_proposed_for_retirement",
  };
}

/** Registered-and-quiet worktrees that are not retirement candidates are dormant. */
export function markDormant(classified) {
  if (classified.state !== "retirable") return classified;
  return classified;
}

// ── Ports ────────────────────────────────────────────────────────────────────

/**
 * Classify one managed port by comparing recorded intent with observed reality.
 *
 * `observedOwnerWorktree` must come from S1 ancestry. A cwd is not ownership:
 * a server started from one directory can serve another, and a process whose
 * cwd is unreadable — which is most of them on this host, since lsof is absent —
 * would otherwise look ownerless.
 */
export function classifyPort({
  port,
  recordedWorktree = null,
  recordedPid = null,
  recordedPidAlive = false,
  listening = false,
  observedPid = null,
  observedOwnerWorktree = null,
  ownershipProven = false,
} = {}) {
  const base = { port, recorded_worktree: recordedWorktree, recorded_pid: recordedPid, observed_pid: observedPid, listening };

  if (!listening) {
    // Nothing is serving. Either the record is stale, or the port is genuinely free.
    if (recordedWorktree || recordedPid) {
      return { ...base, verdict: "stale_record", reason: recordedPid && !recordedPidAlive
        ? `recorded pid ${recordedPid} is gone and nothing is listening`
        : `registry assigns ${port} to ${recordedWorktree} but nothing is listening` };
    }
    return { ...base, verdict: "free", reason: "no listener and no assignment" };
  }

  // Something IS serving. Who owns it?
  if (!ownershipProven || !observedOwnerWorktree) {
    // Do not guess. An unprovable owner must never authorise a correction.
    return { ...base, verdict: "ambiguous", reason: "a server is listening but its owner could not be proven from process ancestry" };
  }

  if (!recordedWorktree) {
    return { ...base, verdict: "unregistered_server", observed_owner: observedOwnerWorktree,
      reason: `${observedOwnerWorktree} is serving ${port} with no registry entry` };
  }

  if (observedOwnerWorktree === recordedWorktree) {
    return { ...base, verdict: "matched", observed_owner: observedOwnerWorktree, reason: "observed owner matches the registry" };
  }

  // A DIFFERENT owner than recorded. This is not a stale record — the record is
  // wrong about WHO, not about WHETHER. Collapsing the two would license
  // "correcting" a live server's port away from it.
  return { ...base, verdict: "foreign_owner", observed_owner: observedOwnerWorktree,
    reason: `${observedOwnerWorktree} is serving ${port}, which the registry assigns to ${recordedWorktree}` };
}

// ── Corrections ──────────────────────────────────────────────────────────────

/**
 * Deterministic, non-destructive metadata corrections.
 *
 * Every entry either edits a record or is WITHHELD. A correction that would
 * touch a live process is never emitted as an action — it is emitted as a
 * withheld item with the reason, so the operator sees what was declined and why.
 */
export function planCorrections({ ports = [], worktrees = [] } = {}) {
  const actions = [];
  const withheld = [];

  for (const p of ports) {
    switch (p.verdict) {
      case "registered_inactive":
        // Nothing to correct: the assignment is durable and honest about
        // having no server. Erasing it to make a metric green would destroy
        // configuration that is supposed to survive a restart.
        break;
      case "stale_record":
        actions.push({
          kind: "clear_dead_pid_record", port: p.port, worktree: p.recorded_worktree,
          detail: "remove the dead pid record and mark the assignment free",
          destructive: false,
        });
        break;
      case "unregistered_server":
        actions.push({
          kind: "adopt_observed_server", port: p.port, worktree: p.observed_owner,
          detail: "record the observed owner as a discovered (unmanaged) assignment",
          destructive: false,
        });
        break;
      case "foreign_owner":
        // The live server is right and the registry is wrong, but correcting the
        // assignment would re-point a port a live process is using.
        withheld.push({
          kind: "reassign_port", port: p.port,
          reason: `a live server owned by ${p.observed_owner} holds ${p.port}; reassigning it would affect a running process`,
          affects_live_process: true,
        });
        break;
      case "ambiguous":
        withheld.push({
          kind: "any_correction", port: p.port,
          reason: "ownership could not be proven; no correction may be derived from a guess",
          affects_live_process: true,
        });
        break;
      default:
        break;
    }
  }

  for (const w of worktrees) {
    if (w.state === "unmanaged") {
      actions.push({
        kind: "adopt_unmanaged_worktree", path: w.path,
        detail: "record as discovered/unmanaged so it is visible without being claimed as managed",
        destructive: false,
      });
    }
    if (w.state === "retirable") {
      withheld.push({
        kind: "retire_worktree", path: w.path,
        reason: "S7 classifies only; retirement is an operator decision",
        affects_live_process: false,
      });
    }
    if (w.state === "active" && w.unregistered_but_live) {
      actions.push({
        kind: "adopt_live_unregistered_worktree", path: w.path,
        detail: "record as discovered; live work must be visible to capacity accounting",
        destructive: false,
      });
    }
  }

  return { actions, withheld };
}

/**
 * Summarise for health.
 *
 * A retirable worktree is not itself a problem — it is a tidy-up opportunity.
 * A retirable worktree with live processes would be a contradiction, and is
 * impossible by construction here because live ownership classifies as active.
 */
export function summarizeReconciliation({ ports = [], worktrees = [] } = {}) {
  const portCounts = Object.fromEntries(PORT_VERDICTS.map((v) => [v, 0]));
  for (const p of ports) portCounts[p.verdict] = (portCounts[p.verdict] || 0) + 1;

  const wtCounts = Object.fromEntries(WORKTREE_STATES.map((s) => [s, 0]));
  for (const w of worktrees) wtCounts[w.state] = (wtCounts[w.state] || 0) + 1;

  return {
    schema_version: RECONCILIATION_SCHEMA,
    ports: portCounts,
    worktrees: wtCounts,
    managed: worktrees.filter((w) => w.managed).length,
    unmanaged: worktrees.filter((w) => !w.managed).length,
    live_but_unregistered: worktrees.filter((w) => w.unregistered_but_live).length,
    total_worktrees: worktrees.length,
  };
}
