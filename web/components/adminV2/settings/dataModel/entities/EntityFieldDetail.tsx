"use client";

/**
 * Selected-field workspace inside Entity → Fields.
 *
 * Overview / Definition / Validation / Usage / History for one field, hosted in
 * the Entity — no navigation to a Fields destination. Editing rehosts the
 * existing `field-definitions` mutation path (`PATCH /api/admin/field-definitions/:id`)
 * for tenant-configured fields; platform catalog and computed fields render as
 * protected because no persisted override layer exists for them.
 */

import { useEffect, useState } from "react";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { EntityOptionSetPanel } from "@/components/adminV2/settings/dataModel/entities/EntityOptionSetPanel";
import {
    ENTITY_FIELD_DETAIL_TABS,
    withFieldSummaryPatch,
    type EntityFieldDetailTabKey,
    type EntityFieldSummaryVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

const OWNERSHIP_LABEL: Record<"platform" | "custom" | "computed", string> = {
    platform: "Platform",
    custom: "Custom",
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

function VisibilityRow({ label, on }: { label: string; on: boolean }) {
    return (
        <li className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-alloy-midnight">{label}</span>
            <span className={on ? "text-[#007d68]" : "text-alloy-midnight/35"}>{on ? "Yes" : "No"}</span>
        </li>
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
    const [activeTab, setActiveTab] = useState<EntityFieldDetailTabKey>("overview");
    const [editing, setEditing] = useState(false);
    const [label, setLabel] = useState(field.label);
    const [description, setDescription] = useState(field.description ?? "");
    const [categoryKey, setCategoryKey] = useState(field.categoryKey);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [optionSetOpen, setOptionSetOpen] = useState(false);

    useEffect(() => {
        setEditing(false);
        setError(null);
        setOptionSetOpen(false);
        setLabel(field.label);
        setDescription(field.description ?? "");
        setCategoryKey(field.categoryKey);
    }, [field.refKey, field.label, field.description, field.categoryKey]);

    const editable =
        canMutate &&
        !configLocked &&
        field.editMode !== "view" &&
        field.fieldDefinitionId != null;

    const optionSet = field.optionSetKey
        ? entity.optionSets.find((set) => set.setKey === field.optionSetKey)
        : undefined;

    const save = async () => {
        if (!editable || !field.fieldDefinitionId) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/field-definitions/${field.fieldDefinitionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: label.trim(),
                    description: description.trim() || null,
                    section_key: categoryKey,
                }),
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
                }),
            );
            setEditing(false);
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
                    {OWNERSHIP_LABEL[field.ownership]} · {field.fieldType} · {field.categoryLabel}
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
                {activeTab === "overview" ?
                    <ConfigWorkspaceCard title="What this field means" compact testId={`${testId}-overview-card`}>
                        <p className="text-[12px] leading-5 text-alloy-midnight/70">
                            {field.description ?? field.helpText ?? "No description has been written for this field."}
                        </p>
                        <dl className="mt-3 grid grid-cols-2 gap-2.5">
                            <FactRow label="Label" value={field.label} />
                            <FactRow label="Type" value={field.fieldType} />
                            <FactRow label="Ownership" value={OWNERSHIP_LABEL[field.ownership]} />
                            <FactRow label="Category" value={field.categoryLabel} />
                        </dl>
                    </ConfigWorkspaceCard>

                : activeTab === "definition" ?
                    <>
                        <ConfigWorkspaceCard title="Definition" compact testId={`${testId}-definition-card`}>
                            <dl className="grid grid-cols-2 gap-2.5">
                                <FactRow label="Reference key" value={field.refKey} />
                                <FactRow label="Record type" value={field.entityType} />
                                <FactRow label="Type" value={field.fieldType} />
                                <FactRow label="Storage" value={field.storageLine ?? "Not recorded"} />
                            </dl>

                            {editable ?
                                editing ?
                                    <div className="mt-3 space-y-2.5 border-t border-alloy-stone/25 pt-3">
                                        <label className="block space-y-0.5">
                                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                                Label
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
                                        {error ?
                                            <p className="text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                                                {error}
                                            </p>
                                        :   null}
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={() => void save()}
                                                className="rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                                data-testid={`${testId}-save`}
                                            >
                                                {saving ? "Saving…" : "Save"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditing(false)}
                                                className="text-[11px] font-medium text-alloy-midnight/55 hover:underline"
                                                data-testid={`${testId}-cancel`}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                        {field.editMode === "presentation" ?
                                            <p className="text-[10px] text-alloy-midnight/45">
                                                System field — only label, description, and category can change.
                                            </p>
                                        :   null}
                                    </div>
                                :   <button
                                        type="button"
                                        onClick={() => setEditing(true)}
                                        className="mt-3 text-[11px] font-medium text-alloy-bend-pine hover:underline"
                                        data-testid={`${testId}-edit`}
                                    >
                                        Edit field
                                    </button>

                            :   <p
                                    className="mt-3 border-t border-alloy-stone/25 pt-2.5 text-[11px] text-alloy-midnight/50"
                                    data-testid={`${testId}-protected`}
                                >
                                    {field.ownership === "custom" ?
                                        configLocked ? "Configuration is locked for this organization."
                                        : !canMutate ? "You do not have permission to change fields."
                                        : "This field is not operator-configurable."
                                    :   PROTECTED_REASON[field.ownership]}
                                </p>
                            }
                        </ConfigWorkspaceCard>

                        {field.optionSetKey ?
                            <ConfigWorkspaceCard title="Source" compact testId={`${testId}-source-card`}>
                                <button
                                    type="button"
                                    onClick={() => setOptionSetOpen((open) => !open)}
                                    className="text-[12px] font-medium text-alloy-bend-pine hover:underline"
                                    aria-expanded={optionSetOpen}
                                    data-testid={`${testId}-option-set-toggle`}
                                >
                                    Option set · {optionSet?.label ?? field.optionSetKey}
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
                                        />
                                    </div>
                                :   null}
                            </ConfigWorkspaceCard>
                        :   null}
                    </>

                : activeTab === "validation" ?
                    <ConfigWorkspaceCard title="Validation" compact testId={`${testId}-validation-card`}>
                        {field.visibility ?
                            <>
                                <dl className="grid grid-cols-2 gap-2.5">
                                    <FactRow label="Required" value={field.required ? "Yes" : "No"} />
                                    <FactRow label="Type" value={field.fieldType} />
                                </dl>
                                <ul className="mt-3 space-y-1 border-t border-alloy-stone/25 pt-2.5">
                                    <VisibilityRow label="Shown in forms" on={field.visibility.form} />
                                    <VisibilityRow label="Shown in drawers" on={field.visibility.drawer} />
                                    <VisibilityRow label="Shown in tables" on={field.visibility.table} />
                                    <VisibilityRow label="Filterable" on={field.visibility.filterable} />
                                    <VisibilityRow label="Sortable" on={field.visibility.sortable} />
                                </ul>
                            </>
                        :   <p className="text-[12px] leading-5 text-alloy-midnight/55">
                                {PROTECTED_REASON[field.ownership === "computed" ? "computed" : "platform"]} No
                                per-field validation rules are stored for it.
                            </p>
                        }
                    </ConfigWorkspaceCard>

                : activeTab === "usage" ?
                    <ConfigWorkspaceCard title="Where this field is used" compact testId={`${testId}-usage-card`}>
                        {field.visibility ?
                            <ul className="space-y-1" data-testid={`${testId}-usage-list`}>
                                <VisibilityRow label="Forms" on={field.visibility.form} />
                                <VisibilityRow label="Drawers" on={field.visibility.drawer} />
                                <VisibilityRow label="Queue rows and tables" on={field.visibility.table} />
                            </ul>
                        :   <p className="text-[12px] leading-5 text-alloy-midnight/55">
                                Per-field usage tracking is not wired for {OWNERSHIP_LABEL[field.ownership].toLowerCase()}{" "}
                                fields yet. The Usage tab on this entity lists the surfaces its data reaches.
                            </p>
                        }
                        {optionSet ?
                            <p className="mt-2.5 border-t border-alloy-stone/25 pt-2 text-[11px] text-alloy-midnight/50">
                                Shares the {optionSet.label} option set with {optionSet.usedByFieldRefKeys.length - 1}{" "}
                                other field
                                {optionSet.usedByFieldRefKeys.length - 1 === 1 ? "" : "s"}.
                            </p>
                        :   null}
                    </ConfigWorkspaceCard>

                :   <ConfigWorkspaceCard title="History" compact testId={`${testId}-history-card`}>
                        <p
                            className="text-[12px] leading-5 text-alloy-midnight/55"
                            data-testid={`${testId}-history-planned-empty-state`}
                        >
                            Change history for individual fields is planned but not wired yet. Once an audit trail
                            exists for field_definitions changes, it will appear here.
                        </p>
                    </ConfigWorkspaceCard>
                }
            </div>
        </div>
    );
}
