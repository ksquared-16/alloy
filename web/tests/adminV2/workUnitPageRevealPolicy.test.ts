import { describe, expect, it } from "vitest";

import {
    workUnitKpiStripShowsPlaceholder,
    workUnitPageContentReady,
    workUnitPageShowsLoadingGate,
} from "@/lib/adminV2/workUnitPageRevealPolicy";

describe("workUnitPageRevealPolicy", () => {
    it("holds page gate until critical bundle is ready", () => {
        expect(
            workUnitPageShowsLoadingGate({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            })
        ).toBe(true);
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: false,
            })
        ).toBe(false);
    });

    it("reveals page when critical bundle is ready", () => {
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: true,
                coordinated_reveal_completed: false,
            })
        ).toBe(true);
    });

    it("keeps page visible after first coordinated reveal during pill switch hold", () => {
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: true,
            })
        ).toBe(true);
    });

    it("never reveals content without shell", () => {
        expect(
            workUnitPageContentReady({
                shell_ready: false,
                critical_bundle_ready: true,
                coordinated_reveal_completed: true,
            })
        ).toBe(false);
    });

    it("defaults operational_surface_ready to true (flag-off / non-operational unchanged)", () => {
        // Omitting operational_surface_ready must behave exactly as before.
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: true,
                coordinated_reveal_completed: false,
            })
        ).toBe(true);
    });

    it("Phase 3 cold path: holds the single reveal until the operational surface is coherent", () => {
        // Critical bundle ready, but the resolved subject + Focus Panel shell are not yet coherent.
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: true,
                coordinated_reveal_completed: false,
                operational_surface_ready: false,
            })
        ).toBe(false);
        // Once the operational surface is ready, the whole Work Unit reveals as one.
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: true,
                coordinated_reveal_completed: false,
                operational_surface_ready: true,
            })
        ).toBe(true);
    });

    it("warm path ignores operational_surface_ready (stale complete surface stays revealed)", () => {
        // coordinated_reveal_completed short-circuits — warm return never drops to a cold shell.
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                critical_bundle_ready: false,
                coordinated_reveal_completed: true,
                operational_surface_ready: false,
            })
        ).toBe(true);
    });

    it("KPI placeholder only when lane settled and metrics pending", () => {
        expect(
            workUnitKpiStripShowsPlaceholder({
                kpi_metrics_pending: true,
                lane_reveal_settled: false,
            })
        ).toBe(false);
        expect(
            workUnitKpiStripShowsPlaceholder({
                kpi_metrics_pending: true,
                lane_reveal_settled: true,
            })
        ).toBe(true);
    });
});
