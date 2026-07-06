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
                            id: "pub-1",
                            org_id: "org-1",
                            industry_key: null,
                            entity_type: "workspace",
                            surface: "workspace",
                            layout_key: "workspace_header",
                            name: "Workspace Header",
                            version: 1,
                            status: "published",
                            is_system_default: false,
                            doc: { metadata: { workspaceHeaderSurface: { version: 1, title: "Firefly", subtitle: "Ops", kpis: [] } } },
                            metadata: { source: "workspace_header_builder" },
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

describe("PUT /api/admin/surfaces/workspace-header", () => {
    beforeEach(() => {
        listOrgLayouts.mockReset();
        createDraft.mockReset();
        updateDraft.mockReset();
        publishLayout.mockReset();
    });

    it("publishes a new layout when none exists", async () => {
        listOrgLayouts.mockResolvedValue([]);
        createDraft.mockResolvedValue({ id: "draft-1" });
        publishLayout.mockResolvedValue({ id: "draft-1", status: "published", layoutKey: "workspace_header" });

        const { PUT } = await import("@/app/api/admin/surfaces/workspace-header/route");
        const req = new Request("http://localhost/api/admin/surfaces/workspace-header", {
            method: "PUT",
            body: JSON.stringify({
                config: {
                    title: "Firefly Early Learning",
                    subtitle: "Operational Workspace",
                    kpis: [],
                },
            }),
        });
        const res = await PUT(req as never);
        expect(res.status).toBe(201);
        expect(createDraft).toHaveBeenCalledTimes(1);
        expect(publishLayout).toHaveBeenCalledWith(expect.anything(), "draft-1");
        expect(createDraft.mock.calls[0]?.[1]?.layoutKey).toBe("workspace_header");
    });

    it("updates the existing published row in place on second publish (no duplicate published rows)", async () => {
        listOrgLayouts.mockResolvedValue([
            {
                id: "pub-1",
                layoutKey: "workspace_header",
                status: "published",
                version: 1,
                doc: { metadata: {} },
            },
        ]);

        const { PUT } = await import("@/app/api/admin/surfaces/workspace-header/route");
        const req = new Request("http://localhost/api/admin/surfaces/workspace-header", {
            method: "PUT",
            body: JSON.stringify({
                config: {
                    title: "Firefly Early Learning",
                    subtitle: "Operational Workspace",
                    kpis: [],
                },
            }),
        });
        const res = await PUT(req as never);
        expect(res.status).toBe(200);
        expect(createDraft).not.toHaveBeenCalled();
        expect(publishLayout).not.toHaveBeenCalled();
    });
});
