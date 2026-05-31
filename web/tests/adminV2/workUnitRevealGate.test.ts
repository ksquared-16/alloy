import { describe, expect, it } from "vitest";

import {
    computeWorkUnitRevealGate,
    workUnitRevealActionsReady,
    workUnitRevealRowsReady,
    workUnitRevealShellReady,
    workUnitRevealSummariesReady,
} from "@/lib/adminV2/workUnitRevealGate";

describe("workUnitRevealGate", () => {
    it("above_fold_ready requires all four lanes", () => {
        expect(
            computeWorkUnitRevealGate({
                shell_ready: true,
                summaries_ready: true,
                actions_ready: true,
                rows_ready: true,
            }).above_fold_ready
        ).toBe(true);

        const blocked = computeWorkUnitRevealGate({
            shell_ready: true,
            summaries_ready: true,
            actions_ready: false,
            rows_ready: true,
        });
        expect(blocked.above_fold_ready).toBe(false);
        expect(blocked.reason_if_blocked).toEqual(["actions"]);
    });

    it("shell_ready waits for bootstrap loading to finish", () => {
        expect(
            workUnitRevealShellReady({
                work_unit_loaded: true,
                department_loaded: true,
                bootstrap_loading: true,
                error: null,
            })
        ).toBe(false);
        expect(
            workUnitRevealShellReady({
                work_unit_loaded: true,
                department_loaded: true,
                bootstrap_loading: false,
                error: null,
            })
        ).toBe(true);
    });

    it("summaries_ready accepts summaries or error", () => {
        expect(
            workUnitRevealSummariesReady({ queue_summaries: [], queue_summaries_error: null })
        ).toBe(true);
        expect(
            workUnitRevealSummariesReady({ queue_summaries: null, queue_summaries_error: "fail" })
        ).toBe(true);
    });

    it("actions_ready requires enrollment settlement when rail reserved", () => {
        expect(
            workUnitRevealActionsReady({
                reserve_actions_rail: false,
                enrollment_actions_settled: false,
            })
        ).toBe(true);
        expect(
            workUnitRevealActionsReady({
                reserve_actions_rail: true,
                enrollment_actions_settled: false,
            })
        ).toBe(false);
        expect(
            workUnitRevealActionsReady({
                reserve_actions_rail: true,
                enrollment_actions_settled: true,
            })
        ).toBe(true);
    });

    it("rows_ready requires lane_reveal_settled", () => {
        expect(
            workUnitRevealRowsReady({
                lane_authority_ready: true,
                queue_summaries: [],
                queue_summaries_error: null,
                lane_reveal_settled: true,
            })
        ).toBe(true);

        expect(
            workUnitRevealRowsReady({
                lane_authority_ready: true,
                queue_summaries: [{ key: "pipeline" }],
                queue_summaries_error: null,
                lane_reveal_settled: true,
            })
        ).toBe(true);

        expect(
            workUnitRevealRowsReady({
                lane_authority_ready: true,
                queue_summaries: [{ key: "pipeline" }],
                queue_summaries_error: null,
                lane_reveal_settled: false,
            })
        ).toBe(false);
    });
});
