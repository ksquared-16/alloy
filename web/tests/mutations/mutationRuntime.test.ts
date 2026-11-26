import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeMutation, resolvePhase, evaluatePhase, buildPreview } from "@/lib/mutations/runtime";
import type { DecisionIntent } from "@/lib/mutations/types";
import { LEAD_STATUS_DOMAIN, resolveDomainForCommand } from "@/lib/mutations/leadStatusDomain";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([
        { status_key: "new", status_label: "New", is_active: true },
        { status_key: "qualified", status_label: "Qualified", is_active: true },
        { status_key: "lost", status_label: "Lost", is_active: true },
    ]),
}));

vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: vi.fn().mockResolvedValue({ ok: true }),
}));

const mockRpc = vi.fn().mockResolvedValue({
    data: { ok: true, mutation_id: "test-mutation-id", previous_state: "new", new_state: "qualified" },
    error: null,
});

vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn().mockResolvedValue(null),
}));

function makeSupabase(statusKey = "new") {
    return {
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { status_key: statusKey },
                            error: null,
                        }),
                    }),
                }),
            }),
        }),
        rpc: mockRpc,
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const BASE_INTENT: DecisionIntent = {
    commandKey: "update_lead_status",
    subjectId: "opp-uuid-123",
    subjectType: "opportunity",
    domain: "lead_status",
    targetState: "qualified",
    operatorId: "user-abc",
    origin: "operator",
};

const BASE_CTX = {
    supabase: makeSupabase(),
    orgId: "org-123",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Mutation Runtime — Phase 1: Resolve", () => {
    it("resolves lead_status domain for update_lead_status command", async () => {
        const result = await resolvePhase(BASE_CTX, BASE_INTENT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.resolved.domain.key).toBe("lead_status");
        expect(result.resolved.domain.subjectType).toBe("opportunity");
    });

    it("returns ok:false for unknown command", async () => {
        const intent = { ...BASE_INTENT, commandKey: "update_generic_status" };
        const result = await resolvePhase(BASE_CTX, intent);
        expect(result.ok).toBe(false);
    });

    it("resolves current state from subject record", async () => {
        const result = await resolvePhase(BASE_CTX, BASE_INTENT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.resolved.currentState).toBe("new");
    });

    it("excludes current status from available targets", async () => {
        const ctxWithCurrentQualified = { ...BASE_CTX, supabase: makeSupabase("qualified") };
        const result = await resolvePhase(ctxWithCurrentQualified, BASE_INTENT);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.resolved.availableTargets).not.toContain("qualified");
    });
});

describe("Mutation Runtime — Phase 2: Evaluate", () => {
    it("passes when all checks succeed", async () => {
        const resolveResult = await resolvePhase(BASE_CTX, BASE_INTENT);
        expect(resolveResult.ok).toBe(true);
        if (!resolveResult.ok) return;

        const evalResult = await evaluatePhase(BASE_CTX, BASE_INTENT, resolveResult.resolved);
        expect(evalResult.ok).toBe(true);
    });

    it("blocks when target status is not in allowed set", async () => {
        const { assertAllowedStatusKey } = await import("@/lib/admin/statusDefinitionsResolve");
        vi.mocked(assertAllowedStatusKey).mockResolvedValueOnce({ ok: false, message: "Status not defined" });

        const resolveResult = await resolvePhase(BASE_CTX, BASE_INTENT);
        expect(resolveResult.ok).toBe(true);
        if (!resolveResult.ok) return;

        const evalResult = await evaluatePhase(BASE_CTX, BASE_INTENT, resolveResult.resolved);
        expect(evalResult.ok).toBe(false);
        if (evalResult.ok) return;
        expect(evalResult.code).toBe("invalid_target_status");
    });

    it("blocks when transition rule is violated", async () => {
        const { validateStatusTransition } = await import("@/lib/admin/statusTransitionRules");
        vi.mocked(validateStatusTransition).mockResolvedValueOnce({ ok: false, message: "Transition blocked" });

        const resolveResult = await resolvePhase(BASE_CTX, BASE_INTENT);
        expect(resolveResult.ok).toBe(true);
        if (!resolveResult.ok) return;

        const evalResult = await evaluatePhase(BASE_CTX, BASE_INTENT, resolveResult.resolved);
        expect(evalResult.ok).toBe(false);
        if (evalResult.ok) return;
        expect(evalResult.code).toBe("transition_blocked");
    });

    it("blocks on no-op (same status)", async () => {
        const sameStatusIntent = { ...BASE_INTENT, targetState: "new" };
        const ctxWithNew = { ...BASE_CTX, supabase: makeSupabase("new") };
        const resolveResult = await resolvePhase(ctxWithNew, sameStatusIntent);
        expect(resolveResult.ok).toBe(true);
        if (!resolveResult.ok) return;

        const evalResult = await evaluatePhase(ctxWithNew, sameStatusIntent, resolveResult.resolved);
        expect(evalResult.ok).toBe(false);
        if (evalResult.ok) return;
        expect(evalResult.code).toBe("no_state_change");
    });
});

describe("Mutation Runtime — Phase 3: Preview", () => {
    it("builds preview with transition info", async () => {
        const resolveResult = await resolvePhase(BASE_CTX, BASE_INTENT);
        expect(resolveResult.ok).toBe(true);
        if (!resolveResult.ok) return;

        const preview = buildPreview(BASE_INTENT, resolveResult.resolved, [], []);
        expect(preview.commandKey).toBe("update_lead_status");
        expect(preview.domain).toBe("lead_status");
        expect(preview.previousState).toBe("new");
        expect(preview.targetState).toBe("qualified");
        expect(preview.sideEffects).toHaveLength(0);
        expect(preview.readinessGaps).toHaveLength(0);
    });
});

describe("Mutation Runtime — previewOnly mode", () => {
    it("returns previewed result without committing when previewOnly=true", async () => {
        const ctx = { ...BASE_CTX, supabase: makeSupabase("new") };
        const result = await executeMutation(ctx, BASE_INTENT, { previewOnly: true });
        expect(result.status).toBe("previewed");
        expect(mockRpc).not.toHaveBeenCalled();
    });
});

describe("Mutation Runtime — Phase 4: Commit", () => {
    beforeEach(() => {
        mockRpc.mockResolvedValue({
            data: { ok: true, mutation_id: "test-mutation-id", previous_state: "new", new_state: "qualified" },
            error: null,
        });
    });

    it("commits and returns committed result", async () => {
        const ctx = { ...BASE_CTX, supabase: makeSupabase("new") };
        const result = await executeMutation(ctx, BASE_INTENT);
        expect(result.status).toBe("committed");
        if (result.status !== "committed") return;
        expect(result.newState).toBe("qualified");
        expect(result.previousState).toBe("new");
        expect(result.commandKey).toBe("update_lead_status");
        expect(result.domain).toBe("lead_status");
        expect(result.mutationId).toBe("test-mutation-id");
    });

    it("calls execute_lead_status_mutation RPC with correct params", async () => {
        const ctx = { ...BASE_CTX, supabase: makeSupabase("new") };
        await executeMutation(ctx, BASE_INTENT);
        expect(mockRpc).toHaveBeenCalledWith("execute_lead_status_mutation", {
            p_org_id: "org-123",
            p_opportunity_id: "opp-uuid-123",
            p_new_status_key: "qualified",
            p_operator_id: "user-abc",
            p_origin: "operator",
            p_context_payload: {},
        });
    });

    it("returns blocked when RPC reports opportunity_not_found", async () => {
        mockRpc.mockResolvedValueOnce({
            data: null,
            error: { message: "opportunity_not_found" },
        });
        const ctx = { ...BASE_CTX, supabase: makeSupabase("new") };
        const result = await executeMutation(ctx, BASE_INTENT);
        expect(result.status).toBe("blocked");
        if (result.status !== "blocked") return;
        expect(result.blockedCode).toBe("not_found");
    });
});

describe("Mutation Runtime — domain isolation", () => {
    it("update_lead_status does NOT operate on opportunity_customer_members", () => {
        expect(LEAD_STATUS_DOMAIN.subjectType).toBe("opportunity");
        expect(LEAD_STATUS_DOMAIN.canonicalField).toBe("opportunities.status_key");
        expect(LEAD_STATUS_DOMAIN.key).toBe("lead_status");
    });

    it("update_lead_status is distinct from update_child_enrollment_status", () => {
        const leadCmd = "update_lead_status";
        const childCmd = "update_child_enrollment_status";
        expect(leadCmd).not.toBe(childCmd);
        expect(resolveDomainForCommand(leadCmd)?.key).toBe("lead_status");
        expect(resolveDomainForCommand(childCmd)?.key).toBe("enrollment_status");
        expect(resolveDomainForCommand(childCmd)?.key).not.toBe("lead_status");
    });
});
