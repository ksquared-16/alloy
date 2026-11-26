import { describe, expect, it } from "vitest";
import {
    applyPlacementV2ToOpportunityQueueRows,
    type EnabledPlacementV2,
} from "@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows";
import type { PlacementCandidateQueueBundle } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import type { PlacementCandidateRow } from "@/lib/orchestration/placement/placementCandidateTypes";

const NOW = 1_715_176_800_000;
const WU = "wu-1";
const QK = "waitlisted";

function enabledV2(shadow: boolean): EnabledPlacementV2 {
    const r = resolvePlacementQueueConfig({
        departmentMetadata: null,
        workUnitMetadata: {
            placement_priority_v1: {
                version: 1,
                enabled: true,
                engine_version: "v2",
                profile_id: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.profile_id,
                profile_revision: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.revision,
                queue_keys_enabled: [QK],
                shadow_mode: shadow,
                evaluation_cap: 50,
            },
        },
        queue_key: QK,
    });
    if (r.status !== "enabled" || r.engine_version !== "v2") {
        throw new Error(`expected v2 enabled, got ${JSON.stringify(r)}`);
    }
    return r as EnabledPlacementV2;
}

function candidateRow(id: string, oppId: string, waitSince: string, cohort: string): PlacementCandidateRow {
    return {
        id,
        org_id: "org",
        opportunity_id: oppId,
        customer_id: null,
        opportunity_customer_member_id: `ocm_${id}`,
        customer_member_id: null,
        person_id: null,
        site_id: null,
        is_synthetic_fallback: false,
        program_room_cohort_key: cohort,
        program_room_group_label: cohort,
        wait_since: waitSince,
        start_date: null,
        status: "active",
        seed_key: null,
        metadata: null,
    };
}

function bundle(
    id: string,
    oppId: string,
    waitSince: string,
    cohort: string,
    opts?: { link_mode?: "independent" | "strictly_together"; link_group_id?: string; member_count?: number }
): PlacementCandidateQueueBundle {
    const linkMode = opts?.link_mode ?? "independent";
    return {
        candidate: candidateRow(id, oppId, waitSince, cohort),
        link_group:
            opts?.link_group_id && linkMode !== "independent"
                ? {
                      id: opts.link_group_id,
                      link_mode: linkMode,
                      member_count: opts.member_count ?? 2,
                  }
                : null,
        link_mode: linkMode,
        active_overrides: [],
        child_display_name: `Child ${id}`,
    };
}

describe("applyPlacementV2ToOpportunityQueueRows", () => {
    it("attaches _placement_priority_v2 with embedded candidates (no legacy _placement_priority)", () => {
        const oppId = "opp-a";
        const map = new Map<string, PlacementCandidateQueueBundle[]>([
            [
                oppId,
                [
                    bundle("c1", oppId, "2024-01-01T00:00:00.000Z", "infant"),
                    bundle("c2", oppId, "2024-06-01T00:00:00.000Z", "preschool"),
                ],
            ],
        ]);
        const rows = [{ id: oppId, created_at: "2025-01-01T00:00:00.000Z", metadata: {} }];
        const { rows: out } = applyPlacementV2ToOpportunityQueueRows({
            rows,
            placement: enabledV2(true),
            ctx: { workUnitId: WU, queueKey: QK, nowMs: NOW },
            candidatesByOpportunityId: map,
            v1FallbackForEmpty: false,
        });
        expect(out[0]._placement_priority).toBeUndefined();
        const v2 = out[0]._placement_priority_v2 as {
            evaluated: boolean;
            candidates: unknown[];
            family_rollup: { candidate_count: number };
        };
        expect(v2.evaluated).toBe(true);
        expect(v2.candidates).toHaveLength(2);
        expect(v2.family_rollup.candidate_count).toBe(2);
        expect(out[0]).not.toHaveProperty("scoped_waitlist_position");
    });

    it("shadow_mode preserves SQL order", () => {
        const oppA = "opp-a";
        const oppB = "opp-b";
        const map = new Map<string, PlacementCandidateQueueBundle[]>([
            [oppA, [bundle("c1", oppA, "2024-06-01T00:00:00.000Z", "infant")]],
            [oppB, [bundle("c2", oppB, "2024-01-01T00:00:00.000Z", "infant")]],
        ]);
        const rows = [
            { id: oppA, created_at: "2025-01-01T00:00:00.000Z", metadata: {} },
            { id: oppB, created_at: "2025-01-01T00:00:00.000Z", metadata: {} },
        ];
        const { rows: out, diagnostics } = applyPlacementV2ToOpportunityQueueRows({
            rows,
            placement: enabledV2(true),
            ctx: { workUnitId: WU, queueKey: QK, nowMs: NOW },
            candidatesByOpportunityId: map,
        });
        expect(diagnostics.reorder_applied).toBe(false);
        expect(out.map((r) => r.id)).toEqual([oppA, oppB]);
    });

    it("non-shadow reorders by family rollup sort tuple", () => {
        const oppA = "opp-a";
        const oppB = "opp-b";
        const map = new Map<string, PlacementCandidateQueueBundle[]>([
            [oppA, [bundle("c1", oppA, "2024-06-01T00:00:00.000Z", "infant")]],
            [oppB, [bundle("c2", oppB, "2024-01-01T00:00:00.000Z", "infant")]],
        ]);
        const rows = [
            { id: oppA, created_at: "2025-01-01T00:00:00.000Z", metadata: {} },
            { id: oppB, created_at: "2025-01-01T00:00:00.000Z", metadata: {} },
        ];
        const { rows: out, diagnostics } = applyPlacementV2ToOpportunityQueueRows({
            rows,
            placement: enabledV2(false),
            ctx: { workUnitId: WU, queueKey: QK, nowMs: NOW },
            candidatesByOpportunityId: map,
        });
        expect(diagnostics.reorder_applied).toBe(true);
        expect(out.map((r) => r.id)).toEqual([oppB, oppA]);
    });

    it("missing candidates falls back to V1 _placement_priority", () => {
        const oppId = "opp-empty";
        const rows = [
            {
                id: oppId,
                created_at: "2025-01-01T00:00:00.000Z",
                metadata: { wait_since: "2024-03-01T00:00:00.000Z", program_room_group: "Toddler" },
            },
        ];
        const { rows: out, diagnostics } = applyPlacementV2ToOpportunityQueueRows({
            rows,
            placement: enabledV2(true),
            ctx: { workUnitId: WU, queueKey: QK, nowMs: NOW },
            candidatesByOpportunityId: new Map(),
        });
        expect(diagnostics.v2_opportunities_fallback_v1).toBe(1);
        const v2 = out[0]._placement_priority_v2 as { fallback_to_v1?: boolean };
        expect(v2.fallback_to_v1).toBe(true);
        expect(out[0]._placement_priority).toBeDefined();
    });

    it("strictly_together uses conservative (max) tuple within group", () => {
        const oppId = "opp-sib";
        const gid = "grp-1";
        const map = new Map<string, PlacementCandidateQueueBundle[]>([
            [
                oppId,
                [
                    bundle("c-early", oppId, "2024-01-01T00:00:00.000Z", "infant", {
                        link_mode: "strictly_together",
                        link_group_id: gid,
                        member_count: 2,
                    }),
                    bundle("c-late", oppId, "2024-09-01T00:00:00.000Z", "infant", {
                        link_mode: "strictly_together",
                        link_group_id: gid,
                        member_count: 2,
                    }),
                ],
            ],
        ]);
        const { rows: out } = applyPlacementV2ToOpportunityQueueRows({
            rows: [{ id: oppId, created_at: "2025-01-01T00:00:00.000Z", metadata: {} }],
            placement: enabledV2(true),
            ctx: { workUnitId: WU, queueKey: QK, nowMs: NOW },
            candidatesByOpportunityId: map,
        });
        const v2 = out[0]._placement_priority_v2 as {
            family_rollup: { blocked_by_strict_link?: boolean; sort_tuple: unknown[] };
            candidates: Array<{ placement_candidate_id: string; sort_tuple: unknown[] }>;
        };
        expect(v2.family_rollup.blocked_by_strict_link).toBe(true);
        const late = v2.candidates.find((c) => c.placement_candidate_id === "c-late");
        expect(v2.family_rollup.sort_tuple).toEqual(late?.sort_tuple);
    });
});

describe("resolvePlacementQueueConfig — v2", () => {
    it("v1 config unchanged when engine_version omitted", () => {
        const r = resolvePlacementQueueConfig({
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    profile_id: "childcare_enrollment_waitlist_v1",
                    queue_keys_enabled: [QK],
                },
            },
            departmentMetadata: null,
            queue_key: QK,
        });
        expect(r.status).toBe("enabled");
        if (r.status === "enabled") expect(r.engine_version).toBe("v1");
    });

    it("rejects v2 engine with v1 preset id", () => {
        const r = resolvePlacementQueueConfig({
            workUnitMetadata: {
                placement_priority_v1: {
                    version: 1,
                    enabled: true,
                    engine_version: "v2",
                    profile_id: "childcare_enrollment_waitlist_v1",
                    queue_keys_enabled: [QK],
                },
            },
            departmentMetadata: null,
            queue_key: QK,
        });
        expect(r.status).toBe("disabled");
    });
});
