import { describe, expect, it } from "vitest";

import { recomputeOpportunityDrawerOperationalAttention } from "@/lib/admin/recomputeOpportunityDrawerOperationalAttention";

describe("recomputeOpportunityDrawerOperationalAttention", () => {
    const nowMs = Date.parse("2026-05-27T18:00:00.000Z");

    it("drops stale follow_up_date_passed after tour_scheduled with future tour date", () => {
        const row = {
            id: "opp-1",
            org_id: "org-1",
            status_key: "tour_scheduled",
            created_at: "2026-05-01T12:00:00.000Z",
            updated_at: "2026-05-20T12:00:00.000Z",
            metadata: {
                tour_date: "2026-06-01",
                tour_time: "09:00",
                next_follow_up_at: "2026-05-20T12:00:00.000Z",
            },
            customer_id: "cust-1",
            primary_person_id: "person-1",
        };

        const patch = recomputeOpportunityDrawerOperationalAttention(row, { orgId: "org-1", nowMs });
        const attn = patch._operational_attention;
        expect(attn).not.toBeNull();
        expect(attn?.reasons.map((r) => r.code)).not.toContain("follow_up_date_passed");
        expect(attn?.primary_reason?.code).not.toBe("follow_up_date_passed");
        expect(patch._operational_recommendation?.stale_state_check?.fingerprint_inputs?.primary_reason_code).not.toBe(
            "follow_up_date_passed"
        );
    });

    it("still surfaces tour_date_passed when tour date is in the past", () => {
        const row = {
            id: "opp-1",
            org_id: "org-1",
            status_key: "tour_scheduled",
            created_at: "2026-05-01T12:00:00.000Z",
            updated_at: "2026-05-20T12:00:00.000Z",
            metadata: {
                tour_date: "2026-05-01",
                tour_time: "09:00",
                next_follow_up_at: "2026-05-20T12:00:00.000Z",
            },
            customer_id: "cust-1",
            primary_person_id: "person-1",
        };

        const patch = recomputeOpportunityDrawerOperationalAttention(row, { orgId: "org-1", nowMs });
        const attn = patch._operational_attention;
        expect(attn?.reasons.map((r) => r.code)).toContain("tour_date_passed");
        expect(attn?.primary_reason?.code).toBe("tour_date_passed");
    });
});
