/**
 * Placement candidate orchestration types (Phase 2 — Card 2).
 * Schema-backed rows; no rank/ordinal fields.
 */

export const PLACEMENT_CANDIDATE_STATUSES = ["active", "paused", "withdrawn", "placed"] as const;
export type PlacementCandidateStatus = (typeof PLACEMENT_CANDIDATE_STATUSES)[number];

export const PLACEMENT_LINK_MODES = ["independent", "preferred_together", "strictly_together"] as const;
export type PlacementLinkMode = (typeof PLACEMENT_LINK_MODES)[number];

export const PLACEMENT_OVERRIDE_KINDS = ["pin", "tier_boost", "temporary"] as const;
export type PlacementOverrideKind = (typeof PLACEMENT_OVERRIDE_KINDS)[number];

/** Row shape from `placement_candidates` (server reads). */
export type PlacementCandidateRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    customer_id: string | null;
    opportunity_customer_member_id: string | null;
    customer_member_id: string | null;
    person_id: string | null;
    site_id: string | null;
    is_synthetic_fallback: boolean;
    program_room_cohort_key: string;
    program_room_group_label: string | null;
    wait_since: string | null;
    desired_start_date: string | null;
    status: PlacementCandidateStatus;
    seed_key: string | null;
    metadata: Record<string, unknown> | null;
};

export type PlacementCandidateActiveOverrideSummary = {
    id: string;
    override_kind: PlacementOverrideKind;
    reason: string;
    expires_at: string | null;
    payload?: Record<string, unknown> | null;
};

export type PlacementCandidateLinkGroupSummary = {
    id: string;
    link_mode: PlacementLinkMode;
    member_count: number;
};

export type OpportunityPlacementCandidateChildVm = {
    opportunity_customer_member_id?: string | null;
    customer_member_id?: string | null;
    person_id?: string | null;
    display_name?: string | null;
};

export type OpportunityPlacementCandidateVm = {
    id: string;
    status: PlacementCandidateStatus;
    is_synthetic_fallback: boolean;
    program_room_cohort_key: string;
    program_room_group_label: string | null;
    wait_since: string | null;
    desired_start_date: string | null;
    child: OpportunityPlacementCandidateChildVm;
    link_group?: PlacementCandidateLinkGroupSummary | null;
    active_overrides: PlacementCandidateActiveOverrideSummary[];
    metadata?: Record<string, unknown>;
};

export type OpportunityPlacementCandidatesResponse = {
    opportunity_id: string;
    projection_mode: "family_row";
    candidates: OpportunityPlacementCandidateVm[];
};

/** Waitlist-relevant opportunity statuses for backfill (enrollment pipeline). */
export const WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS = ["waitlisted", "ready_to_enroll"] as const;
