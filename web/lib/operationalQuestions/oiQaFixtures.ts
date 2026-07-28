/**
 * Developer-only QA fixture helpers for Operational Intelligence expansion.
 * Not exposed in product UI. Does not delete unrelated org data.
 *
 * Usage (from web/): 
 *   npx tsx scripts/qa/seedOiUtilizationFixtures.ts --org <orgId>
 *
 * This module documents deterministic naming; the seed script is the executable entry.
 */

export const OI_QA_FIXTURE_PREFIX = "OI-QA";

export function oiQaRoomLabel(slug: string): string {
    return `${OI_QA_FIXTURE_PREFIX} Room ${slug}`;
}

export function oiQaProgramLabel(slug: string): string {
    return `${OI_QA_FIXTURE_PREFIX} Program ${slug}`;
}

export function isOiQaFixtureLabel(label: string | null | undefined): boolean {
    return typeof label === "string" && label.startsWith(`${OI_QA_FIXTURE_PREFIX} `);
}

/**
 * Recommended fixture matrix (manual or scripted):
 * - Room A: capacity 20, occupancy 16 → ~80% (on goal for 75–95)
 * - Room B: capacity 20, occupancy 10 → 50% (below)
 * - Room C: capacity 20, occupancy 20 → 100% (above)
 * - Room D: capacity missing → utilization not available
 */
export const OI_QA_UTILIZATION_MATRIX = [
    { slug: "A-healthy", targetPct: 80, capacity: 20, occupancy: 16 },
    { slug: "B-below", targetPct: 50, capacity: 20, occupancy: 10 },
    { slug: "C-above", targetPct: 100, capacity: 20, occupancy: 20 },
    { slug: "D-missing-capacity", targetPct: null, capacity: null, occupancy: 8 },
] as const;
