/**
 * Vacilando Runtime — shared model vocabulary.
 *
 * Pure constants and tiny deterministic helpers used across the six projection
 * modules. No I/O. No wall-clock reads (time is injected at compose so snapshots
 * stay replayable — a rule inherited from the toolkit's event contract).
 */

export const SNAPSHOT_SCHEMA = "vacilando.snapshot.v1";
export const EVENT_SCHEMA = "vacilando.event.v1";

/**
 * Canonical lifecycle order for initiative-backed work. Position on this line is
 * the ONLY honest source of a coarse "progress" number — and it is always
 * labelled derived. Managed sprints without an initiative get progress = null.
 */
export const INITIATIVE_LIFECYCLE = [
  "draft", "auditing", "planning", "awaiting_plan_approval", "approved",
  "assigning", "implementing", "validating", "reviewing",
  "remediation_required", "merge_ready", "awaiting_promotion_approval", "closed",
];

/** Operator-facing status roles (match the approved Command Center palette). */
export const STATUS = Object.freeze({
  RUNNING: "running",
  REVIEW: "review",
  BLOCKED: "blocked",
  COMPLETE: "complete",
  PLANNING: "planning",
  PAUSED: "paused",
  IDLE: "idle",
});

/**
 * Deterministic sprint glyph. Stable per worktree name so a sprint keeps its
 * desert mark across snapshots. Pure hash → fixed palette; no randomness.
 */
export const GLYPHS = ["sun", "cactus", "mountain", "wave", "leaf", "bus", "ruler", "compass"];
export function glyphFor(key) {
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return GLYPHS[h % GLYPHS.length];
}

/** Parse "ahead/behind" (e.g. "15/23") into numbers, tolerant of junk. */
export function parseAheadBehind(s) {
  const m = String(s || "").match(/^(\d+)\s*\/\s*(\d+)$/);
  return { ahead: m ? Number(m[1]) : 0, behind: m ? Number(m[2]) : 0 };
}

/** A typed gap: something the UI wants that no authoritative source yields yet. */
export function gap(field, reason, wouldNeed) {
  return { field, reason, would_need: wouldNeed };
}

/** ISO string from ms, or null. Time-in is always injected, never read here. */
export function isoFromMs(ms) {
  if (ms === null || ms === undefined) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}
