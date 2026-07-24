"use client";

/**
 * Selected-field workspace inside Entity → Fields.
 *
 * Definition / Usage / History — lands on Definition. Editing rehosts the
 * existing `field-definitions` mutation path (`PATCH /api/admin/field-definitions/:id`)
 * for tenant-configured fields; platform catalog and computed fields render as
 * protected. Usage points at Surfaces (Focus Panels and Queue Rows).
 */

import { useEffect, useState } from "react";
import ConfigurationAdvancedToggle from "@/components/adminV2/configuration/ConfigurationAdvancedToggle";
import { fieldTypeOperatorLabel } from "@/lib/fields/dataModelWorkspaceOperatorUi";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { EntityOptionSetPanel } from "@/components/adminV2/settings/dataModel/entities/EntityOptionSetPanel";
import { EntitySurfacesUsageCard } from "@/components/adminV2/settings/dataModel/entities/EntitySurfacesUsageCard";
import {
    ENTITY_FIELD_DETAIL_TABS,
    withFieldSummaryPatch,
    withOptionSetReplaced,
    type EntityFieldDetailTabKey,
    type EntityFieldSummaryVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

const OWNERSHIP_LABEL: Record<"platform" | "custom" | "computed", string> = {
    platform: "Platform",
    custom: "Organization",
    computed: "Computed",
};

const PROTECTED_REASON: Record<"platform" | "computed", string> = {
    platform: "Platform field — storage, type, and ownership are owned by Alloy.",
    computed: "Computed field — the value is derived, so there is nothing to configure here.",
};

function FactRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">{label}</dt>
            <dd className="mt-0.5 text-[12px] text-alloy-midnight">{value}</dd>
        </div>
    );
}

export function EntityFieldDetail({
    entity,
    field,
    canMutate,
    configLocked,
    onEntityChanged,
    testId = "entity-field-detail",
}: {
    entity: EntityWorkspaceVm;
    field: EntityFieldSummaryVm;
    canMutate: boolean;
    configLocked: boolean;
    onEntityChanged: (entity: EntityWorkspaceVm) => void;
    testId?: string;
}) {
    const [activeTab, setActiveTab] = useState<EntityFieldDetailTabKey>("definition");
    const [label, setLabel] = useState(field.label);
    const [description, setDescription] = useState(field.description ?? "");
    const [categoryKey, setCategoryKey] = useState(field.categoryKey);
    const [active, setActive] = useState(field.isActive);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [optionSetOpen, setOptionSetOpen] = useState(false);

    useEffect(() => {
        setActiveTab("definition");
        setError(null);
        setSaved(false);
        setAdvancedOpen(false);
        setOptionSetOpen(false);
        setLabel(field.label);
        setDescription(field.description ?? "");
        setCategoryKey(field.categoryKey);
        setActive(field.isActive);
    }, [field.refKey, field.label, field.description, field.categoryKey, field.isActive]);

    const editable =
        canMutate &&
        !configLocked &&
        field.editMode !== "view" &&
        field.fieldDefinitionId != null;

    /** Only tenant-owned fields may be switched off; system rows keep their lifecycle. */
    const canToggleActive = editable && field.editMode === "full";

    const optionSet = field.optionSetKey
        ? entity.optionSets.find((set) => set.setKey === field.optionSetKey)
        : undefined;

    const dirty =
        label.trim() !== field.label ||
        (description.trim() || null) !== (field.description ?? null) ||
        categoryKey !== field.categoryKey ||
        active !== field.isActive;

    const save = async () => {
        if (!editable || !field.fieldDefinitionId) return;
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const body: Record<string, unknown> = {
                label: label.trim(),
                description: description.trim() || null,
                section_key: categoryKey,
            };
            if (canToggleActive) body.is_active = active;

            const res = await fetch(`/api/admin/field-definitions/${field.fieldDefinitionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Save failed");
            const nextCategory = entity.fieldCategories.find((category) => category.key === categoryKey);
            onEntityChanged(
                withFieldSummaryPatch(entity, field.refKey, {
                    label: label.trim() || field.label,
                    description: description.trim() || null,
                    categoryKey,
                    categoryLabel: nextCategory?.label ?? categoryKey,
                    isActive: canToggleActive ? active : field.isActive,
                }),
            );
            setSaved(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const fieldLabelByRefKey = new Map(entity.fields.map((row) => [row.refKey, row.label] as const));

    return (
        <div data-testid={testId} data-field-ref-key={field.refKey}>
            <header>
                <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                    {entity.displayName} field
                </p>
                <h2 className="text-lg font-semibold leading-tight text-alloy-midnight">{field.label}</h2>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                    {OWNERSHIP_LABEL[field.ownership]} · {fieldTypeOperatorLabel(field.fieldType)} · {field.categoryLabel}
                    {field.isActive ? "" : " · Inactive"}
                </p>
            </header>

            <ConfigWorkspaceTabBar<EntityFieldDetailTabKey>
                tabs={ENTITY_FIELD_DETAIL_TABS}
                activeSection={activeTab}
                onSectionChange={setActiveTab}
                ariaLabel="Field details"
                testId={`${testId}-tabs`}
                testIdPrefix={`${testId}-tab`}
            />

            <div className="space-y-3 pt-3" data-testid={`${testId}-${activeTab}`}>
                {activeTab === "definition" ?
                    <>
                        <ConfigWorkspaceCard title="Definition" compact testId={`${testId}-definition-card`}>
                            {editable ?
                                <div className="space-y-2.5">
                                    <label className="block space-y-0.5">
                                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                            Field label
                                        </span>
                                        <input
                                            value={label}
                                            onChange={(event) => setLabel(event.target.value)}
                                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                            data-testid={`${testId}-label-input`}
                                        />
                                    </label>
                                    <label className="block space-y-0.5">
                                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                            Description
                                        </span>
                                        <textarea
                                            value={description}
                                            onChange={(event) => setDescription(event.target.value)}
                                            rows={2}
                                            className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                            data-testid={`${testId}-description-input`}
                                        />
                                    </label>
                                    <div className="grid gap-2.5 sm:grid-cols-2">
                                        <label className="block space-y-0.5">
                                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                                Category
                                            </span>
                                            <select
                                                value={categoryKey}
                                                onChange={(event) => setCategoryKey(event.target.value)}
                                                className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                                data-testid={`${testId}-category-select`}
                                            >
                                                {entity.fieldCategories.map((category) => (
                                                    <option key={category.key} value={category.key}>
                                                        {category.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <div className="space-y-0.5">
                                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                                Type
                                            </span>
                                            <p className="pt-1.5 text-[12px] text-alloy-midnight/70">
                                                {fieldTypeOperatorLabel(field.fieldType)}
                                                <span className="ml-1 text-[10px] text-alloy-midnight/40">
                                                    cannot change after creation
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                    {canToggleActive ?
                                        <label className="flex items-center gap-2 text-[12px] text-alloy-midnight">
                                            <input
                                                type="checkbox"
                                                checked={active}
                                                onChange={(event) => setActive(event.target.checked)}
                                                data-testid={`${testId}-active-input`}
                                            />
                                            Active — staff can see and use this field
                                        </label>
                                    :   null}

                                    {error ?
                                        <p className="text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                                            {error}
                                        </p>
                                    :   null}

                                    <div className="flex items-center gap-2 border-t border-alloy-stone/25 pt-2.5">
                                        <button
                                            type="button"
                                            disabled={saving || !dirty}
                                            onClick={() => void save()}
                                            className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                            data-testid={`${testId}-save`}
                                        >
                                            {saving ? "Saving…" : "Save Field"}
                                        </button>
                                        {saved && !dirty ?
                                            <span className="text-[11px] text-[#007d68]" data-testid={`${testId}-saved`}>
                                                Saved
                                            </span>
                                        :   null}
                                    </div>
                                    {field.editMode === "presentation" ?
                                        <p className="text-[10px] text-alloy-midnight/45">
                                            System field — only the label, description, and category can change.
                                        </p>
                                    :   null}
                                </div>

                            :   <>
                                    <dl className="grid grid-cols-2 gap-2.5">
                                        <FactRow label="Field label" value={field.label} />
                                        <FactRow label="Type" value={fieldTypeOperatorLabel(field.fieldType)} />
                                        <FactRow label="Category" value={field.categoryLabel} />
                                        <FactRow label="Required" value={field.required ? "Yes" : "No"} />
                                    </dl>
                                    <p
                                        className="mt-3 border-t border-alloy-stone/25 pt-2.5 text-[11px] text-alloy-midnight/50"
                                        data-testid={`${testId}-protected`}
                                    >
                                        {field.ownership === "custom" ?
                                            configLocked ? "Configuration is locked for this organization."
                                            : !canMutate ? "You do not have permission to change fields."
                                            : "This field is not operator-configurable."
                                        :   PROTECTED_REASON[field.ownership]}
                                    </p>
                                </>
                            }

                            <div className="mt-3 border-t border-alloy-stone/20 pt-2.5">
                                <ConfigurationAdvancedToggle
                                    open={advancedOpen}
                                    onToggle={() => setAdvancedOpen((open) => !open)}
                                />
                                {advancedOpen ?
                                    <dl
                                        className="mt-2 grid grid-cols-2 gap-2.5"
                                        data-testid={`${testId}-advanced`}
                                    >
                                        <div>
                                            <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                                Internal reference
                                            </dt>
                                            <dd className="mt-0.5 font-mono text-[11px] text-alloy-midnight/70">
                                                {field.refKey}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                                Storage location
                                            </dt>
                                            <dd className="mt-0.5 font-mono text-[11px] text-alloy-midnight/70">
                                                {field.storageLine ?? "Not recorded"}
                                            </dd>
                                        </div>
                                    </dl>
                                :   null}
                            </div>
                        </ConfigWorkspaceCard>

                        {field.optionSetKey ?
                            <ConfigWorkspaceCard title="Answer options" compact testId={`${testId}-source-card`}>
                                <button
                                    type="button"
                                    onClick={() => setOptionSetOpen((open) => !open)}
                                    className="text-[12px] font-medium text-alloy-bend-pine hover:underline"
                                    aria-expanded={optionSetOpen}
                                    data-testid={`${testId}-option-set-toggle`}
                                >
                                    Shared list · {optionSet?.label ?? field.optionSetKey}
                                </button>
                                {optionSetOpen ?
                                    <div className="mt-2.5">
                                        <EntityOptionSetPanel
                                            optionSet={
                                                optionSet ?? {
                                                    setKey: field.optionSetKey,
                                                    label: field.optionSetKey,
                                                    itemCount: 0,
                                                    values: [],
                                                    usedByFieldRefKeys: [field.refKey],
                                                    resolved: false,
                                                }
                                            }
                                            fieldLabelByRefKey={fieldLabelByRefKey}
                                            canMutate={canMutate}
                                            configLocked={configLocked}
                                            onOptionSetChanged={(next) =>
                                                onEntityChanged(withOptionSetReplaced(entity, next))
                                            }
                                        />
                                    </div>
                                :   null}
                            </ConfigWorkspaceCard>
                        :   null}
                    </>

                : activeTab === "usage" ?
                    <EntitySurfacesUsageCard
                        title="Where this field is used"
                        testId={`${testId}-usage`}
                    />

                :   <ConfigWorkspaceCard title="History" compact testId={`${testId}-history-card`}>
                        <p
                            className="text-[12px] leading-5 text-alloy-midnight/55"
                            data-testid={`${testId}-history-planned-empty-state`}
                        >
                            Change history for individual fields is planned but not wired yet. Once Alloy keeps an
                            audit trail for field changes, it will appear here.
                        </p>
                    </ConfigWorkspaceCard>
                }
            </div>
        </div>
    );
}
