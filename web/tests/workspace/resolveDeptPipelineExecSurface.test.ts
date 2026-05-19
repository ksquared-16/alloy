import { afterEach, describe, expect, it, vi } from "vitest";
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
});
