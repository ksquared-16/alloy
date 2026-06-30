import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeMutation, resolvePhase, evaluatePhase } from "@/lib/mutations/runtime";
import type { DecisionIntent } from "@/lib/mutations/types";
import { ENROLLMENT_STATUS_DOMAIN } from "@/lib/mutations/domains/enrollmentStatus";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([
        { status_key: "inquiry", status_label: "Inquiry", is_active: true },
        { status_key: "waitlisted", status_label: "Waitlisted", is_active: true },
        { status_key: "enrolled", status_label: "Enrolled", is_active: true },
    ]),
}));

vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: vi.fn().mockResolvedValue({ ok: true }),
}));

const mockRpc = vi.fn().mockResolvedValue({
    data: { ok: true, mutation_id: "test-enrollment-id", previous_state: "inquiry", new_state: "waitlisted" },
    error: null,
});

function makeOcmSupabase(params: {
    statusKey?: string;
    desiredStartDate?: string | null;
    locationId?: string | null;
} = {}) {
    const { statusKey = "inquiry", desiredStartDate = "2026-09-01", locationId = "loc-123" } = params;
    return {
        from: vi.fn().mockImplementation((table: string) => ({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: table === "opportunity_customer_members"
                                ? { outcome_status_key: statusKey, opportunity_id: "opp-123", desired_start_date: desiredStartDate, location_id: locationId }
                                : null,
                            error: null,
                        }),
                    }),
                }),
            }),
        })),
        rpc: mockRpc,
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const BASE_INTENT: DecisionIntent = {
    commandKey: "update_child_enrollment_status",
    subjectId: "ocm-uuid-456",
    subjectType: "opportunity_customer_member",
    domain: "enrollment_status",
    targetState: "waitlisted",
    operatorId: "user-abc",
    origin: "operator",
};

const BASE_CTX = {
    supabase: makeOcmSupabase(),
    orgId: "org-123",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Enrollment Status Runtime — Phase 1: Resolve", () => {
    it("resolves enrollment_status domain for update_child_enrollment_status command", async () => {
        const result = await resolvePhase(BASE_CTX, BASE_INTENT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.resolved.domain.key).toBe("enrollment_status");
        expect(result.resolved.domain.subjectType).toBe("opportunity_customer_member");
        expect(result.resolved.entityType).toBe("opportunity_customer_members");
    });

    it("resolves current state from OCM record", async () => {
        const result = await resolvePhase(BASE_CTX, BASE_INTENT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.resolved.currentState).toBe("inquiry");
    });

    it("excludes current status from available targets", async () => {
        const ctxWithWaitlisted = { ...BASE_CTX, supabase: makeOcmSupabase({ statusKey: "waitlisted" }) };
        const result = await resolvePhase(ctxWithWaitlisted, BASE_INTENT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.resolved.availableTargets).not.toContain("waitlisted");
    });
});

describe("Enrollment Status Runtime — previewOnly (no readiness gaps)", () => {
    it("returns previewed result without calling RPC", async () => {
        const result = await executeMutation(BASE_CTX, BASE_INTENT, { previewOnly: true });
        expect(result.status).toBe("previewed");
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("preview has empty readinessGaps when placement data is present", async () => {
        const result = await executeMutation(BASE_CTX, BASE_INTENT, { previewOnly: true });
        expect(result.status).toBe("previewed");
        if (result.status !== "previewed") return;
        expect(result.preview.readinessGaps).toHaveLength(0);
    });
});

describe("Enrollment Status Runtime — readiness gating", () => {
    it("returns readinessGaps in preview when desired_start_date is missing for waitlisted", async () => {
        const ctx = { ...BASE_CTX, supabase: makeOcmSupabase({ desiredStartDate: null, locationId: "loc-123" }) };
        const result = await executeMutation(ctx, BASE_INTENT, { previewOnly: true });
        expect(result.status).toBe("previewed");
        if (result.status !== "previewed") return;
        expect(result.preview.readinessGaps.length).toBeGreaterThan(0);
        expect(result.preview.readinessGaps[0]).toContain("start date");
    });

    it("blocks commit when placement fields are missing for enrolled transition", async () => {
        const enrollIntent = { ...BASE_INTENT, targetState: "enrolled" };
        const ctx = { ...BASE_CTX, supabase: makeOcmSupabase({ locationId: null }) };
        const result = await executeMutation(ctx, enrollIntent);
        expect(result.status).toBe("blocked");
        if (result.status !== "blocked") return;
        expect(result.blockedCode).toBe("readiness_blocked");
    });

    it("does NOT gate readiness for status keys outside placement-required set", async () => {
        const inquiryIntent = { ...BASE_INTENT, targetState: "inquiry" };
        // even with missing fields, non-placement-required transitions should not be gated
        const ctx = { ...BASE_CTX, supabase: makeOcmSupabase({ desiredStartDate: null, locationId: null, statusKey: "waitlisted" }) };
        const result = await executeMutation(ctx, inquiryIntent, { previewOnly: true });
        expect(result.status).toBe("previewed");
        if (result.status !== "previewed") return;
        expect(result.preview.readinessGaps).toHaveLength(0);
    });
});

describe("Enrollment Status Runtime — Phase 4: Commit", () => {
    beforeEach(() => {
        mockRpc.mockResolvedValue({
            data: { ok: true, mutation_id: "test-enrollment-id", previous_state: "inquiry", new_state: "waitlisted" },
            error: null,
        });
    });

    it("commits and returns committed result", async () => {
        const result = await executeMutation(BASE_CTX, BASE_INTENT);
        expect(result.status).toBe("committed");
        if (result.status !== "committed") return;
        expect(result.newState).toBe("waitlisted");
        expect(result.domain).toBe("enrollment_status");
        expect(result.mutationId).toBe("test-enrollment-id");
    });

    it("calls execute_enrollment_status_mutation RPC with correct params", async () => {
        await executeMutation(BASE_CTX, BASE_INTENT);
        expect(mockRpc).toHaveBeenCalledWith("execute_enrollment_status_mutation", {
            p_org_id: "org-123",
            p_ocm_id: "ocm-uuid-456",
            p_new_status_key: "waitlisted",
            p_operator_id: "user-abc",
            p_origin: "operator",
            p_context_payload: {},
        });
    });

    it("returns blocked when RPC reports ocm_not_found", async () => {
        mockRpc.mockResolvedValueOnce({ data: null, error: { message: "ocm_not_found" } });
        const result = await executeMutation(BASE_CTX, BASE_INTENT);
        expect(result.status).toBe("blocked");
        if (result.status !== "blocked") return;
        expect(result.blockedCode).toBe("not_found");
    });
});

describe("Enrollment domain isolation — cross-domain regression", () => {
    it("enrollment domain canonical field does not reference opportunities.status_key", () => {
        expect(ENROLLMENT_STATUS_DOMAIN.canonicalField).toBe(
            "opportunity_customer_members.outcome_status_key"
        );
        expect(ENROLLMENT_STATUS_DOMAIN.canonicalField).not.toBe("opportunities.status_key");
    });

    it("RPC called is execute_enrollment_status_mutation, not execute_lead_status_mutation", async () => {
        await executeMutation(BASE_CTX, BASE_INTENT);
        const callArgs = mockRpc.mock.calls[mockRpc.mock.calls.length - 1];
        expect(callArgs[0]).toBe("execute_enrollment_status_mutation");
        expect(callArgs[0]).not.toBe("execute_lead_status_mutation");
    });
});
