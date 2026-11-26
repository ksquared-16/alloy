"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";

export type ConfigCollectionFilterKey =
    | "all"
    | "attention"
    | "draft"
    | "published"
    | "active"
    | "retired";

export type ConfigCollectionItem = {
    id: string;
    label: string;
    publicationLabel: string;
    hasPublishedRevision?: boolean;
    assignmentLabel?: string;
    isAssigned?: boolean;
    setupLabel?: string;
    supportingLabel?: string;
    hasAttention: boolean;
    publicationState: "draft_only" | "published" | "changes_ready";
    lifecycleStatus?: string;
    leading?: ReactNode;
};

function itemMatchesFilter(item: ConfigCollectionItem, filter: ConfigCollectionFilterKey): boolean {
    if (filter === "attention") return item.hasAttention;
    if (filter === "draft") return item.publicationState !== "published";
    if (filter === "published") return item.publicationState === "published";
    if (filter === "active") return !item.lifecycleStatus || item.lifecycleStatus === "active";
    if (filter === "retired") return item.lifecycleStatus === "retired";
    return true;
}

/** Complete Collection Runtime selector for publishable Configuration objects. */
export function ConfigCollectionRail({
    title,
    description,
    objectLabel,
    items,
    selectedId,
    canAdd,
    onAdd,
    onSelect,
    addLabel = "Add",
    testId = "config-collection-rail",
}: {
    title: string;
    description?: string;
    objectLabel: string;
    items: ConfigCollectionItem[];
    selectedId: string | null;
    canAdd: boolean;
    onAdd: () => void;
    onSelect: (id: string) => void;
    addLabel?: string;
    testId?: string;
}) {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<ConfigCollectionFilterKey>("all");
    const visibleItems = useMemo(() => {
        const query = search.trim().toLocaleLowerCase();
        return items.filter(
            (item) =>
                itemMatchesFilter(item, filter)
                && (
                    !query
                    || item.label.toLocaleLowerCase().includes(query)
                    || item.publicationLabel.toLocaleLowerCase().includes(query)
                    || item.assignmentLabel?.toLocaleLowerCase().includes(query)
                    || item.supportingLabel?.toLocaleLowerCase().includes(query)
                ),
        );
    }, [filter, items, search]);
    const publishedCount = items.filter(
        (item) => item.hasPublishedRevision ?? item.publicationState === "published",
    ).length;
    const draftCount = items.filter((item) => item.publicationState !== "published").length;
    const assignedCount = items.filter((item) => item.isAssigned).length;
    const attentionCount = items.filter((item) => item.hasAttention).length;

    return (
        <>
            <aside
                className="process-config-setup-card hidden min-w-0 max-w-full self-start overflow-hidden p-0 xl:block"
                aria-label={`${title} selector`}
                data-testid={testId}
            >
                <header className="border-b border-alloy-stone/20 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-alloy-midnight">{title}</h2>
                            {description ?
                                <p className="mt-0.5 max-w-xs text-[11px] leading-4 text-alloy-midnight/50">
                                    {description}
                                </p>
                            :   null}
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                {visibleItems.length} of {items.length} shown
                            </p>
                        </div>
                        {canAdd ?
                            <ConfigurationPrimaryButton
                                className="shrink-0 gap-1 px-2 py-1 text-[11px]"
                                onClick={onAdd}
                                data-testid={`${testId}-add`}
                            >
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                                {addLabel}
                            </ConfigurationPrimaryButton>
                        :   null}
                    </div>
                    {items.length > 0 ?
                        <p
                            className="mt-2 text-[10px] leading-4 text-alloy-midnight/45"
                            data-testid={`${testId}-summary`}
                        >
                            {publishedCount} published · {draftCount} draft or changed · {assignedCount} assigned
                            {attentionCount > 0 ? ` · ${attentionCount} need attention` : ""}
                        </p>
                    :   null}
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                        <label className="relative">
                            <span className="sr-only">Search {title.toLocaleLowerCase()}</span>
                            <Search
                                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-alloy-midnight/35"
                                aria-hidden
                            />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder={`Search ${objectLabel.toLocaleLowerCase()}…`}
                                className="config-runtime-input config-runtime-input--with-leading-icon py-1.5 text-xs"
                                data-testid={`${testId}-search`}
                            />
                        </label>
                        <label>
                            <span className="sr-only">Filter {title.toLocaleLowerCase()}</span>
                            <select
                                value={filter}
                                onChange={(event) => setFilter(event.target.value as ConfigCollectionFilterKey)}
                                className="config-runtime-select py-1.5 text-xs"
                                data-testid={`${testId}-filter`}
                            >
                                <option value="all">All</option>
                                <option value="attention">Attention</option>
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                                <option value="active">Active</option>
                                <option value="retired">Retired</option>
                            </select>
                        </label>
                    </div>
                </header>
                <div className="max-h-[calc(100vh-16rem)] space-y-1 overflow-y-auto p-2" role="listbox">
                    {visibleItems.map((item) => {
                        const selected = item.id === selectedId;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                aria-current={selected ? "true" : undefined}
                                className={`${QUEUE_ROW_CARD_SHELL_CLASS} min-h-[4.5rem] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-bend-pine ${
                                    selected ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                }`}
                                onClick={() => onSelect(item.id)}
                                data-testid={`${testId}-item-${item.id}`}
                            >
                                {selected ?
                                    <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} />
                                :   null}
                                <span className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                                    {item.leading ?
                                        <span className="mt-0.5 shrink-0 text-alloy-bend-pine/80" aria-hidden>
                                            {item.leading}
                                        </span>
                                    :   null}
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <span className="block min-w-0 flex-1 truncate text-[13px] font-semibold text-alloy-midnight">
                                                {item.label}
                                            </span>
                                            {item.lifecycleStatus && item.lifecycleStatus !== "active" ?
                                                <span className="shrink-0 rounded-full border border-alloy-stone/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                    {item.lifecycleStatus}
                                                </span>
                                            :   null}
                                        </span>
                                        <span className="mt-0.5 block text-[11px] leading-4 text-alloy-midnight/55">
                                            {item.publicationLabel}
                                        </span>
                                        {item.assignmentLabel || item.setupLabel || item.supportingLabel ?
                                            <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-alloy-midnight/45">
                                                {item.assignmentLabel ? <span>{item.assignmentLabel}</span> : null}
                                                {item.setupLabel ? <span>{item.setupLabel}</span> : null}
                                                {item.supportingLabel ? <span>{item.supportingLabel}</span> : null}
                                            </span>
                                        :   null}
                                    </span>
                                    {item.hasAttention ?
                                        <span
                                            className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-alloy-ember"
                                            title="Needs attention"
                                            aria-label="Needs attention"
                                        />
                                    : selected ?
                                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-alloy-bend-pine" aria-hidden />
                                    :   null}
                                </span>
                            </button>
                        );
                    })}
                    {items.length > 0 && visibleItems.length === 0 ?
                        <p className="px-2 py-6 text-center text-xs text-alloy-midnight/45">
                            No {objectLabel.toLocaleLowerCase()} match this view.
                        </p>
                    :   null}
                </div>
            </aside>

            {items.length > 0 ?
                <div className="xl:hidden" data-testid={`${testId}-mobile`}>
                    <label className="config-typo-field-label" htmlFor={`${testId}-mobile-select`}>
                        {objectLabel}
                    </label>
                    <select
                        id={`${testId}-mobile-select`}
                        className="config-runtime-select mt-1"
                        value={selectedId ?? ""}
                        onChange={(event) => onSelect(event.target.value)}
                    >
                        {items.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label} · {item.lifecycleStatus ?? "active"} · {item.publicationLabel}
                            </option>
                        ))}
                    </select>
                </div>
            :   null}
        </>
    );
}
