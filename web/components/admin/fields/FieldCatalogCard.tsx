"use client";

import FieldSurfaceAvailabilityBadges from "@/components/admin/fields/FieldSurfaceAvailabilityBadges";
import {
    childHubOwnerGrainLabel,
    type SettingsFieldCatalogEntry,
    type SettingsHubEntityKey,
} from "@/lib/fields/fieldCatalogForSettings";
import { FIELD_OWNERSHIP_LABELS } from "@/lib/fields/fieldOwnership";
import { resolveSettingsCatalogEntryAvailability } from "@/lib/fields/fieldSurfaceAvailability";

type Props = {
    entry: SettingsFieldCatalogEntry;
    hubEntity?: SettingsHubEntityKey;
    sectionLabel?: string;
    /** Compact canonical storage owner for Child hub (Profile vs Enrollment). */
    showOwnerGrainBadge?: boolean;
    selected?: boolean;
    onSelect?: () => void;
    onConfigure?: () => void;
    onDelete?: () => void;
    deleteSaving?: boolean;
    deleteDisabled?: boolean;
    canMutate?: boolean;
};

function ownershipBadgeClass(ownership: SettingsFieldCatalogEntry["ownership"]): string {
    switch (ownership) {
        case "platform":
            return "border-alloy-forge/25 bg-alloy-forge/[0.06] text-alloy-midnight/65";
        case "custom":
            return "border-alloy-pine/25 bg-alloy-pine/[0.06] text-alloy-pine";
        case "computed":
            return "border-violet-300/40 bg-violet-500/[0.06] text-violet-800";
    }
}

export default function FieldCatalogCard({
    entry,
    hubEntity,
    sectionLabel,
    showOwnerGrainBadge = false,
    selected = false,
    onSelect,
    onConfigure,
    onDelete,
    deleteSaving,
    deleteDisabled,
    canMutate = false,
}: Props) {
    const availability = resolveSettingsCatalogEntryAvailability({
        ownership: entry.ownership,
        platformField: entry.platformField,
        computedField: entry.computedField,
        hub_entity: hubEntity,
        registry: entry.fieldDef
            ? {
                  entity_type: entry.entity_type,
                  field_key: entry.fieldDef.field_key,
                  field_type: entry.fieldDef.field_type,
                  label: entry.fieldDef.label,
                  is_system: entry.fieldDef.is_system,
                  is_active: entry.fieldDef.is_active,
                  is_visible_in_form: entry.fieldDef.is_visible_in_form,
                  is_visible_in_drawer: entry.fieldDef.is_visible_in_drawer,
                  is_visible_in_table: entry.fieldDef.is_visible_in_table,
                  config: entry.fieldDef.config,
              }
            : undefined,
    });

    const actionLabel =
        entry.ownership === "platform"
            ? "View"
            : entry.ownership === "computed"
              ? "View logic"
              : entry.configurable
                ? "Configure"
                : "View";

    return (
        <article
            className={`cursor-pointer rounded-xl border p-4 shadow-sm transition-colors ${
                selected
                    ? "border-alloy-pine/40 bg-alloy-pine/[0.04] ring-1 ring-alloy-pine/20"
                    : entry.ownership === "platform"
                      ? "border-alloy-forge/15 bg-alloy-pine/[0.02] hover:border-alloy-forge/25"
                      : entry.ownership === "computed"
                        ? "border-violet-200/50 bg-violet-500/[0.02] hover:border-violet-300/40"
                        : "border-alloy-stone/35 bg-white hover:border-alloy-stone/50"
            }`}
            data-testid="field-catalog-card"
            data-field-ref-key={entry.refKey}
            data-ownership={entry.ownership}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.();
                }
            }}
            role="button"
            tabIndex={0}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-alloy-midnight">{entry.label}</h3>
                        <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ownershipBadgeClass(entry.ownership)}`}
                            data-testid="field-ownership-badge"
                        >
                            {FIELD_OWNERSHIP_LABELS[entry.ownership]}
                        </span>
                        {showOwnerGrainBadge ? (
                            <span
                                className="rounded-full border border-alloy-stone/30 bg-alloy-stone/[0.08] px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60"
                                data-testid="field-owner-grain-badge"
                                title="Canonical data owner"
                            >
                                Owner: {childHubOwnerGrainLabel(entry.entity_type)}
                            </span>
                        ) : null}
                    </div>
                    <p className="font-mono text-[11px] text-alloy-midnight/50">{entry.refKey}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-alloy-midnight/60">
                        <span>
                            <span className="font-medium text-alloy-midnight/75">Type:</span> {entry.field_type}
                        </span>
                        <span>
                            <span className="font-medium text-alloy-midnight/75">Section:</span>{" "}
                            {sectionLabel ?? entry.section_key.replace(/_/g, " ")}
                        </span>
                        {entry.storage_line ? (
                            <span>
                                <span className="font-medium text-alloy-midnight/75">Source:</span> {entry.storage_line}
                            </span>
                        ) : null}
                    </div>
                    {entry.description ? (
                        <p className="text-xs leading-relaxed text-alloy-midnight/55">{entry.description}</p>
                    ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={onSelect}
                        className="rounded-md border border-alloy-stone/40 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight hover:bg-alloy-stone/10"
                        data-testid="field-card-view"
                    >
                        {actionLabel}
                    </button>
                    {canMutate && entry.ownership === "custom" && entry.configurable && onConfigure ? (
                        <button
                            type="button"
                            onClick={onConfigure}
                            className="rounded-md border border-alloy-stone/40 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight hover:bg-alloy-stone/10"
                            data-testid="field-card-configure"
                        >
                            Configure
                        </button>
                    ) : null}
                    {canMutate && entry.ownership === "custom" && onDelete && !entry.fieldDef?.is_system ? (
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={deleteDisabled || deleteSaving}
                            className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            data-testid="field-card-delete"
                        >
                            {deleteSaving ? "Deleting…" : "Delete"}
                        </button>
                    ) : null}
                </div>
            </div>
            <div className="mt-3 border-t border-alloy-stone/25 pt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Surface availability
                </p>
                <FieldSurfaceAvailabilityBadges rows={availability} compact />
            </div>
        </article>
    );
}
