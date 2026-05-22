import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    clearWorkspaceNavTreeCache,
    getWorkspaceNavTreeSnapshot,
    loadWorkspaceNavTree,
} from "@/lib/adminV2/navigation/workspaceNavTreeCache";

vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetch: vi.fn(async (url: string) => {
        if (url.includes("departments")) {
            return {
                ok: true,
                json: async () => ({ items: [{ id: "d1", name: "Enrollment", key: "enrollment" }] }),
            };
        }
        return {
            ok: true,
            json: async () => ({
                items: [{ id: "w1", name: "Billing", key: "billing", department_id: "d1" }],
            }),
        };
    }),
}));

vi.mock("@/lib/workspace/workspaceDataFetch", () => ({
    workspaceDataFetchInit: () => ({}),
}));

describe("workspaceNavTreeCache", () => {
    beforeEach(() => {
        clearWorkspaceNavTreeCache();
    });

    afterEach(() => {
        clearWorkspaceNavTreeCache();
        vi.clearAllMocks();
    });

    it("returns cached snapshot without second fetch", async () => {
        const first = await loadWorkspaceNavTree();
        expect(first.depts).toHaveLength(1);
        const second = await loadWorkspaceNavTree();
        expect(second).toBe(first);
        expect(getWorkspaceNavTreeSnapshot()?.depts[0]?.id).toBe("d1");
    });

    it("force refresh reloads tree", async () => {
        await loadWorkspaceNavTree();
        const before = getWorkspaceNavTreeSnapshot()!.loadedAtMs;
        await new Promise((r) => setTimeout(r, 2));
        const refreshed = await loadWorkspaceNavTree({ force: true });
        expect(refreshed.loadedAtMs).toBeGreaterThanOrEqual(before);
    });
});
