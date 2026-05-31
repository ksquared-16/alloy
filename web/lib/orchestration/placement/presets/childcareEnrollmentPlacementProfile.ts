import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";
import {
    TIER_EMPLOYEE_FAMILY_BUCKET,
    TIER_GENERAL_WAITLIST_BUCKET,
    TIER_STAFF_COMMUNITY_LEGACY_BUCKET,
} from "@/lib/orchestration/placement/placementBucketLabels";

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
            bucket_key: TIER_EMPLOYEE_FAMILY_BUCKET,
            priority_order: 10,
            label_key: "bucket_employee_family",
        },
        {
            bucket_key: TIER_STAFF_COMMUNITY_LEGACY_BUCKET,
            priority_order: 15,
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
            bucket_key: TIER_GENERAL_WAITLIST_BUCKET,
            priority_order: 100,
            label_key: "bucket_standard_family",
        },
    ],
    rules: [
        {
            rule_order: 10,
            when: { fact_eq: { key: "flag_employee_household", value: true } },
            assign_bucket_key: TIER_EMPLOYEE_FAMILY_BUCKET,
        },
        {
            rule_order: 15,
            when: {
                any: [
                    { fact_eq: { key: "flag_staff_household", value: true } },
                    { fact_eq: { key: "flag_community_priority", value: true } },
                ],
            },
            assign_bucket_key: TIER_STAFF_COMMUNITY_LEGACY_BUCKET,
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
    fallback_bucket_key: TIER_GENERAL_WAITLIST_BUCKET,
    tie_breakers: [
        { kind: "fact", field: "wait_since", direction: "asc" },
        { kind: "fact", field: "desired_start_date", direction: "asc" },
    ],
    primary_group_fact_key: "program_room_group",
    cohort_filter: {
        queue_keys: ["waitlisted", "ready_to_enroll"],
    },
    strict_required_facts: false,
    required_fact_keys: [],
    warn_if_unknown_fact_keys: ["flag_sibling_enrolled"],
    labels: {
        bucket_employee_family: "Employee family",
        bucket_staff_community: "Staff / community priority",
        bucket_sibling_enrolled: "Sibling enrolled at center",
        bucket_sister_center: "Sister center priority",
        bucket_standard_family: "Standard family",
        reason_fallback:
            "No special priority rule matched — standard family ordering within this program / room group uses wait dates below.",
        reason_rule_matched: "Priority rule matched for this program / room group.",
        warn_unknown_flag_sibling_enrolled:
            "Sibling enrollment could not be verified; sibling priority rules were skipped.",
        reason_unknown_flag_sibling_enrolled:
            "Sibling enrollment not verified; ordering uses wait dates within this program / room group.",
    },
} satisfies PlacementProfile;

/** Operator-configurable factor order (staff/community tier omitted — deferred). */
export const CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_FACTOR_ORDER: readonly string[] = [
    TIER_EMPLOYEE_FAMILY_BUCKET,
    "tier_sibling_enrolled",
    "tier_sister_center",
    TIER_GENERAL_WAITLIST_BUCKET,
] as const;
