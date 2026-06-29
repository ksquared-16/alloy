import { describe, expect, it } from "vitest";

import {
    computeWorkspaceRevealGate,
    workspaceRevealDepartmentTilesReady,
    workspaceRevealShellReady,
    workspaceRevealTileCountsReady,
} from "@/lib/adminV2/workspaceRevealGate";

describe("workspaceRevealGate", () => {
    it("above_fold_ready requires shell, tiles, and tile counts", () => {
        expect(
            computeWorkspaceRevealGate({
                shell_ready: true,
                department_tiles_ready: true,
                tile_counts_ready: true,
                kpi_region_ready: true,
                actions_ready: true,
            }).above_fold_ready
        ).toBe(true);

        const blocked = computeWorkspaceRevealGate({
            shell_ready: true,
            department_tiles_ready: true,
            tile_counts_ready: false,
            kpi_region_ready: true,
            actions_ready: true,
        });
        expect(blocked.above_fold_ready).toBe(false);
        expect(blocked.reason_if_blocked).toEqual(["tile_counts"]);
    });

    it("shell_ready when departments resolved and not loading", () => {
        expect(
            workspaceRevealShellReady({ bootstrap_loading: true, departments_resolved: true })
        ).toBe(false);
        expect(
            workspaceRevealShellReady({ bootstrap_loading: false, departments_resolved: true })
        ).toBe(true);
    });

    it("shell_ready immediately on warm return when a surface snapshot is committed (atomic commit)", () => {
        // Warm return: lifecycle tiles restored synchronously → reveal the committed surface
        // immediately even though the dept bootstrap is still loading (it refines quietly).
        expect(
            workspaceRevealShellReady({
                bootstrap_loading: true,
                departments_resolved: false,
                surface_snapshot_committed: true,
            })
        ).toBe(true);
        // True cold first load (no committed snapshot) still waits on the bootstrap settling so the
        // coordinated loading gate is shown once — never a partial surface.
        expect(
            workspaceRevealShellReady({
                bootstrap_loading: true,
                departments_resolved: false,
                surface_snapshot_committed: false,
            })
        ).toBe(false);
    });

    it("shell_ready immediately for the operator lifecycle landing (Route VM reveal — gate retired)", () => {
        // The landing is structurally data-independent: it reveals from the server-composed Route VM
        // + static chrome at once, so the shell is ready even on a true cold load with no snapshot and
        // the departments fetch still in flight. This is what made WorkspacePageLoadingGate unnecessary.
        expect(
            workspaceRevealShellReady({
                bootstrap_loading: true,
                departments_resolved: false,
                surface_snapshot_committed: false,
                operator_lifecycle_landing: true,
            })
        ).toBe(true);
    });

    it("department_tiles_ready allows lifecycle landing without departments", () => {
        expect(
            workspaceRevealDepartmentTilesReady({
                bootstrap_loading: false,
                has_departments: false,
                fetch_settled_empty: false,
                operator_lifecycle_landing: true,
            })
        ).toBe(true);
    });

    it("tile_counts_ready allows empty org without metrics", () => {
        expect(
            workspaceRevealTileCountsReady({
                has_departments: false,
                quick_rollup_applied: false,
                fetch_settled_empty: true,
            })
        ).toBe(true);
    });
});
