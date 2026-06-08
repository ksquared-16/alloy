import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    buildDrawerViewModelShadowSummary,
    logDrawerViewModelShadow,
    safeLogDrawerViewModelShadow,
} from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadow";

describe("buildDrawerViewModelShadowSummary", () => {
    it("includes mismatch keys and cutover_ready when settled with zero mismatches", () => {
        const summary = buildDrawerViewModelShadowSummary({
            opportunity_id: "opp-1",
            compose_ms: 95,
            vm_structure_settled: true,
            diff: {
                structural_mismatches: [],
                structural_improvements: [],
                scalar_warnings: [],
                mismatch_count: 0,
            },
        });
        expect(summary).toEqual({
            opportunity_id: "opp-1",
            structureSettled: true,
            compose_ms: 95,
            structural_mismatch_count: 0,
            scalar_warning_count: 0,
            mismatch_keys: [],
            cutover_ready: true,
        });
    });

    it("lists mismatch field keys and marks cutover_ready false", () => {
        const summary = buildDrawerViewModelShadowSummary({
            opportunity_id: "opp-2",
            compose_ms: 110,
            vm_structure_settled: true,
            diff: {
                structural_mismatches: [
                    {
                        field: "header_action_keys",
                        kind: "structural_mismatch",
                        legacy: ["a"],
                        vm: [],
                    },
                    {
                        field: "tasks_open_count",
                        kind: "structural_mismatch",
                        legacy: 1,
                        vm: 0,
                    },
                ],
                structural_improvements: [],
                scalar_warnings: [{ field: "status_control_type", kind: "scalar_warning", legacy: "x", vm: "y" }],
                mismatch_count: 2,
            },
        });
        expect(summary.structural_mismatch_count).toBe(2);
        expect(summary.scalar_warning_count).toBe(1);
        expect(summary.mismatch_keys).toEqual(["header_action_keys", "tasks_open_count"]);
        expect(summary.cutover_ready).toBe(false);
    });
});

describe("logDrawerViewModelShadow runtime", () => {
    beforeEach(() => {
        vi.stubGlobal("window", {} as Window & typeof globalThis);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("logs concise summary first, then detail payload", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => {});
        logDrawerViewModelShadow({
            opportunity_id: "opp-1",
            generation: "gen-abc",
            compose_ms: 80,
            fetch_ms: 40,
            diff_ms: 2,
            vm_structure_settled: true,
            legacy_path: "composed_open",
            skip_reason: null,
            diff: {
                structural_mismatches: [],
                structural_improvements: [],
                scalar_warnings: [],
                mismatch_count: 0,
            },
        });

        expect(info).toHaveBeenCalledWith(
            "[drawer-vm-shadow:summary]",
            expect.objectContaining({
                opportunity_id: "opp-1",
                structureSettled: true,
                compose_ms: 80,
                structural_mismatch_count: 0,
                scalar_warning_count: 0,
                mismatch_keys: [],
                cutover_ready: true,
            })
        );
        expect(info).toHaveBeenCalledWith("[drawer-vm-shadow]", expect.objectContaining({ cutover_ready: true }));
    });

    it("safeLogDrawerViewModelShadow never throws when console.info fails", () => {
        vi.spyOn(console, "info").mockImplementation(() => {
            throw new Error("console_blocked");
        });
        expect(() =>
            safeLogDrawerViewModelShadow({
                opportunity_id: "opp-1",
                generation: null,
                compose_ms: null,
                fetch_ms: 0,
                diff_ms: 0,
                vm_structure_settled: false,
                legacy_path: "composed_open",
                diff: {
                    structural_mismatches: [],
                    structural_improvements: [],
                    scalar_warnings: [],
                    mismatch_count: 0,
                },
            })
        ).not.toThrow();
    });
});
