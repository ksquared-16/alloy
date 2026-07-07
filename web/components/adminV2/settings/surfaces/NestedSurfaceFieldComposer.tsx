"use client";

import { SURFACE_FIELD_INSPECTOR_ATTRS } from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";
import { SURFACE_COMPOSER_CANVAS_ATTR } from "@/lib/adminV2/settings/surfaces/surfaceComposer";
import type { NestedPlacedFieldRef } from "@/lib/adminV2/settings/surfaces/nestedSurfaceComposerModel";

type Props = {
    groupKey: string;
    groupLabel: string;
    purpose?: string;
    placed: readonly NestedPlacedFieldRef[];
    selectedFieldId: string | null;
    groupSelected: boolean;
    onSelectGroup: () => void;
    onSelectField: (fieldId: string) => void;
    onAddField: () => void;
};

function FieldChip({
    field,
    selected,
    onSelect,
}: {
    field: NestedPlacedFieldRef;
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
                "max-w-[10rem] truncate rounded px-1.5 py-0.5 text-[10px] font-medium",
                selected
                    ? "bg-alloy-pine/[0.1] text-alloy-pine ring-1 ring-alloy-pine/45"
                    : "bg-white/90 text-alloy-midnight/85 ring-1 ring-alloy-stone/25 hover:ring-alloy-pine/30",
            ].join(" ")}
            {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.canvasField]: field.id }}
            {...(selected ? { [SURFACE_FIELD_INSPECTOR_ATTRS.canvasFieldSelected]: true } : {})}
        >
            {field.label}
        </button>
    );
}

/** Click-first field composer for one nested surface evidence group. */
export default function NestedSurfaceFieldComposer({
    groupKey,
    groupLabel,
    purpose,
    placed,
    selectedFieldId,
    groupSelected,
    onSelectGroup,
    onSelectField,
    onAddField,
}: Props) {
    return (
        <section
            className={[
                "cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition-colors",
                groupSelected ? "border-alloy-pine/40 ring-1 ring-alloy-pine/20" : "border-alloy-stone/14 hover:border-alloy-pine/25",
            ].join(" ")}
            data-nested-group={groupKey}
            {...{ [SURFACE_COMPOSER_CANVAS_ATTR]: `nested-group-${groupKey}` }}
            onClick={onSelectGroup}
            role="button"
        >
            <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-alloy-midnight">{groupLabel}</p>
                    {purpose ?
                        <p className="text-[11px] text-alloy-midnight/45">{purpose}</p>
                    :   null}
                </div>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddField();
                    }}
                    className="shrink-0 rounded-lg border border-dashed border-alloy-pine/30 px-2 py-1 text-[10px] font-medium text-alloy-pine hover:bg-alloy-pine/[0.05]"
                    data-nested-add-field={groupKey}
                    {...{ [SURFACE_FIELD_INSPECTOR_ATTRS.canvasAddField]: groupKey }}
                >
                    + Add field
                </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1" data-nested-selected={groupKey}>
                {placed.length === 0 ?
                    <p className="text-[11px] text-alloy-midnight/35" data-composer-empty-hint="true">
                        Click to add fields.
                    </p>
                :   placed.map((field) => (
                        <FieldChip
                            key={field.id}
                            field={field}
                            selected={selectedFieldId === field.id}
                            onSelect={() => onSelectField(field.id)}
                        />
                    ))
                }
            </div>
        </section>
    );
}
