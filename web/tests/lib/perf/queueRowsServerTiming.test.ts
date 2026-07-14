/**
 * Server-Timing header for the Work Unit queue critical path — shape + PII-safety (Trust Closure).
 */

import { describe, it, expect } from "vitest";
import { buildQueueRowsServerTimingHeader } from "@/lib/perf/queueRowsServerTiming";

describe("buildQueueRowsServerTimingHeader", () => {
    it("emits ordered time metrics as Server-Timing durations plus a cache marker", () => {
        const header = buildQueueRowsServerTimingHeader({
            cacheHit: false,
            metrics: {
                auth: 12.34,
                prep: 5,
                base_query: 40,
                count: 8,
                enrichment: 120.06,
                serialize: 2,
                total: 200,
            },
        });
        expect(header).toContain("auth;dur=12.3");
        expect(header).toContain("base_query;dur=40");
        expect(header).toContain("enrichment;dur=120.1");
        expect(header).toContain("total;dur=200");
        expect(header).toContain('cache;desc="miss"');
        // Ordering: auth before base_query before total.
        expect(header.indexOf("auth")).toBeLessThan(header.indexOf("base_query"));
        expect(header.indexOf("base_query")).toBeLessThan(header.indexOf("total"));
    });

    it("omits absent / negative / non-finite metrics", () => {
        const header = buildQueueRowsServerTimingHeader({
            metrics: { auth: 10, prep: -1, base_query: Number.NaN, enrichment: undefined },
        });
        expect(header).toBe("auth;dur=10");
    });

    it("marks cache hits", () => {
        expect(buildQueueRowsServerTimingHeader({ cacheHit: true, metrics: {} })).toBe('cache;desc="hit"');
    });

    it("never emits ids, SQL, tenant identifiers, or record values (PII-safe by construction)", () => {
        const header = buildQueueRowsServerTimingHeader({
            cacheHit: false,
            metrics: { auth: 1, base_query: 2, count: 3, enrichment: 4, total: 5 },
        });
        // Only metric names, `dur=<number>`, and the hit/miss desc are present.
        expect(header).toMatch(/^([a-z_]+;dur=[0-9.]+|cache;desc="(hit|miss)")(, ([a-z_]+;dur=[0-9.]+|cache;desc="(hit|miss)"))*$/);
        expect(header).not.toMatch(/select|from|where|org|user|id=|email|@/i);
    });
});
