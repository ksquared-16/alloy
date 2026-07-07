"use client";

/**
 * Focus Panel Surface Composer — full-bleed editor shell.
 *
 * Same presentation pattern as Queue Row and Workspace Header builders:
 * back navigation, full workspace, embedded composer canvas.
 */

import FocusPanelSummarySurfaceEditor from "@/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor";
import { nestedSurfaceLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { focusPanelNestedLaunchers } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import { SURFACE_COMPOSER_EMPTY_HINT } from "@/lib/adminV2/settings/surfaces/surfaceComposer";

const NESTED_LAUNCHERS = focusPanelNestedLaunchers().map((l) => ({
    cardLabel: l.cardLabel,
    surfaceId: l.surfaceId,
}));

export type FocusPanelSurfaceEditorProps = {
    onBack: () => void;
    onOpenNestedSurface: (surfaceId: string, cardLabel?: string) => void;
};

export default function FocusPanelSurfaceEditor({ onBack, onOpenNestedSurface }: FocusPanelSurfaceEditorProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="focus-panel-surface-editor">
            <header className="flex flex-wrap items-center gap-3 border-b border-alloy-stone/10 px-4 py-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="text-sm font-medium text-alloy-pine hover:underline"
                    data-testid="focus-panel-surface-back"
                >
                    ← Surfaces
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-lg font-semibold text-alloy-midnight">Enrollment Focus Panel</h1>
                    <p className="text-sm text-alloy-midnight/55">{SURFACE_COMPOSER_EMPTY_HINT}</p>
                </div>
            </header>

            {NESTED_LAUNCHERS.length > 0 ?
                <div className="flex flex-wrap items-center gap-2 border-b border-alloy-stone/8 px-4 py-2" data-focus-panel-nested-launchers>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/35">
                        Expansion surfaces
                    </span>
                    {NESTED_LAUNCHERS.map((l) => (
                        <button
                            key={l.surfaceId}
                            type="button"
                            onClick={() => onOpenNestedSurface(l.surfaceId, l.cardLabel)}
                            className="flex items-center gap-1 rounded-full border border-alloy-stone/20 bg-white px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/65 hover:border-alloy-pine/40 hover:text-alloy-pine"
                            data-open-nested-surface={l.surfaceId}
                        >
                            {l.cardLabel}
                            <span className="text-alloy-midnight/30">›</span>
                            {nestedSurfaceLabel(l.surfaceId)}
                        </button>
                    ))}
                </div>
            :   null}

            <div className="min-h-0 flex-1 overflow-hidden p-4">
                <FocusPanelSummarySurfaceEditor onOpenNestedSurface={onOpenNestedSurface} />
            </div>
        </div>
    );
}
