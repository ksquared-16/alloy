import { describe, expect, it, beforeEach, vi } from "vitest";
import { alloyPerfSet, ensureAlloyPerf } from "@/lib/perf/alloyPerfGlobal";
import {
    buildWorkUnitSpeedSprintRow,
    reportAdminV2SpeedSprint,
} from "@/lib/perf/adminV2SpeedSprintTrace";

describe("adminV2SpeedSprintTrace", () => {
    beforeEach(() => {
        vi.stubGlobal("window", {
            __alloyPerf: undefined,
            dispatchEvent: vi.fn(),
        });
        ensureAlloyPerf();
        window.__alloyPerf!.marks = {};
    });

    it("buildWorkUnitSpeedSprintRow computes deltas from alloy marks", () => {
        alloyPerfSet("route_work_unit_shell_visible", 1000);
        alloyPerfSet("route_work_unit_bootstrap_returned", 1200);
        alloyPerfSet("route_work_unit_first_above_fold_stable", 1500);
        alloyPerfSet("route_work_unit_hydration_complete", 1600);
        alloyPerfSet("route_work_unit_post_shell_fetch_count", 2);
        alloyPerfSet("work_unit_bootstrap_payload_bytes", 48_000);
        alloyPerfSet("work_unit_queue_rows_request_start", 1300);
        alloyPerfSet("work_unit_queue_rows_ready", 1450);
        const row = buildWorkUnitSpeedSprintRow();
        expect(row.shell_visible_ms).toBe(1000);
        expect(row.bootstrap_or_primary_ms).toBe(200);
        expect(row.above_fold_stable_ms).toBe(500);
        expect(row.hydration_complete_ms).toBe(600);
        expect(row.queue_items_fetch_ms).toBe(150);
        expect(row.post_shell_fetch_count).toBe(2);
        expect(row.bootstrap_payload_bytes).toBe(48_000);
    });

    it("reportAdminV2SpeedSprint returns four surface rows", () => {
        const report = reportAdminV2SpeedSprint();
        expect(report.rows.length).toBe(4);
        expect(report.rows.map((r) => r.surface)).toContain("work_unit");
        expect(report.rows.map((r) => r.surface)).toContain("drawer_opportunity");
    });
});
