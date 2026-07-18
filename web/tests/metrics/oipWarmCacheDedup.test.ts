import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OipMetricKey } from "@/lib/metrics/types";

// Count + control every resolver call so we can assert exact request counts.
const calls: { keys: OipMetricKey[] }[] = [];
let deferred: { resolve: (v: Record<string, unknown>) => void; reject: (e: unknown) => void; promise: Promise<Record<string, unknown>> } | null = null;

vi.mock("@/lib/kpi/oipBridge", () => ({
    fetchOipMetricsResolved: vi.fn((args: { keys: OipMetricKey[] }) => {
        calls.push({ keys: args.keys });
        let resolve!: (v: Record<string, unknown>) => void;
        let reject!: (e: unknown) => void;
        const promise = new Promise<Record<string, unknown>>((res, rej) => {
            resolve = res as never;
            reject = rej;
        });
        deferred = { resolve, reject, promise };
        return promise;
    }),
}));
vi.mock("@/lib/metrics/packs", () => ({ listAvailableMetricPacks: () => [] }));
vi.mock("@/lib/workspace/adminV2DeferBackgroundWork", () => ({ runWhenAdminV2PrimarySurfaceReady: (fn: () => void) => fn() }));

import { prefetchOipMetricsWarm, buildOipWarmScopeKey } from "@/lib/metrics/oipWorkspaceWarmCache";

let uniq = 0;
const scope = (keys: OipMetricKey[]) => ({ siteId: `site-${++uniq}`, workUnitId: "wu-1", keys });

beforeEach(() => {
    calls.length = 0;
    deferred = null;
});

describe("OIP warm cache — deterministic metrics batching (P1-C)", () => {
    it("scope key is order-independent (key SET is canonical)", () => {
        const a = buildOipWarmScopeKey({ siteId: "s", workUnitId: "w", keys: ["a", "b", "c"] as OipMetricKey[] });
        const b = buildOipWarmScopeKey({ siteId: "s", workUnitId: "w", keys: ["c", "a", "b"] as OipMetricKey[] });
        expect(a).toBe(b);
    });

    it("N concurrent calls for the same scope → exactly ONE request (in-flight dedup)", async () => {
        const s = scope(["a", "b", "c"] as OipMetricKey[]);
        const p1 = prefetchOipMetricsWarm(s);
        const p2 = prefetchOipMetricsWarm(s);
        const p3 = prefetchOipMetricsWarm(s);
        expect(calls.length).toBe(1); // three callers, one request
        deferred!.resolve({ a: {}, b: {}, c: {} });
        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
        expect(r1).toBe(r2);
        expect(r2).toBe(r3); // same resolved map shared
    });

    it("after the cache is fresh, repeated calls do not fan out background refreshes", async () => {
        const s = scope(["x", "y"] as OipMetricKey[]);
        const p = prefetchOipMetricsWarm(s);
        deferred!.resolve({ x: {}, y: {} });
        await p;
        expect(calls.length).toBe(1);
        // Fresh cache now. Fire several rapid reads; at most ONE background revalidation may start,
        // and further reads while it is in flight must not add requests.
        prefetchOipMetricsWarm(s);
        prefetchOipMetricsWarm(s);
        prefetchOipMetricsWarm(s);
        expect(calls.length).toBeLessThanOrEqual(2); // 1 original + at most 1 coalesced refresh
    });

    it("different key sets are distinct scopes → separate requests", () => {
        prefetchOipMetricsWarm(scope(["a"] as OipMetricKey[]));
        prefetchOipMetricsWarm(scope(["b"] as OipMetricKey[]));
        expect(calls.length).toBe(2);
    });

    it("failure isolation: a rejected fetch resolves to prior/empty and never throws", async () => {
        const s = scope(["a", "b"] as OipMetricKey[]);
        const p = prefetchOipMetricsWarm(s);
        deferred!.reject(new Error("boom"));
        await expect(p).resolves.toEqual({}); // no throw; empty map (no prior cache)
    });

    it("stable mapping: the resolved map returned is the resolver's map verbatim", async () => {
        const s = scope(["a", "b", "c"] as OipMetricKey[]);
        const p = prefetchOipMetricsWarm(s);
        const map = { a: { metric_key: "a" }, b: { metric_key: "b" }, c: { metric_key: "c" } };
        deferred!.resolve(map);
        await expect(p).resolves.toEqual(map);
    });
});
