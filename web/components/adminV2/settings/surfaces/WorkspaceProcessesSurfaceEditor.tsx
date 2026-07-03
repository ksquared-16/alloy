"use client";

/**
 * Workspace Processes — Surface Builder editor.
 *
 * Two things the operator configures, nothing more:
 *   1. Primary Signal — per business process, WHICH Operational Calculation the card presents.
 *      Options come straight from the Operational Calculations registry (tile-consumable, active).
 *      The builder chooses the signal; it never configures the calculation.
 *   2. Today's Work behavior — visible / max rows / sort / show counts (global).
 *
 * The canvas renders the ACTUAL runtime ProcessSummaryCard with the selected signal, so editing
 * feels like the frontend card. UI language: Primary Signal / Today's Work. "Operational
 * Answer" / "Evidence" stay internal.
 */

import { useEffect, useMemo, useState } from "react";
import { ProcessSummaryCard } from "@/components/presentation/workspace/ProcessSummaryCard";
import type { ProcessTileModel } from "@/lib/presentation/runtime";
import {
    signalsForBusinessProcess,
    signalAnswerText,
    signalStateFromKpiStatus,
    WORKSPACE_SIGNAL_BUSINESS_PROCESSES,
} from "@/lib/presentation/runtime/workspaceProcessSignal";
import {
    DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    type TodaysWorkSort,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import {
    loadWorkspaceProcessSurfaceConfig,
    publishWorkspaceProcessSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessSurfaceService";

const SORT_OPTIONS: { value: TodaysWorkSort; label: string }[] = [
    { value: "attention", label: "Needs attention first" },
    { value: "count", label: "Highest count first" },
    { value: "configured", label: "Configured order" },
];

/** Business processes that actually have a tile-consumable signal (registry-driven). */
const SIGNAL_PROCESSES = WORKSPACE_SIGNAL_BUSINESS_PROCESSES.map((p) => ({
    ...p,
    signals: signalsForBusinessProcess(p.businessProcess),
})).filter((p) => p.signals.length > 0);

/** Sample preview data (builder-local ONLY) — the real card renders the selected signal. */
function previewProcess(label: string, signalKey: string): ProcessTileModel {
    const calc = SIGNAL_PROCESSES.flatMap((p) => p.signals).find((c) => c.key === signalKey);
    const signalLabel = calc?.label ?? "Signal";
    const state = signalStateFromKpiStatus("healthy"); // representative preview state
    return {
        id: `preview-${signalKey}`,
        processKey: label.toLowerCase(),
        label,
        description: "Preview",
        entryHref: "#",
        activeRecordCount: 142,
        needsAttentionCount: 11,
        workViews: [
            { id: "a", label: "New Leads", isActive: false, count: 24, href: "#", attentionCount: 6, overdueCount: null },
            { id: "b", label: "Active Pipeline", isActive: false, count: 58, href: "#", attentionCount: null, overdueCount: 3 },
        ],
        primarySignal: {
            key: signalKey,
            label: signalLabel,
            answer: signalAnswerText(signalLabel, state),
            state,
            value: "—",
            supportingContext: null,
            trend: null,
            drillHref: null,
        },
    };
}

export default function WorkspaceProcessesSurfaceEditor() {
    const [config, setConfig] = useState<WorkspaceProcessSurfaceConfig>(
        DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    );
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishedAt, setPublishedAt] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewBp, setPreviewBp] = useState(SIGNAL_PROCESSES[0]?.businessProcess ?? null);

    useEffect(() => {
        let active = true;
        loadWorkspaceProcessSurfaceConfig()
            .then((c) => { if (active) { setConfig(c); setDirty(false); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    function setPrimarySignal(bp: string, key: string) {
        setConfig((prev) => ({ ...prev, primarySignalByProcess: { ...prev.primarySignalByProcess, [bp]: key } }));
        setDirty(true);
        setPublishedAt(false);
    }
    function patchTodaysWork(patch: Partial<WorkspaceProcessSurfaceConfig["todaysWork"]>) {
        setConfig((prev) => ({ ...prev, todaysWork: { ...prev.todaysWork, ...patch } }));
        setDirty(true);
        setPublishedAt(false);
    }

    async function handlePublish() {
        setPublishing(true);
        setError(null);
        try {
            await publishWorkspaceProcessSurfaceConfig(config);
            setDirty(false);
            setPublishedAt(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setPublishing(false);
        }
    }

    const tw = config.todaysWork;
    const previewProc = SIGNAL_PROCESSES.find((p) => p.businessProcess === previewBp);
    const previewSignalKey = previewProc
        ? config.primarySignalByProcess[previewProc.businessProcess] ?? previewProc.signals[0]?.key ?? ""
        : "";
    const preview = useMemo(
        () => (previewProc ? previewProcess(previewProc.label, previewSignalKey) : null),
        [previewProc, previewSignalKey],
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto" data-workspace-processes-builder>
            <header className="border-b border-alloy-stone/10 pb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Surface Builder</p>
                <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">Workspace Processes</h2>
                <p className="mt-0.5 text-sm text-alloy-midnight/55">
                    One process card per process on <code>/workspace</code>. Choose the Primary Signal each process
                    presents; the card renders it live.
                </p>
            </header>

            {loading ? (
                <div className="h-40 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/5" />
            ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    {/* Live canvas — the REAL ProcessSummaryCard with the selected signal. */}
                    <div data-workspace-processes-canvas>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Live card · {previewProc?.label ?? "—"}
                        </p>
                        <div className="max-w-[26rem]">
                            {preview ? <ProcessSummaryCard process={preview} config={config} /> : null}
                        </div>
                    </div>

                    {/* Inspector — Primary Signal per process + Today's Work behavior. */}
                    <div className="flex flex-col gap-5" data-workspace-processes-inspector>
                        <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Primary Signal</p>
                            <div className="flex flex-col gap-3">
                                {SIGNAL_PROCESSES.map((p) => (
                                    <label key={p.businessProcess} className="flex flex-col gap-1 text-[13px] text-alloy-midnight/80">
                                        <span
                                            className="cursor-pointer font-medium"
                                            onClick={() => setPreviewBp(p.businessProcess)}
                                        >
                                            {p.label}
                                        </span>
                                        <select
                                            value={config.primarySignalByProcess[p.businessProcess] ?? p.signals[0]?.key ?? ""}
                                            onChange={(e) => { setPrimarySignal(p.businessProcess, e.target.value); setPreviewBp(p.businessProcess); }}
                                            data-primary-signal={p.businessProcess}
                                            className="rounded-md border border-alloy-stone/25 px-2 py-1.5 text-sm"
                                        >
                                            {p.signals.map((s) => (
                                                <option key={s.key} value={s.key}>{s.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                            </div>
                            <p className="mt-2 text-[11px] text-alloy-midnight/45">
                                Choosing WHICH Operational Calculation the process presents — not configuring the calculation.
                            </p>
                        </div>

                        <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Today's Work</p>
                            <label className="flex items-center justify-between gap-2 text-[13px] text-alloy-midnight/80">
                                Show Today's Work
                                <input type="checkbox" checked={tw.visible} onChange={(e) => patchTodaysWork({ visible: e.target.checked })} data-config-visible className="h-4 w-4 rounded border-alloy-stone/30 text-alloy-pine" />
                            </label>
                            <label className="mt-2 flex flex-col gap-1 text-[13px] text-alloy-midnight/80">
                                Max rows (0 = all)
                                <input type="number" min={0} max={12} value={tw.maxRows} onChange={(e) => patchTodaysWork({ maxRows: Math.max(0, Number(e.target.value) || 0) })} data-config-max-rows className="rounded-md border border-alloy-stone/25 px-2 py-1 text-sm" />
                            </label>
                            <label className="mt-2 flex flex-col gap-1 text-[13px] text-alloy-midnight/80">
                                Order
                                <select value={tw.sort} onChange={(e) => patchTodaysWork({ sort: e.target.value as TodaysWorkSort })} data-config-sort className="rounded-md border border-alloy-stone/25 px-2 py-1 text-sm">
                                    {SORT_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                                </select>
                            </label>
                            <label className="mt-2 flex items-center justify-between gap-2 text-[13px] text-alloy-midnight/80">
                                Show counts
                                <input type="checkbox" checked={tw.showCounts} onChange={(e) => patchTodaysWork({ showCounts: e.target.checked })} data-config-show-counts className="h-4 w-4 rounded border-alloy-stone/30 text-alloy-pine" />
                            </label>
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-auto flex items-center gap-3 border-t border-alloy-stone/10 pt-3">
                <button type="button" onClick={handlePublish} disabled={publishing || !dirty} data-workspace-processes-publish className="rounded-md bg-alloy-pine px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {publishing ? "Publishing…" : "Publish"}
                </button>
                {publishedAt ? <span className="text-xs font-medium text-alloy-pine">Published</span> : null}
                {dirty && !publishing ? <span className="text-xs text-alloy-midnight/45">Unpublished changes</span> : null}
                {error ? <span className="text-xs text-alloy-ember">{error}</span> : null}
            </div>
        </div>
    );
}
