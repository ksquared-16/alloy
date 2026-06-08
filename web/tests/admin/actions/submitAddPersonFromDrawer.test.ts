import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    submitAddPersonFromDrawer,
    validateAddPersonSubmitPayload,
} from "@/lib/admin/actions/submitAddPersonFromDrawer";

describe("validateAddPersonSubmitPayload", () => {
    it("blocks missing contact channel", () => {
        expect(
            validateAddPersonSubmitPayload({ first_name: "Ada", last_name: "Lo" })
        ).toMatch(/phone or email/i);
    });
});

describe("submitAddPersonFromDrawer", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("posts execute with payload and returns person_id", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                ok: true,
                execution_result: { person_id: "person-9", opportunity_person_id: "op-1" },
            }),
        });

        const result = await submitAddPersonFromDrawer({
            entityType: "opportunity",
            entityId: "opp-1",
            actionKey: "add_family_member",
            payload: {
                first_name: "Ada",
                last_name: "Lo",
                email: "ada@example.com",
                role_type: "parent",
            },
            fetchFn: fetchFn as typeof fetch,
        });

        expect(result.person_id).toBe("person-9");
        expect(fetchFn).toHaveBeenCalledWith(
            "/api/admin/actions/execute",
            expect.objectContaining({ method: "POST" })
        );
        const body = JSON.parse(String((fetchFn.mock.calls[0] as [string, RequestInit])[1]?.body));
        expect(body.action_key).toBe("add_family_member");
        expect(body.payload.first_name).toBe("Ada");
    });

    it("throws server error message", async () => {
        const fetchFn = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ ok: false, error: "Not found" }),
        });

        await expect(
            submitAddPersonFromDrawer({
                entityType: "opportunity",
                entityId: "opp-missing",
                actionKey: "add_family_member",
                payload: { first_name: "A", last_name: "B", phone: "555" },
                fetchFn: fetchFn as typeof fetch,
            })
        ).rejects.toThrow(/not found/i);
    });
});
