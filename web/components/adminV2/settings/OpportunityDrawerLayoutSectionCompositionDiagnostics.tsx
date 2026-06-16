"use client";

import type { SectionCompositionDiagnostic } from "@/lib/layout/layoutEditorSectionCompositionDiagnostics";

type Props = {
    title: string;
    diagnostic: SectionCompositionDiagnostic | null;
};

export default function OpportunityDrawerLayoutSectionCompositionDiagnostics({ title, diagnostic }: Props) {
    if (!diagnostic) return null;

    return (
        <div
            className="mt-2 rounded border border-alloy-forge/10 bg-alloy-stone/[0.03] px-2 py-1.5 text-[10px] text-alloy-midnight/55"
            data-testid={`visual-editor-composition-diagnostic-${diagnostic.sectionKey}`}
        >
            <p className="mb-1 font-semibold uppercase tracking-wide text-alloy-midnight/45">{title}</p>
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
                <dd data-testid="visual-editor-composition-source">{diagnostic.runtimeCompositionSource}</dd>
            </dl>
        </div>
    );
}
