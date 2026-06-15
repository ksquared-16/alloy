"use client";

import { useEffect } from "react";
import { installPlatformSurfacePerfDebugBridge } from "@/lib/perf/platformSurfacePerfDebugBridge";

/** Registers `window.__alloyPlatformPerf` when platform perf debug is enabled. */
export default function PlatformSurfacePerfDebugInstaller() {
    useEffect(() => {
        installPlatformSurfacePerfDebugBridge();
    }, []);

    return null;
}
