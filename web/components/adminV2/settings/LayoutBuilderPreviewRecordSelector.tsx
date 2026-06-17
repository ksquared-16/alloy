"use client";

import type { LayoutBuilderPreviewRecordState } from "@/lib/layout/layoutBuilderPreviewRecordState";

type Props = {
    state: LayoutBuilderPreviewRecordState;
};

/** Toolbar control — preview against a real opportunity record or sample fallback. */
export default function LayoutBuilderPreviewRecordSelector({ state }: Props) {
    const { opportunityId, setOpportunityId, loading, error, usingSample } = state;

    return (
        <div
            className="flex min-w-0 flex-wrap items-end gap-2 rounded-lg border border-alloy-forge/12 bg-white px-3 py-2"
            data-testid="layout-builder-preview-record-selector"
        >
            <label className="min-w-[12rem] flex-1 text-[11px] text-alloy-midnight/60">
                Preview record
                <input
                    type="text"
                    value={opportunityId}
                    onChange={(e) => setOpportunityId(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Opportunity ID (optional)"
                    className="mt-1 w-full rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
                    data-testid="layout-builder-preview-opportunity-id"
                />
            </label>
            <p className="text-[10px] text-alloy-midnight/45" data-testid="layout-builder-preview-record-status">
                {loading ?
                    "Loading record…"
                : usingSample ?
                    "Using sample data"
                :   "Using live record"}
                {error && !loading ?
                    <span className="ml-1 text-amber-700">({error})</span>
                :   null}
            </p>
        </div>
    );
}
