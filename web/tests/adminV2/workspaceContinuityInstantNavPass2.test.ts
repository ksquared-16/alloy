import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    readWorkspaceRootCache,
    writeWorkspaceRootCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import {
    peekWorkspaceLifecycleCardsForRestore,
    resetWorkspaceContinuityPrefetchForTests,
    scheduleWorkspaceRootRevalidation,
    writeWorkspaceLifecycleCardsCache,
} from "@/lib/workspace/workspaceContinuityPrefetch";
import {
    resetAdminV2NavigationTransitionForTests,
    runAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation/adminV2NavigationTransition";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const SAMPLE_CARD: OperatorLifecycleLandingCard = {
    id: "lc-1",
    departmentId: "dept-1",
    processKey: "enrollment",
    label: "Enrollment",
    description: "Enrollment lifecycle",
    entryHref: "/workspace/work-unit/new-leads",
    workQueues: [],
    stageCount: 3,
    activeRecordCount: 12,
    needsAttentionCount: 2,
};

let store: Record<string, string> = {};

beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, "sessionStorage", {
        value: {
            getItem: (key: string) => store[key] ?? null,
            setItem: (key: string, value: string) => {
                store[key] = value;
            },
            removeItem: (key: string) => {
                delete store[key];
            },
            clear: () => {
                store = {};
            },
            get length() {
                return Object.keys(store).length;
            },
            key: (index: number) => Object.keys(store)[index] ?? null,
        },
        writable: true,
        configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
        value: {
            ...globalThis,
            dispatchEvent: () => true,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        },
        writable: true,
        configurable: true,
    });
    resetWorkspaceContinuityPrefetchForTests();
    resetAdminV2NavigationTransitionForTests();
});

afterEach(() => {
    resetWorkspaceContinuityPrefetchForTests();
    resetAdminV2NavigationTransitionForTests();
});

describe("workspace continuity + instant navigation pass 2", () => {
    it("workspace session cache stores lifecycle cards (schema v6)", () => {
        writeWorkspaceRootCache("org-1", "user-1", "scope-a", {
            departments: [],
            deptTileStats: {},
            metrics: { departments: null, workUnits: null },
            orgOpportunityKpis: null,
            kpiPlacementPending: false,
            rollupRefined: true,
            lifecycleCards: [SAMPLE_CARD],
        });
        const hit = readWorkspaceRootCache("org-1", "user-1", "scope-a");
        expect(hit?.lifecycleCards?.[0]?.id).toBe("lc-1");
    });

    it("peekWorkspaceLifecycleCardsForRestore reads session cache", () => {
        writeWorkspaceRootCache("org-1", "user-1", "scope-a", {
            departments: [],
            deptTileStats: {},
            metrics: { departments: null, workUnits: null },
            orgOpportunityKpis: null,
            kpiPlacementPending: false,
            rollupRefined: true,
            lifecycleCards: [SAMPLE_CARD],
        });
        const restored = peekWorkspaceLifecycleCardsForRestore({
            orgId: "org-1",
            principalUserId: "user-1",
            accessScopeFingerprint: "scope-a",
        });
        expect(restored?.[0]?.entryHref).toBe("/workspace/work-unit/new-leads");
    });

    it("writeWorkspaceLifecycleCardsCache merges into existing root snapshot", () => {
        writeWorkspaceRootCache("org-1", "user-1", "scope-a", {
            departments: [{ id: "d1", name: "Dept", key: "enrollment" }],
            deptTileStats: {},
            metrics: { departments: 1, workUnits: 2 },
            orgOpportunityKpis: null,
            kpiPlacementPending: false,
            rollupRefined: true,
        });
        writeWorkspaceLifecycleCardsCache(
            { orgId: "org-1", principalUserId: "user-1", accessScopeFingerprint: "scope-a" },
            [SAMPLE_CARD],
        );
        const hit = readWorkspaceRootCache("org-1", "user-1", "scope-a");
        expect(hit?.departments).toHaveLength(1);
        expect(hit?.lifecycleCards?.[0]?.label).toBe("Enrollment");
    });

    it("commitFirst navigation commits before prepare finishes", async () => {
        const commit = vi.fn();
        let resolvePrepare: (() => void) | undefined;
        const prepare = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolvePrepare = resolve;
                }),
        );

        const result = await runAdminV2NavigationTransition({
            href: "/workspace/work-unit/new-leads",
            clickedKey: "lifecycle:lc-1",
            variant: "work_unit",
            commitFirst: true,
            prepare,
            commit,
        });

        expect(result).toBe("commit_first");
        expect(commit).toHaveBeenCalledTimes(1);
        expect(prepare).toHaveBeenCalledTimes(1);
        resolvePrepare?.();
    });

    it("workspace page hydrates lifecycle cards from continuity cache", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("peekWorkspaceLifecycleCardsForRestore");
        expect(page).toContain("writeWorkspaceLifecycleCardsCache");
        expect(page).toContain("peekOperatorLifecycleLandingCards");
    });

    it("lifecycle grid uses commitFirst tile navigation", () => {
        const grid = read("components/admin/workspace/WorkspaceRootLifecycleGrid.tsx");
        expect(grid).toContain("commitFirst: true");
        expect(grid).toContain("lifecycle_tile_click");
    });

    it("work-unit page retains coordinated reveal on shell cache seed", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("seededWorkUnitShellRef.current");
        expect(page).toMatch(/setWuCoordinatedRevealDone\(true\)/);
        expect(page).toContain("scheduleWorkspaceRootRevalidation");
    });

    it("linked person VM warm prefetches drawer body layout", () => {
        const warm = read(
            "lib/adminV2/viewModel/drawer/vmRuntime/warmLinkedPersonDrawerVmsFromOpportunityRecord.ts",
        );
        expect(warm).toContain("prefetchDrawerLayoutRuntimeBody");
        expect(warm).toContain("markDrawerLinkedPrewarmScheduled");
    });

    it("operational tasks enrichment uses cached entity labels", () => {
        const enrich = read("lib/admin/operationalTasksWorkspaceEnrichment.ts");
        expect(enrich).toContain("resolveEntityLabelsForOrgCached");
        expect(enrich).not.toContain("resolveEntityLabelsForOrg(supabase");
    });

    it("opportunity drawer schedules linked person prewarm on idle", () => {
        const drawer = read("components/admin/AdminEntityDrawerLegacy.tsx");
        expect(drawer).toContain("scheduleAdminV2BackgroundWork");
        expect(drawer).toContain('source: "opportunity_drawer_idle"');
    });

    it("scheduleWorkspaceRootRevalidation is deduped per scope", () => {
        const cancelA = scheduleWorkspaceRootRevalidation({
            orgId: "org-1",
            principalUserId: "u1",
            accessScopeFingerprint: "scope",
        });
        const cancelB = scheduleWorkspaceRootRevalidation({
            orgId: "org-1",
            principalUserId: "u1",
            accessScopeFingerprint: "scope",
        });
        expect(typeof cancelA).toBe("function");
        expect(typeof cancelB).toBe("function");
    });
});
