import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/actions/executeAdminAction", () => ({
    executeAdminAction: vi.fn(),
}));

import { confirmTourAction } from "@/lib/adminV2/actions/definitions/confirmTourAction";
import { runRegisteredAction } from "@/lib/adminV2/actions/actionExecutor";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import type { ActionHandlerDeps } from "@/lib/adminV2/actions/actionTypes";

const supabase = {} as never;
const ctx = { orgId: "org-1", userId: "user-1" };

function deps(entityId: string): ActionHandlerDeps {
    return {
        supabase,
        ctx,
        invocation: { actionKey: "confirm_tour", entityType: "opportunity", entityId },
        payload: {},
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("confirm_tour is a registered action", () => {
    it("is present in the registry", () => {
        expect(getRegisteredAction("confirm_tour")).toBeTruthy();
    });
});

describe("confirm_tour eligibility", () => {
    it("blocks when no record is present", async () => {
        const result = await confirmTourAction.resolveEligibility(deps(""));
        expect(result.eligible).toBe(false);
        expect(result.blockers[0]?.code).toBe("missing_entity");
    });

    it("is eligible with a record", async () => {
        const result = await confirmTourAction.resolveEligibility(deps("opp-1"));
        expect(result.eligible).toBe(true);
    });
});

describe("confirm_tour executes through the shared executor", () => {
    it("delegates to the canonical executeAdminAction confirm_tour handler", async () => {
        (executeAdminAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            correlation_id: "corr-1",
            execution_result: { kind: "confirm_tour", booking_id: "booking-9" },
        });

        const result = await runRegisteredAction(
            supabase,
            ctx,
            { actionKey: "confirm_tour", entityType: "opportunity", entityId: "opp-1", context: { surface: "right_rail" } },
            "execute"
        );

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected success");
        expect(result.result.affectedId).toBe("booking-9");
        expect(executeAdminAction).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({ orgId: "org-1" }),
            expect.objectContaining({ actionKey: "confirm_tour", entityType: "opportunity", entityId: "opp-1" })
        );
    });

    it("surfaces a structured error when no active booking exists", async () => {
        (executeAdminAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            correlation_id: "corr-err",
            error: "No active tour booking found for this record.",
            status: 400,
        });
        const result = await runRegisteredAction(
            supabase,
            ctx,
            { actionKey: "confirm_tour", entityType: "opportunity", entityId: "opp-1" },
            "execute"
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected error");
        expect(result.error).toMatch(/tour booking/);
    });

    it("cannot execute without a record (context validation)", async () => {
        const result = await runRegisteredAction(
            supabase,
            ctx,
            { actionKey: "confirm_tour", entityType: "opportunity", entityId: "" },
            "execute"
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected error");
        expect(executeAdminAction).not.toHaveBeenCalled();
    });
});
