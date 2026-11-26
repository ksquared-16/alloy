"use client";

import clsx from "clsx";

import FocusPanelCardInspector from "@/components/admin/focusPanel/FocusPanelCardInspector";
import IdentitySurfaceBuilderInspector from "@/components/adminV2/settings/surfaces/composer/IdentitySurfaceBuilderInspector";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import {
    CHILDREN_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
    nestedSurfaceLabel,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
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

function isIdentitySurfaceId(surfaceId: string): boolean {
    return surfaceId === HOUSEHOLD_SURFACE_ID || surfaceId === CHILDREN_SURFACE_ID;
}

/**
 * Focus Panel drill-in inspector — identity surfaces mount the shared layout composer;
 * other nested surfaces keep metadata-only card inspector.
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
    const identitySurface = isIdentitySurfaceId(surfaceId);

    const selectedGroupKey =
        composer.selection?.kind === "region" || composer.selection?.kind === "field"
            ? composer.selection.groupKey
            : null;

    const selectedFieldId =
        composer.selection?.kind === "field"
            ? `${composer.selection.groupKey}:${composer.selection.fieldKey}`
            : null;

    return (
        <div
            className="flex h-full min-h-0 flex-col"
            data-focus-panel-drill-in-inspector={surfaceId}
            data-focus-panel-drill-in-mode={identitySurface ? "identity-builder" : "metadata"}
        >
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
                    {identitySurface
                        ? "Configure layout — drag fields, set width, and manage evidence collections."
                        : "Edit fields directly on the runtime surface. This panel is for card metadata only."}
                </p>
                {identitySurface ? (
                    <div className="mt-3 flex gap-1 rounded-lg border border-alloy-stone/15 bg-alloy-stone/5 p-1" data-compose-canvas-mode-toggle="true">
                        {(["configure", "preview"] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                className={clsx(
                                    "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium capitalize",
                                    composer.composeCanvasMode === mode
                                        ? "bg-white text-alloy-midnight shadow-sm"
                                        : "text-alloy-midnight/50 hover:text-alloy-midnight",
                                )}
                                aria-pressed={composer.composeCanvasMode === mode}
                                onClick={() => composer.setComposeCanvasMode(mode)}
                                data-compose-canvas-mode={mode}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                ) : null}

            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {identitySurface ?
                    <IdentitySurfaceBuilderInspector
                        surfaceId={surfaceId}
                        config={composer.configFor(surfaceId)}
                        onChange={(next) => composer.updateConfig(surfaceId, next)}
                        selectedGroupKey={selectedGroupKey}
                        onSelectGroup={(groupKey) => {
                            if (groupKey) {
                                composer.select({ kind: "region", surfaceId, groupKey });
                            } else {
                                composer.select(null);
                            }
                        }}
                        selectedFieldId={selectedFieldId}
                        onSelectField={(fieldId) => {
                            if (!fieldId) {
                                composer.select(
                                    selectedGroupKey
                                        ? { kind: "region", surfaceId, groupKey: selectedGroupKey }
                                        : null,
                                );
                                return;
                            }
                            const colon = fieldId.indexOf(":");
                            const groupKey = fieldId.slice(0, colon);
                            const fieldKey = fieldId.slice(colon + 1);
                            composer.select({ kind: "field", surfaceId, groupKey, fieldKey });
                        }}
                    />
                :   <FocusPanelCardInspector
                        baseModel={drillModel}
                        instanceId={drillEntry.instanceId}
                        config={drillEntry.config ?? {}}
                        onChange={(config) => onConfigChange(drillEntry.instanceId, config)}
                        onClose={() => composer.exitDrillIn()}
                        history={history}
                        metadataOnly
                    />
                }
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
