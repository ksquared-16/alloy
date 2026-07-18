/**
 * Operational Graph — Phase A rollout gate (§16, row A rollback boundary).
 *
 * When OFF (default), nothing changes: navigation continues to derive destinations ad hoc through
 * the existing nav path. When ON, the client materializes the compiled Operational Graph and uses
 * it as the single source of *what is reachable*. The graph is additive and side-effect-free at
 * this phase — it enumerates and schedules; it does not yet own commit — so the flag is a pure
 * fallback boundary: flip it off and the live path is untouched.
 *
 * Default: OFF. Set `NEXT_PUBLIC_OPERATIONAL_GRAPH=1`.
 */

export const OPERATIONAL_GRAPH_ENABLED = process.env.NEXT_PUBLIC_OPERATIONAL_GRAPH === "1";

/** Is client materialization of the Operational Graph enabled? (Phase A fallback boundary.) */
export function operationalGraphMaterializationEnabled(): boolean {
    return OPERATIONAL_GRAPH_ENABLED;
}
