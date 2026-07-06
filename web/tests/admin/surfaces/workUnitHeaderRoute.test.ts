import { beforeEach, describe, expect, it, vi } from "vitest";

const listOrgLayouts = vi.fn();
const createDraft = vi.fn();
const updateDraft = vi.fn();
const publishLayout = vi.fn();
const createAdminClient = vi.fn(() => ({
    from: vi.fn(() => ({
        update: vi.fn(() => ({
            eq: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                        data: {
                            id: "pub-wuh",
                            org_id: "org-1",
                            industry_key: null,
                            entity_type: "workspace",
                            surface: "workspace",
                            layout_key: "work_unit_header",
                            name: "Work Unit Header",
                            version: 1,
                            status: "published",
                            is_system_default: false,
                            doc: {
                                metadata: {
                                    workUnitHeaderSurface: { version: 1, title: "Enrollment", subtitle: "Pipeline", kpis: [] },
                                },
                            },
                            metadata: { source: "work_unit_header_builder" },
                            created_by: "u1",
                            created_at: "2026-01-01",
                            updated_at: "2026-01-01",
                            published_at: "2026-01-01",
                        },
                        error: null,
                    })),
                })),
            })),
        })),
    })),
}));

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient }));
vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(async () => ({
        ok: true,
        orgId: "org-1",
        userId: "u1",
        role: "admin",
    })),
}));
vi.mock("@/lib/layout/entityLayoutsRepo", () => ({
    listOrgLayouts,
    createDraft,
    updateDraft,
    publishLayout,
}));

describe("PUT /api/admin/surfaces/work-unit-header", () => {
    beforeEach(() => {
        listOrgLayouts.mockReset();
        createDraft.mockReset();
        updateDraft.mockReset();
        publishLayout.mockReset();
    });

    it("publishes a new layout when none exists", async () => {
        listOrgLayouts.mockResolvedValue([]);
        createDraft.mockResolvedValue({ id: "draft-wuh" });
        publishLayout.mockResolvedValue({ id: "draft-wuh", status: "published", layoutKey: "work_unit_header" });

        const { PUT } = await import("@/app/api/admin/surfaces/work-unit-header/route");
        const req = new Request("http://localhost/api/admin/surfaces/work-unit-header", {
            method: "PUT",
            body: JSON.stringify({
                config: {
                    title: "Enrollment",
                    subtitle: "Active Pipeline",
                    kpis: [],
                },
            }),
        });
        const res = await PUT(req as never);
        expect(res.status).toBe(201);
        expect(createDraft.mock.calls[0]?.[1]?.layoutKey).toBe("work_unit_header");
    });

    it("updates the existing published row in place on second publish", async () => {
        listOrgLayouts.mockResolvedValue([
            {
                id: "pub-wuh",
                layoutKey: "work_unit_header",
                status: "published",
                version: 1,
                doc: { metadata: {} },
            },
        ]);

        const { PUT } = await import("@/app/api/admin/surfaces/work-unit-header/route");
        const req = new Request("http://localhost/api/admin/surfaces/work-unit-header", {
            method: "PUT",
            body: JSON.stringify({ config: { title: "Enrollment", subtitle: "Pipeline", kpis: [] } }),
        });
        const res = await PUT(req as never);
        expect(res.status).toBe(200);
        expect(createDraft).not.toHaveBeenCalled();
        expect(publishLayout).not.toHaveBeenCalled();
    });
});
