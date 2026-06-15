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
