import { describe, expect, it } from "vitest";
import type { QueueConfig } from "@/lib/config/queueDefinitionSchema";
import type { PlacementCandidateQueueBundle } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import { __testing } from "@/lib/queues/QueueService";

const waitlistedLane: QueueConfig = {
    key: "waitlisted",
    label: "Waitlisted",
    filters: [{ type: "status", operator: "in", values: ["waitlisted"] }],
} as QueueConfig;

const mockSupabase = {} as never;

describe("QueueService — placement projection hookup", () => {
    it("disabled placement metadata preserves row references and omits diagnostics", async () => {
        const rows = [{ id: "a", created_at: "2026-01-01T00:00:00.000Z", metadata: {} }];
        const out = await __testing.attachPlacementToEnrichedOpportunityItems({
            supabase: mockSupabase,
            orgId: "org",
            enrichedRows: rows,
            workUnitId: "wu",
            queueKey: "waitlisted",
            queueConfig: waitlistedLane,
            departmentMetadata: null,
            workUnitMetadata: null,
            nowMs: 1,
        });
        expect(out.diagnostics).toBeNull();
        expect(out.rows).toBe(rows);
    });

    it("queue_keys_enabled gates evaluation for non-listed lanes", async () => {
        const rows = [{ id: "a", created_at: "2026-01-01T00:00:00.000Z", metadata: {} }];
        const out = await __testing.attachPlacementToEnrichedOpportunityItems({
            supabase: mockSupabase,
            orgId: "org",
            enrichedRows: rows,
            workUnitId: "wu",
            queueKey: "all",
            queueConfig: { key: "all", label: "All", filters: [] } as QueueConfig,
            departmentMetadata: null,
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: "childcare_enrollment_waitlist_v1",
                    queue_keys_enabled: ["waitlisted"],
                },
            },
            nowMs: 1,
        });
        expect(out.diagnostics).toBeNull();
        expect(out.rows).toBe(rows);
        expect(out.rows[0]._placement_priority).toBeUndefined();
    });

    it("v2 engine expands to candidate rows with _placement_waitlist_row", async () => {
        const oppId = "opp-1";
        const bundles: PlacementCandidateQueueBundle[] = [
            {
                candidate: {
                    id: "pc-1",
                    org_id: "org",
                    opportunity_id: oppId,
                    customer_id: null,
                    opportunity_customer_member_id: "ocm-1",
                    customer_member_id: null,
                    person_id: null,
                    site_id: null,
                    is_synthetic_fallback: false,
                    program_room_cohort_key: "infant",
                    program_room_group_label: "Infant",
                    wait_since: "2024-01-01T00:00:00.000Z",
                    start_date: null,
                    status: "active",
                    seed_key: null,
                    metadata: null,
                },
                link_group: null,
                link_mode: "independent",
                active_overrides: [],
                child_display_name: "Alex",
            },
        ];
        const map = new Map([[oppId, bundles]]);
        const rows = [{ id: oppId, created_at: "2026-01-01T00:00:00.000Z", metadata: {} }];
        const out = await __testing.attachPlacementToEnrichedOpportunityItems({
            supabase: mockSupabase,
            orgId: "org",
            enrichedRows: rows,
            workUnitId: "wu",
            queueKey: "waitlisted",
            queueConfig: waitlistedLane,
            departmentMetadata: null,
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    engine_version: "v2",
                    profile_id: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.profile_id,
                    profile_revision: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.revision,
                    queue_keys_enabled: ["waitlisted"],
                    shadow_mode: true,
                },
            },
            nowMs: 1_715_176_800_000,
            placementCandidatesByOpportunityId: map,
        });
        expect(out.diagnostics?.placement_engine_version).toBe("v2");
        expect(out.diagnostics?.v2_candidate_queue_rows).toBe(1);
        expect(out.rows[0]._placement_waitlist_row).toBeDefined();
        expect(out.rows[0].opportunity_id).toBe(oppId);
        expect(out.rows[0]._placement_priority).toBeUndefined();
    });

    it("opportunityQueueStatusKeysAllowed collects status filter values", () => {
        const q = {
            key: "x",
            label: "X",
            filters: [{ type: "status" as const, operator: "in" as const, values: ["waitlisted", " ready_to_enroll "] }],
        } as QueueConfig;
        expect(__testing.opportunityQueueStatusKeysAllowed(q)?.sort()).toEqual(["ready_to_enroll", "waitlisted"]);
    });
});
