import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    composeSurfaceReveal,
    resolveSurfaceSource,
} from "@/lib/adminV2/runtime/surface/surfaceViewModel";
import {
    composeWorkUnitSurfaceViewModel,
    WORK_UNIT_PATCH_AFTER_COMMIT,
} from "@/lib/adminV2/runtime/surface/workUnitSurfaceViewModel";
import { composeShellNavigationSurfaceViewModel } from "@/lib/adminV2/runtime/surface/shellNavigationSurfaceViewModel";

const webRoot = join(process.cwd());
function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("SurfaceViewModel core", () => {
    it("composeSurfaceReveal keeps canCommit external (no second gate) and splits blocking/non-blocking", () => {
        const reveal = composeSurfaceReveal({
            canCommit: true,
            sections: [
                { id: "X-1", blocking: true },
                { id: "X-2", blocking: false },
            ],
        });
        expect(reveal.canCommit).toBe(true);
        expect(reveal.blockingSectionIds).toEqual(["X-1"]);
        expect(reveal.nonBlockingSectionIds).toEqual(["X-2"]);
    });

    it("resolveSurfaceSource prefers the warmest source", () => {
        expect(resolveSurfaceSource({ seededFromSession: true })).toEqual({ source: "session", warm: true });
        expect(resolveSurfaceSource({ seededFromCache: true })).toEqual({ source: "cache", warm: true });
        expect(resolveSurfaceSource({ seededFromBootstrap: true })).toEqual({ source: "bootstrap", warm: true });
        expect(resolveSurfaceSource({ network: true })).toEqual({ source: "network", warm: false });
        expect(resolveSurfaceSource({})).toEqual({ source: "default", warm: false });
    });
});

describe("WorkUnitSurfaceViewModel", () => {
    const base = {
        title: "Tours",
        departmentTitle: "Enrollment",
        kpiSnapshotAvailable: true,
        workViewPillCount: 4,
        queueHeaderAvailable: true,
        queueState: "rows" as const,
        queueRowCount: 12,
        operationalSubjectId: "opp-1",
        focusPanelShellSeeded: true,
        focusPanelSubjectId: "opp-1",
        modeControlActiveMode: null,
        rightRailAvailable: true,
        bosRailAvailable: true,
        warmFromSession: false,
        warmFromBootstrap: true,
    };

    it("includes WU-01/02/03/04/05/07/08 sections and seeds the Focus Panel shell only", () => {
        const vm = composeWorkUnitSurfaceViewModel({ pageContentReady: true, ...base });
        expect(vm.surface).toBe("work_unit");
        expect(vm.sections.contextHeader.title).toBe("Tours");
        expect(vm.sections.kpi.hasSnapshot).toBe(true);
        expect(vm.sections.workViewPills.count).toBe(4);
        expect(vm.sections.queueHeader.available).toBe(true);
        expect(vm.sections.queue.state).toBe("rows");
        expect(vm.sections.focusPanelShellSeed.seeded).toBe(true);
        expect(vm.sections.focusPanelShellSeed.subjectId).toBe("opp-1");
        expect(vm.sections.modeControlSeed.activeMode).toBeNull();
    });

    it("WU-07 joins the blocking bundle only when a subject is selected", () => {
        const withSubject = composeWorkUnitSurfaceViewModel({ pageContentReady: true, ...base });
        expect(withSubject.reveal.blockingSectionIds).toContain("WU-07");

        const noSubject = composeWorkUnitSurfaceViewModel({
            pageContentReady: true,
            ...base,
            operationalSubjectId: null,
            focusPanelSubjectId: null,
            focusPanelShellSeeded: false,
        });
        expect(noSubject.reveal.blockingSectionIds).not.toContain("WU-07");
        expect(noSubject.reveal.blockingSectionIds).toEqual(
            expect.arrayContaining(["WU-01", "WU-03", "WU-04", "WU-05", "WU-08"]),
        );
    });

    it("canCommit tracks workUnitPageContentReady (no second gate)", () => {
        expect(composeWorkUnitSurfaceViewModel({ pageContentReady: true, ...base }).reveal.canCommit).toBe(true);
        expect(composeWorkUnitSurfaceViewModel({ pageContentReady: false, ...base }).reveal.canCommit).toBe(false);
    });

    it("Focus Panel card composition is patched after commit (separate sprint)", () => {
        expect([...WORK_UNIT_PATCH_AFTER_COMMIT]).toEqual(
            expect.arrayContaining(["WU-09", "WU-10", "WU-11"]),
        );
        const vm = composeWorkUnitSurfaceViewModel({ pageContentReady: true, ...base });
        expect(vm.patch.allowedAfterCommit).toContain("WU-09");
        expect(vm.patch.allowedAfterCommit).toContain("WU-02");
    });

    it("queue state is always a stable rows/empty/preparing token (never a legacy full-width branch)", () => {
        for (const state of ["rows", "empty", "preparing"] as const) {
            const vm = composeWorkUnitSurfaceViewModel({ pageContentReady: true, ...base, queueState: state });
            expect(["rows", "empty", "preparing"]).toContain(vm.sections.queue.state);
        }
    });

    it("keeps WU-02 (KPI) and WU-03 (pills) separate and stable — pills never hold KPI content", () => {
        // KPI strip is a snapshot slot (non-blocking, patches in place); pills are a distinct
        // blocking section that commits with the header. They are independent sections, so the KPI
        // strip resolving cannot reshuffle the pills row.
        const vm = composeWorkUnitSurfaceViewModel({
            pageContentReady: true,
            ...base,
            kpiSnapshotAvailable: false,
        });
        expect(vm.sections.kpi).not.toBe(vm.sections.workViewPills);
        expect(vm.sections.workViewPills.count).toBe(4);
        // KPI is non-blocking + patch-after-commit; pills commit with the header (blocking).
        expect(vm.reveal.nonBlockingSectionIds).toContain("WU-02");
        expect(vm.patch.allowedAfterCommit).toContain("WU-02");
        expect(vm.reveal.blockingSectionIds).toContain("WU-03");
        expect(vm.patch.allowedAfterCommit).not.toContain("WU-03");
        // WU-01 header + WU-03 pills commit together (both blocking).
        expect(vm.reveal.blockingSectionIds).toEqual(expect.arrayContaining(["WU-01", "WU-03"]));
    });
});

describe("ShellNavigationSurfaceViewModel", () => {
    const base = {
        itemCount: 6,
        activeRouteKey: "/workspace",
        activeRouteResolvable: true,
        launcherKeys: ["inbox", "processing", "tasks", "analytics"],
        inboxUnread: null,
        workItems: null,
        processing: null,
        notifications: null,
        collapsed: false,
        warmFromSession: true,
    };

    it("commits when items + active route + launchers exist; count slots default without blocking", () => {
        const vm = composeShellNavigationSurfaceViewModel(base);
        expect(vm.surface).toBe("shell_nav");
        expect(vm.reveal.canCommit).toBe(true);
        expect(vm.reveal.blockingSectionIds).toContain("NAV-ITEMS");
        expect(vm.reveal.blockingSectionIds).toContain("NAV-LAUNCHERS");
        expect(vm.reveal.nonBlockingSectionIds).toEqual(["NAV-COUNTS"]);
        // Null count snapshots are valid defaults and do not block.
        expect(vm.sections.counts.inboxUnread).toBeNull();
    });

    it("does not commit without items or launchers", () => {
        expect(composeShellNavigationSurfaceViewModel({ ...base, itemCount: 0 }).reveal.canCommit).toBe(false);
        expect(composeShellNavigationSurfaceViewModel({ ...base, launcherKeys: [] }).reveal.canCommit).toBe(false);
        expect(
            composeShellNavigationSurfaceViewModel({ ...base, activeRouteResolvable: false }).reveal.canCommit,
        ).toBe(false);
    });

    it("counts patch after commit (must not block / shift layout)", () => {
        const vm = composeShellNavigationSurfaceViewModel({ ...base, inboxUnread: 3, workItems: 7 });
        expect(vm.patch.allowedAfterCommit).toEqual(["NAV-COUNTS"]);
        expect(vm.sections.counts.inboxUnread).toBe(3);
        expect(vm.sections.counts.workItems).toBe(7);
    });
});

describe("Surface VM wiring (ownership)", () => {
    it("workspace page reveals from the server-composed Route VM (reveal-readiness layer removed)", () => {
        const page = readSrc("app/adminV2/workspace/page.tsx");
        // The client WorkspaceSurfaceViewModel / reveal-gate layer is retired — the page reveals from
        // the canonical server-composed Route VM (the workspace Surface VM module is delete-eligible).
        expect(page).toContain("useWorkspaceRouteVm");
        expect(page).not.toContain("composeWorkspaceSurfaceViewModel");
        expect(page).not.toContain("workspaceSurfaceVm.reveal.canCommit");
    });

    it("work-unit page composes and consumes the WorkUnitSurfaceViewModel reveal", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        expect(page).toContain("composeWorkUnitSurfaceViewModel");
        expect(page).toContain("workUnitSurfaceVm.reveal.canCommit");
    });

    it("sidebar composes the ShellNavigationSurfaceViewModel and exposes a readiness marker", () => {
        const sidebar = readSrc("app/adminV2/components/Sidebar.tsx");
        expect(sidebar).toContain("composeShellNavigationSurfaceViewModel");
        expect(sidebar).toContain('data-shell-nav-ready');
        // Reads the warm caches directly (no duplicate count fetch).
        expect(sidebar).toContain("readInboxUnreadCountCache");
        expect(sidebar).toContain("readOperationalTasksNavCountsCache");
    });

    it("the sidebar is mounted above the route (commits once, never remounts on navigation)", () => {
        const shell = readSrc("app/adminV2/components/AdminV2Shell.tsx");
        const sidebarIdx = shell.indexOf("<Sidebar");
        expect(sidebarIdx).toBeGreaterThan(-1);
        // In the standard shell branch the per-route children render as a sibling BELOW the Sidebar.
        const childrenAfterSidebar = shell.indexOf("{children}", sidebarIdx);
        expect(childrenAfterSidebar).toBeGreaterThan(sidebarIdx);
        // The nav lives in the shell, not in the per-route pages (so it never remounts on nav).
        expect(readSrc("app/adminV2/layout.tsx")).toContain("AdminV2Shell");
        expect(readSrc("app/adminV2/workspace/page.tsx")).not.toContain("<Sidebar");
    });

    it("Surface VM adapters are pure (no runtime flag branch — flag-off legacy behavior preserved)", () => {
        for (const rel of [
            "lib/adminV2/runtime/surface/surfaceViewModel.ts",
            "lib/adminV2/runtime/surface/workUnitSurfaceViewModel.ts",
            "lib/adminV2/runtime/surface/shellNavigationSurfaceViewModel.ts",
        ]) {
            expect(readSrc(rel)).not.toContain("ALLOY_OS_RUNTIME_ENABLED");
        }
    });
});
