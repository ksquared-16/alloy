import { afterEach, describe, expect, it, vi } from "vitest";
import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { resolveDeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";

const fetchMock = vi.fn();

vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetch: (...args: unknown[]) => fetchMock(...args),
}));

describe("resolveDeptPipelineExecSurface", () => {
    afterEach(() => {
        fetchMock.mockReset();
    });

    it("uses workUnitDetailById without GET /work-units/:id when layout is not pipeline", async () => {
        const detail = new Map([
            [
                "wu-1",
                {
                    department_id: "dept-1",
                    queue_definition: { queues: [], ui: { layout: "standard" } },
                },
            ],
        ]);
        const out = await resolveDeptPipelineExecSurface({
            departmentId: "dept-1",
            candidates: [{ id: "wu-1", key: "other" }],
            workUnitDetailById: detail,
        });
        expect(out).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("resolves v2 enrollment_pipeline domain layout via bundle loader", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                queues: [
                    { key: "new_leads", count: 4, counts_deferred: false },
                    { key: "waitlist", count: 2, counts_deferred: false },
                ],
            }),
        });
        const detail = new Map([
            [
                "wu-enroll",
                {
                    department_id: "dept-1",
                    queue_definition: ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.normalized.raw,
                },
            ],
        ]);
        const out = await resolveDeptPipelineExecSurface({
            departmentId: "dept-1",
            candidates: [{ id: "wu-enroll", key: "enrollment_pipeline" }],
            workUnitDetailById: detail,
        });
        expect(out).not.toBeNull();
        expect(out?.workUnitId).toBe("wu-enroll");
        expect(out?.lanes.map((l) => l.key)).toContain("new_leads");
        expect(out?.lanes.map((l) => l.key)).toContain("waitlist");
        expect(out?.lanes.map((l) => l.key)).not.toContain("needs_attention");
    });
});
