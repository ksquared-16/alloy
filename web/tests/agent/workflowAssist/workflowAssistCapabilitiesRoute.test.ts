import { describe, expect, it, vi, beforeEach } from "vitest";

import { GET } from "@/app/api/admin/ai/workflow-assist/capabilities/route";

const { mockGetAdminContextCached } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContextCached,
    };
});

describe("GET /api/admin/ai/workflow-assist/capabilities", () => {
    beforeEach(() => {
        mockGetAdminContextCached.mockReset();
    });

    it("returns can_propose_and_apply_workflow_assist true for admin role", async () => {
        mockGetAdminContextCached.mockResolvedValue({
            ok: true,
            orgId: "11111111-1111-4111-8111-111111111111",
            userId: "22222222-2222-4222-8222-222222222222",
            role: "admin",
        });
        const res = await GET();
        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok?: boolean; can_propose_and_apply_workflow_assist?: boolean };
        expect(j.ok).toBe(true);
        expect(j.can_propose_and_apply_workflow_assist).toBe(true);
    });

    it("returns can_propose_and_apply_workflow_assist false for ops role", async () => {
        mockGetAdminContextCached.mockResolvedValue({
            ok: true,
            orgId: "11111111-1111-4111-8111-111111111111",
            userId: "22222222-2222-4222-8222-222222222222",
            role: "ops",
        });
        const res = await GET();
        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok?: boolean; can_propose_and_apply_workflow_assist?: boolean };
        expect(j.ok).toBe(true);
        expect(j.can_propose_and_apply_workflow_assist).toBe(false);
    });
});
