"use client";

/**
 * Entity → Fields. A real in-entity Fields experience: category filter, field
 * collection (grouped by category under Show All), and a selected-field
 * workspace — all in place. Selecting a field never leaves the Entity.
 */

import { useMemo, useState } from "react";
import { ConfigChildObjectMasterDetail } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { EntityFieldDetail } from "@/components/adminV2/settings/dataModel/entities/EntityFieldDetail";
import {
    groupFieldsByCategory,
    parseFieldSelection,
    SHOW_ALL_CATEGORY_KEY,
    type EntityFieldSummaryVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

const OWNERSHIP_LABEL: Record<"platform" | "custom" | "computed", string> = {
    platform: "Platform",
    custom: "Custom",
    computed: "Computed",
};

function FieldRow({
    field,
    active,
    onSelect,
    testId,
}: {
    field: EntityFieldSummaryVm;
    active: boolean;
    onSelect: () => void;
    testId: string;
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                    active ?
                        "bg-alloy-bend-pine/[0.10] font-semibold text-alloy-bend-pine"
                    :   "text-alloy-midnight hover:bg-alloy-stone/20"
                }`}
                data-testid={testId}
            >
                <span className="min-w-0 truncate">{field.label}</span>
                <span className="shrink-0 rounded border border-alloy-forge/10 px-1.5 py-0.5 text-[9px] text-alloy-midnight/50">
                    {OWNERSHIP_LABEL[field.ownership]}
                </span>
            </button>
        </li>
    );
}

export function EntityFieldsTab({
    entity,
    canMutate,
    configLocked,
    onEntityChanged,
    initialFieldRefKey,
    testId = "entity-fields-tab",
}: {
    entity: EntityWorkspaceVm;
    canMutate: boolean;
    configLocked: boolean;
    onEntityChanged: (entity: EntityWorkspaceVm) => void;
    initialFieldRefKey?: string;
    testId?: string;
}) {
    const [categoryKey, setCategoryKey] = useState<string>(SHOW_ALL_CATEGORY_KEY);
    const [query, setQuery] = useState("");
    const [selectedRefKey, setSelectedRefKey] = useState<string | null>(() =>
        parseFieldSelection(initialFieldRefKey, entity),
    );

    const matchesQuery = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (field: EntityFieldSummaryVm) =>
            !q ||
            field.label.toLowerCase().includes(q) ||
            field.refKey.toLowerCase().includes(q) ||
            field.categoryLabel.toLowerCase().includes(q);
    }, [query]);

    const showAll = categoryKey === SHOW_ALL_CATEGORY_KEY;

    const visibleFields = useMemo(
        () =>
            entity.fields.filter(
                (field) => matchesQuery(field) && (showAll || field.categoryKey === categoryKey),
            ),
        [entity.fields, matchesQuery, showAll, categoryKey],
    );

    const groups = useMemo(
        () => (showAll ? groupFieldsByCategory(visibleFields, entity.fieldCategories) : []),
        [showAll, visibleFields, entity.fieldCategories],
    );

    const selectedField =
        entity.fields.find((field) => field.refKey === selectedRefKey) ?? visibleFields[0] ?? null;

    const { fields: counts } = entity.structure;

    return (
        <div
            className="grid items-start gap-3 xl:grid-cols-[11.5rem_minmax(0,1fr)]"
            data-testid={testId}
        >
            <nav
                className="process-config-setup-card self-start p-2.5"
                aria-label="Field categories"
                data-testid={`${testId}-category-filter`}
            >
                <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                    Categories
                </p>
                <ul className="space-y-0.5">
                    <li>
                        <button
                            type="button"
                            onClick={() => setCategoryKey(SHOW_ALL_CATEGORY_KEY)}
                            aria-current={showAll ? "true" : undefined}
                            className={`flex w-full items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                                showAll ?
                                    "bg-alloy-bend-pine/[0.10] font-semibold text-alloy-bend-pine"
                                :   "text-alloy-midnight hover:bg-alloy-stone/20"
                            }`}
                            data-testid={`${testId}-category-all`}
                        >
                            <span>Show All</span>
                            <span className="text-[10px] text-alloy-midnight/45">{counts.total}</span>
                        </button>
                    </li>
                    {entity.fieldCategories.map((category) => {
                        const active = category.key === categoryKey;
                        return (
                            <li key={category.key}>
                                <button
                                    type="button"
                                    onClick={() => setCategoryKey(category.key)}
                                    aria-current={active ? "true" : undefined}
                                    className={`flex w-full items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                                        active ?
                                            "bg-alloy-bend-pine/[0.10] font-semibold text-alloy-bend-pine"
                                        :   "text-alloy-midnight hover:bg-alloy-stone/20"
                                    }`}
                                    data-testid={`${testId}-category-${category.key}`}
                                >
                                    <span className="min-w-0 truncate">{category.label}</span>
                                    <span className="text-[10px] text-alloy-midnight/45">{category.fieldCount}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <ConfigChildObjectMasterDetail
                testId={`${testId}-master-detail`}
                listTitle="Fields"
                listSummary={`${counts.total} total · ${counts.platform} platform · ${counts.custom} custom · ${counts.computed} computed`}
                list={
                    <div>
                        <label className="block px-1 pb-2">
                            <span className="sr-only">Search fields</span>
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search fields…"
                                className="config-runtime-input w-full text-xs"
                                data-testid={`${testId}-search`}
                            />
                        </label>

                        {showAll ?
                            <div className="space-y-2.5" data-testid={`${testId}-grouped-list`}>
                                {groups.map((group) => (
                                    <section key={group.category.key}>
                                        <h3
                                            className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/55"
                                            data-testid={`${testId}-group-heading-${group.category.key}`}
                                        >
                                            {group.category.label}
                                            <span className="ml-1 font-normal text-alloy-midnight/35">
                                                {group.fields.length}
                                            </span>
                                        </h3>
                                        <ul className="space-y-0.5">
                                            {group.fields.map((field) => (
                                                <FieldRow
                                                    key={field.refKey}
                                                    field={field}
                                                    active={field.refKey === selectedField?.refKey}
                                                    onSelect={() => setSelectedRefKey(field.refKey)}
                                                    testId={`${testId}-item-${field.refKey}`}
                                                />
                                            ))}
                                        </ul>
                                    </section>
                                ))}
                            </div>
                        :   <ul className="space-y-0.5" data-testid={`${testId}-filtered-list`}>
                                {visibleFields.map((field) => (
                                    <FieldRow
                                        key={field.refKey}
                                        field={field}
                                        active={field.refKey === selectedField?.refKey}
                                        onSelect={() => setSelectedRefKey(field.refKey)}
                                        testId={`${testId}-item-${field.refKey}`}
                                    />
                                ))}
                            </ul>
                        }

                        {visibleFields.length === 0 ?
                            <p
                                className="px-2 py-4 text-center text-[11px] text-alloy-midnight/45"
                                data-testid={`${testId}-empty`}
                            >
                                No fields match.
                            </p>
                        :   null}
                    </div>
                }
                detail={
                    selectedField ?
                        <EntityFieldDetail
                            entity={entity}
                            field={selectedField}
                            canMutate={canMutate}
                            configLocked={configLocked}
                            onEntityChanged={onEntityChanged}
                        />
                    :   <p className="text-[12px] text-alloy-midnight/45" data-testid={`${testId}-no-selection`}>
                            Select a field to see how it is defined and where it is used.
                        </p>
                }
            />
        </div>
    );
}
