"use client";

import { FIELDS_HUB_DATA_STRUCTURE_INTRO } from "@/lib/fields/fieldSettingsOperatorUi";

type Props = {
    entityType: string;
    entityLabel: string;
    fieldCount: number;
    platformCount?: number;
    customCount?: number;
    computedCount?: number;
    hiddenCount?: number;
    profileNote?: string;
    explanation?: string;
    surfacesNote?: string;
    actions?: React.ReactNode;
};

export default function FieldSettingsEntityHeader({
    entityType,
    entityLabel,
    fieldCount,
    platformCount = 0,
    customCount = 0,
    computedCount = 0,
    hiddenCount = 0,
    profileNote,
    explanation,
    surfacesNote,
    actions,
}: Props) {
    const entityCopy = entityLabel.trim() || entityType.replace(/_/g, " ");

    return (
        <header
            className="rounded-xl border border-alloy-forge/12 bg-alloy-pine/[0.03] px-4 py-3"
            data-testid="field-settings-entity-header"
            data-entity-type={entityType}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-alloy-midnight">{entityCopy} fields</h2>
                    {explanation ? (
                        <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/60">{explanation}</p>
                    ) : (
                        <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/60">{FIELDS_HUB_DATA_STRUCTURE_INTRO}</p>
                    )}
                    {profileNote ? (
                        <p className="mt-2 text-xs leading-relaxed text-alloy-midnight/55">{profileNote}</p>
                    ) : null}
                    {surfacesNote ? (
                        <p className="mt-2 text-[11px] text-alloy-midnight/50">
                            <span className="font-medium text-alloy-midnight/65">Appears in:</span> {surfacesNote}
                        </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/50">
                        <span data-testid="field-count-total">
                            {fieldCount} shown
                        </span>
                        <span data-testid="field-count-platform">Platform {platformCount}</span>
                        <span data-testid="field-count-custom">Custom {customCount}</span>
                        <span data-testid="field-count-computed">Computed {computedCount}</span>
                        {hiddenCount > 0 ? (
                            <span>
                                · {hiddenCount} workflow field{hiddenCount === 1 ? "" : "s"} hidden
                            </span>
                        ) : null}
                    </div>
                </div>
                {actions ? <div className="shrink-0">{actions}</div> : null}
            </div>
        </header>
    );
}
