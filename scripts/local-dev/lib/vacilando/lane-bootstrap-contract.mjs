/**
 * The lane bootstrap contract version, and nothing else.
 *
 * WHY THIS IS ITS OWN FILE. The lane registry writes the version stamp and the
 * bootstrap resolver reads it, and the resolver also has to ask the registry for
 * lanes — so putting the constant in either one makes them import each other.
 * ESM tolerates that cycle today only because both sides happen to use function
 * declarations and call them at runtime; it would break the first time someone
 * evaluated one of these at module scope, and it would break as an undefined
 * function with no obvious cause.
 *
 * A leaf with zero imports cannot participate in a cycle, so neither can its
 * dependents through it. It holds a version and a timestamp helper: no lane, no
 * worktree, no slot, no policy. It is not an owner of anything.
 */

/**
 * Bump this when the BASELINE a lane is entitled to changes in a way an
 * already-initialised lane would not automatically satisfy.
 *
 * Do NOT bump it for a newly derived field that every lane answers correctly the
 * moment it is added — that reports the whole fleet as stale and buys nothing.
 * Staleness should mean "this lane predates a real change", or it will be
 * ignored the way every noisy signal eventually is.
 */
export const LANE_BOOTSTRAP_CONTRACT_VERSION = "vacilando.lane_bootstrap.v1";

/**
 * The stamp the lane registry persists.
 *
 * Returned as a value rather than written here: the lane record has exactly one
 * writer, and it is not this file.
 */
export function laneBootstrapStamp(nowMs = Date.now()) {
  return {
    contract_version: LANE_BOOTSTRAP_CONTRACT_VERSION,
    at: new Date(nowMs).toISOString(),
  };
}

/**
 * Was this lane initialised under the current contract?
 *
 * A lane with no stamp is STALE, not broken. Every lane created before this
 * contract existed is unstamped by definition, and calling that a fault would
 * report the entire fleet as damaged on the day it ships. Stale means "DevOps 2
 * should look at this" and nothing more.
 */
export function laneBootstrapIsStale(rec) {
  if (!rec) return true;
  return (rec.bootstrap?.contract_version || null) !== LANE_BOOTSTRAP_CONTRACT_VERSION;
}
