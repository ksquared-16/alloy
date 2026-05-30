import { describe, expect, it } from "vitest";

import {
    workUnitKpiStripShowsPlaceholder,
    workUnitPageContentReady,
    workUnitPageShowsLoadingGate,
} from "@/lib/adminV2/workUnitPageRevealPolicy";

describe("workUnitPageRevealPolicy", () => {
    it("cold path holds page gate until above_fold when shell is ready", () => {
        expect(
            workUnitPageShowsLoadingGate({
                page_seeded_from_cache: false,
                shell_ready: true,
                above_fold_ready: false,
            })
        ).toBe(true);
        expect(
            workUnitPageContentReady({
                page_seeded_from_cache: false,
                shell_ready: true,
                above_fold_ready: false,
            })
        ).toBe(false);
    });

    it("cold path reveals page when above_fold is ready", () => {
        expect(
            workUnitPageContentReady({
                page_seeded_from_cache: false,
                shell_ready: true,
                above_fold_ready: true,
            })
        ).toBe(true);
    });

    it("warm seeded path reveals at shell_ready with in-lane skeletons", () => {
        expect(
            workUnitPageContentReady({
                page_seeded_from_cache: true,
                shell_ready: true,
                above_fold_ready: false,
            })
        ).toBe(true);
        expect(
            workUnitPageShowsLoadingGate({
                page_seeded_from_cache: true,
                shell_ready: true,
                above_fold_ready: false,
            })
        ).toBe(false);
    });

    it("never reveals content without shell", () => {
        expect(
            workUnitPageContentReady({
                page_seeded_from_cache: true,
                shell_ready: false,
                above_fold_ready: true,
            })
        ).toBe(false);
    });

    it("KPI placeholder on cold first paint when metrics pending and above_fold ready", () => {
        expect(
            workUnitKpiStripShowsPlaceholder({
                kpi_metrics_pending: true,
                page_seeded_from_cache: false,
                above_fold_ready: true,
            })
        ).toBe(true);
    });

    it("warm path defers KPI placeholder until above_fold", () => {
        expect(
            workUnitKpiStripShowsPlaceholder({
                kpi_metrics_pending: true,
                page_seeded_from_cache: true,
                above_fold_ready: false,
            })
        ).toBe(false);
        expect(
            workUnitKpiStripShowsPlaceholder({
                kpi_metrics_pending: true,
                page_seeded_from_cache: true,
                above_fold_ready: true,
            })
        ).toBe(true);
    });
});
