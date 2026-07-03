import { describe, expect, it } from "vitest";

import {
    computeWorkspaceRevealGate,
    workspaceRevealKpiRegionReady,
} from "@/lib/adminV2/workspaceRevealGate";
/**
 * KPI reveal-gating (Experience Layer Phase 0 #1).
 * Locks the atomic-reveal law: KPI/health readiness is part of above-fold readiness,
 * and the gate is NOT bypassed by fake readiness at the call site.
 * See docs/platform/experience/operational-experience-doctrine.md (Law 1).
 */
describe("KPI reveal gating — workspace", () => {
    const READY_BASE = {
        shell_ready: true,
        department_tiles_ready: true,
        tile_counts_ready: true,
        actions_ready: true,
    };

    it("blocks above-fold reveal while the KPI region structure is not yet present", () => {
        const kpi_region_ready = workspaceRevealKpiRegionReady({
            quick_metrics_applied: false,
            fetch_settled_empty: false,
            cache_primed: false,
            errored: false,
        });
        expect(kpi_region_ready).toBe(false);

        const gate = computeWorkspaceRevealGate({ ...READY_BASE, kpi_region_ready });
        expect(gate.above_fold_ready).toBe(false);
        expect(gate.reason_if_blocked).toContain("kpi_region");
    });

    it("reveals once quick rollup metrics are applied (KPI structure present)", () => {
        const kpi_region_ready = workspaceRevealKpiRegionReady({
            quick_metrics_applied: true,
            fetch_settled_empty: false,
            cache_primed: false,
            errored: false,
        });
        expect(kpi_region_ready).toBe(true);
        expect(computeWorkspaceRevealGate({ ...READY_BASE, kpi_region_ready }).above_fold_ready).toBe(true);
    });

    it("does not block forever: empty org, primed cache, and settled error all read as ready (degraded)", () => {
        // Confirmed-empty org — no KPI region to populate.
        expect(
            workspaceRevealKpiRegionReady({
                quick_metrics_applied: false,
                fetch_settled_empty: true,
                cache_primed: false,
                errored: false,
            }),
        ).toBe(true);
        // Primed session cache — structure already known.
        expect(
            workspaceRevealKpiRegionReady({
                quick_metrics_applied: false,
                fetch_settled_empty: false,
                cache_primed: true,
                errored: false,
            }),
        ).toBe(true);
        // Terminal error — reveal the degraded surface rather than hang.
        expect(
            workspaceRevealKpiRegionReady({
                quick_metrics_applied: false,
                fetch_settled_empty: false,
                cache_primed: false,
                errored: true,
            }),
        ).toBe(true);
    });
});
