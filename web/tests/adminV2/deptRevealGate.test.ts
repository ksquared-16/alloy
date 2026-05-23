import { describe, expect, it } from "vitest";

import {
    computeDeptRevealGate,
    deptRevealActionsReady,
    deptRevealKpiStripReady,
    deptRevealShellReady,
} from "@/lib/adminV2/deptRevealGate";

describe("deptRevealGate", () => {
    it("above_fold_ready requires all five lanes", () => {
        expect(
            computeDeptRevealGate({
                shell_ready: true,
                work_units_ready: true,
                operational_region_ready: true,
                kpi_strip_ready: true,
                actions_ready: true,
            }).above_fold_ready
        ).toBe(true);

        const blocked = computeDeptRevealGate({
            shell_ready: true,
            work_units_ready: true,
            operational_region_ready: false,
            kpi_strip_ready: true,
            actions_ready: true,
        });
        expect(blocked.above_fold_ready).toBe(false);
        expect(blocked.reason_if_blocked).toEqual(["operational_region"]);
    });

    it("shell_ready waits for bootstrap blocking to clear", () => {
        expect(
            deptRevealShellReady({
                department_id: "d1",
                department_loaded: true,
                bootstrap_loading: true,
            })
        ).toBe(false);
    });

    it("kpi_strip_ready when placement rows defined", () => {
        expect(deptRevealKpiStripReady({ placement_rows_defined: true })).toBe(true);
        expect(deptRevealKpiStripReady({ placement_rows_defined: false })).toBe(false);
    });

    it("actions_ready requires enrollment settlement when rail reserved", () => {
        expect(
            deptRevealActionsReady({
                reserve_actions_rail: true,
                enrollment_actions_settled: false,
            })
        ).toBe(false);
        expect(
            deptRevealActionsReady({
                reserve_actions_rail: false,
                enrollment_actions_settled: false,
            })
        ).toBe(true);
    });
});
