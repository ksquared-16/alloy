import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    clearWorkspaceNavTreeCache,
    getInitialWorkspaceNavTreeState,
    getWorkspaceNavTreeSnapshot,
    hydrateWorkspaceNavTreeCache,
    loadWorkspaceNavTree,
} from "@/lib/adminV2/navigation/workspaceNavTreeCache";
import { clearWorkspaceNavTreeSession } from "@/lib/adminV2/navigation/workspaceNavTreeSession";

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
    const store: Record<string, string> = {};

    beforeEach(() => {
        clearWorkspaceNavTreeCache();
        clearWorkspaceNavTreeSession();
        vi.stubGlobal("sessionStorage", {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => {
                store[k] = v;
            },
            removeItem: (k: string) => {
                delete store[k];
            },
        });
        vi.stubGlobal("window", { sessionStorage: globalThis.sessionStorage });
    });

    afterEach(() => {
        clearWorkspaceNavTreeCache();
        clearWorkspaceNavTreeSession();
        vi.unstubAllGlobals();
        Object.keys(store).forEach((k) => delete store[k]);
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

    it("hydrates from session after memory cache clear", async () => {
        await loadWorkspaceNavTree();
        clearWorkspaceNavTreeCache();
        const hydrated = hydrateWorkspaceNavTreeCache();
        expect(hydrated?.depts).toHaveLength(1);
        expect(getInitialWorkspaceNavTreeState().showLoading).toBe(false);
    });
});
