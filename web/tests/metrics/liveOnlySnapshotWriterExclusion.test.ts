/**
 * The generic snapshot writer must never persist a live-only metric.
 *
 * Refusing at read time alone is not enough. A persisted current-state row is
 * indistinguishable afterwards from a legitimate historical one — same table,
 * same shape, same `computed_at` — so anything that later reads
 * `metric_snapshots` directly, or any future relaxation of the read guard, would
 * serve it as a real point in a series. The row must not exist.
 *
 * The exclusion is applied to the CALLER'S list, not merely to the default, and
 * that is what this proves: naming a live-only key explicitly — a backfill, a
 * test, a future scheduler — still writes nothing.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const writeMetricSnapshot = vi.fn();
const resolveMetrics = vi.fn();
const isLiveOnlyMetric = vi.fn();

vi.mock("@/lib/metrics/snapshots/writeMetricSnapshot", () => ({
    writeMetricSnapshot: (...args: unknown[]) => writeMetricSnapshot(...args),
}));

vi.mock("@/lib/metrics/metricEngine", () => ({
    resolveMetrics: (...args: unknown[]) => resolveMetrics(...args),
}));

vi.mock("@/lib/metrics/registry", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        isLiveOnlyMetric: (...args: unknown[]) => isLiveOnlyMetric(...args),
    };
});

const { writeOrgMetricSnapshots } = await import("@/lib/metrics/snapshots/writeOrgMetricSnapshots");

const LIVE_ONLY = "ops.needs_attention_count" as const;
const ORDINARY = "ops.work_overdue_count" as const;

/** Org-only writer run: no site rows, so the assertions are about key selection alone. */
const supabase = {
    from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ data: [], error: null }) }) }) }),
    }),
} as never;

function resolvedRow(key: string) {
    return {
        metric: {
            key,
            label: key,
            format: "count",
            value: 3,
            formattedValue: "3",
            window: "rolling_7d",
            windowStartIso: "2026-09-12T00:00:00.000Z",
            windowEndIso: "2026-09-12T16:00:00.000Z",
            computedAtIso: "2026-09-12T16:00:00.000Z",
            sources: [],
            resolveMode: "live",
        },
    };
}

beforeEach(() => {
    writeMetricSnapshot.mockReset();
    resolveMetrics.mockReset();
    isLiveOnlyMetric.mockReset();
    writeMetricSnapshot.mockResolvedValue({ id: "snap-1", error: null });
    isLiveOnlyMetric.mockImplementation((key: string) => key === LIVE_ONLY);
    resolveMetrics.mockImplementation(async ({ keys }: { keys: string[] }) =>
        keys.map((k) => resolvedRow(k))
    );
});

describe("writeOrgMetricSnapshots excludes live-only metrics", () => {
    it("writes nothing when the ONLY requested key is live-only", async () => {
        const result = await writeOrgMetricSnapshots({
            supabase,
            orgId: "org-1",
            metricKeys: [LIVE_ONLY],
            windows: ["rolling_7d"],
            includeSiteScopes: false,
        });
        expect(writeMetricSnapshot).not.toHaveBeenCalled();
        expect(result.written).toBe(0);
    });

    it("never even resolves the live-only key — it is dropped before computation", async () => {
        await writeOrgMetricSnapshots({
            supabase,
            orgId: "org-1",
            metricKeys: [LIVE_ONLY],
            windows: ["rolling_7d"],
            includeSiteScopes: false,
        });
        // Dropping it before `resolveMetrics` also means the writer does no work
        // for a value it is forbidden to keep.
        expect(resolveMetrics).not.toHaveBeenCalled();
    });

    it("still writes the ordinary key alongside it, rather than failing the whole run", async () => {
        await writeOrgMetricSnapshots({
            supabase,
            orgId: "org-1",
            metricKeys: [LIVE_ONLY, ORDINARY],
            windows: ["rolling_7d"],
            includeSiteScopes: false,
        });
        const writtenKeys = writeMetricSnapshot.mock.calls.map(
            (c) => (c[1] as { metricKey: string }).metricKey
        );
        expect(writtenKeys).toContain(ORDINARY);
        expect(writtenKeys).not.toContain(LIVE_ONLY);
    });

    it("leaves ordinary metrics entirely unaffected", async () => {
        isLiveOnlyMetric.mockReturnValue(false);
        await writeOrgMetricSnapshots({
            supabase,
            orgId: "org-1",
            metricKeys: [ORDINARY],
            windows: ["rolling_7d"],
            includeSiteScopes: false,
        });
        expect(writeMetricSnapshot).toHaveBeenCalled();
    });
});
