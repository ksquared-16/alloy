import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import * as getAdminContext from "@/lib/admin/getAdminContext";

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return { ...actual, getAdminContext: vi.fn() };
});

describe("Queue API routes (thin wrappers)", () => {
    beforeEach(() => {
        vi.spyOn(getAdminContext, "getAdminContext").mockResolvedValue({
            ok: true,
            orgId: "org1",
            userId: "u1",
            role: "admin",
        } as any);
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

    it("GET /api/admin/queues/[workUnitId]/[queueKey] caps limit at 100", async () => {
        const getItems = vi.fn(async (p: any) => ({
            queue: { key: p.queueKey, label: "X", entity_type: "job", priority: "standard", display: "list" },
            items: [],
            total: 0,
            limit: p.limit ?? 0,
            offset: p.offset ?? 0,
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
            expect.objectContaining({ limit: 100, offset: 0, workUnitId: "wu1", queueKey: "all" })
        );
    });
});

