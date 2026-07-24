"use client";

/**
 * Entity → Fields. A real in-entity Fields experience: search, an ownership /
 * lifecycle filter, a category filter that also authors categories in place, a
 * field collection (grouped by category under Show All), and a selected-field
 * workspace. Selecting, creating, or editing a field never leaves the Entity.
 *
 * Search and both filters compose, so an operator can isolate (say) the inactive
 * organization fields in one category without scrolling.
 */

import { useMemo, useState } from "react";
import { ConfigChildObjectMasterDetail } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { EntityFieldCategoriesPanel } from "@/components/adminV2/settings/dataModel/entities/EntityFieldCategoriesPanel";
import { EntityFieldCreatePanel } from "@/components/adminV2/settings/dataModel/entities/EntityFieldCreatePanel";
import { EntityFieldDetail } from "@/components/adminV2/settings/dataModel/entities/EntityFieldDetail";
import {
    ENTITY_FIELD_OWNERSHIP_FILTERS,
    entityFieldOwnershipFilterCount,
    groupFieldsByCategory,
    matchesEntityFieldOwnershipFilter,
    parseFieldSelection,
    SHOW_ALL_CATEGORY_KEY,
    withFieldCategoriesReplaced,
    withFieldSummaryAdded,
    type EntityFieldOwnershipFilterKey,
    type EntityFieldSummaryVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

const OWNERSHIP_LABEL: Record<"platform" | "custom" | "computed", string> = {
    platform: "Platform",
    custom: "Organization",
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
                } ${field.isActive ? "" : "opacity-60"}`}
                data-testid={testId}
                data-field-inactive={field.isActive ? undefined : "true"}
            >
                <span className="min-w-0 truncate">{field.label}</span>
                <span className="flex shrink-0 items-center gap-1">
                    {field.isActive ? null : (
                        <span className="rounded border border-alloy-forge/10 px-1 py-0.5 text-[9px] text-alloy-midnight/50">
                            Inactive
                        </span>
                    )}
                    <span className="rounded border border-alloy-forge/10 px-1.5 py-0.5 text-[9px] text-alloy-midnight/50">
                        {OWNERSHIP_LABEL[field.ownership]}
                    </span>
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
    const [ownershipFilter, setOwnershipFilter] = useState<EntityFieldOwnershipFilterKey>("all");
    const [query, setQuery] = useState("");
    const [selectedRefKey, setSelectedRefKey] = useState<string | null>(() =>
        parseFieldSelection(initialFieldRefKey, entity),
    );
    const [creating, setCreating] = useState(false);
    const [managingCategories, setManagingCategories] = useState(false);

    const matchesQuery = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (field: EntityFieldSummaryVm) =>
            !q || field.label.toLowerCase().includes(q) || field.categoryLabel.toLowerCase().includes(q);
    }, [query]);

    const showAll = categoryKey === SHOW_ALL_CATEGORY_KEY;

    const visibleFields = useMemo(
        () =>
            entity.fields.filter(
                (field) =>
                    matchesQuery(field) &&
                    matchesEntityFieldOwnershipFilter(field, ownershipFilter) &&
                    (showAll || field.categoryKey === categoryKey),
            ),
        [entity.fields, matchesQuery, ownershipFilter, showAll, categoryKey],
    );

    const groups = useMemo(
        () => (showAll ? groupFieldsByCategory(visibleFields, entity.fieldCategories) : []),
        [showAll, visibleFields, entity.fieldCategories],
    );

    const selectedField =
        entity.fields.find((field) => field.refKey === selectedRefKey) ?? visibleFields[0] ?? null;

    const { fields: counts } = entity.structure;
    const canEdit = canMutate && !configLocked;

    const selectField = (refKey: string) => {
        setCreating(false);
        setSelectedRefKey(refKey);
    };

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
                {canEdit ?
                    <button
                        type="button"
                        onClick={() => setManagingCategories((open) => !open)}
                        aria-expanded={managingCategories}
                        className="mt-1.5 w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-alloy-bend-pine hover:bg-alloy-stone/20"
                        data-testid={`${testId}-manage-categories`}
                    >
                        {managingCategories ? "Close categories" : "Manage categories"}
                    </button>
                :   null}
            </nav>

            <div className="min-w-0 space-y-3">
                {managingCategories ?
                    <EntityFieldCategoriesPanel
                        entity={entity}
                        canMutate={canMutate}
                        configLocked={configLocked}
                        onCategoriesChanged={(categories) =>
                            onEntityChanged(withFieldCategoriesReplaced(entity, categories))
                        }
                        onClose={() => setManagingCategories(false)}
                    />
                :   null}

                <ConfigChildObjectMasterDetail
                    testId={`${testId}-master-detail`}
                    listTitle="Fields"
                    listSummary={`${counts.total} total · ${counts.platform} platform · ${counts.custom} organization · ${counts.computed} computed`}
                    listActions={
                        canEdit ?
                            <button
                                type="button"
                                onClick={() => {
                                    setCreating(true);
                                    setManagingCategories(false);
                                }}
                                className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2 py-1 text-[11px] font-semibold text-white"
                                data-testid={`${testId}-new-field`}
                            >
                                New Field
                            </button>
                        :   null
                    }
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

                            <div
                                className="flex flex-wrap gap-1 px-1 pb-2"
                                role="group"
                                aria-label="Filter fields by owner"
                                data-testid={`${testId}-ownership-filter`}
                            >
                                {ENTITY_FIELD_OWNERSHIP_FILTERS.map((option) => {
                                    const active = option.key === ownershipFilter;
                                    const count = entityFieldOwnershipFilterCount(entity.fields, option.key);
                                    return (
                                        <button
                                            key={option.key}
                                            type="button"
                                            onClick={() => setOwnershipFilter(option.key)}
                                            aria-pressed={active}
                                            className={`rounded-full border px-1.5 py-0.5 text-[10px] transition-colors ${
                                                active ?
                                                    "border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.10] font-semibold text-alloy-bend-pine"
                                                :   "border-alloy-forge/12 text-alloy-midnight/60 hover:bg-alloy-stone/20"
                                            }`}
                                            data-testid={`${testId}-ownership-${option.key}`}
                                        >
                                            {option.label}
                                            <span className="ml-1 text-alloy-midnight/35">{count}</span>
                                        </button>
                                    );
                                })}
                            </div>

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
                                                        active={
                                                            !creating && field.refKey === selectedField?.refKey
                                                        }
                                                        onSelect={() => selectField(field.refKey)}
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
                                            active={!creating && field.refKey === selectedField?.refKey}
                                            onSelect={() => selectField(field.refKey)}
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
                        creating ?
                            <EntityFieldCreatePanel
                                entity={entity}
                                onCreated={(field, refKey) => {
                                    onEntityChanged(withFieldSummaryAdded(entity, field));
                                    setCreating(false);
                                    setSelectedRefKey(refKey);
                                }}
                                onCancel={() => setCreating(false)}
                            />
                        : selectedField ?
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
        </div>
    );
}
