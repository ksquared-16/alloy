"use client";

import {
    SURFACE_COMPOSER_INSPECTOR_ATTR,
    SURFACE_FIELD_INSPECTOR_ATTRS,
    SURFACE_FIELD_PLACEMENT_HELP,
    SURFACE_FIELD_PLACEMENT_LABELS,
    SURFACE_FIELD_SECTION_HELP,
    SURFACE_FIELD_SECTION_LABELS,
    surfaceComposerPlacementModeFromInline,
    type SurfaceComposerPlacedItemRef,
    type SurfaceFieldPlacementMode,
    type SurfaceFieldSectionKey,
} from "@/lib/adminV2/settings/surfaces/surfaceComposer";

export type SurfaceFieldInspectorProps = {
    field: SurfaceComposerPlacedItemRef;
    /** `nested` hides section/placement — nested surfaces only support order. */
    variant?: "full" | "nested";
    onChangeSection: (section: SurfaceFieldSectionKey) => void;
    onChangePlacement: (mode: SurfaceFieldPlacementMode) => void;
    onChangeLabel: (label: string) => void;
    onMoveEarlier: () => void;
    onMoveLater: () => void;
    onRemove: () => void;
};

const SECTION_KEYS = Object.keys(SURFACE_FIELD_SECTION_LABELS) as SurfaceFieldSectionKey[];

/**
 * Shared contextual inspector for a selected placed field on any surface canvas.
 */
export default function SurfaceFieldInspector({
    field,
    variant = "full",
    onChangeSection,
    onChangePlacement,
    onChangeLabel,
    onMoveEarlier,
    onMoveLater,
    onRemove,
}: SurfaceFieldInspectorProps) {
    const placementMode = surfaceComposerPlacementModeFromInline(field.inlineWithPrevious);
    const nested = variant === "nested";

    return (
        <div className="space-y-4" {...{ [SURFACE_COMPOSER_INSPECTOR_ATTR]: nested ? "nested-field" : "field" }}>
            <div>
                <p className="config-typo-sublabel mb-1">{nested ? "Field" : "Display as"}</p>
                {nested ?
                    <p className="rounded-md border border-alloy-stone/15 bg-alloy-stone/[0.03] px-2 py-1.5 text-sm text-alloy-midnight/80" data-inspector-field-label>
                        {field.label}
                    </p>
                :   <input
                        type="text"
                        value={field.label}
                        onChange={(e) => onChangeLabel(e.target.value)}
                        className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm"
                        data-inspector-field-label
                    />
                }
            </div>

            {!nested ?
                <>
                    <div {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.section]: true }}>
                        <p className="config-typo-sublabel mb-1">Section</p>
                        <p className="mb-2 text-[10px] leading-snug text-alloy-midnight/45">{SURFACE_FIELD_SECTION_HELP}</p>
                        <div className="flex flex-wrap gap-1">
                            {SECTION_KEYS.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => onChangeSection(key)}
                                    className={[
                                        "rounded-md border px-2 py-1 text-[11px] font-medium",
                                        field.builderSlot === key
                                            ? "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                                            : "border-alloy-stone/20 text-alloy-midnight/70 hover:border-alloy-stone/35",
                                    ].join(" ")}
                                    data-inspector-section-option={key}
                                >
                                    {SURFACE_FIELD_SECTION_LABELS[key]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.placement]: true }}>
                        <p className="config-typo-sublabel mb-1">Placement</p>
                        <p className="mb-2 text-[10px] leading-snug text-alloy-midnight/45">{SURFACE_FIELD_PLACEMENT_HELP}</p>
                        <div className="flex flex-wrap gap-1">
                            {(Object.keys(SURFACE_FIELD_PLACEMENT_LABELS) as SurfaceFieldPlacementMode[]).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => onChangePlacement(mode)}
                                    className={[
                                        "rounded-md border px-2 py-1 text-[11px] font-medium",
                                        placementMode === mode
                                            ? "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                                            : "border-alloy-stone/20 text-alloy-midnight/70 hover:border-alloy-stone/35",
                                    ].join(" ")}
                                    data-inspector-placement-option={mode}
                                >
                                    {SURFACE_FIELD_PLACEMENT_LABELS[mode]}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            :   null}

            <div {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.fieldList]: true }}>
                <p className="config-typo-sublabel mb-2">Order</p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onMoveEarlier} className="config-secondary-btn text-xs" data-inspector-move-earlier>
                        Move earlier
                    </button>
                    <button type="button" onClick={onMoveLater} className="config-secondary-btn text-xs" data-inspector-move-later>
                        Move later
                    </button>
                    <button type="button" onClick={onRemove} className="rounded-md border border-alloy-ember/25 px-2 py-1 text-xs font-medium text-alloy-ember hover:bg-alloy-ember/5" data-inspector-remove>
                        Remove
                    </button>
                </div>
            </div>
        </div>
    );
}
