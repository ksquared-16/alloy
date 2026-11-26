"use client";

/**
 * Option Set panel embedded inside a field's Definition tab.
 *
 * Option Sets are not an Entity tab — they are reached through the option-backed
 * field that consumes them, and are authored here without leaving the Entity.
 * Everything runs through the existing option-sets APIs:
 * `POST /api/admin/option-sets` to create the set a field already points at,
 * `POST …/:setKey/items` to add a value, `PATCH …/:setKey/items/:itemId` to rename
 * one. The detached `/settings/option-sets/[setKey]` page is no longer part of the
 * journey from an Entity.
 */

import { useEffect, useState } from "react";
import ConfigurationAdvancedToggle from "@/components/adminV2/configuration/ConfigurationAdvancedToggle";
import { ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { EntitySurfacesUsageCard } from "@/components/adminV2/settings/dataModel/entities/EntitySurfacesUsageCard";
import type {
    EntityOptionSetValueVm,
    EntityOptionSetVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

type OptionSetPanelTabKey = "values" | "usage" | "history";

const OPTION_SET_TABS: readonly { key: OptionSetPanelTabKey; label: string }[] = [
    { key: "values", label: "Values" },
    { key: "usage", label: "Usage" },
    { key: "history", label: "History" },
];

const VALUE_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function slugifyValueKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export function EntityOptionSetPanel({
    optionSet,
    fieldLabelByRefKey,
    canMutate,
    configLocked,
    onOptionSetChanged,
    testId = "entity-option-set-panel",
}: {
    optionSet: EntityOptionSetVm;
    fieldLabelByRefKey: ReadonlyMap<string, string>;
    canMutate: boolean;
    configLocked: boolean;
    /** Fired with the updated set so the Entity VM reflects the change in place. */
    onOptionSetChanged: (optionSet: EntityOptionSetVm) => void;
    testId?: string;
}) {
    const [activeTab, setActiveTab] = useState<OptionSetPanelTabKey>("values");
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [addingValue, setAddingValue] = useState(false);
    const [newValueLabel, setNewValueLabel] = useState("");
    const [editingValueId, setEditingValueId] = useState<string | null>(null);
    const [editingValueLabel, setEditingValueLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setActiveTab("values");
        setError(null);
        setAddingValue(false);
        setEditingValueId(null);
    }, [optionSet.setKey]);

    const canEdit = canMutate && !configLocked;

    const run = async (action: () => Promise<void>) => {
        if (!canEdit) return;
        setSaving(true);
        setError(null);
        try {
            await action();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    /** Create the org option set a field config already references but that has no row yet. */
    const createOptionSet = () =>
        run(async () => {
            const res = await fetch("/api/admin/option-sets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ set_key: optionSet.setKey, label: optionSet.label }),
            });
            const json = await readJson(res);
            if (!res.ok) throw new Error(String(json.error ?? "Could not create the option set"));
            onOptionSetChanged({ ...optionSet, resolved: true, itemCount: 0, values: [] });
            setActiveTab("values");
        });

    const addValue = () =>
        run(async () => {
            const label = newValueLabel.trim();
            const key = slugifyValueKey(label);
            if (!label) throw new Error("Give the value a name.");
            if (!VALUE_KEY_REGEX.test(key)) {
                throw new Error("Could not build a valid reference from that name.");
            }
            const res = await fetch(`/api/admin/option-sets/${encodeURIComponent(optionSet.setKey)}/items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    item_key: key,
                    label,
                    sort_order: (optionSet.values[optionSet.values.length - 1]?.sortOrder ?? 0) + 10,
                }),
            });
            const json = await readJson(res);
            if (res.status === 409) throw new Error("This value already exists in the set.");
            if (!res.ok) throw new Error(String(json.error ?? "Could not add the value"));

            const created: EntityOptionSetValueVm = {
                id: String(json.id ?? ""),
                key,
                label,
                sortOrder: Number(json.sort_order) || 0,
            };
            const values = [...optionSet.values, created];
            onOptionSetChanged({ ...optionSet, values, itemCount: values.length });
            setAddingValue(false);
            setNewValueLabel("");
        });

    const saveValue = (value: EntityOptionSetValueVm) =>
        run(async () => {
            const label = editingValueLabel.trim();
            if (!label) throw new Error("Value name cannot be empty.");
            const res = await fetch(
                `/api/admin/option-sets/${encodeURIComponent(optionSet.setKey)}/items/${value.id}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ label }),
                },
            );
            const json = await readJson(res);
            if (!res.ok) throw new Error(String(json.error ?? "Could not save the value"));
            onOptionSetChanged({
                ...optionSet,
                values: optionSet.values.map((row) => (row.id === value.id ? { ...row, label } : row)),
            });
            setEditingValueId(null);
        });

    return (
        <section
            className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] p-3"
            data-testid={testId}
        >
            <header className="mb-2">
                <p className="text-[12px] font-semibold text-alloy-midnight">{optionSet.label}</p>
                <p className="text-[10px] text-alloy-midnight/45">
                    {optionSet.resolved ?
                        `Shared list · ${optionSet.itemCount} value${optionSet.itemCount === 1 ? "" : "s"}`
                    :   "Shared list · not set up for this organization yet"}
                </p>
            </header>

            <ConfigWorkspaceTabBar<OptionSetPanelTabKey>
                tabs={OPTION_SET_TABS}
                activeSection={activeTab}
                onSectionChange={setActiveTab}
                ariaLabel="Option set details"
                testId={`${testId}-tabs`}
                testIdPrefix={`${testId}-tab`}
            />

            <div className="pt-2.5" data-testid={`${testId}-${activeTab}`}>
                {activeTab === "values" ?
                    <>
                        {!optionSet.resolved ?
                            <div className="mb-2.5 border-b border-alloy-stone/25 pb-2">
                                <p className="text-[11px] leading-4 text-alloy-midnight/55">
                                    This field points at a shared list that does not exist for your organization yet,
                                    so it has no values to offer.
                                </p>
                                {canEdit ?
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void createOptionSet()}
                                        className="mt-2 rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                        data-testid={`${testId}-create-set`}
                                    >
                                        {saving ? "Creating…" : "New Option Set"}
                                    </button>
                                :   null}
                            </div>
                        :   null}
                        {optionSet.values.length > 0 ?
                            <ul className="space-y-1" data-testid={`${testId}-values`}>
                                {optionSet.values.map((value) => (
                                    <li key={value.id || value.key} className="text-[11px]">
                                        {editingValueId === value.id ?
                                            <div className="flex flex-wrap items-center gap-2">
                                                <input
                                                    autoFocus
                                                    value={editingValueLabel}
                                                    onChange={(event) => setEditingValueLabel(event.target.value)}
                                                    className="min-w-0 flex-1 rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[11px]"
                                                    data-testid={`${testId}-value-input`}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={() => void saveValue(value)}
                                                    className="rounded-lg bg-alloy-bend-pine px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                                                    data-testid={`${testId}-value-save`}
                                                >
                                                    {saving ? "Saving…" : "Save"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingValueId(null)}
                                                    className="text-[10px] font-medium text-alloy-midnight/55 hover:underline"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        :   <div className="flex items-baseline justify-between gap-2">
                                                <span className="min-w-0 truncate text-alloy-midnight">
                                                    {value.label}
                                                </span>
                                                {canEdit && value.id ?
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingValueId(value.id);
                                                            setEditingValueLabel(value.label);
                                                            setError(null);
                                                        }}
                                                        className="shrink-0 text-[10px] font-medium text-alloy-bend-pine hover:underline"
                                                        data-testid={`${testId}-edit-value-${value.key}`}
                                                    >
                                                        Edit Value
                                                    </button>
                                                :   null}
                                            </div>
                                        }
                                    </li>
                                ))}
                            </ul>
                        :   <p className="text-[11px] text-alloy-midnight/45">
                                {optionSet.resolved ?
                                    "This list has no values yet."
                                :   "This list does not exist for your organization yet."}
                            </p>
                        }

                        {canEdit && optionSet.resolved ?
                            addingValue ?
                                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-alloy-stone/25 pt-2">
                                    <input
                                        autoFocus
                                        value={newValueLabel}
                                        onChange={(event) => setNewValueLabel(event.target.value)}
                                        placeholder="New value name"
                                        className="min-w-0 flex-1 rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[11px]"
                                        data-testid={`${testId}-new-value-input`}
                                    />
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void addValue()}
                                        className="rounded-lg bg-alloy-bend-pine px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                                        data-testid={`${testId}-new-value-save`}
                                    >
                                        {saving ? "Adding…" : "Add"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAddingValue(false)}
                                        className="text-[10px] font-medium text-alloy-midnight/55 hover:underline"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            :   <button
                                    type="button"
                                    onClick={() => setAddingValue(true)}
                                    className="mt-2 border-t border-alloy-stone/25 pt-2 text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                                    data-testid={`${testId}-add-value`}
                                >
                                    Add Value
                                </button>
                        :   null}

                        <div className="mt-2.5 border-t border-alloy-stone/20 pt-2">
                            <ConfigurationAdvancedToggle
                                open={advancedOpen}
                                onToggle={() => setAdvancedOpen((open) => !open)}
                            />
                            {advancedOpen ?
                                <dl className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]" data-testid={`${testId}-advanced`}>
                                    <div>
                                        <dt className="text-alloy-midnight/40">List name</dt>
                                        <dd className="text-alloy-midnight">{optionSet.label}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-alloy-midnight/40">Internal reference</dt>
                                        <dd className="font-mono text-[10px] text-alloy-midnight/70">
                                            {optionSet.setKey}
                                        </dd>
                                    </div>
                                </dl>
                            :   null}
                        </div>
                    </>

                : activeTab === "usage" ?
                    <div data-testid={`${testId}-usage`}>
                        <EntitySurfacesUsageCard
                            title="Where this list is used on Surfaces"
                            testId={`${testId}-surfaces-usage`}
                        />
                        {optionSet.usedByFieldRefKeys.length > 0 ?
                            <ul className="mt-2.5 space-y-1 border-t border-alloy-stone/25 pt-2 text-[11px]">
                                <li className="text-[10px] uppercase tracking-wide text-alloy-midnight/40">
                                    Fields on this entity
                                </li>
                                {optionSet.usedByFieldRefKeys.map((refKey) => (
                                    <li key={refKey} className="text-alloy-midnight">
                                        {fieldLabelByRefKey.get(refKey) ?? "Field"}
                                    </li>
                                ))}
                            </ul>
                        :   null}
                    </div>
                :   <p className="text-[11px] leading-4 text-alloy-midnight/55">
                        No audit trail is wired to shared list changes yet, so there is nothing to show here.
                    </p>
                }

                {error ?
                    <p className="mt-2 text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                        {error}
                    </p>
                :   null}
            </div>
        </section>
    );
}
