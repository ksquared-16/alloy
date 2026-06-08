import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    clearOperationalTasksWorkspaceCache,
    getCachedWorkspaceOperationalTasks,
    prefetchWorkspaceOperationalTasks,
    setCachedWorkspaceOperationalTasks,
} from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";

vi.mock("@/lib/agent/taskAssist/taskAssistV11OpportunityApi", () => ({
    fetchWorkspaceOperationalTasks: vi.fn(async () => ({
        ok: true,
        json: async () => ({
            ok: true,
            tasks: [{ id: "t1", title: "Call family", due_at: "2026-05-21T12:00:00Z", status: "open" }],
        }),
    })),
    readJson: async (res: { json: () => Promise<unknown> }) => res.json(),
}));

describe("operationalTasksWorkspaceCache", () => {
    beforeEach(() => {
        clearOperationalTasksWorkspaceCache();
    });

    afterEach(() => {
        clearOperationalTasksWorkspaceCache();
        vi.clearAllMocks();
    });

    it("stores and returns cached tasks by filter", () => {
        setCachedWorkspaceOperationalTasks("open", [
            {
                id: "t1",
                title: "A",
                description: null,
                due_at: "2026-05-21T12:00:00Z",
                status: "open",
                source: "manual",
                entity_id: "e1",
                entity_type: "opportunities",
                created_at: "2026-05-21T10:00:00Z",
            },
        ]);
        expect(getCachedWorkspaceOperationalTasks("open")).toHaveLength(1);
    });

    it("prefetch populates cache without blocking callers", async () => {
        prefetchWorkspaceOperationalTasks("open");
        await vi.waitFor(() => expect(getCachedWorkspaceOperationalTasks("open")).toHaveLength(1));
    });
});
