import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetAdminContext, mockGetAdminAccessContext, mockCreateAdminClient } = vi.hoisted(() => ({
    mockGetAdminContext: vi.fn(),
    mockGetAdminAccessContext: vi.fn(),
    mockCreateAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return {
        ...actual,
        getAdminContext: mockGetAdminContext,
        getAdminContextCached: mockGetAdminContext,
    };
});

vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    getAdminAccessContextCached: mockGetAdminAccessContext,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: mockCreateAdminClient,
}));

describe("Queue API routes (thin wrappers)", () => {
    beforeEach(() => {
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: "org1",
            userId: "u1",
            role: "admin",
        } as any);
        mockGetAdminAccessContext.mockResolvedValue({
            ok: true,
            userId: "u1",
            orgId: "org1",
            roleKeys: ["admin"],
            permissionKeys: [],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        });
        mockCreateAdminClient.mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "work_units") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "wu1" }, error: null }),
                                })),
                            })),
                        })),
                    };
                }
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data:
                                    table === "user_profiles"
                                        ? { timezone: "America/Los_Angeles" }
                                        : { metadata: { timezone: "America/Los_Angeles" } },
                                error: null,
                            }),
                        })),
                    })),
                };
            }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("GET /api/admin/work-units/[id]/queues calls service and returns {queues}", async () => {
        vi.doMock("@/lib/queues/QueueService", () => ({
            QueueServiceError: class QueueServiceError extends Error {
                status: number;
                code: string;
                constructor(m: string, s: number, c: string) {
                    super(m);
                    this.status = s;
                    this.code = c;
                }
            },
            getWorkUnitQueueSummaries: vi.fn(async () => ({
                queues: [{ key: "all", label: "All", entity_type: "job", priority: "standard", display: "list", count: 0, preview: [] }],
            })),
        }));
        const { GET } = await import("@/app/api/admin/work-units/[id]/queues/route");

        const req = new NextRequest("http://localhost/api/admin/work-units/wu1/queues?limit=5");
        const res = await GET(req, { params: Promise.resolve({ id: "wu1" }) });
        expect(res.status).toBe(200);
        const j = (await res.json()) as { queues: unknown[] };
        expect(Array.isArray(j.queues)).toBe(true);
    });

    it("GET /api/admin/work-units/[id]/queues passes record scope into QueueService (never omits for scoped callers)", async () => {
        vi.resetModules();
        const getSummaries = vi.fn(async () => ({
            queues: [{ key: "needs_attention", label: "NA", entity_type: "opportunity", priority: "critical", display: "list", count: 2, preview: [] }],
            work_unit_scope_total: 2,
            work_unit_scope_queue_key: "pipeline_total",
        }));
        vi.doMock("@/lib/queues/QueueService", () => ({
            QueueServiceError: class QueueServiceError extends Error {
                status: number;
                code: string;
                constructor(m: string, s: number, c: string) {
                    super(m);
                    this.status = s;
                    this.code = c;
                }
            },
            getWorkUnitQueueSummaries: getSummaries,
        }));

        mockGetAdminAccessContext.mockResolvedValue({
            ok: true,
            userId: "u1",
            orgId: "org1",
            roleKeys: ["school_director"],
            permissionKeys: [],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "restricted",
            allowedSiteLocationIds: ["site-south"],
        });

        mockCreateAdminClient.mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "work_units") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "wu1" }, error: null }),
                                })),
                            })),
                        })),
                    };
                }
                if (table === "locations") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                in: vi.fn().mockResolvedValue({ data: [], error: null }),
                            })),
                        })),
                    };
                }
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data:
                                    table === "user_profiles"
                                        ? { timezone: "America/Los_Angeles" }
                                        : { metadata: { timezone: "America/Los_Angeles" } },
                                error: null,
                            }),
                        })),
                    })),
                };
            }),
        });

        const { GET } = await import("@/app/api/admin/work-units/[id]/queues/route");
        const req = new NextRequest("http://localhost/api/admin/work-units/wu1/queues");
        const res = await GET(req, { params: Promise.resolve({ id: "wu1" }) });
        expect(res.status).toBe(200);
        expect(getSummaries).toHaveBeenCalledWith(
            expect.objectContaining({
                workUnitId: "wu1",
                recordScopeImpossible: false,
                recordScopeConstraints: expect.objectContaining({
                    locationIds: expect.arrayContaining(["site-south"]),
                }),
            })
        );
    });

    it("GET /api/admin/queues/[workUnitId]/[queueKey] caps limit at 100", async () => {
        const getItems = vi.fn(async (p: any) => ({
            result: {
                queue: { key: p.queueKey, label: "X", entity_type: "job", priority: "standard", display: "list" },
                items: [],
                total: 0,
                limit: p.limit ?? 0,
                offset: p.offset ?? 0,
            },
            rowsPerf: {
                load_def_ms: 0,
                operational_day_ms: 0,
                base_query_ms: 0,
                count_ms: 0,
                status_defs_ms: 0,
                enrichment_ms: 0,
                service_total_ms: 0,
                status_defs_cache_hit: null,
                status_defs_resolve: null,
                queue_def_cache_hit: false,
                operational_day_cache_hit: false,
                enrichment_subtimings_ms: null,
            },
        }));
        vi.doMock("@/lib/queues/QueueService", () => ({
            QueueServiceError: class QueueServiceError extends Error {
                status: number;
                code: string;
                constructor(m: string, s: number, c: string) {
                    super(m);
                    this.status = s;
                    this.code = c;
                }
            },
            getWorkUnitQueueItems: getItems,
        }));
        const { GET } = await import("@/app/api/admin/queues/[workUnitId]/[queueKey]/route");

        const req = new NextRequest("http://localhost/api/admin/queues/wu1/all?limit=999&offset=0");
        const res = await GET(req, { params: Promise.resolve({ workUnitId: "wu1", queueKey: "all" }) });
        expect(res.status).toBe(200);
        expect(getItems).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 100,
                offset: 0,
                workUnitId: "wu1",
                queueKey: "all",
                recordScopeImpossible: false,
                recordScopeConstraints: null,
            })
        );
    });

    it("GET /api/admin/departments/[id]/work-unit-queue-summaries passes scope constraints when restricted", async () => {
        mockGetAdminAccessContext.mockResolvedValue({
            ok: true,
            userId: "u1",
            orgId: "org1",
            roleKeys: ["school_director"],
            permissionKeys: [],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "restricted",
            allowedSiteLocationIds: ["site-south"],
        });

        // Department exists
        mockCreateAdminClient.mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "departments") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "dept1" }, error: null }),
                                })),
                            })),
                        })),
                    };
                }
                if (table === "user_profiles") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn().mockResolvedValue({ data: { timezone: "America/Los_Angeles" }, error: null }),
                            })),
                        })),
                    };
                }
                if (table === "org_settings") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: { timezone: "America/Los_Angeles" } }, error: null }),
                            })),
                        })),
                    };
                }
                if (table === "work_units") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    order: vi.fn().mockResolvedValue({ data: [{ id: "wu1" }], error: null }),
                                })),
                            })),
                        })),
                    };
                }
                // resolveRecordScopeConstraints will query work_units/locations/etc via accessScope helpers; keep permissive fallbacks
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            in: vi.fn(() => Promise.resolve({ data: [], error: null })),
                            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                        })),
                    })),
                };
            }),
        });

        const svc = vi.fn(async (p: any) => ({ work_units: [] }));
        vi.doMock("@/lib/queues/QueueService", () => ({
            QueueServiceError: class QueueServiceError extends Error {
                status: number;
                code: string;
                constructor(m: string, s: number, c: string) {
                    super(m);
                    this.status = s;
                    this.code = c;
                }
            },
            getDepartmentWorkUnitQueueSummaries: svc,
        }));

        const { GET } = await import("@/app/api/admin/departments/[departmentId]/work-unit-queue-summaries/route");
        const req = new NextRequest(
            "http://localhost/api/admin/departments/dept1/work-unit-queue-summaries?include_previews=false&count_mode=exact&summary_mode=priority&priority_budget=5"
        );
        const res = await GET(req, { params: Promise.resolve({ departmentId: "dept1" }) });
        expect(res.status).toBe(200);
        expect(svc).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: "org1",
                departmentId: "dept1",
                recordScopeImpossible: false,
                recordScopeConstraints: expect.anything(),
            })
        );
    });
});

