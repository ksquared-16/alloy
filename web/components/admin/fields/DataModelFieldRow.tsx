"use client";

import { useEffect, useState } from "react";
import ConfigurationStatusToggle from "@/components/adminV2/configuration/ConfigurationStatusToggle";
import FieldSurfaceAvailabilityBadges from "@/components/admin/fields/FieldSurfaceAvailabilityBadges";
import { configurationFieldUnavailableHint } from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import { CONFIG_WORKSPACE_ROW_INNER_CLASS } from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import { FIELD_OWNERSHIP_LABELS } from "@/lib/fields/fieldOwnership";
import { resolveSettingsCatalogEntryAvailability } from "@/lib/fields/fieldSurfaceAvailability";
import {
    fieldRowEditCapability,
    type SettingsFieldCatalogEntry,
    type SettingsHubEntityKey,
} from "@/lib/fields/fieldCatalogForSettings";
import {
    CONFIG_WORKSPACE_GHOST_ACTION_CLASS,
    CONFIG_WORKSPACE_ROW_CLASS,
    CONFIG_WORKSPACE_ROW_EXPANDED_CLASS,
    fieldTypeOperatorLabel,
    ownershipChipClass,
} from "@/lib/fields/dataModelWorkspaceOperatorUi";
import {
    DATA_MODEL_FIELD_TYPE_ICONS,
    DATA_MODEL_ICON_STROKE,
} from "@/lib/fields/dataModelWorkspaceIcons";
import { Check, Circle } from "lucide-react";

export type FieldInlineEditValues = {
    label: string;
    description: string;
    help_text: string;
    category_key: string;
    is_active: boolean;
};

type Props = {
    entry: SettingsFieldCatalogEntry;
    hubEntity: SettingsHubEntityKey;
    expanded: boolean;
    onExpand: () => void;
    onCollapse: () => void;
    canMutate?: boolean;
    activeCategoryOptions?: Array<{ value: string; label: string }>;
    saving?: boolean;
    error?: string | null;
    onSave?: (values: FieldInlineEditValues) => void | Promise<void>;
    onDelete?: () => void;
};

function TypeIcon({ fieldType }: { fieldType: string }) {
    const Icon = DATA_MODEL_FIELD_TYPE_ICONS[fieldType] ?? DATA_MODEL_FIELD_TYPE_ICONS.text;
    return <Icon size={13} strokeWidth={DATA_MODEL_ICON_STROKE} className="text-alloy-forge/45" aria-hidden />;
}

function valuesFromEntry(entry: SettingsFieldCatalogEntry): FieldInlineEditValues {
    const d = entry.fieldDef;
    return {
        label: d?.label ?? entry.label,
        description: d?.description ?? entry.description ?? "",
        help_text: d?.help_text ?? "",
        category_key: d?.section_key ?? entry.section_key,
        is_active: d?.is_active !== false,
    };
}

function selectableCategoryKey(
    categoryKey: string,
    activeCategoryOptions: ReadonlyArray<{ value: string; label: string }>,
): string {
    const normalized = categoryKey.trim();
    if (activeCategoryOptions.some((o) => o.value === normalized)) return normalized;
    return (
        activeCategoryOptions.find((o) => o.value === "custom")?.value ??
        activeCategoryOptions[0]?.value ??
        "custom"
    );
}

export default function DataModelFieldRow({
    entry,
    hubEntity,
    expanded,
    onExpand,
    onCollapse,
    canMutate = false,
    activeCategoryOptions = [],
    saving = false,
    error = null,
    onSave,
    onDelete,
}: Props) {
    const capability = fieldRowEditCapability(entry, canMutate);
    const editable = capability.mode !== "view";
    const presentationOnly = capability.mode === "presentation";
    const active = entry.fieldDef ? entry.fieldDef.is_active !== false : true;
    const [draft, setDraft] = useState<FieldInlineEditValues>(() => valuesFromEntry(entry));

    useEffect(() => {
        if (expanded) {
            const values = valuesFromEntry(entry);
            setDraft({
                ...values,
                category_key: selectableCategoryKey(values.category_key, activeCategoryOptions),
            });
        }
    }, [expanded, entry, activeCategoryOptions]);

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

    const unavailableHint = configurationFieldUnavailableHint(availability);

    return (
        <div
            className={[CONFIG_WORKSPACE_ROW_CLASS, expanded ? CONFIG_WORKSPACE_ROW_EXPANDED_CLASS : ""].join(" ")}
            data-testid="data-model-field-row"
            data-field-ref-key={entry.refKey}
            data-expanded={expanded ? "true" : "false"}
            data-ownership={entry.ownership}
        >
            <div className={CONFIG_WORKSPACE_ROW_INNER_CLASS}>
                <span className="shrink-0" aria-hidden title={active ? "Active" : "Hidden"}>
                    {active ? (
                        <Check size={13} strokeWidth={DATA_MODEL_ICON_STROKE} className="text-alloy-bend-pine" />
                    ) : (
                        <Circle size={13} strokeWidth={DATA_MODEL_ICON_STROKE} className="text-alloy-midnight/25" />
                    )}
                </span>
                <TypeIcon fieldType={entry.field_type} />
                <button
                    type="button"
                    onClick={onExpand}
                    className="min-w-0 flex-1 text-left"
                    data-testid="data-model-field-row-toggle"
                >
                    <span className="block truncate text-[13px] font-medium text-alloy-midnight">{entry.label}</span>
                </button>
                <span className={`hidden sm:inline ${ownershipChipClass(entry.ownership)}`}>
                    {FIELD_OWNERSHIP_LABELS[entry.ownership]}
                </span>
                <span className="hidden shrink-0 text-[10px] text-alloy-midnight/45 sm:inline">
                    {fieldTypeOperatorLabel(entry.field_type)}
                </span>
                {!active ? (
                    <span className="shrink-0 text-[10px] font-medium text-alloy-midnight/35">Hidden</span>
                ) : null}
                {unavailableHint ? (
                    <span
                        className="hidden max-w-[9rem] shrink-0 truncate text-[10px] font-medium text-alloy-midnight/45 sm:inline"
                        title={unavailableHint.title}
                        data-testid="data-model-field-unavailable-hint"
                    >
                        Unavailable · {unavailableHint.label}
                    </span>
                ) : null}
                <button
                    type="button"
                    onClick={expanded ? onCollapse : onExpand}
                    className={[CONFIG_WORKSPACE_GHOST_ACTION_CLASS, expanded ? "opacity-100" : ""].join(" ")}
                    data-testid="data-model-field-edit"
                >
                    {expanded ? "Close" : editable ? "Edit" : "View"}
                </button>
            </div>

            {expanded ? (
                <div className="space-y-2 border-t border-alloy-forge/8 px-3 pb-2.5 pt-2" data-testid="data-model-field-editor">
                    {editable ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                            <label className="block space-y-0.5 sm:col-span-2">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Field name
                                </span>
                                <input
                                    value={draft.label}
                                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm text-alloy-midnight"
                                    data-testid="inline-field-label"
                                />
                            </label>
                            <label className="block space-y-0.5">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Category
                                </span>
                                <select
                                    value={selectableCategoryKey(draft.category_key, activeCategoryOptions)}
                                    onChange={(e) => setDraft((d) => ({ ...d, category_key: e.target.value }))}
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                    data-testid="inline-field-category"
                                >
                                    {activeCategoryOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block space-y-0.5">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Help text
                                </span>
                                <input
                                    value={draft.help_text}
                                    onChange={(e) => setDraft((d) => ({ ...d, help_text: e.target.value }))}
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                    data-testid="inline-field-help"
                                    placeholder="Shown when staff edit records"
                                />
                            </label>
                            <label className="block space-y-0.5 sm:col-span-2">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Description
                                </span>
                                <textarea
                                    value={draft.description}
                                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                                    rows={2}
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                    data-testid="inline-field-description"
                                />
                            </label>
                            {capability.canEditStatus ? (
                                <div className="sm:col-span-2">
                                    <ConfigurationStatusToggle
                                        active={draft.is_active}
                                        onChange={(is_active) => setDraft((d) => ({ ...d, is_active }))}
                                    />
                                </div>
                            ) : null}
                            {presentationOnly ? (
                                <p
                                    className="text-[11px] text-alloy-midnight/45 sm:col-span-2"
                                    data-testid="inline-field-presentation-note"
                                >
                                    This is a platform field. You can rename it and change its category. Type and storage
                                    stay locked.
                                </p>
                            ) : null}
                        </div>
                    ) : (
                        <div className="space-y-1 text-[12px] text-alloy-midnight/60">
                            <p>
                                <span className="font-medium text-alloy-midnight/75">Type:</span>{" "}
                                {fieldTypeOperatorLabel(entry.field_type)}
                            </p>
                            {entry.description ? <p>{entry.description}</p> : null}
                            {entry.ownership === "platform" || entry.ownership === "computed" ? (
                                <p className="text-[11px] text-alloy-midnight/45">
                                    {entry.ownership === "computed"
                                        ? "Computed fields are platform-defined and view-only."
                                        : "Platform fields describe your organization’s model. Placement is configured in Surface Builder."}
                                </p>
                            ) : null}
                        </div>
                    )}

                    {unavailableHint ? (
                        <div>
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                Availability
                            </p>
                            <FieldSurfaceAvailabilityBadges rows={availability} unavailableOnly />
                        </div>
                    ) : null}

                    {error ? (
                        <p className="text-xs text-alloy-ember" data-testid="inline-field-error">
                            {error}
                        </p>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            {capability.canDelete && onDelete ? (
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={onDelete}
                                    className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50"
                                    data-testid="inline-field-delete"
                                >
                                    Delete
                                </button>
                            ) : null}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={onCollapse}
                                className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.35]"
                                data-testid="inline-field-cancel"
                            >
                                {editable ? "Cancel" : "Close"}
                            </button>
                            {editable && onSave ? (
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => void onSave(draft)}
                                    className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                                    data-testid="inline-field-save"
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
