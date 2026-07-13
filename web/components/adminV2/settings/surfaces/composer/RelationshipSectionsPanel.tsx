"use client";

import clsx from "clsx";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import ComposerFloatingPopover from "@/components/admin/focusPanel/drillIn/ComposerFloatingPopover";
import {
    addHouseholdRelationshipSectionInstance,
    listHouseholdRelationshipSectionInstances,
    removeHouseholdRelationshipSectionInstance,
    addableHouseholdRelationshipSections,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";
import {
    canRemoveHouseholdRelationshipInstance,
    householdRelationshipSectionDefinition,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionDefinitions";
import { moveSectionInNestedConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceSectionOrder";
import { HOUSEHOLD_SURFACE_ID, type NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

export type RelationshipSectionsPanelProps = {
    config: NestedSurfaceConfig;
    onChange: (next: NestedSurfaceConfig) => void;
    selectedInstanceKey?: string | null;
    onSelectInstance?: (instanceKey: string) => void;
    className?: string;
};

/** Household Builder — ordered relationship section list with + Add section. */
export default function RelationshipSectionsPanel({
    config,
    onChange,
    selectedInstanceKey,
    onSelectInstance,
    className,
}: RelationshipSectionsPanelProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const instances = useMemo(() => listHouseholdRelationshipSectionInstances(config), [config]);
    const addable = useMemo(() => addableHouseholdRelationshipSections(config), [config]);

    const addSection = (definitionKey: string) => {
        const def = householdRelationshipSectionDefinition(definitionKey);
        onChange(addHouseholdRelationshipSectionInstance(config, definitionKey));
        if (def && onSelectInstance) {
            onSelectInstance(def.presentationGroupKey);
        }
        setPickerOpen(false);
    };

    const removeSection = (instanceKey: string, definitionKey: string) => {
        if (!canRemoveHouseholdRelationshipInstance({ definitionKey })) return;
        onChange(removeHouseholdRelationshipSectionInstance(config, instanceKey));
    };

    const moveSection = (instanceKey: string, delta: -1 | 1) => {
        onChange(moveSectionInNestedConfig(config, instanceKey, delta));
    };

    return (
        <div
            className={clsx("relationship-sections-panel space-y-2 rounded-lg border border-alloy-stone/15 bg-alloy-paper/50 p-3", className)}
            data-relationship-sections-panel="true"
        >
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Relationship sections</p>
                <button
                    ref={triggerRef}
                    type="button"
                    className="fp-inline-add-section inline-flex items-center gap-1 text-[11px]"
                    data-add-section-trigger="true"
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen((open) => !open)}
                >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add section
                </button>
            </div>

            <ComposerFloatingPopover
                open={pickerOpen}
                anchorRef={triggerRef}
                onClose={() => setPickerOpen(false)}
                className="fp-add-section-menu"
            >
                <div role="menu" data-relationship-section-definition-picker="true">
                    {addable.length === 0 ?
                        <p className="px-3 py-2 text-[11px] text-alloy-midnight/50">All available sections are already added.</p>
                    :   addable.map((def) => (
                            <button
                                key={def.definitionKey}
                                type="button"
                                role="menuitem"
                                className="fp-add-section-menu__item"
                                data-add-section-definition={def.definitionKey}
                                onClick={() => addSection(def.definitionKey)}
                            >
                                <span className="fp-add-section-menu__label">{def.defaultLabel}</span>
                            </button>
                        ))
                    }
                </div>
            </ComposerFloatingPopover>

            <ol className="space-y-1" data-relationship-section-list="true">
                {instances.map((instance, index) => {
                    const removable = canRemoveHouseholdRelationshipInstance({ definitionKey: instance.definitionKey });
                    const selected = selectedInstanceKey === instance.instanceKey;
                    return (
                        <li
                            key={instance.instanceKey}
                            className={clsx(
                                "flex items-center gap-2 rounded-md border px-2 py-1.5",
                                selected ? "border-alloy-pine/35 bg-alloy-pine/8" : "border-alloy-stone/12 bg-white/40",
                            )}
                            data-relationship-section-instance={instance.instanceKey}
                        >
                            <span className="w-4 text-[10px] text-alloy-midnight/40">{index + 1}.</span>
                            <button
                                type="button"
                                className="min-w-0 flex-1 truncate text-left text-[12px] text-alloy-midnight/85"
                                onClick={() => onSelectInstance?.(instance.instanceKey)}
                            >
                                {instance.label}
                            </button>
                            <div className="flex items-center gap-0.5">
                                <button
                                    type="button"
                                    className="fp-inline-section-controls__btn"
                                    aria-label="Move section up"
                                    disabled={index === 0}
                                    onClick={() => moveSection(instance.instanceKey, -1)}
                                >
                                    <ChevronUp size={14} />
                                </button>
                                <button
                                    type="button"
                                    className="fp-inline-section-controls__btn"
                                    aria-label="Move section down"
                                    disabled={index >= instances.length - 1}
                                    onClick={() => moveSection(instance.instanceKey, 1)}
                                >
                                    <ChevronDown size={14} />
                                </button>
                                {removable ?
                                    <button
                                        type="button"
                                        className="fp-inline-section-controls__btn text-red-600/70"
                                        aria-label="Remove section"
                                        onClick={() => removeSection(instance.instanceKey, instance.definitionKey)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                :   null}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
