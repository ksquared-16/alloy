import { describe, expect, it } from "vitest";

import {
    workUnitKpiStripShowsPlaceholder,
    workUnitPageContentReady,
    workUnitPageShowsLoadingGate,
} from "@/lib/adminV2/workUnitPageRevealPolicy";

describe("workUnitPageRevealPolicy", () => {
    it("holds page gate until first lane reveal settles", () => {
        expect(
            workUnitPageShowsLoadingGate({
                shell_ready: true,
                initial_lane_reveal_settled: false,
                lane_reveal_settled: false,
            })
        ).toBe(true);
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                initial_lane_reveal_settled: false,
                lane_reveal_settled: false,
            })
        ).toBe(false);
    });

    it("reveals page when lane reaches settled state", () => {
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                initial_lane_reveal_settled: false,
                lane_reveal_settled: true,
            })
        ).toBe(true);
    });

    it("keeps page visible after first lane settle during pill switch hold", () => {
        expect(
            workUnitPageContentReady({
                shell_ready: true,
                initial_lane_reveal_settled: true,
                lane_reveal_settled: false,
            })
        ).toBe(true);
    });

    it("never reveals content without shell", () => {
        expect(
            workUnitPageContentReady({
                shell_ready: false,
                initial_lane_reveal_settled: true,
                lane_reveal_settled: true,
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
