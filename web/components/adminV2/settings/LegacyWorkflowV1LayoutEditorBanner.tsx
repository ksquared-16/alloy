"use client";

import Link from "next/link";
import { isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient } from "@/lib/layout/featureFlag";
import { LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_MESSAGE } from "@/lib/layout/legacyOpportunityDrawerLayoutConvergence";

type Props = {
    /** Section/order writes blocked; field placement editor may still write. */
    showFieldPlacementNote?: boolean;
};

/**
 * Legacy opportunity workflow v1 layout editors write to record_drawer_layouts.
 * Phase 5 — read-only for section/order when visual layout config runtime is active.
 */
export default function LegacyWorkflowV1LayoutEditorBanner({ showFieldPlacementNote = false }: Props) {
    const readOnly = isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient();

    return (
        <div
            className={`mb-3 rounded-lg border px-3 py-2 text-xs leading-snug ${
                readOnly ?
                    "border-amber-300 bg-amber-50 text-amber-950"
                :   "border-amber-200 bg-amber-50 text-amber-950"
            }`}
            data-testid="legacy-workflow-v1-layout-editor-banner"
            data-legacy-layout-read-only={readOnly ? "true" : "false"}
        >
            {readOnly ?
                <>
                    <strong>Read-only — surface composition moved to the Surface gallery.</strong>{" "}
                    {LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_MESSAGE}
                </>
            :   <>
                    <strong>Legacy layout editor.</strong> Changes here are saved to{" "}
                    <code className="font-mono text-[10px]">record_drawer_layouts</code> and may be superseded by{" "}
                </>
            }
            <Link href="/settings/surfaces" className="font-medium text-alloy-pine underline">
                Settings → Surfaces
            </Link>
            {!readOnly ? " (opportunity drawer visual editor). Until migration completes, edits in both places can conflict." : null}
            {showFieldPlacementNote ?
                <p className="mt-1 text-[10px] text-amber-900/80">
                    Field required/editable controls still save to legacy <code className="font-mono">field_placements_v1</code> until a
                    follow-up migration.
                </p>
            :   null}
        </div>
    );
}

export function useLegacyOpportunityDrawerLayoutReadOnly(): boolean {
    return isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient();
}
