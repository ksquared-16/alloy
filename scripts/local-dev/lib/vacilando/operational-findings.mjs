/**
 * Operational findings — the canonical durable owner.
 *
 * WHAT THIS IS FOR. Vacilando keeps rediscovering the same operational problems
 * and re-deciding what to do about them, because what it learned lived in a
 * conversation that ended. A finding is the durable form of that knowledge: one
 * underlying problem, its evidence, and what happened to it.
 *
 * NOT A TICKET SYSTEM. A ticket is work someone intends to do. A finding is a
 * fact about how the system behaves, which may or may not deserve work. The
 * distinction matters because a ticket queue grows until someone grooms it,
 * while findings should shrink on their own as conditions disappear.
 *
 * COMPOSED, NOT INVENTED. A store already existed at
 * vacilando/operational-findings/findings.json with 22 hand-written findings
 * carrying real root causes, mitigations and promoted SHAs — and no module
 * referenced it. This is that store's owner. The existing records are migrated
 * in place and none is discarded: their `classification` becomes the category
 * vocabulary, and the fields the lifecycle needs are defaulted rather than
 * demanded retroactively.
 *
 * FINDINGS DO NOT OWN TRUTH. A finding never decides whether a lane, run or
 * process exists. It consumes canonical evidence from the owners that do, and
 * records what that evidence meant. Nothing here may become a second lane
 * registry, run registry, health system or scheduler.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { assertResettableRoot } from "./development-lane.mjs";

export const OPERATIONAL_FINDINGS_SCHEMA = "vacilando.operational_findings.v1";

/**
 * Lifecycle.
 *
 * CLOSED is deliberately not reachable by editing code. A finding is closed by
 * EVIDENCE that the condition is gone — a certification, a live measurement, a
 * promoted SHA plus a verification. "We fixed it" is FIXED; "we proved it" is
 * CLOSED. The gap between those two is where regressions live.
 *
 * ACCEPTED_DEBT is a decision, not a shrug: the problem is real, understood, and
 * deliberately not being fixed now. It stays visible and stops interrupting.
 */
export const FINDING_STATUSES = Object.freeze(["OPEN", "MITIGATED", "FIXED", "CLOSED", "ACCEPTED_DEBT"]);
export const TERMINAL_FINDING_STATUSES = Object.freeze(["CLOSED", "ACCEPTED_DEBT"]);

/** Categories, taken from the vocabulary the existing corpus already used. */
export const FINDING_CATEGORIES = Object.freeze([
  "defect", "design_gap", "observability_gap", "hardening_debt", "operator_friction",
]);

/**
 * Severity is CONSEQUENCE, not annoyance and not frequency.
 *
 * A daily irritation is not severe; a rare event that loses data is. Frequency
 * belongs in `occurrences`, where it can inform priority without inflating
 * severity — the two were conflated in earlier operational notes and it made
 * the loudest problem look like the worst one.
 */
export const FINDING_SEVERITIES = Object.freeze([
  "control_plane",      // safety, data loss, or the control plane itself at risk
  "blocks_work",        // authorized work cannot proceed
  "degrades",           // reduced reliability or trustworthiness of a signal
  "debt",               // hygiene and accumulation
  "opportunity",        // improvement, not a gap
]);
const SEVERITY_RANK = Object.freeze(Object.fromEntries(FINDING_SEVERITIES.map((s, i) => [s, i])));

/** Severities that may constrain what the planner is willing to do. */
export const CONSTRAINING_SEVERITIES = Object.freeze(["control_plane", "blocks_work"]);

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim() || join(homedir(), ".local", "state", "alloy-dev");
}

export function findingsStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "operational-findings", "findings.json");
}

function emptyStore() {
  return { schema_version: OPERATIONAL_FINDINGS_SCHEMA, findings: [] };
}

/**
 * ABSENT AND UNREADABLE ARE DIFFERENT ANSWERS.
 *
 * The Capacity V2 lesson, applied from the start rather than after an incident:
 * a missing file is legitimately empty, and a file that exists but cannot be
 * parsed is a fact we do not have. Mutations refuse rather than overwrite it.
 */
export function readFindingsStoreGuarded(root = runtimeRoot()) {
  const path = findingsStorePath(root);
  if (!existsSync(path)) return { ok: true, store: emptyStore(), absent: true };
  let text;
  try { text = readFileSync(path, "utf8"); }
  catch (e) { return { ok: false, error: "findings_store_unreadable", detail: e?.message || String(e), store: emptyStore() }; }
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.findings)) {
      return { ok: false, error: "findings_store_malformed", detail: "findings must be an array", store: emptyStore() };
    }
    return { ok: true, store: { schema_version: OPERATIONAL_FINDINGS_SCHEMA, findings: raw.findings.map(migrate) } };
  } catch (e) {
    return { ok: false, error: "findings_store_malformed", detail: e?.message || String(e), store: emptyStore() };
  }
}

/** Lenient read for surfaces; a dashboard should render empty, not throw. */
export function listFindings(root = runtimeRoot()) {
  return readFindingsStoreGuarded(root).store.findings;
}

export function getFinding(id, root = runtimeRoot()) {
  return listFindings(root).find((f) => f.id === String(id || "")) || null;
}

/**
 * Bring a legacy record up to the current shape WITHOUT inventing history.
 *
 * Severity is not guessed from prose — an unclassified finding is `degrades`,
 * the middle of the scale, and says so via `severity_source`. Pretending to know
 * the consequence of a record written before the model existed would put false
 * confidence into exactly the field the planner keys on.
 */
function migrate(raw) {
  const f = { ...raw };
  f.id = String(f.id || "");
  f.status = normalizeStatus(f.status);
  f.category = FINDING_CATEGORIES.includes(f.category) ? f.category
    : (FINDING_CATEGORIES.includes(f.classification) ? f.classification : "defect");
  if (!FINDING_SEVERITIES.includes(f.severity)) {
    f.severity = "degrades";
    f.severity_source = f.severity_source || "defaulted_on_migration";
  }
  f.occurrences = Number.isFinite(f.occurrences) ? f.occurrences : 1;
  f.evidence = Array.isArray(f.evidence) ? f.evidence : [];
  f.affected = Array.isArray(f.affected) ? f.affected : [];
  f.related = Array.isArray(f.related) ? f.related : [];
  f.title = f.title || f.observed?.split(/[.\n]/)[0]?.slice(0, 90) || f.id;
  f.owner = f.owner || null;
  f.permanent_fix = f.permanent_fix ?? null;
  f.closure_evidence = f.closure_evidence ?? null;
  f.regressed_at = f.regressed_at ?? null;
  return f;
}

function normalizeStatus(s) {
  const v = String(s || "OPEN").toUpperCase();
  return FINDING_STATUSES.includes(v) ? v : "OPEN";
}

function writeStore(store, root) {
  const path = findingsStorePath(root);
  // Never overwrite a store we could not read, and keep one generation behind.
  const current = readFindingsStoreGuarded(root);
  if (!current.ok) return { ok: false, error: current.error };
  try { if (existsSync(path)) copyFileSync(path, `${path}.prev`); } catch { /* backup must never block the write */ }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  return { ok: true };
}

/**
 * IDENTITY IS THE ROOT CAUSE, NOT THE SYMPTOM.
 *
 * Five stale-run symptoms from one reconciliation defect are one finding; two
 * unrelated defects in the same subsystem are two. So identity is derived from
 * (subsystem, key) where the caller supplies a key describing the CAUSE it
 * believes it is looking at — deterministic, so the same cause observed next
 * week lands on the same record, and explicit, so a caller cannot accidentally
 * merge distinct causes by writing a vague symptom string.
 */
export function findingId({ subsystem, key }) {
  const s = slug(subsystem), k = slug(key);
  if (!s || !k) return null;
  return `${s}-${k}`;
}

function slug(v) {
  return String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function today(nowMs) {
  return new Date(nowMs ?? Date.now()).toISOString().slice(0, 10);
}

/**
 * Record an observation of an underlying problem.
 *
 * Repeated observation UPDATES: it extends `last_seen`, increments
 * `occurrences` and appends bounded evidence. It never multiplies records, and
 * it never silently changes a finding's meaning — `root_cause` and `severity`
 * are only set when absent, because a later observation is weaker evidence than
 * the analysis that first characterised the problem.
 *
 * A finding already CLOSED that is observed again is a REGRESSION, and says so
 * rather than quietly reopening as if nothing had been certified.
 */
export function recordObservation({
  id: explicitId = null,
  subsystem, key, title = null, observed = null, impact = null, root_cause = null,
  category = null, severity = null, affected = [], evidence = null, owner = null,
  nowMs = Date.now(), root = runtimeRoot(),
} = {}) {
  /*
   * AN EXPLICIT ID TARGETS AN EXISTING FINDING.
   *
   * Derived identity is right for new observations, but the store predates this
   * module and its 22 records carry hand-written ids that do not follow the
   * (subsystem, key) scheme — `supervisor-without-scheduler`, not
   * `dev-server-supervisor-without-scheduler`. Without a way to name a finding
   * directly, an observation of one of those causes creates a DUPLICATE, which
   * is the exact failure this system exists to prevent. Seeding this store hit
   * that immediately and produced two.
   */
  const id = explicitId ? String(explicitId) : findingId({ subsystem, key });
  if (!id) return { ok: false, error: "identity_required", detail: "supply an id, or both subsystem and key" };
  const read = readFindingsStoreGuarded(root);
  if (!read.ok) return { ok: false, error: read.error };
  const store = read.store;
  const existing = store.findings.find((f) => f.id === id);
  const stamp = today(nowMs);

  if (existing) {
    existing.last_seen = stamp;
    existing.occurrences = (Number(existing.occurrences) || 0) + 1;
    if (evidence) existing.evidence = [...existing.evidence, { at: stamp, note: String(evidence).slice(0, 400) }].slice(-20);
    for (const [k, v] of Object.entries({ root_cause, impact, owner })) {
      if (v && !existing[k]) existing[k] = v;
    }
    if (Array.isArray(affected) && affected.length) {
      existing.affected = [...new Set([...existing.affected, ...affected])].slice(0, 40);
    }
    let regressed = false;
    if (existing.status === "CLOSED") {
      existing.status = "OPEN";
      existing.regressed_at = stamp;
      regressed = true;
    }
    const w = writeStore(store, root);
    return w.ok ? { ok: true, id, created: false, regressed, finding: existing } : { ok: false, error: w.error };
  }

  const finding = migrate({
    id, subsystem: String(subsystem), first_seen: stamp, last_seen: stamp,
    title: title || key, observed, impact, root_cause,
    category: FINDING_CATEGORIES.includes(category) ? category : "defect",
    severity: FINDING_SEVERITIES.includes(severity) ? severity : undefined,
    severity_source: FINDING_SEVERITIES.includes(severity) ? "declared" : undefined,
    status: "OPEN", occurrences: 1, owner,
    affected: Array.isArray(affected) ? affected : [],
    evidence: evidence ? [{ at: stamp, note: String(evidence).slice(0, 400) }] : [],
  });
  store.findings.push(finding);
  const w = writeStore(store, root);
  return w.ok ? { ok: true, id, created: true, regressed: false, finding } : { ok: false, error: w.error };
}

/**
 * Move a finding through its lifecycle.
 *
 * CLOSED REQUIRES EVIDENCE. Code changing is FIXED. Closing asserts the
 * condition is gone, which is a claim about the running system, so it must
 * carry something that could be checked later: a certification, a measurement,
 * a promoted SHA with a verification. Without it this refuses rather than
 * recording an unfalsifiable claim.
 */
export function transitionFinding(id, toStatus, {
  closure_evidence = null, permanent_fix = null, promoted_sha = null,
  mitigation = null, note = null, nowMs = Date.now(), root = runtimeRoot(),
} = {}) {
  const to = normalizeStatus(toStatus);
  if (!FINDING_STATUSES.includes(String(toStatus || "").toUpperCase())) {
    return { ok: false, error: "invalid_status", detail: String(toStatus) };
  }
  const read = readFindingsStoreGuarded(root);
  if (!read.ok) return { ok: false, error: read.error };
  const f = read.store.findings.find((x) => x.id === String(id || ""));
  if (!f) return { ok: false, error: "finding_not_found", detail: String(id) };

  if (to === "CLOSED" && !(closure_evidence || f.closure_evidence)) {
    return {
      ok: false,
      error: "closure_evidence_required",
      detail: "CLOSED asserts the condition is gone; that is a claim about the running system and needs evidence a later reader could check",
    };
  }
  f.status = to;
  f.last_seen = today(nowMs);
  if (closure_evidence) f.closure_evidence = String(closure_evidence).slice(0, 600);
  if (permanent_fix) f.permanent_fix = String(permanent_fix).slice(0, 600);
  if (promoted_sha) f.promoted_sha = String(promoted_sha);
  if (mitigation) f.mitigation = String(mitigation).slice(0, 600);
  if (note) f.evidence = [...f.evidence, { at: today(nowMs), note: String(note).slice(0, 400) }].slice(-20);
  const w = writeStore(read.store, root);
  return w.ok ? { ok: true, finding: f } : { ok: false, error: w.error };
}

/**
 * Fold a duplicate into the finding it should always have been.
 *
 * Evidence and occurrences are additive — the duplicate's observations really
 * did happen — while the surviving record keeps its own characterisation. The
 * duplicate is removed rather than tombstoned, because a finding store that
 * accumulates markers for its own mistakes becomes the inbox this is meant to
 * replace.
 */
export function mergeFindings(duplicateId, intoId, { root = runtimeRoot() } = {}) {
  const read = readFindingsStoreGuarded(root);
  if (!read.ok) return { ok: false, error: read.error };
  const dup = read.store.findings.find((f) => f.id === String(duplicateId));
  const keep = read.store.findings.find((f) => f.id === String(intoId));
  if (!dup || !keep) return { ok: false, error: "finding_not_found" };
  if (dup.id === keep.id) return { ok: false, error: "cannot_merge_into_itself" };
  keep.evidence = [...keep.evidence, ...dup.evidence].slice(-20);
  keep.occurrences = (Number(keep.occurrences) || 0) + (Number(dup.occurrences) || 0);
  keep.affected = [...new Set([...keep.affected, ...dup.affected])].slice(0, 40);
  keep.related = [...new Set([...keep.related, ...dup.related])];
  if (dup.last_seen > keep.last_seen) keep.last_seen = dup.last_seen;
  if (dup.first_seen < keep.first_seen) keep.first_seen = dup.first_seen;
  read.store.findings = read.store.findings.filter((f) => f.id !== dup.id);
  const w = writeStore(read.store, root);
  return w.ok ? { ok: true, merged_into: keep.id, finding: keep } : { ok: false, error: w.error };
}

/**
 * The Steward's read-only view.
 *
 * The Steward consumes this and never writes findings, so findings cannot
 * become a second source of operational truth. Every question the Steward needs
 * is answered here as data, not as a decision.
 */
export function findingsForSteward(root = runtimeRoot()) {
  const all = listFindings(root);
  /*
   * "AFFECTING OPERATION" MEANS THE CONDITION IS STILL LIVE.
   *
   * OPEN and MITIGATED qualify: the problem is present, worked around at best.
   * FIXED does not — the repair is believed done and merely uncertified, so
   * listing it here would tell the Steward that everything ever repaired is
   * still hurting it. That is the difference between a useful signal and a
   * changelog. FIXED gets its own bucket, because "what should I verify" is a
   * real question the Steward can act on.
   */
  const affecting = all.filter((f) => f.status === "OPEN" || f.status === "MITIGATED");
  const live = all.filter((f) => !TERMINAL_FINDING_STATUSES.includes(f.status));
  const constraining = affecting.filter((f) => CONSTRAINING_SEVERITIES.includes(f.severity));
  return {
    schema_version: "vacilando.findings_steward_view.v1",
    total: all.length,
    counts: Object.fromEntries(FINDING_STATUSES.map((s) => [s, all.filter((f) => f.status === s).length])),
    affecting_operation: affecting.map((f) => f.id),
    awaiting_certification: all.filter((f) => f.status === "FIXED").map((f) => f.id),
    constraining_planning: constraining.map((f) => ({ id: f.id, severity: f.severity, affected: f.affected })),
    needs_director: all.filter((f) => directorObligation(f)).map((f) => f.id),
    regressed: all.filter((f) => f.regressed_at).map((f) => f.id),
    accepted_debt: all.filter((f) => f.status === "ACCEPTED_DEBT").map((f) => f.id),
  };
}

/**
 * Does this finding place an obligation on the Director?
 *
 * Deliberately narrow. An OPEN finding is not an obligation — it is a fact the
 * system has recorded and can often act on itself. The Director is owed
 * attention when consequence is high and the system cannot proceed alone, which
 * is the difference between a scoreboard and an inbox.
 */
export function directorObligation(f) {
  if (!f || TERMINAL_FINDING_STATUSES.includes(f.status)) return false;
  if (f.regressed_at) return true;                       // something certified came back
  if (f.status === "FIXED") return false;                // repaired; verification is the system's job                       // something certified came back
  return f.severity === "control_plane" || f.severity === "blocks_work";
}

/** Map findings onto the accepted Director attention vocabulary. */
export function directorAttention(root = runtimeRoot()) {
  const items = listFindings(root).filter(directorObligation);
  return items.map((f) => ({
    id: f.id,
    class: f.regressed_at ? "ATTENTION" : (f.severity === "control_plane" ? "STUCK" : "ATTENTION"),
    title: f.title,
    reason: f.regressed_at ? "a finding that was certified closed has recurred" : `severity ${f.severity}`,
  }));
}

export function summarizeFindings(root = runtimeRoot()) {
  const all = listFindings(root);
  const live = all.filter((f) => !TERMINAL_FINDING_STATUSES.includes(f.status));
  return {
    total: all.length,
    by_status: Object.fromEntries(FINDING_STATUSES.map((s) => [s, all.filter((f) => f.status === s).length])),
    by_severity: Object.fromEntries(FINDING_SEVERITIES.map((s) => [s, all.filter((f) => f.severity === s).length])),
    constraining: live.filter((f) => CONSTRAINING_SEVERITIES.includes(f.severity)).length,
    needs_director: all.filter(directorObligation).length,
    highest_live_severity: live.length
      ? FINDING_SEVERITIES[Math.min(...live.map((f) => SEVERITY_RANK[f.severity] ?? 2))]
      : null,
  };
}

/** Test reset. Refuses the live gateway root, exactly as the run and lane stores do. */
export function resetFindingsForTests(root = runtimeRoot()) {
  assertResettableRoot(root, "operational findings store");
  writeStore(emptyStore(), root);
}
