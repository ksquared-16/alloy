"use client";

import FocusPanelCardInspector from "@/components/admin/focusPanel/FocusPanelCardInspector";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { nestedSurfaceLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { FocusPanelCardConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { SummaryCardOrderEntry } from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";

type HistoryInfo = {
    publishedVersion: number | null;
    hasDraft: boolean;
    dirty: boolean;
};

type Props = {
    drillCardKey: FocusPanelCardKey;
    drillEntry: SummaryCardOrderEntry;
    drillModel: FocusPanelCardModel;
    onConfigChange: (instanceId: string, config: FocusPanelCardConfig) => void;
    history: HistoryInfo;
};

/**
 * Surface Composer V3 — secondary metadata rail during in-canvas drill-in.
 * Presentation and field policy live inline on the runtime; this rail holds card metadata only.
 */
export default function FocusPanelDrillInInspector({
    drillCardKey,
    drillEntry,
    drillModel,
    onConfigChange,
    history,
}: Props) {
    const composer = useFocusPanelComposer();
    const drillIn = composer?.drillIn;
    const surfaceId = drillIn?.surfaceId ?? null;

    if (!composer || !drillIn || !surfaceId) return null;

    const breadcrumb = drillInLabel(drillCardKey, drillIn.depth);

    return (
        <div className="flex h-full min-h-0 flex-col" data-focus-panel-drill-in-inspector={surfaceId}>
            <header className="border-b border-alloy-stone/10 px-4 py-3">
                <button
                    type="button"
                    className="mb-1 text-[11px] font-medium text-alloy-pine hover:underline"
                    onClick={() => composer.exitDrillIn()}
                    data-testid="composer-drill-in-exit"
                >
                    ← Focus Panel
                </button>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    {breadcrumb}
                </p>
                <h2 className="text-base font-semibold text-alloy-midnight">
                    {nestedSurfaceLabel(surfaceId)}
                </h2>
                <p className="mt-0.5 text-xs text-alloy-midnight/50">
                    Edit fields directly on the runtime surface. This panel is for card metadata only.
                </p>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">
                <FocusPanelCardInspector
                    baseModel={drillModel}
                    instanceId={drillEntry.instanceId}
                    config={drillEntry.config ?? {}}
                    onChange={(config) => onConfigChange(drillEntry.instanceId, config)}
                    onClose={() => composer.exitDrillIn()}
                    history={history}
                    metadataOnly
                />
            </div>
        </div>
    );
}

function drillInLabel(
    cardKey: string,
    depth: { kind: string; personId?: string; childId?: string },
): string {
    const base = `Focus Panel · ${cardKey.replace(/_/g, " ")}`;
    if (depth.kind === "contact-edit") return `${base} · Contact`;
    if (depth.kind === "child-focus") return `${base} · Child`;
    if (depth.kind === "child-edit") return `${base} · Child edit`;
    return base;
}
