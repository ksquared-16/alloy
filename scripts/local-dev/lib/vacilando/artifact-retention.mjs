/**
 * Artifact retention — what an artefact is FOR, and what that obliges.
 *
 * WHY THIS OWNER DID NOT EXIST. Worktrees have a retirement classifier and the
 * toolkit has a retention policy, but every other thing Vacilando writes to
 * disk — logs, browser profiles, certification bundles, evidence blobs, audit
 * ledgers — had no owner at all. The result was not a disk problem: 205 MB of
 * runtime state is nothing. The result was that nobody could answer "may this
 * be removed?" without opening the file and guessing, and a guess about a
 * 37 MB authoritative audit ledger is the one guess that must never be made.
 *
 * THE RULE THAT SHAPES EVERYTHING HERE. Classification comes from a DECLARED
 * relationship — a state family, a certification obligation, a known writer —
 * never from a filename and never from an mtime. `*.log` does not mean
 * diagnostic; `2026-09-01` does not mean stale. A path this module cannot tie
 * to a declaration is UNKNOWN, and UNKNOWN is preserved.
 *
 * WHERE THE AUTHORITY COMES FROM. `durable-state.mjs` already declares every
 * Vacilando state family and its class. That is the existing owner of "what is
 * this file", and this module READS it rather than restating it. A family added
 * there is classified here automatically; a family removed there stops being
 * silently protected here. One declaration, two consumers.
 */
import { STATE_FAMILIES } from "./durable-state.mjs";

export const ARTIFACT_RETENTION_SCHEMA = "vacilando.artifact_retention.v1";

/**
 * Retention classes.
 *
 * LIVE_STATE is the seventh, and it is not padding. The runtime holds files
 * that are neither evidence nor disposable: `api-token` is a secret the Gateway
 * authenticates with, `node.json` is this host's identity. Calling those
 * "durable evidence" would be false, and leaving them to fall through to
 * UNKNOWN would bury a real answer under a fail-closed one. They have an owner;
 * it is simply not this module.
 */
export const RETENTION_CLASSES = Object.freeze([
  "DURABLE_EVIDENCE",
  "ROLLBACK_SUPPORT",
  "RECENT_DIAGNOSTIC",
  "TRANSIENT_QA",
  "SCRATCH",
  "LIVE_STATE",
  "UNKNOWN",
]);

/** Classes an automatic cycle may ever reclaim, given every other condition holds. */
export const RECLAIMABLE_CLASSES = Object.freeze(["RECENT_DIAGNOSTIC", "TRANSIENT_QA", "SCRATCH"]);

/**
 * Retention windows, in milliseconds.
 *
 * A window is a NECESSARY condition, never a sufficient one. Nothing is removed
 * because it aged out; something already proven unreferenced and reclaimable may
 * be removed once it has also aged out. Inverting those two is the whole of
 * "age is not deletion authority".
 */
export const RETENTION_WINDOWS_MS = Object.freeze({
  DURABLE_EVIDENCE: null,      // no window: an obligation ends when it is discharged, not when it is old
  ROLLBACK_SUPPORT: null,      // held while referenced; the reference is the window
  RECENT_DIAGNOSTIC: 14 * 24 * 60 * 60_000,
  TRANSIENT_QA: 3 * 24 * 60 * 60_000,
  SCRATCH: 24 * 60 * 60_000,
  LIVE_STATE: null,
  UNKNOWN: null,
});

/**
 * Declared rules, most specific first.
 *
 * `requires` names the evidence a caller must supply before the rule may be
 * applied at all. A rule whose evidence is missing does not degrade to a
 * permissive answer — it degrades to UNKNOWN, and the missing key is reported.
 */
export const RETENTION_RULES = Object.freeze([
  {
    id: "capacity_certification_evidence",
    match: /^vacilando\/capacity-cert(\/|$)/,
    class: "DURABLE_EVIDENCE",
    why: "certification evidence supporting the accepted Capacity V2 baseline",
    requires: [],
  },
  {
    id: "capacity_experiment_ledger",
    match: /^vacilando\/capacity-experiment(\/|$)/,
    class: "DURABLE_EVIDENCE",
    why: "provider-ceiling changes are an audit ledger, not experiment debris",
    requires: [],
  },
  {
    id: "operational_findings",
    match: /^vacilando\/operational-findings(\/|$)/,
    class: "DURABLE_EVIDENCE",
    why: "findings carry the closure evidence a CLOSED status depends on",
    requires: [],
  },
  {
    id: "evidence_store",
    match: /^(vacilando\/)?evidence(\/|$)/,
    class: "DURABLE_EVIDENCE",
    why: "the evidence store backs certification and incident claims; durable-state calls it reconstructible for BACKUP purposes, which is not the same as disposable",
    requires: [],
  },
  {
    id: "reclamation_ledger",
    match: /^vacilando\/hygiene(\/|$)/,
    class: "DURABLE_EVIDENCE",
    why: "the reclamation ledger is the audit trail for everything hygiene has removed, and is what an interrupted cycle is reconciled against",
    requires: [],
  },
  {
    id: "durable_backups",
    match: /^backups(\/|$)/,
    class: "ROLLBACK_SUPPORT",
    why: "durable-state backups; retention is already owned by pruneBackups",
    requires: [],
  },
  {
    id: "session_and_server_logs",
    match: /^logs\/[^/]+\.log$/,
    class: "RECENT_DIAGNOSTIC",
    // Measured, not assumed: alloy-dev-supervise reads these with `tail -50`
    // and `tail -3`. No reader in the toolkit consumes a full history, so the
    // head of a 26 MB log supports nothing.
    why: "dev-server and session logs; every known reader consumes the tail only",
    requires: ["writer_live"],
  },
  {
    id: "browser_profiles",
    match: /^browser-profiles(\/|$)/,
    class: "TRANSIENT_QA",
    why: "managed browser session profiles, reproduced by the canonical restore path",
    requires: ["active_session_refs"],
  },
  {
    id: "playwright_output",
    match: /(^|\/)(playwright\/artifacts|playwright-report|test-results)(\/|$)/,
    class: "TRANSIENT_QA",
    why: "browser test output with no durable audit obligation of its own",
    requires: ["active_session_refs"],
  },
  {
    id: "validate_results",
    match: /^validate-results(\/|$)/,
    class: "RECENT_DIAGNOSTIC",
    why: "validation broker results; consumed by the run that requested them",
    requires: ["active_run_refs"],
  },
]);

/** Root-relative paths declared by durable-state, with their declared class. */
export function declaredStatePaths(families = STATE_FAMILIES) {
  const out = new Map();
  for (const fam of families) {
    for (const p of fam.paths || []) {
      // Families are declared relative to the `vacilando/` state directory.
      out.set(`vacilando/${String(p).replace(/^\/+/, "")}`, { family: fam.id, state_class: fam.class });
    }
  }
  return out;
}

/**
 * The class a declared state family implies.
 *
 * AUTHORITATIVE is evidence. EPHEMERAL and RECONSTRUCTABLE are NOT disposable —
 * "not backed up" is a statement about the backup unit, not a licence. They are
 * live state with an owner that is not this module.
 */
export function classForStateFamily(stateClass) {
  if (stateClass === "AUTHORITATIVE") return "DURABLE_EVIDENCE";
  return "LIVE_STATE";
}

const EVIDENCE_KEYS = Object.freeze(["writer_live", "active_session_refs", "active_run_refs"]);

/**
 * Classify one root-relative path.
 *
 * `evidence` supplies the measured facts a rule requires. A required key that is
 * absent or null is NOT MEASURED, and an unmeasured requirement returns UNKNOWN
 * with the key named — the same contract the worktree gates use, for the same
 * reason.
 */
export function classifyArtifactPath({
  relPath = null,
  evidence = null,
  families = STATE_FAMILIES,
  rules = RETENTION_RULES,
  now = Date.now(),
  mtimeMs = null,
  bytes = null,
} = {}) {
  const rel = String(relPath || "").replace(/^\.?\/+/, "").replace(/\/+$/, "");
  if (!rel) {
    return unknown({ rel: relPath, why: "no path was supplied", bytes, mtimeMs });
  }

  // A declared state family wins over every pattern. The declaration is the
  // strongest evidence available and it lives in another owner's file.
  //
  // BOTH DIRECTIONS MATTER. A path INSIDE a declared family is that family's.
  // A path that CONTAINS one is the directory the family lives in — and it read
  // UNKNOWN until this was fixed, so the 27 MB directory holding the
  // authoritative execution-run store was classified as an unrecognised blob.
  // Preserved either way, but for the wrong reason, and a scoreboard full of
  // spurious UNKNOWNs is one nobody reads.
  const declared = declaredStatePaths(families);
  let ancestorOf = null;
  for (const [p, meta] of declared) {
    if (rel === p || rel.startsWith(`${p}/`)) {
      const cls = classForStateFamily(meta.state_class);
      return {
        schema_version: ARTIFACT_RETENTION_SCHEMA,
        path: rel,
        retention_class: cls,
        rule: `durable_state:${meta.family}`,
        why: `declared by durable-state as ${meta.state_class} (${meta.family})`,
        window_ms: RETENTION_WINDOWS_MS[cls],
        aged_out: false,
        unmeasured: [],
        reclaimable: false,
        bytes: numOrNull(bytes),
        mtime_ms: numOrNull(mtimeMs),
      };
    }
    if (p.startsWith(`${rel}/`)) {
      // Strictest wins: a directory holding anything AUTHORITATIVE is evidence.
      if (!ancestorOf || (meta.state_class === "AUTHORITATIVE" && ancestorOf.state_class !== "AUTHORITATIVE")) {
        ancestorOf = { ...meta, declared_path: p };
      }
    }
  }
  if (ancestorOf) {
    const cls = classForStateFamily(ancestorOf.state_class);
    return {
      schema_version: ARTIFACT_RETENTION_SCHEMA,
      path: rel,
      retention_class: cls,
      rule: `durable_state_container:${ancestorOf.family}`,
      why: `contains ${ancestorOf.declared_path}, declared by durable-state as ${ancestorOf.state_class} (${ancestorOf.family})`,
      window_ms: RETENTION_WINDOWS_MS[cls],
      aged_out: false,
      unmeasured: [],
      reclaimable: false,
      bytes: numOrNull(bytes),
      mtime_ms: numOrNull(mtimeMs),
    };
  }

  for (const rule of rules) {
    if (!rule.match.test(rel)) continue;
    const unmeasured = (rule.requires || []).filter((k) => {
      if (!EVIDENCE_KEYS.includes(k)) return true;
      return evidence == null || evidence[k] === undefined || evidence[k] === null;
    });
    const cls = rule.class;
    const window = RETENTION_WINDOWS_MS[cls];
    // Age is computed for every class that has a window, and it is reported
    // even when it does not authorise anything — a reader has to be able to see
    // that the window was checked and was not the deciding fact.
    const agedOut = window == null || mtimeMs == null ? false : (now - Number(mtimeMs)) >= window;
    // The second, independent trigger for unrotated logs. See LOG_SIZE_CEILING_BYTES.
    const oversized = cls === "RECENT_DIAGNOSTIC"
      && RECLAIM_MECHANISM[cls] === "truncate_to_tail"
      && numOrNull(bytes) != null
      && Number(bytes) > LOG_SIZE_CEILING_BYTES;

    if (unmeasured.length) {
      return unknown({
        rel, bytes, mtimeMs,
        why: `rule ${rule.id} applies but its required evidence was not measured`,
        unmeasured,
        candidate_rule: rule.id,
        candidate_class: cls,
      });
    }

    // The reclaim conditions, stated positively. Every one must be TRUE; a
    // false or missing value keeps the artefact.
    const blockers = [];
    if (!RECLAIMABLE_CLASSES.includes(cls)) blockers.push(`class ${cls} is never automatically reclaimed`);
    if (window != null && !agedOut && !oversized) {
      blockers.push(oversizedEligible(cls) ? "inside its retention window and under the size ceiling" : "inside its retention window");
    }
    if (evidence?.writer_live === true) blockers.push("a live writer holds this file open");
    if (Array.isArray(evidence?.active_session_refs) && evidence.active_session_refs.length) {
      blockers.push(`referenced by ${evidence.active_session_refs.length} active session(s)`);
    }
    if (Array.isArray(evidence?.active_run_refs) && evidence.active_run_refs.length) {
      blockers.push(`referenced by ${evidence.active_run_refs.length} active run(s)`);
    }
    if (evidence?.retention_hold === true) blockers.push("an explicit retention hold is set");

    return {
      schema_version: ARTIFACT_RETENTION_SCHEMA,
      path: rel,
      retention_class: cls,
      rule: rule.id,
      why: rule.why,
      window_ms: window,
      aged_out: agedOut,
      oversized,
      size_ceiling_bytes: oversizedEligible(cls) ? LOG_SIZE_CEILING_BYTES : null,
      unmeasured: [],
      reclaimable: blockers.length === 0,
      blocked_by: blockers,
      // The mechanism is part of the classification, because "reclaim" means
      // different things to a log and to a profile directory and a caller must
      // not choose.
      mechanism: RECLAIM_MECHANISM[cls] ?? null,
      bytes: numOrNull(bytes),
      mtime_ms: numOrNull(mtimeMs),
    };
  }

  return unknown({ rel, bytes, mtimeMs, why: "no declared state family and no retention rule covers this path" });
}

/**
 * How a class is reclaimed. A log is REWRITTEN to its tail, never deleted: the
 * recent tail is the part anything reads, and deleting the file would also
 * delete the evidence of what a supervisor last saw.
 */
export const RECLAIM_MECHANISM = Object.freeze({
  RECENT_DIAGNOSTIC: "truncate_to_tail",
  TRANSIENT_QA: "remove_directory",
  SCRATCH: "remove_path",
});

/** Bytes of tail preserved when a diagnostic log is reclaimed. */
export const LOG_TAIL_BYTES = 256 * 1024;

/**
 * The size at which an unrotated diagnostic log becomes reclaimable regardless
 * of age.
 *
 * WHY SIZE IS ALLOWED TO TRIGGER THIS AND AGE IS NOT ALLOWED TO TRIGGER A
 * DELETE. These two rules look similar and are not. Deleting an old file
 * destroys the only copy of something on the strength of a date. Truncating an
 * oversized log to its last 256 KB destroys nothing any reader consumes —
 * measured: `alloy-dev-supervise` reads `tail -50` and `tail -3`, and no reader
 * in the toolkit opens a full history. The head of a 26 MB log supports no
 * decision anyone makes.
 *
 * The precondition is still positive proof of no live writer. Rewriting a file
 * an appender holds open is how a log becomes a sparse 26 MB of NULs.
 */
export const LOG_SIZE_CEILING_BYTES = 8 * 1024 * 1024;

function oversizedEligible(cls) {
  return RECLAIM_MECHANISM[cls] === "truncate_to_tail";
}

function unknown({ rel, why, unmeasured = [], bytes = null, mtimeMs = null, candidate_rule = null, candidate_class = null }) {
  return {
    schema_version: ARTIFACT_RETENTION_SCHEMA,
    path: rel ?? null,
    retention_class: "UNKNOWN",
    rule: null,
    why,
    window_ms: null,
    aged_out: false,
    unmeasured,
    reclaimable: false,
    blocked_by: ["classification is UNKNOWN; unknown is preserved"],
    candidate_rule,
    candidate_class,
    bytes: numOrNull(bytes),
    mtime_ms: numOrNull(mtimeMs),
  };
}

function numOrNull(v) {
  // `Number(null)` is 0, and a size we could not read reported as zero bytes is
  // a lie that makes an unmeasured artefact look free to remove.
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Estate rollup by retention class. Bytes we could not read stay uncounted and are reported as such. */
export function summarizeArtifactEstate(classifications = []) {
  const byClass = {};
  let unmeasuredBytes = 0;
  for (const c of classifications) {
    const k = c.retention_class || "UNKNOWN";
    byClass[k] ||= { count: 0, bytes: 0, reclaimable_count: 0, reclaimable_bytes: 0 };
    byClass[k].count += 1;
    if (c.bytes == null) unmeasuredBytes += 1;
    else byClass[k].bytes += c.bytes;
    if (c.reclaimable) {
      byClass[k].reclaimable_count += 1;
      byClass[k].reclaimable_bytes += Number(c.bytes) || 0;
    }
  }
  const total = Object.values(byClass).reduce((s, v) => s + v.bytes, 0);
  const reclaimable = Object.values(byClass).reduce((s, v) => s + v.reclaimable_bytes, 0);
  return {
    schema_version: ARTIFACT_RETENTION_SCHEMA,
    by_class: byClass,
    total_bytes: total,
    reclaimable_bytes: reclaimable,
    entries: classifications.length,
    entries_without_measured_size: unmeasuredBytes,
  };
}
