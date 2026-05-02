"use client";

import { neutral, palette } from "@/styles/tokens/colors";
import {
    clearAdminV2PerfEvents,
    exportAdminV2PerfEvents,
    getAdminV2PerfEvents,
    installAdminV2PerfConsoleHook,
    isAdminV2PerfCaptureActive,
    type AdminV2PerfEvent,
} from "@/lib/perf/adminV2PerfCapture";
import { useCallback, useEffect, useMemo, useState } from "react";

function eventSortDuration(e: AdminV2PerfEvent): number {
    if (typeof e.duration_ms === "number" && Number.isFinite(e.duration_ms)) return e.duration_ms;
    return 0;
}

function groupByTag(events: AdminV2PerfEvent[]): Map<string, { count: number; maxMs: number }> {
    const m = new Map<string, { count: number; maxMs: number }>();
    for (const e of events) {
        const cur = m.get(e.tag) ?? { count: 0, maxMs: 0 };
        cur.count += 1;
        const d = eventSortDuration(e);
        if (d > cur.maxMs) cur.maxMs = d;
        m.set(e.tag, cur);
    }
    return m;
}

export default function AdminV2PerfCaptureWidget() {
    const [enabled, setEnabled] = useState(false);
    const [open, setOpen] = useState(false);
    const [tick, setTick] = useState(0);

    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        const read = () => setEnabled(isAdminV2PerfCaptureActive());
        read();
        const onVis = () => read();
        document.addEventListener("visibilitychange", onVis);
        window.addEventListener("focus", onVis);
        return () => {
            document.removeEventListener("visibilitychange", onVis);
            window.removeEventListener("focus", onVis);
        };
    }, []);

    useEffect(() => {
        if (!enabled) return;
        installAdminV2PerfConsoleHook();
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        const onEv = () => refresh();
        window.addEventListener("alloy:perf-event", onEv as EventListener);
        window.addEventListener("alloy:perf-cleared", onEv as EventListener);
        return () => {
            window.removeEventListener("alloy:perf-event", onEv as EventListener);
            window.removeEventListener("alloy:perf-cleared", onEv as EventListener);
        };
    }, [enabled, refresh]);

    const events = useMemo(() => {
        void tick;
        return getAdminV2PerfEvents();
    }, [tick, open, enabled]);

    const latestRoute = events.length ? events[events.length - 1]!.route : "";
    const groups = useMemo(() => groupByTag(events), [events]);
    const groupRows = useMemo(
        () =>
            [...groups.entries()]
                .map(([tag, v]) => ({ tag, ...v }))
                .sort((a, b) => b.count - a.count || b.maxMs - a.maxMs),
        [groups]
    );
    const slowest = useMemo(() => {
        return [...events]
            .filter((e) => eventSortDuration(e) > 0)
            .sort((a, b) => eventSortDuration(b) - eventSortDuration(a))
            .slice(0, 10);
    }, [events]);

    const copyJson = useCallback(async () => {
        const text = exportAdminV2PerfEvents();
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            window.prompt("Copy JSON", text);
        }
    }, []);

    if (!enabled) {
        return null;
    }

    return (
        <div className="pointer-events-none fixed bottom-24 right-4 z-[200] flex flex-col items-end gap-2">
            {!open ? (
                <button
                    type="button"
                    className="pointer-events-auto rounded-lg border px-3 py-1.5 text-[12px] font-semibold shadow-md"
                    style={{
                        backgroundColor: palette.midnightForge,
                        color: neutral.background,
                        borderColor: "rgba(255,255,255,0.2)",
                    }}
                    onClick={() => {
                        refresh();
                        setOpen(true);
                    }}
                >
                    Perf
                </button>
            ) : (
                <div
                    className="pointer-events-auto flex max-h-[min(70vh,520px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-lg border shadow-xl"
                    style={{
                        backgroundColor: neutral.surface,
                        borderColor: "rgba(0,0,0,0.1)",
                    }}
                >
                    <div
                        className="flex items-center justify-between px-3 py-2"
                        style={{ backgroundColor: palette.midnightForge, color: neutral.background }}
                    >
                        <span className="text-[13px] font-semibold">Performance</span>
                        <button
                            type="button"
                            className="rounded px-2 py-0.5 text-[11px] font-medium opacity-90 hover:opacity-100"
                            onClick={() => setOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-2 text-[11px] text-alloy-forge">
                        <div className="space-y-0.5">
                            <div>
                                <span className="font-semibold text-alloy-midnight/80">Events:</span> {events.length} / 300
                            </div>
                            <div className="truncate" title={latestRoute}>
                                <span className="font-semibold text-alloy-midnight/80">Latest route:</span>{" "}
                                <span className="text-alloy-midnight/70">{latestRoute || "—"}</span>
                            </div>
                        </div>
                        <div>
                            <div className="mb-1 font-semibold text-alloy-midnight/85">By tag</div>
                            <ul className="max-h-32 space-y-0.5 overflow-auto border-t border-admin-border/40 pt-1">
                                {groupRows.length === 0 ? (
                                    <li className="text-alloy-midnight/50">No events yet</li>
                                ) : (
                                    groupRows.map((r) => (
                                        <li key={r.tag} className="flex justify-between gap-2">
                                            <span className="truncate font-mono text-[10px]" title={r.tag}>
                                                {r.tag}
                                            </span>
                                            <span className="shrink-0 text-alloy-midnight/70">
                                                n={r.count} max {r.maxMs}ms
                                            </span>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                        <div>
                            <div className="mb-1 font-semibold text-alloy-midnight/85">Slowest (with duration)</div>
                            <ul className="max-h-40 space-y-0.5 overflow-auto border-t border-admin-border/40 pt-1">
                                {slowest.length === 0 ? (
                                    <li className="text-alloy-midnight/50">—</li>
                                ) : (
                                    slowest.map((e) => (
                                        <li key={e.id} className="flex justify-between gap-2">
                                            <span className="truncate font-mono text-[10px]" title={e.tag}>
                                                {e.tag}
                                            </span>
                                            <span className="shrink-0">{eventSortDuration(e)}ms</span>
                                        </li>
                                    ))
                                )}
                            </ul>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                className="rounded border border-admin-border bg-white px-2 py-1 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-midnight/5"
                                onClick={copyJson}
                            >
                                Copy JSON
                            </button>
                            <button
                                type="button"
                                className="rounded border border-admin-border bg-white px-2 py-1 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-midnight/5"
                                onClick={() => {
                                    clearAdminV2PerfEvents();
                                    refresh();
                                }}
                            >
                                Clear
                            </button>
                        </div>
                        <p className="text-[10px] leading-snug text-alloy-midnight/55">
                            Production: set <code className="font-mono">localStorage.alloy_perf_capture=true</code> and refresh.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
