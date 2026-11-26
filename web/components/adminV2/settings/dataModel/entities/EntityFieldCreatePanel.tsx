"use client";

/**
 * Entity → Fields → New Field, in the detail pane.
 *
 * Rehosts `POST /api/admin/field-definitions` without changing its contract: the
 * new row is always an organization field (`is_system` false, decided server-side)
 * on this entity's definition type. The operator names the field and picks a type
 * and category; the storage key is derived and only shown under Advanced, because
 * it is a consequence of the name rather than a decision.
 */

import { useEffect, useMemo, useState } from "react";
import ConfigurationAdvancedToggle from "@/components/adminV2/configuration/ConfigurationAdvancedToggle";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ADMIN_FIELD_TYPES } from "@/lib/fields/adminFieldTypeList";
import {
    entityDefinitionApiType,
    type EntityFieldSummaryVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

const FIELD_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

const FIELD_TYPE_LABELS: Readonly<Record<string, string>> = {
    text: "Text",
    email: "Email",
    phone: "Phone",
    number: "Number",
    date: "Date",
    datetime: "Date and time",
    boolean: "Yes / No",
    select: "Choose one",
    multiselect: "Choose many",
};

function slugifyFieldKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

export function EntityFieldCreatePanel({
    entity,
    onCreated,
    onCancel,
    testId = "entity-field-create",
}: {
    entity: EntityWorkspaceVm;
    /** Fired with the VM summary for the created field so the list updates in place. */
    onCreated: (field: EntityFieldSummaryVm, refKey: string) => void;
    onCancel: () => void;
    testId?: string;
}) {
    const apiEntityType = entityDefinitionApiType(entity.hubKey);
    const [label, setLabel] = useState("");
    const [description, setDescription] = useState("");
    const [fieldType, setFieldType] = useState<string>("text");
    const [categoryKey, setCategoryKey] = useState(
        () => entity.fieldCategories.find((category) => category.key === "custom")?.key ?? entity.fieldCategories[0]?.key ?? "custom",
    );
    const [required, setRequired] = useState(false);
    const [fieldKey, setFieldKey] = useState("");
    const [keyTouched, setKeyTouched] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setError(null);
    }, [entity.hubKey]);

    const derivedKey = useMemo(
        () => (keyTouched ? fieldKey : slugifyFieldKey(label)),
        [keyTouched, fieldKey, label],
    );

    const save = async () => {
        const key = derivedKey.trim().toLowerCase();
        if (!label.trim()) {
            setError("Give the field a name.");
            return;
        }
        if (!FIELD_KEY_REGEX.test(key)) {
            setError("Could not build a valid reference from that name — try adding a letter or number.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/field-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: apiEntityType,
                    field_key: key,
                    field_type: fieldType,
                    label: label.trim(),
                    description: description.trim() || null,
                    section_key: categoryKey,
                    is_required: required,
                    sort_order: 100,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            if (res.status === 409) {
                setError("A field with this name already exists on this entity.");
                return;
            }
            if (!res.ok) throw new Error(String(json.error ?? "Could not create the field"));

            const createdId = json.id != null ? String(json.id) : null;
            const refKey = apiEntityType === "customer_member" ? `child.${key}` : `${entity.hubKey}.${key}`;
            const category = entity.fieldCategories.find((row) => row.key === categoryKey);
            onCreated(
                {
                    refKey,
                    label: label.trim(),
                    ownership: "custom",
                    categoryKey,
                    categoryLabel: category?.label ?? categoryKey,
                    fieldType,
                    entityType: apiEntityType,
                    description: description.trim() || null,
                    helpText: null,
                    storageLine: null,
                    required,
                    optionSetKey: null,
                    fieldDefinitionId: createdId,
                    isSystem: false,
                    editMode: "full",
                    isActive: true,
                    visibility: {
                        form: true,
                        drawer: true,
                        table: true,
                        filterable: false,
                        sortable: false,
                    },
                },
                refKey,
            );
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div data-testid={testId}>
            <header>
                <p className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                    New {entity.displayName} field
                </p>
                <h2 className="text-lg font-semibold leading-tight text-alloy-midnight">Add a field</h2>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                    Organization field · available in forms, drawers, and tables once saved
                </p>
            </header>

            <div className="pt-3">
                <ConfigWorkspaceCard title="Definition" compact testId={`${testId}-card`}>
                    <div className="space-y-2.5">
                        <label className="block space-y-0.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Field label
                            </span>
                            <input
                                autoFocus
                                value={label}
                                onChange={(event) => setLabel(event.target.value)}
                                placeholder="e.g. Transportation notes"
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
                                placeholder="What staff should record here"
                                className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                data-testid={`${testId}-description-input`}
                            />
                        </label>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <label className="block space-y-0.5">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Type
                                </span>
                                <select
                                    value={fieldType}
                                    onChange={(event) => setFieldType(event.target.value)}
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                    data-testid={`${testId}-type-select`}
                                >
                                    {ADMIN_FIELD_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {FIELD_TYPE_LABELS[type] ?? type}
                                        </option>
                                    ))}
                                </select>
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
                        </div>
                        <label className="flex items-center gap-2 text-[12px] text-alloy-midnight">
                            <input
                                type="checkbox"
                                checked={required}
                                onChange={(event) => setRequired(event.target.checked)}
                                data-testid={`${testId}-required-input`}
                            />
                            Required
                        </label>

                        <div>
                            <ConfigurationAdvancedToggle
                                open={advancedOpen}
                                onToggle={() => setAdvancedOpen((open) => !open)}
                            />
                            {advancedOpen ?
                                <label className="mt-1.5 block space-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        Internal reference
                                    </span>
                                    <input
                                        value={derivedKey}
                                        onChange={(event) => {
                                            setKeyTouched(true);
                                            setFieldKey(event.target.value);
                                        }}
                                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 font-mono text-xs"
                                        data-testid={`${testId}-key-input`}
                                    />
                                    <span className="text-[10px] text-alloy-midnight/40">
                                        Generated from the label and used by integrations. Cannot change later.
                                    </span>
                                </label>
                            :   null}
                        </div>

                        {error ?
                            <p className="text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                                {error}
                            </p>
                        :   null}

                        <div className="flex items-center gap-2 border-t border-alloy-stone/25 pt-2.5">
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void save()}
                                className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                data-testid={`${testId}-save`}
                            >
                                {saving ? "Creating…" : "Create Field"}
                            </button>
                            <button
                                type="button"
                                onClick={onCancel}
                                className="text-[11px] font-medium text-alloy-midnight/55 hover:underline"
                                data-testid={`${testId}-cancel`}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </ConfigWorkspaceCard>
            </div>
        </div>
    );
}
