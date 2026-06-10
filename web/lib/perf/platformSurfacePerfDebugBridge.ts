"use client";

import {
    clearPlatformSurfacePerfBufferForTests,
    dumpPlatformSurfacePerfEventsToConsole,
    getPlatformSurfacePerfEvents,
} from "@/lib/perf/platformSurfacePerfBuffer";
import {
    platformSurfacePerfEnabled,
    platformSurfacePerfServerLogEnabled,
} from "@/lib/perf/platformSurfacePerfTrace";

export type AlloyPlatformPerfDebugApi = {
    enabled: () => boolean;
    serverLogEnabled: () => boolean;
    events: () => ReturnType<typeof getPlatformSurfacePerfEvents>;
    dump: () => ReturnType<typeof dumpPlatformSurfacePerfEventsToConsole>;
    exportJson: () => string;
    clear: () => void;
    enable: () => void;
    disable: () => void;
    enableServerLog: () => void;
    disableServerLog: () => void;
};

declare global {
    interface Window {
        __alloyPlatformPerf?: AlloyPlatformPerfDebugApi;
    }
}

export function installPlatformSurfacePerfDebugBridge(): void {
    if (typeof window === "undefined") return;

    window.__alloyPlatformPerf = {
        enabled: platformSurfacePerfEnabled,
        serverLogEnabled: platformSurfacePerfServerLogEnabled,
        events: getPlatformSurfacePerfEvents,
        dump: dumpPlatformSurfacePerfEventsToConsole,
        exportJson: () => JSON.stringify(getPlatformSurfacePerfEvents(), null, 2),
        clear: () => {
            clearPlatformSurfacePerfBufferForTests();
        },
        enable: () => {
            window.localStorage.setItem("ALLOY_PLATFORM_PERF_DEBUG", "1");
            console.info(
                "[alloy-platform-perf] Client buffer enabled — events persist in sessionStorage. Run __alloyPlatformPerf.dump() after navigation.",
            );
        },
        enableServerLog: () => {
            window.localStorage.setItem("ALLOY_PLATFORM_PERF_SERVER_LOG", "1");
            console.info(
                "[alloy-platform-perf] Server relay enabled — events also emit to Vercel logs via /api/admin/debug/platform-perf-trace.",
            );
        },
        disable: () => {
            window.localStorage.removeItem("ALLOY_PLATFORM_PERF_DEBUG");
        },
        disableServerLog: () => {
            window.localStorage.removeItem("ALLOY_PLATFORM_PERF_SERVER_LOG");
        },
    };

    if (platformSurfacePerfEnabled()) {
        console.info(
            "[alloy-platform-perf] Debug API ready — __alloyPlatformPerf.dump() | .events() | .exportJson() | .enableServerLog()",
        );
    }
}
