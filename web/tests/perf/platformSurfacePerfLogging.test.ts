import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    appendPlatformSurfacePerfEvent,
    clearPlatformSurfacePerfBufferForTests,
    getPlatformSurfacePerfEvents,
} from "@/lib/perf/platformSurfacePerfBuffer";
import {
    flushPlatformSurfacePerfRelayForTests,
    relayPlatformSurfacePerfEvents,
} from "@/lib/perf/platformSurfacePerfServerRelay";
import {
    platformSurfacePerfEnabled,
    tracePlatformRouteLoad,
} from "@/lib/perf/platformSurfacePerfTrace";

describe("platformSurfacePerfBuffer", () => {
    beforeEach(() => {
        clearPlatformSurfacePerfBufferForTests();
        vi.stubGlobal("sessionStorage", {
            store: {} as Record<string, string>,
            getItem(key: string) {
                return this.store[key] ?? null;
            },
            setItem(key: string, value: string) {
                this.store[key] = value;
            },
            removeItem(key: string) {
                delete this.store[key];
            },
        });
    });

    afterEach(() => {
        clearPlatformSurfacePerfBufferForTests();
        vi.unstubAllGlobals();
    });

    it("retains events across buffer reads", () => {
        appendPlatformSurfacePerfEvent({
            ts: 1,
            iso: "2026-06-09T00:00:00.000Z",
            surface: "route",
            phase: "wu_slug_fetch_start",
            payload: { layer: "platform_pass2" },
            path: "/workspace/work-unit/new-leads",
        });
        expect(getPlatformSurfacePerfEvents()).toHaveLength(1);
        expect(getPlatformSurfacePerfEvents()[0]?.phase).toBe("wu_slug_fetch_start");
    });

    it("caps at 200 events", () => {
        for (let i = 0; i < 210; i += 1) {
            appendPlatformSurfacePerfEvent({
                ts: i,
                iso: "2026-06-09T00:00:00.000Z",
                surface: "route",
                phase: `phase_${i}`,
                payload: {},
                path: "/workspace",
            });
        }
        const events = getPlatformSurfacePerfEvents();
        expect(events).toHaveLength(200);
        expect(events[0]?.phase).toBe("phase_10");
    });
});

describe("platformSurfacePerfTrace integration", () => {
    const originalEnv = process.env.NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG;

    beforeEach(() => {
        clearPlatformSurfacePerfBufferForTests();
        process.env.NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG = "1";
        vi.stubGlobal("window", {
            location: { pathname: "/workspace", search: "" },
            localStorage: { getItem: () => null },
        });
        vi.stubGlobal("performance", { now: () => 42 });
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG = originalEnv;
        clearPlatformSurfacePerfBufferForTests();
        vi.unstubAllGlobals();
    });

    it("appends trace events to the buffer when enabled", () => {
        expect(platformSurfacePerfEnabled()).toBe(true);
        tracePlatformRouteLoad("wu_slug_cache_hit", { slug: "new-leads" });
        const events = getPlatformSurfacePerfEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.phase).toBe("wu_slug_cache_hit");
        expect(events[0]?.payload.slug).toBe("new-leads");
    });
});

describe("platformSurfacePerfServerRelay", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        process.env.NEXT_PUBLIC_ALLOY_PLATFORM_PERF_SERVER_LOG = "1";
        vi.stubGlobal("window", {});
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
        vi.stubGlobal("navigator", { sendBeacon: vi.fn(() => false) });
    });

    afterEach(() => {
        flushPlatformSurfacePerfRelayForTests();
        delete process.env.NEXT_PUBLIC_ALLOY_PLATFORM_PERF_SERVER_LOG;
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("batches relay POST to debug route", async () => {
        relayPlatformSurfacePerfEvents([
            {
                ts: 1,
                iso: "2026-06-09T00:00:00.000Z",
                surface: "drawer",
                phase: "drawer_reveal",
                payload: {},
                path: "/workspace/work-unit/new-leads",
            },
        ]);
        vi.advanceTimersByTime(150);
        await Promise.resolve();
        expect(fetch).toHaveBeenCalledWith(
            "/api/admin/debug/platform-perf-trace",
            expect.objectContaining({ method: "POST", keepalive: true }),
        );
    });
});
