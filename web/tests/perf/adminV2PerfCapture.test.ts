import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
    __resetAdminV2PerfCaptureForTests,
    clearAdminV2PerfEvents,
    exportAdminV2PerfEvents,
    extractPerfLogTag,
    getAdminV2PerfEvents,
    recordAdminV2PerfMark,
} from "@/lib/perf/adminV2PerfCapture";

describe("adminV2PerfCapture", () => {
    beforeEach(() => {
        __resetAdminV2PerfCaptureForTests();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("extractPerfLogTag finds first known prefix", () => {
        expect(extractPerfLogTag(["[page-timing]", { route: "x" }])).toBe("[page-timing]");
        expect(extractPerfLogTag(["prefix [queue-opt] suffix"])).toBe("[queue-opt]");
    });

    it("record + clear + export roundtrip when capture would be active", () => {
        vi.stubGlobal("window", {
            localStorage: {
                getItem: (k: string) => (k === "alloy_perf_capture" ? "true" : null),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            location: { pathname: "/adminV2/workspace", search: "" },
            dispatchEvent: vi.fn(),
        });
        vi.stubEnv("NODE_ENV", "production");

        recordAdminV2PerfMark("test_mark", { duration_ms: 12 });
        expect(getAdminV2PerfEvents().length).toBe(1);
        expect(getAdminV2PerfEvents()[0]?.tag).toBe("mark:test_mark");
        expect(getAdminV2PerfEvents()[0]?.duration_ms).toBe(12);

        const json = exportAdminV2PerfEvents();
        expect(JSON.parse(json).length).toBe(1);

        clearAdminV2PerfEvents();
        expect(getAdminV2PerfEvents().length).toBe(0);
    });

    it("caps at 300 events", () => {
        vi.stubGlobal("window", {
            localStorage: {
                getItem: (k: string) => (k === "alloy_perf_capture" ? "true" : null),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            location: { pathname: "/adminV2/workspace", search: "" },
            dispatchEvent: vi.fn(),
        });
        vi.stubEnv("NODE_ENV", "production");
        for (let i = 0; i < 305; i++) {
            recordAdminV2PerfMark(`n${i}`, { i });
        }
        expect(getAdminV2PerfEvents().length).toBe(300);
        expect(getAdminV2PerfEvents()[0]?.tag).toBe("mark:n5");
        expect(getAdminV2PerfEvents()[299]?.tag).toBe("mark:n304");
    });
});