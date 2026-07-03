"use client";

/**
 * Workspace Processes — Surface Builder editor.
 *
 * The canvas renders the ACTUAL runtime ProcessSummaryCard (the same component `/workspace`
 * renders), driven by the live-edited config — so editing feels like the frontend card, not
 * a mock template. The only authored settings are the Today's Work behavior (the card grammar
 * and content are runtime-owned): visible / max rows / sort / show counts. Publishing writes
 * the config to the workspace_processes surface; the runtime consumes it.
 *
 * UI language: Section / Field-free (no field authoring here — Today's Work is runtime-
 * generated from configured work views). Evidence Group / Composition Item are not exposed.
 */

import { useEffect, useState } from "react";
import { ProcessSummaryCard } from "@/components/presentation/workspace/ProcessSummaryCard";
import type { ProcessTileModel } from "@/lib/presentation/runtime";
import {
    DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    type TodaysWorkSort,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import {
    loadWorkspaceProcessSurfaceConfig,
    publishWorkspaceProcessSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessSurfaceService";

/** A representative process for the edit canvas — the real card renders it with the live config. */
const SAMPLE_PROCESS: ProcessTileModel = {
    id: "sample-enrollment",
    label: "Enrollment Pipeline",
    description: "Leads through tour, registration, and start",
    entryHref: "/workspace/work-unit/enrollment-pipeline",
    activeRecordCount: 142,
    needsAttentionCount: 11,
    performanceMetrics: [
        { label: "Pipeline health", value: "82%", status: "On track", target: "80%" },
    ],
    workViews: [
        { id: "new-leads", label: "New Leads", isActive: false, count: 24, href: "#", attentionCount: 6, overdueCount: null },
        { id: "active", label: "Active Pipeline", isActive: false, count: 58, href: "#", attentionCount: null, overdueCount: 3 },
        { id: "registration", label: "Registration", isActive: false, count: 12, href: "#", attentionCount: null, overdueCount: null },
        { id: "waitlist", label: "Waitlist", isActive: false, count: 9, href: "#", attentionCount: null, overdueCount: null },
    ],
};

const SORT_OPTIONS: { value: TodaysWorkSort; label: string }[] = [
    { value: "attention", label: "Needs attention first" },
    { value: "count", label: "Highest count first" },
    { value: "configured", label: "Configured order" },
];

export default function WorkspaceProcessesSurfaceEditor() {
    const [config, setConfig] = useState<WorkspaceProcessSurfaceConfig>(
        DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    );
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [publishedAt, setPublishedAt] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        loadWorkspaceProcessSurfaceConfig()
            .then((c) => { if (active) { setConfig(c); setDirty(false); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

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

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto" data-workspace-processes-builder>
            <header className="border-b border-alloy-stone/10 pb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Surface Builder</p>
                <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight">Workspace Processes</h2>
                <p className="mt-0.5 text-sm text-alloy-midnight/55">
                    One process card, repeated per configured process on <code>/workspace</code>. The card content is
                    live runtime data; configure the Today's Work section below.
                </p>
            </header>

            {loading ? (
                <div className="h-40 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/5" />
            ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                    {/* Live canvas — the REAL ProcessSummaryCard with the edited config. */}
                    <div data-workspace-processes-canvas>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Live card · sample process
                        </p>
                        <div className="max-w-[26rem]">
                            <ProcessSummaryCard process={SAMPLE_PROCESS} config={config} />
                        </div>
                    </div>

                    {/* Inspector — Today's Work behavior only. */}
                    <div className="flex flex-col gap-4" data-workspace-processes-inspector>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Today's Work</p>

                        <label className="flex items-center justify-between gap-2 text-[13px] text-alloy-midnight/80">
                            Show Today's Work
                            <input
                                type="checkbox"
                                checked={tw.visible}
                                onChange={(e) => patchTodaysWork({ visible: e.target.checked })}
                                data-config-visible
                                className="h-4 w-4 rounded border-alloy-stone/30 text-alloy-pine"
                            />
                        </label>

                        <label className="flex flex-col gap-1 text-[13px] text-alloy-midnight/80">
                            Max rows (0 = all)
                            <input
                                type="number"
                                min={0}
                                max={12}
                                value={tw.maxRows}
                                onChange={(e) => patchTodaysWork({ maxRows: Math.max(0, Number(e.target.value) || 0) })}
                                data-config-max-rows
                                className="rounded-md border border-alloy-stone/25 px-2 py-1 text-sm"
                            />
                        </label>

                        <label className="flex flex-col gap-1 text-[13px] text-alloy-midnight/80">
                            Order
                            <select
                                value={tw.sort}
                                onChange={(e) => patchTodaysWork({ sort: e.target.value as TodaysWorkSort })}
                                data-config-sort
                                className="rounded-md border border-alloy-stone/25 px-2 py-1 text-sm"
                            >
                                {SORT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="flex items-center justify-between gap-2 text-[13px] text-alloy-midnight/80">
                            Show counts
                            <input
                                type="checkbox"
                                checked={tw.showCounts}
                                onChange={(e) => patchTodaysWork({ showCounts: e.target.checked })}
                                data-config-show-counts
                                className="h-4 w-4 rounded border-alloy-stone/30 text-alloy-pine"
                            />
                        </label>
                    </div>
                </div>
            )}

            <div className="mt-auto flex items-center gap-3 border-t border-alloy-stone/10 pt-3">
                <button
                    type="button"
                    onClick={handlePublish}
                    disabled={publishing || !dirty}
                    data-workspace-processes-publish
                    className="rounded-md bg-alloy-pine px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                    {publishing ? "Publishing…" : "Publish"}
                </button>
                {publishedAt ? <span className="text-xs font-medium text-alloy-pine">Published</span> : null}
                {dirty && !publishing ? <span className="text-xs text-alloy-midnight/45">Unpublished changes</span> : null}
                {error ? <span className="text-xs text-alloy-ember">{error}</span> : null}
            </div>
        </div>
    );
}
