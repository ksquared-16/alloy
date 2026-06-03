import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { POST as postTasks } from "@/app/api/admin/operational-tasks/route";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const taskId = "66666666-6666-4666-8666-666666666666";

const mockCreate = vi.fn();
const mockInstantiateFromDefinition = vi.fn();

vi.mock("@/lib/admin/getAdminOrgContextLight", () => ({
    requireAdminOrgContextLight: vi.fn(() =>
        Promise.resolve({ ok: true, orgId, userId, role: "admin", roleKeys: ["admin"] }),
    ),
    adminOrgContextLightFailureResponse: (failure: { status: number }) =>
        new Response(JSON.stringify({ error: failure.status === 401 ? "Unauthorized" : "Forbidden" }), {
            status: failure.status,
        }),
}));

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("@/lib/admin/operationalWork", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/operationalWork")>("@/lib/admin/operationalWork");
    return {
        ...actual,
        createWorkInstance: (...args: unknown[]) => mockCreate(...args),
        instantiateWorkFromDefinition: (...args: unknown[]) => mockInstantiateFromDefinition(...args),
    };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({})),
}));

const modal = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/opportunity/OpportunityRecordCreateWorkModal.tsx",
);
const taskAssistCard = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/taskAssist/TaskAssistCompactReminderCard.tsx",
);

describe("OpportunityRecordCreateWorkModal B3", () => {
    it("shows work type selector with operator language", () => {
        const src = readFileSync(modal, "utf8");
        expect(src).toContain("Type of work");
        expect(src).toContain("buildCreateWorkModalDefinitionOptions");
        expect(src).toContain("CREATE_WORK_AD_HOC_OPTION_KEY");
        expect(src).toContain("workDefinitionKey");
        expect(src).not.toContain("work_definition_key");
        expect(src).not.toContain("dedupe_policy");
    });

    it("handles deduped create gracefully", () => {
        const src = readFileSync(modal, "utf8");
        expect(src).toContain('json.instantiate?.status === "deduped"');
        expect(src).toContain("Open work already exists");
        expect(src).toContain("dispatchRefresh");
    });

    it("prefills from selected definition", () => {
        const src = readFileSync(modal, "utf8");
        expect(src).toContain("resolveCreateWorkModalDefinitionPrefill");
        expect(src).toContain("onWorkTypeChange");
    });
});

describe("operational-tasks POST definition path", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("routes definition-backed creates through instantiateWorkFromDefinition", async () => {
        mockInstantiateFromDefinition.mockResolvedValue({
            status: "created",
            work: { id: taskId, org_id: orgId, entity_id: oppId, status: "open", title: "Contact family", due_at: "2027-01-02T12:00:00.000Z", source: "manual", metadata: {} },
            dedupeKey: "dedupe-1",
        });

        const req = new NextRequest("http://localhost/api/admin/operational-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: "opportunities",
                entity_id: oppId,
                title: "Contact family",
                due_at: "2027-01-02T12:00:00.000Z",
                source: "manual",
                work_definition_key: "contact_family",
            }),
        });
        const res = await postTasks(req);
        expect(res.status).toBe(201);
        expect(mockInstantiateFromDefinition).toHaveBeenCalledOnce();
        expect(mockCreate).not.toHaveBeenCalled();
        const call = mockInstantiateFromDefinition.mock.calls[0]?.[0] as { workDefinitionKey: string };
        expect(call.workDefinitionKey).toBe("contact_family");
    });

    it("returns deduped response without error status", async () => {
        mockInstantiateFromDefinition.mockResolvedValue({
            status: "deduped",
            existingWork: { id: taskId, org_id: orgId, entity_id: oppId, status: "open", title: "Contact family", due_at: "2027-01-02T12:00:00.000Z", source: "manual", metadata: {} },
            dedupeKey: "dedupe-1",
            reason: "open_instance_exists",
        });

        const req = new NextRequest("http://localhost/api/admin/operational-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: "opportunities",
                entity_id: oppId,
                title: "Contact family",
                due_at: "2027-01-02T12:00:00.000Z",
                source: "manual",
                work_definition_key: "contact_family",
            }),
        });
        const res = await postTasks(req);
        expect(res.status).toBe(200);
        const json = (await res.json()) as { ok?: boolean; instantiate?: { status?: string } };
        expect(json.ok).toBe(true);
        expect(json.instantiate?.status).toBe("deduped");
    });

    it("keeps ad hoc creates on createWorkInstance", async () => {
        mockCreate.mockResolvedValue({
            ok: true,
            row: { id: taskId, org_id: orgId, entity_id: oppId, status: "open", title: "Custom", due_at: "2027-01-02T12:00:00.000Z", source: "manual", metadata: {} },
            instantiateStatus: "created",
        });

        const req = new NextRequest("http://localhost/api/admin/operational-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: "opportunities",
                entity_id: oppId,
                title: "Custom follow-up",
                due_at: "2027-01-02T12:00:00.000Z",
                source: "manual",
            }),
        });
        const res = await postTasks(req);
        expect(res.status).toBe(201);
        expect(mockCreate).toHaveBeenCalledOnce();
        expect(mockInstantiateFromDefinition).not.toHaveBeenCalled();
    });
});

describe("Task Assist unchanged", () => {
    it("Task Assist compact reminder still posts without work_definition_key", () => {
        const src = readFileSync(taskAssistCard, "utf8");
        expect(src).toContain("createOperationalTask");
        expect(src).toContain("buildOperationalTaskBody");
        expect(src).not.toContain("workDefinitionKey");
    });
});
