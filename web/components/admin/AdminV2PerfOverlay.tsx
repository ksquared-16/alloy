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

function fmtHdrMs(n: number | undefined): string {
    if (typeof n !== "number" || !Number.isFinite(n)) return "...";
    return `${Math.round(n)}ms`;
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
    const nav = m.route_nav_start ?? wu;

    const lines: string[] = [
        `WS: ${fmtMs(m.workspace_ready, m.workspace_start)}`,
        `DEPT: ${fmtMs(m.department_ready, m.department_start)}`,
        `nav→summ_req: ${fmtMs(m.summaries_req, nav)}`,
        `nav→summ_resp: ${fmtMs(m.summaries_resp, nav)}`,
        `nav→wu_detail_resp: ${fmtMs(m.work_unit_detail_resp, nav)}`,
        `nav→dept_resp: ${fmtMs(m.dept_resp, nav)}`,
        `nav→rows_req: ${fmtMs(m.rows_req, nav)}`,
        `nav→rows_resp: ${fmtMs(m.rows_resp, nav)}`,
        `nav→shell_ready: ${fmtMs(m.shell_ready, nav)}`,
        `nav→first_useful_paint: ${fmtMs(m.first_useful_paint, nav)}`,
        `WU Shell (legacy): ${fmtMs(m.work_unit_shell_ready, wu)}`,
        `WU Summ req: ${fmtMs(m.work_unit_summaries_request_start, wu)}`,
        `WU Summ hdr: ${fmtMs(m.work_unit_summaries_response_headers, m.work_unit_summaries_request_start)}`,
        `WU Summ json: ${fmtMs(m.work_unit_summaries_json_parse_done, m.work_unit_summaries_response_headers)}`,
        `WU Summ state: ${fmtMs(m.work_unit_summaries_state_applied, m.work_unit_summaries_json_parse_done)}`,
        `Rows req: ${fmtMs(m.queue_rows_request_start, wu)}`,
        `Rows hdr: ${fmtMs(m.queue_rows_response_headers, m.queue_rows_request_start)}`,
        `Rows json: ${fmtMs(m.queue_rows_json_parse_done, m.queue_rows_response_headers)}`,
        `Rows state: ${fmtMs(m.queue_rows_state_applied, m.queue_rows_json_parse_done)}`,
    ];

    const dOpen = m.drawer_open_start;
    if (typeof dOpen === "number") {
        lines.push(`Drawer shell ready: ${fmtMs(m.drawer_visible_ready, dOpen)}`);
        if (typeof m.drawer_opportunity_visible_req === "number") {
            lines.push(`  opp visible req: ${fmtMs(m.drawer_opportunity_visible_req, dOpen)}`);
        }
        if (typeof m.drawer_opportunity_visible_resp === "number") {
            lines.push(`  opp visible resp: ${fmtMs(m.drawer_opportunity_visible_resp, dOpen)}`);
        }
        if (typeof m.drawer_opportunity_visible_applied === "number") {
            lines.push(`  opp visible applied: ${fmtMs(m.drawer_opportunity_visible_applied, dOpen)}`);
        }
        if (typeof m.drawer_opportunity_full_req === "number") {
            lines.push(`  opp full hydrate req: ${fmtMs(m.drawer_opportunity_full_req, dOpen)}`);
        }
        if (typeof m.drawer_opportunity_full_resp === "number") {
            lines.push(`  opp full hydrate resp: ${fmtMs(m.drawer_opportunity_full_resp, dOpen)}`);
        }
        if (typeof m.drawer_opportunity_full_applied === "number") {
            lines.push(`  opp full hydrate applied: ${fmtMs(m.drawer_opportunity_full_applied, dOpen)}`);
        }
        if (typeof m.drawer_entity_request_start === "number") {
            lines.push(`  entity req (all types): ${fmtMs(m.drawer_entity_request_start, dOpen)}`);
        }
        if (typeof m.drawer_entity_response === "number") {
            lines.push(`  entity resp (all types): ${fmtMs(m.drawer_entity_response, dOpen)}`);
        }
        if (typeof m.drawer_entity_applied === "number") {
            lines.push(`  entity applied (all types): ${fmtMs(m.drawer_entity_applied, dOpen)}`);
        }
        if (typeof m.drawer_header_actions_request_start === "number") {
            lines.push(`  header req: ${fmtMs(m.drawer_header_actions_request_start, dOpen)}`);
        }
        if (typeof m.drawer_header_actions_response === "number") {
            lines.push(`  header resp: ${fmtMs(m.drawer_header_actions_response, dOpen)}`);
        }
        lines.push(
            `  visible X-Alloy-Server: ${fmtHdrMs(m.drawer_opportunity_visible_x_alloy_server_duration_ms)} · enrich: ${fmtHdrMs(m.drawer_opportunity_visible_x_alloy_opp_enrich_ms)}`
        );
        lines.push(
            `  full hydrate X-Alloy-Server: ${fmtHdrMs(m.drawer_opportunity_full_x_alloy_server_duration_ms)} · enrich: ${fmtHdrMs(m.drawer_opportunity_full_x_alloy_opp_enrich_ms)}`
        );
        lines.push(`  visible client RTT: ${fmtMs(m.drawer_opportunity_visible_resp, m.drawer_opportunity_visible_req)}`);
        lines.push(`  full hydrate client RTT: ${fmtMs(m.drawer_opportunity_full_resp, m.drawer_opportunity_full_req)}`);
        lines.push(`  legacy overlay entity RTT: ${fmtMs(m.drawer_entity_response, m.drawer_entity_request_start)}`);
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
