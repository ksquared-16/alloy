import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const composeChildDrawerViewModel = vi.fn();

vi.mock("@/lib/adminV2/viewModel/drawer/child/composeChildDrawerViewModel", () => ({
    composeChildDrawerViewModel,
}));

vi.mock("@/lib/admin/adminRouteGate", () => ({
    loadAdminRouteGate: vi.fn(async () => ({
        ok: true,
        orgId: "org-1",
        dim: null,
    })),
    adminRouteGateFailureResponse: vi.fn(),
}));

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

describe("child drawer VM route", () => {
    beforeEach(() => {
        vi.resetModules();
        composeChildDrawerViewModel.mockReset();
    });

    it("returns 200 when compose succeeds for inquiry child person", async () => {
        composeChildDrawerViewModel.mockResolvedValue({
            ok: true,
            viewModel: {
                generation: "child:child-1:v1:1.0.0",
                structureSettled: true,
                compose_version: "1.0.0",
                entity: { type: "person", id: "child-1" },
                surface: "child",
                first_paint: { settled: true, viewport_slots: [], dependencies: [], data: {}, deferred: [], background: [] },
                header: {
                    title: "Mia",
                    subtitle: null,
                    status_label: "Active",
                    status: { renderAs: "hidden" },
                },
                record: { id: "child-1", _household_adult_links: [] },
                layout: { variant_key: "child", operating_sections: ["child_summary", "household"] },
                background_refresh: { allowed: ["status_values"] },
                timing: { compose_ms: 120, phases_ms: {} },
            },
        });

        const { GET } = await import("@/app/api/admin/view-models/drawer/child/[id]/route");
        const res = await GET(
            new Request("http://localhost/api/admin/view-models/drawer/child/child-1?compose_depth=first_paint") as unknown as NextRequest,
            { params: Promise.resolve({ id: "child-1" }) }
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.entity.id).toBe("child-1");
        expect(composeChildDrawerViewModel).toHaveBeenCalledWith(
            expect.objectContaining({
                personId: "child-1",
                composeDepth: "first_paint",
            })
        );
    });
});
