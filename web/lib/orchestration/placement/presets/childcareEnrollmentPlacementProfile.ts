import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";

/**
 * Childcare enrollment waitlist placement profile — **preset only** (Card 3).
 * Evaluator core remains domain-agnostic; rules reference generic fact keys.
 */
export const CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 = {
    profile_id: "childcare_enrollment_waitlist_v1",
    revision: "2026-05-08",
    domain: "childcare_enrollment",
    buckets: [
        {
            bucket_key: "tier_staff_community",
            priority_order: 10,
            label_key: "bucket_staff_community",
        },
        {
            bucket_key: "tier_sibling_enrolled",
            priority_order: 20,
            label_key: "bucket_sibling_enrolled",
        },
        {
            bucket_key: "tier_sister_center",
            priority_order: 30,
            label_key: "bucket_sister_center",
        },
        {
            bucket_key: "tier_general_waitlist",
            priority_order: 100,
            label_key: "bucket_general_waitlist",
        },
    ],
    rules: [
        {
            rule_order: 10,
            when: {
                any: [
                    { fact_eq: { key: "flag_employee_household", value: true } },
                    { fact_eq: { key: "flag_staff_household", value: true } },
                    { fact_eq: { key: "flag_community_priority", value: true } },
                ],
            },
            assign_bucket_key: "tier_staff_community",
        },
        {
            rule_order: 20,
            when: { fact_eq: { key: "flag_sibling_enrolled", value: true } },
            assign_bucket_key: "tier_sibling_enrolled",
        },
        {
            rule_order: 30,
            when: { fact_eq: { key: "flag_sister_center", value: true } },
            assign_bucket_key: "tier_sister_center",
        },
    ],
    fallback_bucket_key: "tier_general_waitlist",
    tie_breakers: [
        { kind: "fact", field: "wait_since", direction: "asc" },
        { kind: "fact", field: "desired_start_date", direction: "asc" },
    ],
    cohort_filter: {
        queue_keys: ["waitlisted", "ready_to_enroll"],
    },
    strict_required_facts: false,
    required_fact_keys: [],
    warn_if_unknown_fact_keys: ["flag_sibling_enrolled"],
    labels: {
        bucket_staff_community: "Staff / community priority",
        bucket_sibling_enrolled: "Sibling enrolled at center",
        bucket_sister_center: "Sister center priority",
        bucket_general_waitlist: "General waitlist",
        reason_fallback: "General waitlist tier — no higher-priority policy rule matched.",
        reason_rule_matched: "Placement tier matched enrollment priority rules.",
        warn_unknown_flag_sibling_enrolled:
            "Sibling enrollment could not be verified; sibling priority rules were skipped.",
        reason_unknown_flag_sibling_enrolled:
            "Sibling enrollment not verified; ordering uses wait dates within this tier.",
    },
} satisfies PlacementProfile;
