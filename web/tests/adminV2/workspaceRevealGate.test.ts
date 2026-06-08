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

    it("department_tiles_ready allows settled empty org", () => {
        expect(
            workspaceRevealDepartmentTilesReady({
                bootstrap_loading: false,
                has_departments: false,
                fetch_settled_empty: true,
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
