"use client";

import type { ReactNode } from "react";
import {
    ACTION_PLACEMENT_ENTITY_TYPES,
} from "@/lib/admin/actions/actionButtonCreateUi";
import {
    RECORD_TYPE_HELP,
    SETTINGS_SURFACE_OPTIONS,
    settingsSlotsForSurface,
    settingsSurfaceDescription,
    surfaceRequiresSectionKey,
} from "@/lib/admin/actions/actionPlacementPresentation";

type Props = {
    entityType: string;
    onEntityTypeChange: (v: string) => void;
    surface: string;
    onSurfaceChange: (v: string) => void;
    slot: string;
    onSlotChange: (v: string) => void;
    sectionKey: string;
    onSectionKeyChange: (v: string) => void;
    orderIndex: number;
    onOrderIndexChange: (v: number) => void;
    disabled?: boolean;
};

function FieldHint({ children }: { children: ReactNode }) {
    return <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/50">{children}</p>;
}

export default function ActionPlacementFormFields({
    entityType,
    onEntityTypeChange,
    surface,
    onSurfaceChange,
    slot,
    onSlotChange,
    sectionKey,
    onSectionKeyChange,
    orderIndex,
    onOrderIndexChange,
    disabled = false,
}: Props) {
    const slotOptions = settingsSlotsForSurface(surface);
    const needsSection = surfaceRequiresSectionKey(surface);

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs sm:col-span-2">
                <span className="mb-0.5 block font-medium text-alloy-midnight/70">Record type</span>
                <select
                    value={entityType}
                    onChange={(e) => onEntityTypeChange(e.target.value)}
                    className="w-full rounded border border-alloy-stone/40 px-2 py-1 text-sm"
                    disabled={disabled}
                >
                    <option value="">Any (action default)</option>
                    {ACTION_PLACEMENT_ENTITY_TYPES.map((et) => (
                        <option key={et} value={et}>
                            {et}
                        </option>
                    ))}
                </select>
                <FieldHint>{RECORD_TYPE_HELP}</FieldHint>
            </label>

            <label className="block text-xs sm:col-span-2">
                <span className="mb-0.5 block font-medium text-alloy-midnight/70">Where it appears</span>
                <select
                    value={surface}
                    onChange={(e) => onSurfaceChange(e.target.value)}
                    className="w-full rounded border border-alloy-stone/40 px-2 py-1 text-sm"
                    disabled={disabled}
                >
                    {SETTINGS_SURFACE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                {settingsSurfaceDescription(surface) ? <FieldHint>{settingsSurfaceDescription(surface)}</FieldHint> : null}
            </label>

            <label className="block text-xs">
                <span className="mb-0.5 block font-medium text-alloy-midnight/70">Position (slot)</span>
                <select
                    value={slot}
                    onChange={(e) => onSlotChange(e.target.value)}
                    className="w-full rounded border border-alloy-stone/40 px-2 py-1 text-sm"
                    disabled={disabled}
                >
                    {slotOptions.map((o) => (
                        <option key={o.value} value={o.value} title={o.description}>
                            {o.label}
                        </option>
                    ))}
                </select>
                {slotOptions.find((o) => o.value === slot)?.description ? (
                    <FieldHint>{slotOptions.find((o) => o.value === slot)!.description}</FieldHint>
                ) : null}
            </label>

            <label className="block text-xs">
                <span className="mb-0.5 block font-medium text-alloy-midnight/70">Sort order</span>
                <input
                    type="number"
                    value={orderIndex}
                    onChange={(e) => onOrderIndexChange(Number(e.target.value))}
                    className="w-full rounded border border-alloy-stone/40 px-2 py-1 text-sm"
                    disabled={disabled}
                />
                <FieldHint>Lower numbers appear first within the same slot.</FieldHint>
            </label>

            {needsSection ? (
                <label className="block text-xs sm:col-span-2">
                    <span className="mb-0.5 block font-medium text-alloy-midnight/70">Record section key</span>
                    <input
                        type="text"
                        value={sectionKey}
                        onChange={(e) => onSectionKeyChange(e.target.value)}
                        placeholder="e.g. details, inquiry_children"
                        className="w-full max-w-sm rounded border border-alloy-stone/40 px-2 py-1 font-mono text-[11px]"
                        disabled={disabled}
                    />
                    <FieldHint>
                        Must match a section key from Record layouts. This is the internal key, not the display name.
                    </FieldHint>
                </label>
            ) : null}
        </div>
    );
}
