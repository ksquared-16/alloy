"use client";

import { useEffect, useState } from "react";

import {
    collectAlloyOsLayoutSurfaceReport,
    type AlloyOsLayoutSurfaceReport,
} from "@/lib/adminV2/runtime/alloyOsLayoutSurfaceReport";

/** localStorage key (set to "1") to show the visual overlay. Console fn is always available. */
const LAYOUT_DEBUG_KEY = "alloy:os-layout-debug";

function overlayEnabled(): boolean {
    if (typeof window === "undefined") return false;
    if (window.localStorage.getItem(LAYOUT_DEBUG_KEY) === "1") return true;
    return new URLSearchParams(window.location.search).has("alloyOsLayoutDebug");
}

/**
 * Dev-only operational-surface diagnostics (System 1.5).
 *
 * - Registers `window.__alloyReportLayoutSurface()` (console table of WUC bottom, op-surface
 *   top/bottom, queue/Focus Panel/BOS top·bottom·height, emitted CSS vars, peer-alignment).
 * - Optional fixed overlay (localStorage `alloy:os-layout-debug=1` or `?alloyOsLayoutDebug`).
 *
 * Inert when the runtime flag is off or outside development. No layout impact (fixed,
 * pointer-events:none, measurement only).
 */
export default function AlloyOsLayoutSurfaceDiagnostics() {
    const [report, setReport] = useState<AlloyOsLayoutSurfaceReport | null>(null);
    const [showOverlay, setShowOverlay] = useState(false);

    useEffect(() => {
        if (process.env.NODE_ENV === "production") return;
        if (typeof window === "undefined") return;

        const w = window as Window & {
            __alloyReportLayoutSurface?: () => AlloyOsLayoutSurfaceReport;
        };
        w.__alloyReportLayoutSurface = () => collectAlloyOsLayoutSurfaceReport({ log: true });
        // eslint-disable-next-line no-console
        console.info(
            "[alloy] operational-surface diagnostics ready — __alloyReportLayoutSurface(); overlay via localStorage['alloy:os-layout-debug']='1'",
        );

        const enabled = overlayEnabled();
        setShowOverlay(enabled);
        if (!enabled) return;

        let frame = 0;
        const schedule = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                setReport(collectAlloyOsLayoutSurfaceReport());
            });
        };
        schedule();
        const mo = new MutationObserver(schedule);
        mo.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["style", "class", "data-adminv2-drawer", "data-alloy-os-runtime-split"],
        });
        window.addEventListener("resize", schedule);
        const interval = window.setInterval(schedule, 1000);

        return () => {
            window.cancelAnimationFrame(frame);
            window.clearInterval(interval);
            mo.disconnect();
            window.removeEventListener("resize", schedule);
        };
    }, []);

    if (!showOverlay || !report) return null;

    const { measurement: m, evaluation: e } = report;
    const row = (label: string, value: unknown) => (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ opacity: 0.7 }}>{label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{String(value ?? "—")}</span>
        </div>
    );
    const check = (label: string, ok: boolean) => (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ opacity: 0.7 }}>{label}</span>
            <span style={{ color: ok ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                {ok ? "OK" : "FAIL"}
            </span>
        </div>
    );

    return (
        <div
            data-alloy-os-layout-diagnostics="true"
            style={{
                position: "fixed",
                bottom: 8,
                left: 8,
                zIndex: 2147483647,
                pointerEvents: "none",
                width: 280,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(15,23,34,0.92)",
                color: "#e5e7eb",
                font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
                boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
                border: `1px solid ${e.pass ? "#16a34a" : "#dc2626"}`,
            }}
        >
            <div style={{ fontWeight: 700, marginBottom: 6, color: e.pass ? "#4ade80" : "#f87171" }}>
                Alloy OS surface — {e.pass ? "PASS" : "MISMATCH"}
            </div>
            {row("WUC bottom Y", m.workUnitContextBottom)}
            {row("op-surface top", m.cssVars.opSurfaceTop)}
            {row("op-surface col-top", m.cssVars.opSurfaceColTop)}
            {row("surface bottom Y", m.cssVars.opSurfaceBottom != null ? m.viewportHeight - m.cssVars.opSurfaceBottom : null)}
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.12)", margin: "6px 0" }} />
            {row("queue top / bottom", m.queue ? `${m.queue.top} / ${m.queue.bottom}` : null)}
            {row("panel top / bottom", m.focusPanel ? `${m.focusPanel.top} / ${m.focusPanel.bottom}` : null)}
            {row("BOS top / bottom", m.bos ? `${m.bos.top} / ${m.bos.bottom}` : null)}
            {row("heights Q/P/B", `${m.queue?.height ?? "—"}/${m.focusPanel?.height ?? "—"}/${m.bos?.height ?? "—"}`)}
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.12)", margin: "6px 0" }} />
            {check("tops aligned", e.topsAligned)}
            {check("bottoms aligned", e.bottomsAligned)}
            {check("heights equal", e.heightsEqual)}
            {check("queue fills height", e.queueFillsHeight)}
        </div>
    );
}
