"use client";

import {
    SURFACE_FIELD_INSPECTOR_ATTRS,
    SURFACE_FIELD_SECTION_LABELS,
    type SurfaceFieldSectionKey,
} from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";
import {
    MAX_FIELDS_PER_CARD_LINE,
    type FocusPanelPlacedFieldRef,
} from "@/lib/adminV2/settings/surfaces/focusPanelComposerModel";

type Props = {
    placed: readonly FocusPanelPlacedFieldRef[];
    selectedFieldId: string | null;
    onSelectField: (fieldId: string) => void;
    onAddToSection: (section: SurfaceFieldSectionKey) => void;
    onClickEmpty: () => void;
};

const SECTION_ORDER: SurfaceFieldSectionKey[] = ["identity", "groupCount", "attention", "status", "work"];

function fieldsByLine(placed: readonly FocusPanelPlacedFieldRef[], section: SurfaceFieldSectionKey) {
    const onSection = placed.filter((f) => f.builderSlot === section);
    const lines = new Map<number, FocusPanelPlacedFieldRef[]>();
    for (const field of onSection) {
        const list = lines.get(field.stackLine) ?? [];
        list.push(field);
        lines.set(field.stackLine, list);
    }
    return [...lines.entries()].sort(([a], [b]) => a - b);
}

function FieldChip({
    field,
    selected,
    onSelect,
}: {
    field: FocusPanelPlacedFieldRef;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            className={[
                "max-w-[8rem] truncate rounded px-1 py-0.5 text-[10px] font-medium",
                selected
                    ? "bg-alloy-pine/[0.1] text-alloy-pine ring-1 ring-alloy-pine/45"
                    : "bg-white/90 text-alloy-midnight/85 ring-1 ring-alloy-stone/25 hover:ring-alloy-pine/30",
            ].join(" ")}
            {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.canvasField]: field.fieldId }}
            {...(selected ? { [SURFACE_FIELD_INSPECTOR_ATTRS.canvasFieldSelected]: true } : {})}
        >
            {field.label}
        </button>
    );
}

function AddFieldButton({ section, onAdd }: { section: SurfaceFieldSectionKey; onAdd: () => void }) {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onAdd();
            }}
            className="shrink-0 rounded border border-dashed border-alloy-stone/25 px-1 py-0.5 text-[9px] font-medium text-alloy-pine/80 hover:border-alloy-pine/35"
            {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.canvasAddField]: section }}
        >
            + Add field
        </button>
    );
}

/**
 * Click-first field composer overlay for a selected Focus Panel card.
 * Renders placed fields as inline tokens grouped by Section / line.
 */
export default function FocusPanelCardFieldComposer({
    placed,
    selectedFieldId,
    onSelectField,
    onAddToSection,
    onClickEmpty,
}: Props) {
    const hasFields = placed.length > 0;

    return (
        <div
            className="pointer-events-none absolute inset-x-2 bottom-2 top-auto z-10 space-y-1 rounded-md border border-alloy-pine/20 bg-white/92 p-2 shadow-sm backdrop-blur-[1px]"
            data-focus-panel-card-field-composer="true"
            onClick={(e) => {
                e.stopPropagation();
                if (!hasFields) onClickEmpty();
            }}
        >
            {!hasFields ?
                <p className="pointer-events-auto cursor-pointer text-[10px] text-alloy-midnight/50" data-composer-empty-hint="true">
                    Click to add fields to this card.
                </p>
            :   SECTION_ORDER.map((section) => {
                    const lineGroups = fieldsByLine(placed, section);
                    if (lineGroups.length === 0) {
                        return (
                            <div key={section} className="pointer-events-auto flex items-center gap-1">
                                <span className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/30">
                                    {SURFACE_FIELD_SECTION_LABELS[section]}
                                </span>
                                <AddFieldButton section={section} onAdd={() => onAddToSection(section)} />
                            </div>
                        );
                    }
                    return (
                        <div key={section} className="pointer-events-auto space-y-0.5">
                            <span className="text-[8px] font-semibold uppercase tracking-wide text-alloy-midnight/30">
                                {SURFACE_FIELD_SECTION_LABELS[section]}
                            </span>
                            {lineGroups.map(([line, fields]) => (
                                <div key={`${section}-${line}`} className="flex flex-wrap items-center gap-1">
                                    {fields.map((field) => (
                                        <FieldChip
                                            key={field.id}
                                            field={field}
                                            selected={selectedFieldId === field.fieldId}
                                            onSelect={() => onSelectField(field.fieldId)}
                                        />
                                    ))}
                                    {fields.length < MAX_FIELDS_PER_CARD_LINE ?
                                        <AddFieldButton section={section} onAdd={() => onAddToSection(section)} />
                                    :   null}
                                </div>
                            ))}
                        </div>
                    );
                })
            }
        </div>
    );
}
