"use client";

import { ALLOY_PERF_TICK_EVENT, ensureAlloyPerf } from "@/lib/perf/alloyPerfGlobal";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function fmtMs(end: number | undefined, start: number | undefined): string {
    if (typeof end !== "number" || typeof start !== "number" || !Number.isFinite(end) || !Number.isFinite(start)) {
        return "...";
    }
    return `${Math.round(end - start)}ms`;
}

export default function AdminV2PerfOverlay() {
    const pathname = usePathname();
    const [, setTick] = useState(0);

    useEffect(() => {
        ensureAlloyPerf();
    }, []);

    useEffect(() => {
        const api = ensureAlloyPerf();
        if (api) {
            api.marks = Object.create(null) as Record<string, number>;
            setTick((t) => t + 1);
        }
    }, [pathname]);

    useEffect(() => {
        const onTick = () => setTick((t) => t + 1);
        window.addEventListener(ALLOY_PERF_TICK_EVENT, onTick);
        return () => window.removeEventListener(ALLOY_PERF_TICK_EVENT, onTick);
    }, []);

    if (process.env.NODE_ENV !== "development") {
        return null;
    }

    const m = ensureAlloyPerf()?.marks ?? ({} as Record<string, number>);

    const text = [
        `WS: ${fmtMs(m.workspace_ready, m.workspace_start)}`,
        `DEPT: ${fmtMs(m.department_ready, m.department_start)}`,
        `WU Shell: ${fmtMs(m.work_unit_shell_ready, m.work_unit_start)}`,
        `WU Summ: ${fmtMs(m.work_unit_summaries_ready, m.work_unit_start)}`,
        `Rows: ${fmtMs(m.queue_rows_ready, m.work_unit_start)}`,
        `Drawer: ${fmtMs(m.drawer_ready, m.drawer_open_start)}`,
    ].join("\n");

    return (
        <div
            style={{
                position: "fixed",
                bottom: 12,
                right: 12,
                zIndex: 99999,
                pointerEvents: "none",
                fontSize: 11,
                padding: 8,
                borderRadius: 6,
                backgroundColor: "rgba(0,0,0,0.78)",
                color: "#fff",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                whiteSpace: "pre-line",
                lineHeight: 1.35,
            }}
        >
            {text}
        </div>
    );
}
