/**
 * Fact-key contract for childcare enrollment placement V2 (Phase 2 — Card 2).
 * Extends V1 household flags with candidate / cohort / link facts.
 */

export const CHILDCARE_PLACEMENT_V2_FACT_PROGRAM_ROOM_COHORT_KEY = "program_room_cohort_key" as const;

export const CHILDCARE_PLACEMENT_V2_FACT_PROGRAM_ROOM_GROUP_LABEL = "program_room_group_label" as const;

export const CHILDCARE_PLACEMENT_V2_FACT_IS_SYNTHETIC_FALLBACK = "is_synthetic_fallback" as const;

export const CHILDCARE_PLACEMENT_V2_FACT_LINK_MODE = "link_mode" as const;

export const CHILDCARE_PLACEMENT_V2_FACT_HAS_ACTIVE_OVERRIDE = "has_active_override" as const;

export const CHILDCARE_PLACEMENT_V2_CANDIDATE_FACT_KEYS = [
    CHILDCARE_PLACEMENT_V2_FACT_PROGRAM_ROOM_COHORT_KEY,
    CHILDCARE_PLACEMENT_V2_FACT_PROGRAM_ROOM_GROUP_LABEL,
    CHILDCARE_PLACEMENT_V2_FACT_IS_SYNTHETIC_FALLBACK,
    CHILDCARE_PLACEMENT_V2_FACT_LINK_MODE,
    CHILDCARE_PLACEMENT_V2_FACT_HAS_ACTIVE_OVERRIDE,
] as const;
