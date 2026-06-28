import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminV2/actions/actionEligibility", () => ({
    loadOpportunityStatusContext: vi.fn(),
    resolveAvailableStatusTransitions: vi.fn(),
    resolveStatusTransitionBlockers: vi.fn(),
}));
vi.mock("@/lib/admin/actions/entryLifecycleActions", () => ({
    validateOpportunityStatusTransitionForAction: vi.fn(),
}));
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn(),
}));
vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: vi.fn(),
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: vi.fn().mockResolvedValue("event-1") }));

import { updateStatusAction } from "@/lib/adminV2/actions/definitions/updateStatusAction";
import {
    loadOpportunityStatusContext,
    resolveAvailableStatusTransitions,
    resolveStatusTransitionBlockers,
} from "@/lib/adminV2/actions/actionEligibility";
import { validateOpportunityStatusTransitionForAction } from "@/lib/admin/actions/entryLifecycleActions";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";
import type { ActionHandlerDeps } from "@/lib/adminV2/actions/actionTypes";

const supabase = {} as never;
const ctx = { orgId: "org-1", userId: "user-1" };

function deps(payload: Record<string, unknown>): ActionHandlerDeps {
    return {
        supabase,
        ctx,
        invocation: {
            actionKey: "update_status",
            entityType: "opportunity",
            entityId: "opp-1",
            context: { work_unit_id: "wu-1" },
            payload,
        },
        payload,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    (loadOpportunityStatusContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        found: true,
        statusKey: "new_inquiry",
        metadata: {},
        workUnitId: "wu-1",
        customerId: "cust-1",
        primaryPersonId: "person-1",
    });
    (resolveAvailableStatusTransitions as ReturnType<typeof vi.fn>).mockResolvedValue({
        options: [
            { key: "qualification", label: "Qualification" },
            { key: "lost", label: "Lost" },
        ],
        definitions: [
            { status_key: "new_inquiry", status_label: "New inquiry" },
            { status_key: "qualification", status_label: "Qualification" },
            { status_key: "lost", status_label: "Lost" },
        ],
    });
    (resolveStatusTransitionBlockers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("update_status eligibility", () => {
    it("resolves available statuses and required inputs when no target chosen", async () => {
        const result = await updateStatusAction.resolveEligibility(deps({}));
        expect(result.eligible).toBe(true);
        expect(result.availableTransitions.map((t) => t.key)).toEqual(["qualification", "lost"]);
        expect(result.requiredInputs.find((i) => i.key === "status_key")?.required).toBe(true);
    });

    it("is ineligible when the record is not found", async () => {
        (loadOpportunityStatusContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            found: false,
            statusKey: null,
            metadata: null,
            workUnitId: null,
            customerId: null,
            primaryPersonId: null,
        });
        const result = await updateStatusAction.resolveEligibility(deps({}));
        expect(result.eligible).toBe(false);
        expect(result.blockers[0]?.code).toBe("not_found");
    });

    it("is blocked by an invalid transition", async () => {
        (resolveStatusTransitionBlockers as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            { code: "transition_blocked", message: "This status transition is blocked.", field: "status_key" },
        ]);
        const result = await updateStatusAction.resolveEligibility(deps({ status_key: "lost" }));
        expect(result.eligible).toBe(false);
        expect(result.blockers[0]?.code).toBe("transition_blocked");
    });
});

describe("update_status execute", () => {
    it("blocks when no target status is supplied", async () => {
        const result = await updateStatusAction.execute(deps({}));
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected error");
        expect(result.status).toBe(400);
        expect(result.blockers?.[0]?.field).toBe("status_key");
    });

    it("returns structured error when the transition is blocked", async () => {
        (validateOpportunityStatusTransitionForAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            error: "Missing required fields for this status transition.",
            status: 400,
        });
        const result = await updateStatusAction.execute(deps({ status_key: "qualification" }));
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected error");
        expect(result.blockers?.[0]?.code).toBe("transition_blocked");
        expect(updateOpportunityStatusWithEvent).not.toHaveBeenCalled();
    });

    it("executes through the canonical status helper on the success path", async () => {
        (validateOpportunityStatusTransitionForAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            existing: { status_key: "new_inquiry" },
            oldStatusKey: "new_inquiry",
        });
        (assertAllowedStatusKey as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
        (updateOpportunityStatusWithEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: null });

        const result = await updateStatusAction.execute(deps({ status_key: "qualification", note: "called" }));
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected success");
        expect(result.result.detail).toMatchObject({ old_status_key: "new_inquiry", new_status_key: "qualification" });
        expect(updateOpportunityStatusWithEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityId: "opp-1",
                newStatusKey: "qualification",
                previousStatusKey: "new_inquiry",
            })
        );
    });
});
