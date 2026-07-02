/**
 * Idempotent demo patch helpers for Priority Placement V1 (Cards 8–9).
 * Safe defaults live only on explicit seed keys — does not change global org behavior by itself.
 */

import type { PlacementPriorityLayer } from "@/lib/orchestration/placement/placementConfigSchema";

/** Merged into `work_units.metadata.placement_priority_v1` for enrollment demo (waitlisted lane only). */
export const PLACEMENT_PRIORITY_DEMO_LAYER_V1 = {
    version: 1 as const,
    enabled: true,
    profile_id: "childcare_enrollment_waitlist_v1",
    profile_revision: "2026-05-08",
    queue_keys_enabled: ["waitlisted"],
    /** False so demo shows placement sort + scoped waitlist position numbers (still page-local — see lane hint). */
    shadow_mode: false,
    evaluation_cap: 200,
    display: { show_bucket_chip: true, show_sort_hint: true },
} satisfies PlacementPriorityLayer;

/** Phase 2 pilot — candidate-backed queue projection (shadow by default). */
export const PLACEMENT_PRIORITY_DEMO_LAYER_V2 = {
    version: 1 as const,
    enabled: true,
    engine_version: "v2" as const,
    profile_id: "childcare_enrollment_waitlist_v2",
    profile_revision: "2026-05-27",
    queue_keys_enabled: ["waitlisted"],
    shadow_mode: true,
    evaluation_cap: 200,
    display: { show_bucket_chip: true, show_sort_hint: true },
} satisfies PlacementPriorityLayer;

export type PlacementDemoScenarioId =
    | "staff"
    | "community"
    | "sibling"
    | "sister_center"
    | "general"
    | "sibling_unknown";

/** Stable `metadata.seed_key` values for demo opportunities (waitlisted). */
export const PLACEMENT_DEMO_SCENARIO_SEED_KEYS: Record<PlacementDemoScenarioId, string> = {
    staff: "placement_demo_waitlisted_staff",
    community: "placement_demo_waitlisted_community",
    sibling: "placement_demo_waitlisted_sibling",
    sister_center: "placement_demo_waitlisted_sister_center",
    general: "placement_demo_waitlisted_general",
    sibling_unknown: "placement_demo_waitlisted_sibling_unknown",
};

const DEMO_PACKAGE = "placement_priority_demo_v1";

/** Demo program / room groups — visible in queue section headers and facts (`program_room_group`). */
const DEMO_ROOM_BY_SCENARIO: Record<PlacementDemoScenarioId, string> = {
    staff: "Toddler",
    community: "Toddler",
    sibling: "Infant",
    sister_center: "Infant",
    general: "Toddler",
    sibling_unknown: "Toddler",
};

function staggerWaitSinceIso(scenarioIndex: number): string {
    const d = new Date("2024-06-01T12:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + scenarioIndex);
    return d.toISOString();
}

const SCENARIO_ORDER: PlacementDemoScenarioId[] = [
    "staff",
    "community",
    "sibling",
    "sister_center",
    "general",
    "sibling_unknown",
];

function scenarioIndex(id: PlacementDemoScenarioId): number {
    return SCENARIO_ORDER.indexOf(id);
}

/**
 * Metadata fragment merged onto each demo opportunity (`waitlisted`).
 * Uses flat flags read by {@link buildOpportunityPlacementFacts}.
 */
export function buildPlacementDemoOpportunityMetadataFragment(scenario: PlacementDemoScenarioId): Record<string, unknown> {
    const idx = scenarioIndex(scenario);
    const room = DEMO_ROOM_BY_SCENARIO[scenario];
    const base: Record<string, unknown> = {
        demo_seed_package: DEMO_PACKAGE,
        seed_key: PLACEMENT_DEMO_SCENARIO_SEED_KEYS[scenario],
        enrollment_operational: {
            wait_since: staggerWaitSinceIso(idx >= 0 ? idx : 0),
        },
        start_date: "2025-09-01",
        placement_fact_inputs_v1: { program_room_group: room },
        program_label: `${room} — Demo waitlist`,
    };

    switch (scenario) {
        case "staff":
            return { ...base, flag_staff_household: true };
        case "community":
            return { ...base, flag_community_priority: true };
        case "sibling":
            return { ...base, flag_sibling_enrolled: true };
        case "sister_center":
            return { ...base, sister_center_transfer: true };
        case "general":
            return base;
        case "sibling_unknown":
            return { ...base, flag_sibling_enrolled: "unknown" };
    }
}

function stableSerializeJson(value: unknown): string {
    const norm = (v: unknown): unknown => {
        if (v === null || typeof v !== "object") return v;
        if (Array.isArray(v)) return v.map(norm);
        const o = v as Record<string, unknown>;
        const keys = Object.keys(o).sort();
        const out: Record<string, unknown> = {};
        for (const k of keys) out[k] = norm(o[k]);
        return out;
    };
    return JSON.stringify(norm(value));
}

/**
 * Returns updated work-unit metadata with demo placement layer; `changed` false when already equivalent.
 */
export function mergePlacementDemoLayerIntoWorkUnitMetadata(metadata: unknown): {
    metadata: Record<string, unknown>;
    changed: boolean;
} {
    const base =
        metadata != null && typeof metadata === "object" && !Array.isArray(metadata)
            ? { ...(metadata as Record<string, unknown>) }
            : {};

    const prev = base.placement_priority_v1;
    const nextLayer = PLACEMENT_PRIORITY_DEMO_LAYER_V1;
    const unchanged = prev != null && stableSerializeJson(prev) === stableSerializeJson(nextLayer);
    if (unchanged) {
        return { metadata: base, changed: false };
    }
    return {
        metadata: { ...base, placement_priority_v1: nextLayer },
        changed: true,
    };
}

/**
 * Deep-merge demo scenario flags into existing opportunity metadata (preserves unrelated keys).
 */
export function mergePlacementDemoIntoOpportunityMetadata(
    existing: Record<string, unknown> | null | undefined,
    scenario: PlacementDemoScenarioId
): Record<string, unknown> {
    const frag = buildPlacementDemoOpportunityMetadataFragment(scenario);
    const prior = existing != null && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
    const eoPrior =
        prior.enrollment_operational != null &&
        typeof prior.enrollment_operational === "object" &&
        !Array.isArray(prior.enrollment_operational)
            ? (prior.enrollment_operational as Record<string, unknown>)
            : {};
    const eoFrag =
        frag.enrollment_operational != null &&
        typeof frag.enrollment_operational === "object" &&
        !Array.isArray(frag.enrollment_operational)
            ? (frag.enrollment_operational as Record<string, unknown>)
            : {};

    const { enrollment_operational: _e, ...fragRest } = frag;

    return {
        ...prior,
        ...fragRest,
        enrollment_operational: { ...eoPrior, ...eoFrag },
    };
}
