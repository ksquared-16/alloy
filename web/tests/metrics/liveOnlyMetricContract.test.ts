/**
 * The live-only metric contract — an OIP platform correctness guarantee.
 *
 * `resolveSingleMetric` serves a stored snapshot under `mode=snapshot`, and the
 * generic writer persists every registered metric. Together those two facts mean
 * that merely REGISTERING a current-state metric creates a path where an older
 * stored number is returned as the present one, stamped with the snapshot's own
 * `computed_at`, and the surface asking "how many children are here right now"
 * cannot tell.
 *
 * There IS a freshness bound — `readLatestMetricSnapshot` defaults to 24h — and
 * it is the reason a policy was needed rather than a tighter number. Twenty-four
 * hours suits a rolling 30-day metric and means nothing for a count that goes
 * from zero to full and back within one day. No age is short enough to make a
 * stored occupancy figure correct.
 *
 * `snapshotPolicy: "live_only"` closes that path. These tests are the proof, and
 * they are written from the failure inward: each one would pass trivially if the
 * guard silently stopped working, so each asserts that the snapshot read was NOT
 * REACHED rather than merely that some value came back.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MetricResolveContext } from "@/lib/metrics/types";

const readLatestMetricSnapshot = vi.fn();
const getMetricDefinition = vi.fn();
const isLiveOnlyMetric = vi.fn();

vi.mock("@/lib/metrics/snapshots/readMetricSnapshot", () => ({
    readLatestMetricSnapshot: (...args: unknown[]) => readLatestMetricSnapshot(...args),
}));

vi.mock("@/lib/metrics/registry", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        getMetricDefinition: (...args: unknown[]) => getMetricDefinition(...args),
        isLiveOnlyMetric: (...args: unknown[]) => isLiveOnlyMetric(...args),
    };
});

const liveValue = { value: 7, computedAtIso: "2026-09-12T16:00:00.000Z" };
vi.mock("@/lib/metrics/resolvers/entitySnapshotMetrics", () => ({
    resolveOpsWorkOverdueCount: vi.fn(async () => ({
        key: "ops.work_overdue_count",
        label: "Overdue work",
        format: "count",
        value: liveValue.value,
        formattedValue: "7",
        window: "rolling_30d",
        windowStartIso: liveValue.computedAtIso,
        windowEndIso: liveValue.computedAtIso,
        computedAtIso: liveValue.computedAtIso,
        sources: ["operational_tasks"],
        resolveMode: "live",
    })),
    countOverdueOpenTasks: vi.fn(),
}));

const { resolveSingleMetric } = await import("@/lib/metrics/metricEngine");

const KEY = "ops.work_overdue_count" as const;

/** A snapshot from hours ago — exactly what must never stand in for "now". */
const STALE_SNAPSHOT = {
    id: "snap-stale",
    value_numeric: 999,
    value_json: {},
    computed_at: "2026-09-11T04:00:00.000Z",
};

function ctx(mode: "live" | "snapshot"): MetricResolveContext {
    return {
        supabase: {} as never,
        orgId: "org-1",
        scope: {
            departmentScope: "all",
            allowedDepartmentIds: [],
            siteScope: "all",
            allowedSiteLocationIds: [],
        },
        window: "rolling_30d",
        siteLocationId: null,
        mode,
    } as MetricResolveContext;
}

beforeEach(() => {
    readLatestMetricSnapshot.mockReset();
    getMetricDefinition.mockReset();
    isLiveOnlyMetric.mockReset();
    readLatestMetricSnapshot.mockResolvedValue(STALE_SNAPSHOT);
    getMetricDefinition.mockReturnValue({
        key: KEY,
        label: "Overdue work",
        format: "count",
        sources: ["operational_tasks"],
    });
});

describe("a live-only metric is never served from storage", () => {
    it("does not even READ a snapshot when snapshot resolution is requested", async () => {
        isLiveOnlyMetric.mockReturnValue(true);
        const result = await resolveSingleMetric(ctx("snapshot"), KEY);

        // The load-bearing assertion: the stale row was not consulted at all.
        expect(readLatestMetricSnapshot).not.toHaveBeenCalled();
        expect(result.value).toBe(liveValue.value);
    });

    it("reports resolveMode 'live', so the API tells the truth about where the value came from", async () => {
        isLiveOnlyMetric.mockReturnValue(true);
        const result = await resolveSingleMetric(ctx("snapshot"), KEY);
        expect(result.resolveMode).toBe("live");
    });

    it("never returns the stale value even though one was available", async () => {
        isLiveOnlyMetric.mockReturnValue(true);
        const result = await resolveSingleMetric(ctx("snapshot"), KEY);
        expect(result.value).not.toBe(STALE_SNAPSHOT.value_numeric);
        expect(result.computedAtIso).not.toBe(STALE_SNAPSHOT.computed_at);
    });
});

describe("ordinary metrics keep their existing snapshot behaviour", () => {
    it("still resolves from the snapshot under mode=snapshot", async () => {
        isLiveOnlyMetric.mockReturnValue(false);
        const result = await resolveSingleMetric(ctx("snapshot"), KEY);
        expect(readLatestMetricSnapshot).toHaveBeenCalled();
        expect(result.value).toBe(STALE_SNAPSHOT.value_numeric);
        expect(result.resolveMode).toBe("snapshot");
    });

    it("still resolves live under mode=live", async () => {
        isLiveOnlyMetric.mockReturnValue(false);
        const result = await resolveSingleMetric(ctx("live"), KEY);
        expect(readLatestMetricSnapshot).not.toHaveBeenCalled();
        expect(result.resolveMode).toBe("live");
    });

    it("falls back to live when no snapshot exists — unchanged", async () => {
        isLiveOnlyMetric.mockReturnValue(false);
        readLatestMetricSnapshot.mockResolvedValue(null);
        const result = await resolveSingleMetric(ctx("snapshot"), KEY);
        expect(result.resolveMode).toBe("live");
        expect(result.value).toBe(liveValue.value);
    });
});
