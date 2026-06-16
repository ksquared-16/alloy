"use client";

import { useState } from "react";
import type { LayoutRuntimeBodyRenderStats } from "@/lib/layout/runtime/layoutRuntimeBodyRenderStats";
import type { LayoutRuntimeDrawerEvidence } from "@/lib/layout/runtime/layoutRuntimeEvidence";
import type { SectionCompositionDiagnostic } from "@/lib/layout/layoutEditorSectionCompositionDiagnostics";

type Props = {
    layoutSource: string | null;
    stats: LayoutRuntimeBodyRenderStats;
    surface: string;
    lastError?: string | null;
    evidence?: LayoutRuntimeDrawerEvidence | null;
    layoutFallbackReason?: string | null;
    sectionDiagnostics?: SectionCompositionDiagnostic[];
};

/** Staging-only layout runtime body diagnostic strip. */
export default function DrawerLayoutRuntimeStagingDiagnostic({
    layoutSource,
    stats,
    surface,
    lastError,
    evidence,
    layoutFallbackReason,
    sectionDiagnostics = [],
}: Props) {
    const [open, setOpen] = useState(false);
    const [sectionsOpen, setSectionsOpen] = useState(false);

    return (
        <div
            className="rounded-md border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950"
            data-layout-runtime-staging-diagnostic="true"
            data-layout-runtime-surface={surface}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Layout runtime · staging diagnostic</div>
                {evidence ?
                    <button
                        type="button"
                        className="rounded border border-amber-300/80 px-1.5 py-0.5 text-[10px] font-medium"
                        onClick={() => setOpen((v) => !v)}
                    >
                        {open ? "Hide evidence" : "Show evidence"}
                    </button>
                :   null}
            </div>
            <dl className="mt-1 grid gap-0.5 sm:grid-cols-2">
                <div>
                    <dt className="inline text-amber-900/70">Source: </dt>
                    <dd className="inline font-medium">{layoutSource ?? "—"}</dd>
                </div>
                <div>
                    <dt className="inline text-amber-900/70">Layout key: </dt>
                    <dd className="inline font-medium">{evidence?.layoutKey ?? "—"}</dd>
                </div>
                {evidence?.layoutRecordId ?
                    <div className="sm:col-span-2">
                        <dt className="inline text-amber-900/70">entity_layouts.id: </dt>
                        <dd className="inline font-mono font-medium">{evidence.layoutRecordId}</dd>
                        {evidence.layoutVersion != null ?
                            <span className="ml-2 text-amber-900/70">v{evidence.layoutVersion}</span>
                        :   null}
                    </div>
                :   null}
                <div>
                    <dt className="inline text-amber-900/70">Sections: </dt>
                    <dd className="inline font-medium">{stats.sectionCount}</dd>
                </div>
                <div>
                    <dt className="inline text-amber-900/70">Renderable items: </dt>
                    <dd className="inline font-medium">{stats.renderableItemCount}</dd>
                </div>
                <div>
                    <dt className="inline text-amber-900/70">Items with data: </dt>
                    <dd className="inline font-medium">{stats.itemsWithValueCount}</dd>
                </div>
                {layoutFallbackReason ?
                    <div className="sm:col-span-2">
                        <dt className="inline text-amber-900/70">Layout fallback: </dt>
                        <dd className="inline font-medium">{layoutFallbackReason}</dd>
                    </div>
                :   null}
                {stats.fallbackReason ?
                    <div className="sm:col-span-2">
                        <dt className="inline text-amber-900/70">Body fallback reason: </dt>
                        <dd className="inline font-medium">{stats.fallbackReason}</dd>
                    </div>
                :   null}
                {lastError ?
                    <div className="sm:col-span-2">
                        <dt className="inline text-amber-900/70">Last error: </dt>
                        <dd className="inline font-medium">{lastError}</dd>
                    </div>
                :   null}
            </dl>
            {sectionDiagnostics.length > 0 ?
                <div className="mt-2 border-t border-amber-200/70 pt-2">
                    <button
                        type="button"
                        className="rounded border border-amber-300/80 px-1.5 py-0.5 text-[10px] font-medium"
                        onClick={() => setSectionsOpen((v) => !v)}
                    >
                        {sectionsOpen ? "Hide section composition" : "Show section composition"}
                    </button>
                    {sectionsOpen ?
                        <div className="mt-2 space-y-2">
                            {sectionDiagnostics.map((diagnostic) => (
                                <div
                                    key={diagnostic.sectionKey}
                                    className="rounded border border-amber-200/60 bg-white/70 px-2 py-1.5"
                                    data-testid={`live-drawer-composition-diagnostic-${diagnostic.sectionKey}`}
                                >
                                    <p className="mb-1 font-semibold uppercase tracking-wide text-amber-900/60">
                                        Live drawer · {diagnostic.sectionKey}
                                    </p>
                                    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                                        <dt>Published layout ID</dt>
                                        <dd className="truncate font-mono">{diagnostic.publishedLayoutId ?? "—"}</dd>
                                        <dt>Published version</dt>
                                        <dd>{diagnostic.publishedLayoutVersion ?? "—"}</dd>
                                        <dt>Section key</dt>
                                        <dd>{diagnostic.sectionKey}</dd>
                                        <dt>Row count</dt>
                                        <dd>{diagnostic.rowCount}</dd>
                                        <dt>Column counts</dt>
                                        <dd>{diagnostic.columnCounts.join(", ") || "—"}</dd>
                                        <dt>Runtime composition source</dt>
                                        <dd data-testid="live-drawer-composition-source">{diagnostic.runtimeCompositionSource}</dd>
                                    </dl>
                                </div>
                            ))}
                        </div>
                    :   null}
                </div>
            :   null}
            {open && evidence ?
                <pre className="mt-2 max-h-64 overflow-auto rounded border border-amber-200/70 bg-white/80 p-2 text-[10px] leading-snug text-amber-950">
                    {JSON.stringify(evidence, null, 2)}
                </pre>
            :   null}
        </div>
    );
}
