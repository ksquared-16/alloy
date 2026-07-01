import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/actions/executeAdminAction", () => ({
    executeAdminAction: vi.fn(),
}));

import { createLeadAction } from "@/lib/adminV2/actions/definitions/createLeadAction";
import { runRegisteredAction } from "@/lib/adminV2/actions/actionExecutor";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import type { ActionHandlerDeps } from "@/lib/adminV2/actions/actionTypes";

const supabase = {} as never;
const ctx = { orgId: "org-1", userId: "user-1" };

function deps(payload: Record<string, unknown>): ActionHandlerDeps {
    return {
        supabase,
        ctx,
        invocation: { actionKey: "create_lead", entityType: "opportunity", entityId: "", payload },
        payload,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("create_lead eligibility", () => {
    it("reports required inputs and blockers when contact details are missing", async () => {
        const result = await createLeadAction.resolveEligibility(deps({ first_name: "Ada" }));
        expect(result.eligible).toBe(false);
        const codes = result.blockers.map((b) => b.field);
        expect(codes).toContain("last_name");
        expect(codes).toContain("email");
        expect(result.requiredInputs.map((i) => i.key)).toEqual(["first_name", "last_name", "email", "phone"]);
    });

    it("is eligible with name + one contact method", async () => {
        const result = await createLeadAction.resolveEligibility(
            deps({ first_name: "Ada", last_name: "Lovelace", phone: "555-0100" })
        );
        expect(result.eligible).toBe(true);
        expect(result.blockers).toHaveLength(0);
    });
});

describe("create_lead executes through the shared executor (manual + BOS)", () => {
    it("delegates a BOS-confirmed proposal to the canonical create-lead path", async () => {
        (executeAdminAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            correlation_id: "corr-1",
            execution_result: { kind: "create_lead", opportunity_id: "opp-new", person_id: "p-1", customer_id: "c-1" },
        });

        const result = await runRegisteredAction(
            supabase,
            ctx,
            {
                actionKey: "create_lead",
                entityType: "opportunity",
                entityId: "",
                context: { origin: "bos", surface: "bos_rail" },
                payload: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            },
            "execute"
        );

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("expected success");
        expect(result.result.affectedId).toBe("opp-new");
        expect(executeAdminAction).toHaveBeenCalledTimes(1);
        expect(executeAdminAction).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({ orgId: "org-1" }),
            expect.objectContaining({ actionKey: "create_lead", entityType: "opportunity" })
        );
    });

    it("returns a structured error and does not mutate when required info is missing", async () => {
        const result = await runRegisteredAction(
            supabase,
            ctx,
            { actionKey: "create_lead", entityType: "opportunity", entityId: "", payload: { first_name: "Ada" } },
            "execute"
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected error");
        expect(result.status).toBe(400);
        expect(result.blockers && result.blockers.length).toBeGreaterThan(0);
        expect(executeAdminAction).not.toHaveBeenCalled();
    });

    it("surfaces delegated executor errors as structured action errors", async () => {
        (executeAdminAction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            correlation_id: "corr-err",
            error: "Could not create household for this lead.",
            status: 400,
        });
        const result = await runRegisteredAction(
            supabase,
            ctx,
            {
                actionKey: "create_lead",
                entityType: "opportunity",
                entityId: "",
                payload: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
            },
            "execute"
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected error");
        expect(result.error).toMatch(/household/);
    });
});

describe("executor rejects unregistered actions", () => {
    it("returns a not-registered error for unknown keys", async () => {
        const result = await runRegisteredAction(
            supabase,
            ctx,
            { actionKey: "totally_made_up", entityType: "opportunity", entityId: "opp-1" },
            "execute"
        );
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected error");
        expect(result.status).toBe(404);
        expect(result.blockers?.[0]?.code).toBe("unregistered_action");
    });
});
