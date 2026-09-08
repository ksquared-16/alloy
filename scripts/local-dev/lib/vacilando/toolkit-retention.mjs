/**
 * S9 — toolkit retention, explicit pruning, and disk-hygiene visibility.
 *
 * THE PROBLEM IS NOT THE DISK. 74 immutable toolkit versions occupy 637 MB on
 * this host, which is not much. What is wrong is that nothing owns their
 * retirement: the set only ever grows, and no rule says which versions matter.
 * Unbounded accumulation without an owner is the defect; the bytes are a
 * symptom.
 *
 * THE TOOLKIT IS THE RECOVERY PATH. Every alloy-* command on this machine
 * resolves through it, so a wrong deletion is not an inconvenience — it is the
 * loss of the mechanism you would use to recover. Everything here is therefore
 * built to refuse: unknown is protected, plan is the default, execution needs an
 * explicit flag, and a plan that has gone stale is recomputed rather than
 * trusted.
 *
 * AGE IS NOT A REASON. A version is retained because something references it,
 * because policy keeps it for rollback depth, or because we cannot prove it is
 * unreferenced. It is never pruned for being old — the same rule S7 applies to
 * worktrees and S8 applies to provider seats.
 *
 * WHAT `current` CANNOT TELL YOU. The Gateway host on this machine runs
 * `.../toolkit/current/lib/vacilando-gateway-host.mjs` — through the SYMLINK.
 * Its command line names no version at all, and `current` has already moved
 * since it started. Reading safety off `current` would therefore mark the
 * running Gateway's own image prunable. Pins are resolved from the process
 * table, through descendants where a parent went in by symlink, and a pin that
 * still cannot be resolved BLOCKS execution rather than being assumed away.
 *
 * NOTHING HERE DELETES. This module computes inventory, protection and plans.
 * `executePrune` performs removal only through an injected remover, only on a
 * freshly recomputed plan, and only when the caller passes explicit consent.
 */
import { createHash } from "node:crypto";

export const TOOLKIT_RETENTION_SCHEMA = "vacilando.toolkit_retention.v1";

/**
 * V2 retention policy.
 *
 * WHAT CHANGED AND WHY, MEASURED. V1 kept the 10 most recent superseded
 * versions. Install cadence on this host was then counted: 17, 30, 22 and 23
 * installs on four consecutive sprint days, and 3 on a quiet one. A depth of
 * ten is therefore about EIGHT HOURS of rollback during a sprint and about
 * three DAYS when nothing is happening. A retention window whose duration
 * varies by a factor of ten with how busy the week was is not a policy; it is
 * an accident of arithmetic, and the failure mode is specific: a regression
 * noticed the next morning finds every candidate rollback target already gone.
 *
 * So the window is stated in TIME, which is the unit the requirement is
 * actually in — "long enough for a regression to be noticed" — and `keep_n`
 * survives as a floor in count terms so a quiet week still has depth.
 *
 * 72 hours covers a weekend plus a working day either side. It is a judgement,
 * but it is a judgement about the right quantity.
 */
export const RETENTION_POLICY_V2 = Object.freeze({
  version: "v2",
  source: "v3-phase-4-install-cadence-measurement-2026-09-06",
  // Minimum rollback depth in COUNT, for periods with few installs.
  keep_n: 10,
  // Minimum rollback depth in TIME. Every version installed inside this window
  // is retained however many there are.
  rollback_window_hours: 72,
  // A floor beneath the whole calculation. Even if every heuristic said
  // otherwise, a machine whose recovery path is one directory deep is a machine
  // one bad install away from having no working toolkit.
  min_retained_versions: 3,
  // Unknown is protected. Stated as policy so that turning it off is a visible,
  // deliberate act rather than a quiet change of behaviour in a resolver.
  protect_unknown: true,
  // Health thresholds, expressed against the retention envelope rather than a
  // raw directory count.
  watch_prunable_ratio: 0.5,
  problem_prunable_ratio: 2.0,
});

/**
 * The V1 policy, kept so the change above is legible and so a caller that
 * genuinely wants count-only retention can still ask for it explicitly.
 */
export const RETENTION_POLICY_V1 = Object.freeze({
  version: "v1",
  source: "capacity-doctrine-2026-08-26",
  keep_n: 10,
  rollback_window_hours: 0,
  min_retained_versions: 3,
  protect_unknown: true,
  watch_prunable_ratio: 0.5,
  problem_prunable_ratio: 2.0,
});

/** The policy in force. Everything below defaults to it. */
export const RETENTION_POLICY = RETENTION_POLICY_V2;

export function configuredKeepN(env = process.env, policy = RETENTION_POLICY) {
  const raw = Number(env.ALLOY_TOOLKIT_KEEP_N);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : policy.keep_n;
}

/**
 * Every reason a version may be retained. A retained version always carries at
 * least one; a prunable version carries none.
 */
export const PROTECTION_REASONS = Object.freeze([
  "current",
  "live_process",
  "rollback_window",
  "explicitly_pinned",
  "reproducibility",
  "unknown_reference_state",
  "unknown_provenance",
  "minimum_retention_floor",
]);

// ── Live-process pinning ─────────────────────────────────────────────────────

// A version is a version because it is INSTALLED, not because it looks like a
// sha. Matching on a hex shape would silently stop pinning anything the day the
// installer changed its naming — and a pin that silently stops working deletes
// a running Gateway's image. `current` is excluded explicitly because it is a
// pointer, not a version.
const VERSION_SEGMENT_RE = /toolkit\/([^/\s]+)(?:[/\s]|$)/;
const CURRENT_RE = /toolkit\/current(?:[/\s]|$)/;

function versionFromCommand(cmd) {
  const text = String(cmd || "");
  if (CURRENT_RE.test(text)) return null;
  const m = text.match(VERSION_SEGMENT_RE);
  if (!m) return null;
  const seg = m[1];
  if (seg === "current" || seg.startsWith(".") || seg === "PINNED") return null;
  return seg;
}

/**
 * Which toolkit version is each live process actually running?
 *
 * THREE OUTCOMES, AND THE THIRD IS THE IMPORTANT ONE.
 *
 *   resolved   — the command line names a version directly.
 *   inherited  — the command line goes through `current`, but a DESCENDANT of
 *                that process names a version. The Gateway host launches its
 *                server child with a resolved path, so the child's evidence
 *                settles the parent. This is S1's ownership model reused, not a
 *                second one.
 *   unresolved — through `current`, with nothing to resolve it. The version it
 *                pins is genuinely unknowable from here, because `current` may
 *                have moved since the process started. This does NOT resolve to
 *                the current target: doing so would be a guess in the one
 *                direction that can delete a running Gateway's own image.
 */
export function resolveProcessPins({ processes = [], now = Date.now() } = {}) {
  const pins = new Map();
  const unresolved = [];
  const byPid = new Map();
  const children = new Map();
  for (const p of processes) {
    byPid.set(Number(p.pid), p);
    const ppid = Number(p.ppid);
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(p);
  }

  const addPin = (sha, proc, how) => {
    const key = String(sha);
    if (!pins.has(key)) pins.set(key, []);
    pins.get(key).push({ pid: Number(proc.pid), command: proc.command, resolution: how });
  };

  const toolkitProcs = processes.filter((p) => /toolkit\//.test(String(p.command || "")));

  for (const proc of toolkitProcs) {
    const cmd = String(proc.command || "");
    const direct = versionFromCommand(cmd);
    if (direct) { addPin(direct, proc, "resolved"); continue; }
    if (!CURRENT_RE.test(cmd)) continue;

    // Through `current`. Look for a descendant that names a version.
    const found = resolveThroughDescendants(proc, children);
    if (found) { addPin(found.sha, proc, "inherited_from_descendant"); continue; }

    unresolved.push({
      pid: Number(proc.pid),
      command: cmd,
      reason: "launched through the `current` symlink; its version cannot be read from the process table and `current` may have moved since",
    });
  }

  return {
    schema_version: TOOLKIT_RETENTION_SCHEMA,
    pins: Object.fromEntries([...pins].map(([k, v]) => [k, v])),
    pinned_versions: [...pins.keys()],
    unresolved,
    fully_resolved: unresolved.length === 0,
    observed_at: now,
  };
}

function resolveThroughDescendants(proc, children, depth = 0) {
  if (depth > 4) return null;
  for (const child of children.get(Number(proc.pid)) || []) {
    const m = versionFromCommand(child.command);
    if (m) return { sha: m, via: Number(child.pid) };
    const deeper = resolveThroughDescendants(child, children, depth + 1);
    if (deeper) return deeper;
  }
  return null;
}

// ── Inventory ────────────────────────────────────────────────────────────────

/**
 * One structured record per installed version.
 *
 * `provenance` comes from the INSTALL-MANIFEST the installer writes. A version
 * with no manifest has unknown provenance and is retained on that basis alone —
 * a directory we cannot account for is not a directory we may delete.
 */
export function buildInventory({
  versions = [],
  currentSha = null,
  pins = null,
  pinnedVersions = [],
  reproducibilityRequired = [],
  policy = RETENTION_POLICY,
  keepN = null,
  now = Date.now(),
} = {}) {
  const keep = Number.isFinite(keepN) ? keepN : policy.keep_n;
  const pinMap = pins?.pins || {};
  const explicit = new Set(pinnedVersions.map(String));
  const repro = new Set(reproducibilityRequired.map(String));

  const records = versions.map((v) => {
    const version = String(v.version ?? v);
    const installedAt = normalizeInstant(v.installed_at);
    const provenanceKnown = Boolean(v.provenance || v.source_commit || v.source_ref);
    const refs = pinMap[version] || [];
    return {
      version,
      path: v.path ?? null,
      installed_at: installedAt,
      installed_at_source: installedAt == null ? "unavailable" : (v.installed_at ? "install_manifest" : "mtime"),
      current: version === String(currentSha || ""),
      live_process_references: refs,
      explicitly_pinned: explicit.has(version),
      reproducibility_retained: repro.has(version),
      disk_bytes: Number.isFinite(Number(v.disk_bytes)) ? Number(v.disk_bytes) : null,
      provenance: v.provenance ?? (v.source_commit ? { source_commit: v.source_commit, source_ref: v.source_ref ?? null } : null),
      provenance_known: provenanceKnown,
      // Filled below — rollback depth is a property of the ORDERED set, not of
      // any one version.
      rollback_retained: false,
      protection_reasons: [],
      prunable: false,
    };
  });

  // Rollback window: the `keep` most recent SUPERSEDED versions. Ordering needs
  // a timestamp; a version we cannot order is not silently dropped from the
  // window, it is protected for unknown provenance below.
  const orderable = records
    .filter((r) => !r.current && r.installed_at != null)
    .sort((a, b) => b.installed_at - a.installed_at);
  for (const r of orderable.slice(0, Math.max(0, keep))) r.rollback_retained = true;
  // ...AND everything installed inside the time window, however many that is.
  // The two rules are a union, not a choice: the count floor protects a quiet
  // week and the time window protects a busy one, and a host can be in either.
  const windowMs = Math.max(0, Number(policy.rollback_window_hours) || 0) * 3600_000;
  if (windowMs > 0) {
    for (const r of orderable) {
      if (now - r.installed_at <= windowMs) {
        r.rollback_retained = true;
        r.rollback_reason = "inside the rollback time window";
      }
    }
  }

  for (const r of records) {
    const reasons = [];
    if (r.current) reasons.push("current");
    if (r.live_process_references.length) reasons.push("live_process");
    if (r.explicitly_pinned) reasons.push("explicitly_pinned");
    if (r.rollback_retained) reasons.push("rollback_window");
    if (r.reproducibility_retained) reasons.push("reproducibility");
    if (policy.protect_unknown && !r.provenance_known) reasons.push("unknown_provenance");
    if (policy.protect_unknown && r.installed_at == null) reasons.push("unknown_reference_state");
    r.protection_reasons = reasons;
    r.prunable = reasons.length === 0;
  }

  // The floor. If honouring it means keeping versions that policy would
  // otherwise release, the newest of those are kept and SAY they were kept for
  // the floor — never silently.
  const retainedCount = records.filter((r) => !r.prunable).length;
  if (retainedCount < policy.min_retained_versions) {
    const shortfall = policy.min_retained_versions - retainedCount;
    const promote = records
      .filter((r) => r.prunable)
      .sort((a, b) => (b.installed_at ?? 0) - (a.installed_at ?? 0))
      .slice(0, shortfall);
    for (const r of promote) {
      r.protection_reasons = [...r.protection_reasons, "minimum_retention_floor"];
      r.prunable = false;
    }
  }

  return records;
}

function normalizeInstant(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

/**
 * A fingerprint of everything that would make a plan unsafe to reuse.
 *
 * Deliberately narrow: it covers `current`, the pin set and the prunable set.
 * A plan does not go stale because disk usage drifted by a kilobyte; it goes
 * stale when something that protects a version changed.
 */
export function planFingerprint({ inventory = [], currentSha = null, pins = null } = {}) {
  const canonical = JSON.stringify({
    current: currentSha,
    pinned: Object.keys(pins?.pins || {}).sort(),
    unresolved: (pins?.unresolved || []).map((u) => u.pid).sort(),
    prunable: inventory.filter((r) => r.prunable).map((r) => r.version).sort(),
    protected: inventory.filter((r) => !r.prunable).map((r) => `${r.version}:${r.protection_reasons.join("|")}`).sort(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 32);
}

/**
 * Build the prune plan. Plan only — this function removes nothing.
 *
 * `execution_blocked` is set when any live process's pin could not be resolved.
 * That is the one condition under which no version may be pruned at all: if we
 * cannot say what a running process is using, every candidate could be it.
 */
export function planPrune({
  inventory = [],
  currentSha = null,
  pins = null,
  policy = RETENTION_POLICY,
  keepN = null,
  now = Date.now(),
} = {}) {
  const retained = inventory.filter((r) => !r.prunable);
  const prunable = inventory.filter((r) => r.prunable);
  const bytes = (list) => list.reduce((sum, r) => sum + (Number(r.disk_bytes) || 0), 0);
  const unresolved = pins?.unresolved || [];
  const blocked = unresolved.length > 0;

  return {
    schema_version: TOOLKIT_RETENTION_SCHEMA,
    generated_at: now,
    policy_version: policy.version,
    keep_n: Number.isFinite(keepN) ? keepN : policy.keep_n,
    rollback_window_hours: policy.rollback_window_hours ?? 0,
    current: currentSha,
    total_installed: inventory.length,
    retained_count: retained.length,
    prunable_count: blocked ? 0 : prunable.length,
    bytes_retained: bytes(retained),
    bytes_reclaimable: blocked ? 0 : bytes(prunable),
    // Every retained version says WHY, so the plan can be read as an argument
    // rather than taken on trust.
    retained_detail: retained.map((r) => ({
      version: r.version,
      reasons: r.protection_reasons,
      disk_bytes: r.disk_bytes,
      installed_at: r.installed_at,
      live_pids: r.live_process_references.map((p) => p.pid),
    })),
    prune: blocked ? [] : prunable.map((r) => ({ version: r.version, path: r.path, disk_bytes: r.disk_bytes })),
    execution_blocked: blocked,
    blocked_reason: blocked
      ? `${unresolved.length} live toolkit process(es) could not be resolved to a version; no version may be pruned while any pin is unknown`
      : null,
    unresolved_pins: unresolved,
    safety_fingerprint: planFingerprint({ inventory, currentSha, pins }),
    // Plan is the default and says so in the artifact itself, so a caller that
    // hands this object around cannot mistake it for an authorisation.
    mode: "plan",
    deletes_nothing: true,
  };
}

/** Did anything safety-relevant change between a presented plan and now? */
export function comparePlans(previous, fresh) {
  if (!previous) return { changed: false, requires_refresh: false, differences: [] };
  if (previous.safety_fingerprint === fresh.safety_fingerprint) {
    return { changed: false, requires_refresh: false, differences: [] };
  }
  const differences = [];
  const pv = new Set((previous.prune || []).map((p) => p.version));
  const fv = new Set((fresh.prune || []).map((p) => p.version));
  for (const v of pv) if (!fv.has(v)) differences.push({ version: v, change: "no_longer_prunable" });
  for (const v of fv) if (!pv.has(v)) differences.push({ version: v, change: "newly_prunable" });
  if (previous.current !== fresh.current) differences.push({ change: "current_moved", from: previous.current, to: fresh.current });
  return { changed: true, requires_refresh: true, differences };
}

// ── Execution ────────────────────────────────────────────────────────────────

export const PRUNE_REFUSALS = Object.freeze([
  "not_confirmed", "execution_blocked", "plan_stale", "nothing_to_prune", "no_remover",
]);

/**
 * Execute a prune. Explicit consent required; nothing implicit anywhere.
 *
 * The plan handed in is EVIDENCE, never permission. State is recomputed from
 * live inputs first, and a plan whose safety fingerprint has moved is refused
 * with the differences rather than reconciled.
 *
 * Partial failure is survivable by construction: each removal is independent,
 * a failure is recorded and the loop continues, and `current` is verified
 * afterwards regardless. What is never allowed is a removal derived from
 * anything but the freshly recomputed prunable set.
 */
export async function executePrune({
  presentedPlan = null,
  recompute = null,
  remove = null,
  confirmed = false,
  policy = RETENTION_POLICY,
  now = Date.now(),
} = {}) {
  if (confirmed !== true) {
    return { ok: false, error: "not_confirmed", removed: [], bytes_reclaimed: 0, detail: "prune requires explicit confirmation" };
  }
  if (typeof recompute !== "function") {
    return { ok: false, error: "plan_stale", removed: [], bytes_reclaimed: 0, detail: "a prune may not run from a plan it cannot recompute" };
  }
  if (typeof remove !== "function") {
    return { ok: false, error: "no_remover", removed: [], bytes_reclaimed: 0 };
  }

  // 1-3: fresh inventory, fresh pins, fresh retention set.
  const fresh = await recompute();
  const freshPlan = planPrune({
    inventory: fresh.inventory,
    currentSha: fresh.currentSha,
    pins: fresh.pins,
    policy,
    keepN: fresh.keepN ?? null,
    now,
  });

  if (freshPlan.execution_blocked) {
    return { ok: false, error: "execution_blocked", removed: [], bytes_reclaimed: 0, detail: freshPlan.blocked_reason, plan: freshPlan };
  }

  // 4-5: compare with what was presented; refuse a stale plan.
  const drift = comparePlans(presentedPlan, freshPlan);
  if (drift.requires_refresh) {
    return {
      ok: false, error: "plan_stale", removed: [], bytes_reclaimed: 0,
      detail: "safety-relevant state changed since the plan was presented; review the refreshed plan",
      differences: drift.differences, plan: freshPlan,
    };
  }
  if (!freshPlan.prune.length) {
    return { ok: true, removed: [], failed: [], bytes_reclaimed: 0, plan: freshPlan, detail: "nothing is prunable" };
  }

  // 6: remove ONLY what the fresh plan says is prunable, right now.
  const removed = [];
  const failed = [];
  for (const target of freshPlan.prune) {
    try {
      const out = await remove(target);
      if (out?.ok === false) failed.push({ ...target, error: out.error || "remove_failed" });
      else removed.push({ ...target, bytes: Number(out?.bytes ?? target.disk_bytes) || 0 });
    } catch (err) {
      failed.push({ ...target, error: err?.message || String(err) });
    }
  }

  // 7-9: verify what must survive.
  const after = await recompute();
  const verification = verifyAfterPrune({
    inventory: after.inventory,
    currentSha: after.currentSha,
    pins: after.pins,
    removed: removed.map((r) => r.version),
    policy,
    keepN: after.keepN ?? null,
  });

  return {
    ok: verification.ok,
    removed: removed.map((r) => r.version),
    failed,
    // 10: exact, from what was actually removed — never from the plan's estimate.
    bytes_reclaimed: removed.reduce((s, r) => s + (Number(r.bytes) || 0), 0),
    verification,
    plan: freshPlan,
    partial: failed.length > 0,
  };
}

/**
 * After a prune, is the machine still recoverable?
 *
 * Checks the things whose absence would mean the recovery path itself was
 * damaged: `current` resolves and survived, no pinned or live-referenced
 * version was removed, and enough rollback depth remains where enough history
 * ever existed.
 */
export function verifyAfterPrune({
  inventory = [],
  currentSha = null,
  pins = null,
  removed = [],
  policy = RETENTION_POLICY,
  keepN = null,
} = {}) {
  const gone = new Set(removed.map(String));
  const problems = [];

  if (!currentSha) problems.push("current does not resolve to any version");
  else if (gone.has(String(currentSha))) problems.push(`current ${currentSha} was removed`);
  else if (!inventory.some((r) => r.version === String(currentSha))) {
    problems.push(`current ${currentSha} is not present in the inventory after pruning`);
  }

  for (const sha of Object.keys(pins?.pins || {})) {
    if (gone.has(sha)) problems.push(`live-process pinned version ${sha} was removed`);
  }
  for (const r of inventory) {
    if (r.explicitly_pinned && gone.has(r.version)) problems.push(`explicitly pinned version ${r.version} was removed`);
  }

  const keep = Number.isFinite(keepN) ? keepN : policy.keep_n;
  const survivors = inventory.filter((r) => !gone.has(r.version));
  const rollbackAvailable = survivors.filter((r) => r.version !== String(currentSha)).length;
  // "Where enough history exists" — a machine with four installs cannot keep
  // ten, and reporting that as a failure would be false.
  const expected = Math.min(keep, Math.max(0, inventory.length - 1));
  if (rollbackAvailable < Math.min(expected, policy.min_retained_versions - 1)) {
    problems.push(`only ${rollbackAvailable} rollback target(s) remain`);
  }

  return {
    ok: problems.length === 0,
    problems,
    current: currentSha,
    current_present: Boolean(currentSha) && survivors.some((r) => r.version === String(currentSha)),
    rollback_targets: rollbackAvailable,
    rollback_expected_at_least: Math.min(expected, keep),
    live_pins_intact: Object.keys(pins?.pins || {}).every((sha) => !gone.has(sha)),
  };
}

// ── Health ───────────────────────────────────────────────────────────────────

/**
 * Severity from the retention ENVELOPE, not from a directory count.
 *
 * A host with 74 versions where 70 are protected is healthy; a host with 20
 * where 18 are prunable and nothing has ever pruned them is not. The old check
 * counted directories and would have called both the same.
 */
export function retentionSeverity(plan, { policy = RETENTION_POLICY, diskPressure = false } = {}) {
  if (!plan) return { severity: "problem", why: "retention state could not be determined" };
  if (plan.execution_blocked) {
    return { severity: "problem", why: plan.blocked_reason || "retention state cannot be safely determined" };
  }
  const keep = plan.keep_n || policy.keep_n;
  const ratio = keep > 0 ? plan.prunable_count / keep : plan.prunable_count;
  // More dead weight than live retention is unmanaged accumulation whatever the
  // ratio against keep_n says — a 20-version host with 18 prunable is in worse
  // shape than a 74-version host with 2, and the depth-relative test alone
  // cannot see that.
  const outweighsRetained = Number.isFinite(plan.retained_count) && plan.prunable_count > plan.retained_count;
  if (ratio >= policy.problem_prunable_ratio || outweighsRetained || (diskPressure && plan.prunable_count > 0)) {
    return {
      severity: "problem",
      why: diskPressure && plan.prunable_count > 0
        ? `${plan.prunable_count} prunable versions hold ${formatBytes(plan.bytes_reclaimable)} while the host is under disk pressure`
        : outweighsRetained && ratio < policy.problem_prunable_ratio
          ? `${plan.prunable_count} prunable versions outnumber the ${plan.retained_count} retained ones`
          : `${plan.prunable_count} prunable versions is more than ${policy.problem_prunable_ratio}× the retention depth of ${keep}`,
    };
  }
  if (ratio >= policy.watch_prunable_ratio) {
    return { severity: "watch", why: `${plan.prunable_count} versions are prunable, reclaiming ${formatBytes(plan.bytes_reclaimable)}` };
  }
  return { severity: "healthy", why: "toolkit retention is within the configured envelope" };
}

export function formatBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b >= 1048576) return `${Math.round(b / 1048576)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

// ── Disk hygiene: observation only ───────────────────────────────────────────

/**
 * A compact view of what is consuming disk, and WHO may act on each item.
 *
 * The ownership column is the whole point. Vacilando may prune the toolkit
 * through this slice; S7 may propose worktree retirement and an operator
 * governs it; caches and Docker are observed and nothing more. A hygiene report
 * that listed them all as "reclaimable" would read as a licence to delete.
 */
export const HYGIENE_OWNERSHIP = Object.freeze({
  toolkit: "vacilando_may_prune_explicitly",
  worktrees: "s7_proposes_operator_governs",
  caches: "report_only",
  docker: "external_report_only",
  build_artifacts: "report_only",
});

export function diskHygiene({ plan = null, reconciliation = null, disk = null, caches = [], docker = null } = {}) {
  const items = [];
  if (plan) {
    items.push({
      resource: "toolkit",
      ownership: HYGIENE_OWNERSHIP.toolkit,
      observed: `${plan.total_installed} versions, ${formatBytes(plan.bytes_retained + plan.bytes_reclaimable)}`,
      reclaimable_bytes: plan.bytes_reclaimable,
      action_available: plan.execution_blocked ? null : "alloy-toolkit prune --yes",
    });
  }
  if (reconciliation) {
    const retirable = reconciliation.worktrees?.retirable ?? 0;
    items.push({
      resource: "worktrees",
      ownership: HYGIENE_OWNERSHIP.worktrees,
      observed: `${reconciliation.total_worktrees ?? "?"} worktrees, ${retirable} classified retirable by S7`,
      reclaimable_bytes: null,
      action_available: null,
      note: "S7 classifies only; retirement is an operator decision and is NOT part of a toolkit prune",
    });
  }
  for (const c of caches) {
    items.push({
      resource: c.name, ownership: HYGIENE_OWNERSHIP.caches,
      observed: c.size_human || formatBytes(c.bytes), reclaimable_bytes: null, action_available: null,
    });
  }
  if (docker) {
    items.push({
      resource: "docker", ownership: HYGIENE_OWNERSHIP.docker,
      observed: docker.summary || "present", reclaimable_bytes: null, action_available: null,
      note: "external resource; the shared local stack is governed separately",
    });
  }
  return {
    schema_version: TOOLKIT_RETENTION_SCHEMA,
    disk_free_gb: disk?.free_gb ?? null,
    disk_total_gb: disk?.total_gb ?? null,
    disk_reserve_gb: disk?.reserve_gb ?? null,
    items,
    // Only one row in this report has an action behind it, and it needs a flag.
    actionable: items.filter((i) => i.action_available).map((i) => i.resource),
  };
}
