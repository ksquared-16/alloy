"use client";

import { ALLOY_PERF_TICK_EVENT, ensureAlloyPerf } from "@/lib/perf/alloyPerfGlobal";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** localStorage key; set to `"true"` via `?perf=1` or manually. Cleared by `?perf=0`. */
export const ALLOY_PERF_OVERLAY_LS_KEY = "alloy_perf_overlay";

function fmtMs(end: number | undefined, start: number | undefined): string {
    if (typeof end !== "number" || typeof start !== "number" || !Number.isFinite(end) || !Number.isFinite(start)) {
        return "...";
    }
    return `${Math.round(end - start)}ms`;
}

function readLocalOverlayFlag(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(ALLOY_PERF_OVERLAY_LS_KEY) === "true";
    } catch {
        return false;
    }
}

export default function AdminV2PerfOverlay() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [visible, setVisible] = useState(false);
    const [, setTick] = useState(0);

    useEffect(() => {
        ensureAlloyPerf();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const perf = searchParams.get("perf");
        try {
            if (perf === "0") {
                window.localStorage.removeItem(ALLOY_PERF_OVERLAY_LS_KEY);
            } else if (perf === "1") {
                window.localStorage.setItem(ALLOY_PERF_OVERLAY_LS_KEY, "true");
            }
        } catch {
            /* private mode */
        }

        const isDev = process.env.NODE_ENV === "development";
        const fromUrl = perf === "1";
        const fromLs = readLocalOverlayFlag();
        setVisible(isDev || fromUrl || fromLs);
    }, [pathname, searchParams]);

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

    if (!visible) {
        return null;
    }

    const m = ensureAlloyPerf()?.marks ?? ({} as Record<string, number>);
    const wu = m.work_unit_start;

    const lines: string[] = [
        `WS: ${fmtMs(m.workspace_ready, m.workspace_start)}`,
        `DEPT: ${fmtMs(m.department_ready, m.department_start)}`,
        `WU Shell: ${fmtMs(m.work_unit_shell_ready, wu)}`,
        `WU Summ req: ${fmtMs(m.work_unit_summaries_request_start, wu)}`,
        `WU Summ resp: ${fmtMs(m.work_unit_summaries_response, wu)}`,
        `WU Summ applied: ${fmtMs(m.work_unit_summaries_applied, wu)}`,
        `Rows req: ${fmtMs(m.queue_rows_request_start, wu)}`,
        `Rows resp: ${fmtMs(m.queue_rows_response, wu)}`,
        `Rows applied: ${fmtMs(m.queue_rows_applied, wu)}`,
    ];

    const dOpen = m.drawer_open_start;
    if (typeof dOpen === "number") {
        lines.push(`Drawer visible: ${fmtMs(m.drawer_visible_ready, dOpen)}`);
        if (typeof m.drawer_entity_request_start === "number") {
            lines.push(`  entity req: ${fmtMs(m.drawer_entity_request_start, dOpen)}`);
        }
        if (typeof m.drawer_entity_response === "number") {
            lines.push(`  entity resp: ${fmtMs(m.drawer_entity_response, dOpen)}`);
        }
        if (typeof m.drawer_entity_applied === "number") {
            lines.push(`  entity applied: ${fmtMs(m.drawer_entity_applied, dOpen)}`);
        }
        if (typeof m.drawer_header_actions_request_start === "number") {
            lines.push(`  header req: ${fmtMs(m.drawer_header_actions_request_start, dOpen)}`);
        }
        if (typeof m.drawer_header_actions_response === "number") {
            lines.push(`  header resp: ${fmtMs(m.drawer_header_actions_response, dOpen)}`);
        }
    }

    const text = lines.join("\n");

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
