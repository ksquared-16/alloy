"use client";

import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { moveSectionInNestedConfig, canMoveHouseholdSection, isHouseholdSectionPinned } from "@/lib/adminV2/settings/surfaces/nestedSurfaceSectionOrder";
import { HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

type Props = {
    surfaceId: string;
    groupKey: string;
    /** Hide reorder when domain-locked. */
    disabled?: boolean;
};

/** Subtle section reorder affordances — visible in Edit Mode (composition) only. */
export default function InlineSectionControls({ surfaceId, groupKey, disabled = false }: Props) {
    const composer = useFocusPanelComposer();
    const composing = composer?.isComposingSurface(surfaceId) ?? false;
    const config = composer?.configFor(surfaceId);

    if (!composing || !composer || !config || disabled) return null;
    if (surfaceId === HOUSEHOLD_SURFACE_ID && isHouseholdSectionPinned(groupKey)) return null;

    const keys = config.groups.map((g) => g.key);
    const index = keys.indexOf(groupKey);
    const canUp =
        index > 0
        && (surfaceId !== HOUSEHOLD_SURFACE_ID || canMoveHouseholdSection(config, groupKey, -1));
    const canDown =
        index >= 0
        && index < keys.length - 1
        && (surfaceId !== HOUSEHOLD_SURFACE_ID || canMoveHouseholdSection(config, groupKey, 1));

    return (
        <div className="fp-inline-section-controls" data-section-controls={groupKey}>
            <GripVertical className="fp-inline-section-controls__grip" aria-hidden />
            <button
                type="button"
                className="fp-inline-section-controls__btn"
                disabled={!canUp}
                aria-label="Move section up"
                data-section-move-up={groupKey}
                onClick={(e) => {
                    e.stopPropagation();
                    composer.updateConfig(surfaceId, moveSectionInNestedConfig(config, groupKey, -1));
                }}
            >
                <ChevronUp size={14} />
            </button>
            <button
                type="button"
                className="fp-inline-section-controls__btn"
                disabled={!canDown}
                aria-label="Move section down"
                data-section-move-down={groupKey}
                onClick={(e) => {
                    e.stopPropagation();
                    composer.updateConfig(surfaceId, moveSectionInNestedConfig(config, groupKey, 1));
                }}
            >
                <ChevronDown size={14} />
            </button>
        </div>
    );
}
