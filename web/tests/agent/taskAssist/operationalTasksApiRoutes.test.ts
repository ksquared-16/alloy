import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { GET as getTasks, POST as postTasks } from "@/app/api/admin/operational-tasks/route";
import { PATCH as patchTask } from "@/app/api/admin/operational-tasks/[id]/route";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const taskId = "66666666-6666-4666-8666-666666666666";

const { mockGetAdminContextCached, mockAssertRowOrg, mockCreate, mockList, mockComplete, mockCancel } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockAssertRowOrg: vi.fn(),
    mockCreate: vi.fn(),
    mockList: vi.fn(),
    mockComplete: vi.fn(),
    mockCancel: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/adminAuth", async () => {
    const actual = await vi.importActual<typeof import("@/lib/adminAuth")>("@/lib/adminAuth");
    return { ...actual, requireAdminOrOps: vi.fn(() => Promise.resolve(null)) };
});

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: (...args: unknown[]) => mockAssertRowOrg(...args),
}));

vi.mock("@/lib/admin/operationalTasksService", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/operationalTasksService")>("@/lib/admin/operationalTasksService");
    return {
        ...actual,
        createOperationalTask: (...args: unknown[]) => mockCreate(...args),
        listOperationalTasksForEntity: (...args: unknown[]) => mockList(...args),
        completeOperationalTask: (...args: unknown[]) => mockComplete(...args),
        cancelOperationalTask: (...args: unknown[]) => mockCancel(...args),
    };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

describe("operational-tasks admin routes", () => {
    beforeEach(() => {
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId, role: "admin" });
        mockAssertRowOrg.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("GET lists tasks", async () => {
        mockList.mockResolvedValue({ ok: true, rows: [{ id: taskId, status: "open" }] });
        const req = new NextRequest(`http://localhost/api/admin/operational-tasks?entity_type=opportunities&entity_id=${oppId}`);
        const res = await getTasks(req);
        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok?: boolean; tasks?: unknown[] };
        expect(j.tasks).toHaveLength(1);
    });

    it("POST creates task", async () => {
        mockCreate.mockResolvedValue({
            ok: true,
            row: { id: taskId, org_id: orgId, entity_id: oppId, status: "open", title: "t", due_at: "2026-06-01T00:00:00.000Z", source: "task_assist" },
        });
        const req = new NextRequest("http://localhost/api/admin/operational-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: "opportunities",
                entity_id: oppId,
                title: "Call back",
                due_at: "2026-06-01T00:00:00.000Z",
                source: "task_assist",
            }),
        });
        const res = await postTasks(req);
        expect(res.status).toBe(201);
        expect(mockCreate).toHaveBeenCalledOnce();
    });

    it("PATCH complete delegates to service", async () => {
        mockComplete.mockResolvedValue({ ok: true, row: { id: taskId, status: "completed" } });
        const req = new NextRequest(`http://localhost/api/admin/operational-tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
        });
        const res = await patchTask(req, { params: Promise.resolve({ id: taskId }) });
        expect(res.status).toBe(200);
        expect(mockComplete).toHaveBeenCalledOnce();
        expect(mockCancel).not.toHaveBeenCalled();
    });

    it("PATCH cancel delegates to service", async () => {
        mockCancel.mockResolvedValue({ ok: true, row: { id: taskId, status: "canceled" } });
        const req = new NextRequest(`http://localhost/api/admin/operational-tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "canceled" }),
        });
        const res = await patchTask(req, { params: Promise.resolve({ id: taskId }) });
        expect(res.status).toBe(200);
        expect(mockCancel).toHaveBeenCalledOnce();
    });
});
