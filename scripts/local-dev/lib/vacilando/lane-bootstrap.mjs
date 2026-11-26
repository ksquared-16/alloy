/**
 * The canonical lane bootstrap contract.
 *
 * WHAT THIS IS, AND — MORE IMPORTANTLY — WHAT IT IS NOT.
 *
 * It is NOT a registry. It stores no lanes, no worktrees, no slots, no
 * providers and no environments, and it owns none of those facts. Vacilando
 * already has an owner for every one of them:
 *
 *   lane identity, provider, repository, work class  → development-lane.mjs
 *   worktree, branch, slot binding, registration     → lane-worktree-lifecycle.mjs
 *   Development Slot topology                        → managed-slots.mjs
 *   repository identity                              → repository-registry.mjs
 *   QA identity and per-slot env source              → browser-auth.mjs
 *   toolkit generation                               → the installed toolkit tree
 *
 * Adding a second home for any of that is exactly the failure this mission
 * exists to prevent, so this module RESOLVES rather than records: it asks each
 * canonical owner the question it already answers and assembles one view.
 *
 * WHY A VIEW IS WORTH HAVING AT ALL. The facts were never missing — they were
 * unassembled. "Does this lane have the same baseline as that one" could only be
 * answered by a person visiting six modules and knowing which six, so in
 * practice nobody asked, and lanes drifted by accumulation rather than by
 * decision. One deterministic answer makes drift a measurement instead of a
 * discovery.
 *
 * BASELINE + OVERLAY. The baseline is DERIVED, never copied into the lane —
 * copying it is how eight independently maintained configurations get created,
 * and how they then disagree. What a lane may legitimately differ in is a small,
 * explicitly declared set of fields it already carries. Those fields ARE the
 * overlay; this module names them rather than inventing a mechanism to hold
 * them.
 *
 * THE ONLY THING WRITTEN ANYWHERE is a version stamp: `bootstrap.contract_version`
 * on the lane record the lane registry already owns. That is the single fact
 * that cannot be derived, because it records which contract a lane was
 * initialised under — a historical fact, not a current one.
 *
 * WHAT THIS MISSION DELIBERATELY DOES NOT DO. It does not rebase, refresh,
 * reconcile or mutate a stale lane. Drift is made observable here so that
 * DevOps 2 can decide what to do about it safely; deciding it here would be
 * guessing with less information.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getDurableLane, listDurableLanes, recordLaneInstructionBaseline,
  stampLaneBootstrapContract, WORK_CLASS_PRODUCT,
} from "./development-lane.mjs";
import { instructionBaselineVersion } from "./agent-configuration.mjs";
import { resolveLaneWorktree } from "./lane-worktree-lifecycle.mjs";
import { qaIdentityForSlot } from "./browser-auth.mjs";
import { LANE_BOOTSTRAP_CONTRACT_VERSION, laneBootstrapIsStale } from "./lane-bootstrap-contract.mjs";

// The contract version, its stamp and its staleness test live in a leaf with no
// imports, so the registry that writes the stamp and this resolver that reads it
// cannot form an import cycle. Re-exported here so consumers have one import
// site for the whole contract.
export {
  LANE_BOOTSTRAP_CONTRACT_VERSION,
  laneBootstrapStamp,
  laneBootstrapIsStale,
} from "./lane-bootstrap-contract.mjs";

/**
 * The fields a lane may legitimately differ in — the overlay, enumerated.
 *
 * Everything NOT on this list is baseline, and a lane that differs there is
 * drift rather than configuration. Keeping the list explicit and short is the
 * whole control: an overlay nobody wrote down becomes convention, and convention
 * is what this mission was called to remove.
 *
 * Every one of these already lives on the lane record. None is introduced here.
 */
export const LANE_OVERLAY_FIELDS = Object.freeze([
  "preferred_provider",
  "work_class",
  "scarce_resource_priority",
  "repository_id",
  "folder_id",
  "aliases",
  "mission_id",
]);

/** Defaults the baseline supplies when a lane declares no overlay for a field. */
const OVERLAY_DEFAULTS = Object.freeze({
  preferred_provider: "claude",
  work_class: WORK_CLASS_PRODUCT,
  scarce_resource_priority: 0,
  repository_id: null,
  folder_id: null,
  aliases: [],
  mission_id: null,
});

/**
 * The overlay a lane actually declares — only what DIFFERS from the baseline.
 *
 * Returning the differences rather than the values is deliberate. A lane that
 * lists its provider as "claude" has not configured anything; it has agreed with
 * the baseline. Reporting that as an overlay would make every lane look
 * customised and make real customisation invisible among the noise.
 */
export function laneBootstrapOverlay(rec) {
  const out = {};
  if (!rec) return out;
  for (const field of LANE_OVERLAY_FIELDS) {
    const value = rec[field];
    const base = OVERLAY_DEFAULTS[field];
    if (Array.isArray(base)) {
      if (Array.isArray(value) && value.length) out[field] = [...value];
      continue;
    }
    if (value == null || value === base) continue;
    out[field] = value;
  }
  return out;
}

/**
 * The instruction pack a lane resolves.
 *
 * Discovered from the worktree the lane is bound to, because that is where the
 * instructions a lane actually obeys live. Absent is a legitimate answer and is
 * reported as such — this states what is resolvable, it does not require it.
 */
function instructionPackFor(worktreePath) {
  if (!worktreePath) return { resolvable: false, reason: "no_worktree" };
  const claude = join(worktreePath, "CLAUDE.md");
  if (!existsSync(claude)) return { resolvable: false, reason: "no_claude_md", path: claude };
  let text = "";
  try { text = readFileSync(claude, "utf8"); } catch { /* unreadable is not present */ }
  const bytes = text.length;
  return {
    resolvable: bytes > 0,
    path: claude,
    bytes,
    // The CURRENT baseline this lane would resolve. The resolver already had the
    // bytes in hand; hashing them here means the drift comparison and the stamp
    // can never be computed from two different reads of the same file.
    baseline_version: bytes > 0 ? instructionBaselineVersion(text) : null,
  };
}

/**
 * The toolkit generation a lane is running against.
 *
 * Read from the installed toolkit symlink the whole host already resolves
 * through. This does not decide compatibility and must not: toolkit convergence
 * is owned by the existing TOOLKIT_DRIFT → converge_toolkit_then_restart path.
 * It is recorded so a drift report can SAY which generation a lane observed.
 */
function toolkitGeneration({ toolkitCurrent = null } = {}) {
  const link = toolkitCurrent
    || process.env.ALLOY_TOOLKIT_CURRENT
    || join(process.env.HOME || "", ".local", "share", "alloy", "toolkit", "current");
  try {
    const real = existsSync(link) ? readFileSync(join(link, "INSTALL-MANIFEST"), "utf8") : "";
    const sha = real.match(/\b([0-9a-f]{12,40})\b/)?.[1] || null;
    return { resolvable: Boolean(sha), sha, source: link };
  } catch {
    return { resolvable: false, sha: null, source: link };
  }
}

/**
 * Resolve one lane's baseline contract.
 *
 * NOTHING HERE MUTATES, and nothing here acquires. Resolving a lane's contract
 * must not start a server, claim a Development Slot, open a browser or wake a
 * provider — a consistency check that consumes the scarce resources it is
 * checking would be self-defeating, and would make "are my lanes consistent?" a
 * question nobody could afford to ask.
 *
 * ABSENT RESOURCES ARE NOT FAULTS. A lane with no slot, no server and no browser
 * is a perfectly valid lane; the contract is about what it RESOLVES, not what it
 * currently holds. Those appear in `baseline` as `assigned: false`, never as
 * errors.
 */
export function resolveLaneBootstrap(laneId, {
  root = undefined,
  getLane = getDurableLane,
  resolveWorktree = resolveLaneWorktree,
  qaIdentity = qaIdentityForSlot,
  toolkitCurrent = null,
} = {}) {
  const rec = root === undefined ? getLane(laneId) : getLane(laneId, root);
  if (!rec) {
    return { ok: false, error: "lane_not_found", lane_id: laneId || null };
  }

  const wt = root === undefined ? resolveWorktree(rec.lane_id) : resolveWorktree(rec.lane_id, { root });
  /*
   * A SLOTLESS LANE MUST NOT READ AS SLOT 0.
   *
   * `Number(null)` is 0 and `Number.isInteger(0)` is true, so the obvious
   * one-liner turns "no Development Slot" into "Development Slot 0" — a slot
   * that does not exist, on a lane that is perfectly valid without one. It would
   * then go looking for slot 0's QA identity, fail to find one, and report a
   * slotless lane as having an unresolved environment: a fault invented entirely
   * by a coercion, in the exact case the contract promises is fine.
   *
   * Absence is checked before conversion, never through it.
   */
  const rawSlot = wt?.binding_slot;
  const slot = (rawSlot === null || rawSlot === undefined || rawSlot === "")
    ? null
    : (Number.isInteger(Number(rawSlot)) ? Number(rawSlot) : null);
  const worktreePath = wt?.worktree_path || rec.binding?.worktree_path || null;

  const baseline = {
    lane_identity: {
      lane_id: rec.lane_id,
      name: rec.name || null,
      status: rec.status || null,
      registered: true,
      schema_version: rec.schema_version || null,
    },
    repository: { repository_id: rec.repository_id || null, declared: Boolean(rec.repository_id) },
    worktree: {
      resolvable: Boolean(wt?.ok),
      path: worktreePath,
      name: wt?.worktree_name || rec.binding?.worktree_name || null,
      // The lifecycle owner's own refusal code, carried verbatim. Restating it
      // in this module's words is how two vocabularies for one fact begin.
      code: wt?.ok ? null : (wt?.code || null),
    },
    branch: {
      expected: wt?.branch_expected ?? wt?.branch ?? rec.binding?.branch ?? null,
      actual: wt?.branch_actual ?? null,
      drift: Boolean(wt?.branch_drift),
    },
    development_slot: {
      // A slotless lane is valid, dispatchable and consistent. This says whether
      // one is assigned, never whether one is required.
      assigned: slot != null,
      slot,
    },
    provider: {
      // Configuration only. Resolving a provider does not run one, and bootstrap
      // never implies an active execution.
      preferred: rec.preferred_provider || OVERLAY_DEFAULTS.preferred_provider,
      execution_implied: false,
    },
    // Asked ONCE. Calling an owner twice for one fact is how a resolver starts
    // costing what it measures, and it is the thing this module must never do.
    environment: (() => {
      if (slot == null) {
        // A slotless lane has no per-slot environment to resolve. Not a fault.
        return { qa_identity: null, resolvable: true };
      }
      const identity = qaIdentity(slot) || null;
      return { qa_identity: identity, resolvable: Boolean(identity) };
    })(),
    instruction_pack: instructionPackFor(worktreePath),
    toolkit: toolkitGeneration({ toolkitCurrent }),
    work_class: rec.work_class || OVERLAY_DEFAULTS.work_class,
  };

  const unresolved = [];
  if (!baseline.worktree.resolvable) unresolved.push(`worktree:${baseline.worktree.code || "unresolved"}`);
  if (baseline.branch.drift) unresolved.push("branch:drift");
  if (!baseline.environment.resolvable) unresolved.push("environment:qa_identity_missing");
  if (!baseline.instruction_pack.resolvable) {
    unresolved.push(`instruction_pack:${baseline.instruction_pack.reason || "unresolved"}`);
  }
  if (!baseline.toolkit.resolvable) unresolved.push("toolkit:generation_unknown");

  return {
    ok: true,
    lane_id: rec.lane_id,
    contract_version: LANE_BOOTSTRAP_CONTRACT_VERSION,
    observed_contract_version: rec.bootstrap?.contract_version || null,
    stale: laneBootstrapIsStale(rec),
    baseline,
    overlay: laneBootstrapOverlay(rec),
    unresolved,
  };
}



/* ── revalidation: the one seam that may write a stamp ────────────────────── */

export const REVALIDATION = Object.freeze({
  SATISFIED: "SATISFIED",
  UNRESOLVED: "UNRESOLVED",
  LANE_NOT_FOUND: "LANE_NOT_FOUND",
});

/**
 * Re-measure one lane against the current contract, and stamp it only if it
 * actually satisfies it.
 *
 * WHY THIS EXISTS AND WHY IT IS NARROW. Every active lane on this host predates
 * the bootstrap contract, so all of them read stale — and the tempting repair is
 * to stamp them all and watch the health check go green. That would be a lie
 * with a timestamp on it. A lane is stamped here only when `resolveLaneBootstrap`
 * returns no unresolved gaps, which is the same measurement the health check
 * makes, so the two can never disagree about what "satisfies the contract" means.
 *
 * TWO STAMPS, DIFFERENT RULES. The instruction baseline pointer is recorded
 * whenever it can be MEASURED — a lane with a readable CLAUDE.md has a baseline
 * whether or not its worktree resolves, and recording it is how drift becomes
 * visible. The bootstrap contract version is stamped only on full satisfaction,
 * because that stamp is a compliance claim rather than an observation.
 *
 * Writes nothing else. Durable decisions, mission, progress and history are not
 * this seam's business and it holds no reference to them.
 */
export function revalidateLaneBootstrap(laneId, {
  root = undefined,
  nowMs = Date.now(),
  stampBootstrap = true,
  recordBaseline = true,
  resolve = resolveLaneBootstrap,
} = {}) {
  const resolved = root === undefined ? resolve(laneId) : resolve(laneId, { root });
  if (!resolved?.ok) {
    return { ok: false, state: REVALIDATION.LANE_NOT_FOUND, lane_id: laneId || null, error: resolved?.error || "lane_not_found" };
  }
  const opts = root === undefined ? { nowMs } : { nowMs, root };

  const baseline = recordBaseline
    ? recordLaneInstructionBaseline(resolved.lane_id, opts)
    : { ok: true, state: "SKIPPED", written: false };

  const satisfied = Array.isArray(resolved.unresolved) && resolved.unresolved.length === 0;
  const bootstrap = (stampBootstrap && satisfied)
    ? stampLaneBootstrapContract(resolved.lane_id, { ...opts, revalidation: resolved })
    : {
      ok: true,
      state: satisfied ? "SKIPPED" : "REFUSED",
      written: false,
      unresolved: resolved.unresolved,
      detail: satisfied ? null : "the lane has unresolved baseline gaps; nothing was stamped",
    };

  return {
    ok: true,
    state: satisfied ? REVALIDATION.SATISFIED : REVALIDATION.UNRESOLVED,
    lane_id: resolved.lane_id,
    contract_version: resolved.contract_version,
    observed_contract_version: resolved.observed_contract_version,
    current_baseline: resolved.baseline?.instruction_pack?.baseline_version ?? null,
    unresolved: resolved.unresolved,
    instruction_baseline: baseline,
    bootstrap,
  };
}

/**
 * The same, for every active lane. Reports per lane; writes only where the lane
 * earned it. A fleet sweep must never become a fleet edit.
 */
export function revalidateFleetBootstrap({ root = undefined, nowMs = Date.now(), ...rest } = {}) {
  const lanes = root === undefined ? listDurableLanes() : listDurableLanes(root);
  const rows = lanes.map((l) => revalidateLaneBootstrap(l.lane_id, root === undefined ? { nowMs, ...rest } : { root, nowMs, ...rest }));
  const by = {};
  for (const r of rows) by[r.state] = (by[r.state] || 0) + 1;
  return {
    lanes: rows.length,
    by_state: by,
    baselines_written: rows.filter((r) => r.instruction_baseline?.written).length,
    bootstraps_stamped: rows.filter((r) => r.bootstrap?.written).length,
    rows,
  };
}


/**
 * The fleet, measured against the contract — for reporting, never for mutation.
 *
 * This is the inventory DevOps 2 inherits. It deliberately reports rather than
 * repairs: a lane can be stale for reasons that matter (it predates a real
 * baseline change) and for reasons that do not (it was created ten minutes
 * before this shipped), and nothing in a count can tell those apart.
 */
export function inventoryLaneBootstrap({
  root = undefined,
  lanes = null,
  resolve = resolveLaneBootstrap,
} = {}) {
  const recs = lanes || (root === undefined ? listDurableLanes() : listDurableLanes(root));
  const rows = [];
  for (const rec of recs) {
    if (!rec?.lane_id) continue;
    let resolved = null;
    try {
      resolved = resolve(rec.lane_id, root === undefined ? {} : { root });
    } catch (e) {
      rows.push({
        lane_id: rec.lane_id,
        name: rec.name || null,
        stale: true,
        unresolved: [`resolve_failed:${String(e?.message || e).slice(0, 80)}`],
        overlay: {},
      });
      continue;
    }
    if (!resolved?.ok) {
      rows.push({ lane_id: rec.lane_id, name: rec.name || null, stale: true, unresolved: ["lane_not_found"], overlay: {} });
      continue;
    }
    rows.push({
      lane_id: resolved.lane_id,
      name: resolved.baseline.lane_identity.name,
      stale: resolved.stale,
      observed_contract_version: resolved.observed_contract_version,
      slot: resolved.baseline.development_slot.slot,
      unresolved: resolved.unresolved,
      overlay: resolved.overlay,
    });
  }
  return {
    contract_version: LANE_BOOTSTRAP_CONTRACT_VERSION,
    lanes: rows.length,
    stale: rows.filter((r) => r.stale).length,
    unresolved: rows.filter((r) => r.unresolved.length).length,
    rows,
  };
}
