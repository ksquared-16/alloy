import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

/**
 * Childcare enrollment waitlist V2 — candidate-level facts + canonical cohort key grouping.
 * V1 preset remains unchanged for opportunity-only queue paths until Card 3.
 */
export const CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 = {
    ...CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
    profile_id: "childcare_enrollment_waitlist_v2",
    revision: "2026-05-27",
    primary_group_fact_key: "program_room_cohort_key",
    labels: {
        ...CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.labels,
        reason_fallback:
            "No special priority rule matched — standard family ordering within this program / room cohort uses wait dates below.",
        reason_rule_matched: "Priority rule matched for this program / room cohort.",
    },
} satisfies PlacementProfile;
