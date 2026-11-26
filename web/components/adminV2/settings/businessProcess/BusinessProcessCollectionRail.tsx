"use client";

/**
 * Business Processes collection rail — Collection → Selected Process → Focused Workspace,
 * same family as Access Users. Reuses the existing lifecycle catalog API only; no new
 * process/stage runtime and no parallel builder.
 */

import { useMemo, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
    QUEUE_ROW_SELECTED_RAIL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import {
    BUSINESS_PROCESS_COLLECTION_EMPTY_SEARCH,
    BUSINESS_PROCESS_COLLECTION_NEW,
    BUSINESS_PROCESS_COLLECTION_SEARCH_PLACEHOLDER,
    BUSINESS_PROCESS_COLLECTION_SUBTITLE,
    BUSINESS_PROCESS_COLLECTION_TITLE,
    BUSINESS_PROCESS_HEALTH_HINT_ATTENTION,
    BUSINESS_PROCESS_HEALTH_HINT_HEALTHY,
    BUSINESS_PROCESS_HEALTH_HINT_NOT_VISIBLE,
} from "@/lib/lifecycle/businessProcessUiLabels";

/**
 * Honest health hint from catalog workspace runtime truth — never invents a status beyond what
 * the lifecycle-catalog API already reports (`workspace.runtime_status`, `department_is_active`).
 */
export function businessProcessHealthHint(entry: LifecycleCatalogEntry): string {
    const ws = entry.workspace;
    if (!ws.department_is_active || ws.runtime_status === "inactive") {
        return BUSINESS_PROCESS_HEALTH_HINT_NOT_VISIBLE;
    }
    if (ws.runtime_status === "visible" && ws.user_has_access) {
        return BUSINESS_PROCESS_HEALTH_HINT_HEALTHY;
    }
    return BUSINESS_PROCESS_HEALTH_HINT_ATTENTION;
}

export function businessProcessStageSummary(entry: LifecycleCatalogEntry): string {
    const n = entry.stage_count;
    return `${n} stage${n === 1 ? "" : "s"}`;
}

export default function BusinessProcessCollectionRail({
    items,
    selectedId,
    loading,
    onSelect,
    onCreateNew,
    collapsed = false,
    onToggleCollapsed,
}: {
    items: LifecycleCatalogEntry[];
    selectedId: string | null;
    loading: boolean;
    onSelect: (entry: LifecycleCatalogEntry) => void;
    onCreateNew: () => void;
    /** Collapsed to a strip once a process is selected — navigation yields to the work. */
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
}) {
    const [search, setSearch] = useState("");

    const visibleItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return items;
        return items.filter(
            (entry) =>
                entry.lifecycle_name.toLowerCase().includes(query) ||
                entry.process_key.toLowerCase().includes(query),
        );
    }, [items, search]);

    // After every hook — an early return above `useMemo` changes the hook count between renders.
    if (collapsed && onToggleCollapsed) {
        const selectedName = items.find((entry) => entry.id === selectedId)?.lifecycle_name;
        return (
            <button
                type="button"
                onClick={onToggleCollapsed}
                className="config-rail-collapsed hidden xl:flex"
                title={`Show all business processes${selectedName ? ` (currently ${selectedName})` : ""}`}
                aria-expanded={false}
                data-testid="business-process-collection-rail-collapsed"
            >
                <PanelLeftOpen className="h-4 w-4 shrink-0 text-alloy-midnight/40" strokeWidth={2} aria-hidden />
                <span className="config-rail-collapsed__label">
                    {BUSINESS_PROCESS_COLLECTION_TITLE}
                </span>
                <span className="stage-count mt-auto" aria-hidden>
                    {items.length}
                </span>
            </button>
        );
    }

    return (
        <aside
            className="locations-collection-rail process-config-setup-card hidden min-w-0 p-0 xl:block"
            data-testid="business-process-collection-rail"
        >
            <header className="locations-collection-rail__header">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <h2 className="locations-collection-rail__title">{BUSINESS_PROCESS_COLLECTION_TITLE}</h2>
                        <p className="locations-collection-rail__count">{BUSINESS_PROCESS_COLLECTION_SUBTITLE}</p>
                    </div>
                    {onToggleCollapsed ? (
                        <button
                            type="button"
                            onClick={onToggleCollapsed}
                            className="-mr-1 shrink-0 rounded-md p-1 text-alloy-midnight/35 transition-colors hover:bg-alloy-stone/60 hover:text-alloy-midnight/60"
                            title="Collapse to give the editor more width"
                            aria-expanded
                            data-testid="business-process-collection-rail-collapse"
                        >
                            <PanelLeftClose className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                    ) : null}
                </div>
            </header>
            <div className="programs-collection-controls">
                <div className="programs-collection-controls__search-wrap">
                    <Search className="programs-collection-controls__search-icon" strokeWidth={2} aria-hidden />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={BUSINESS_PROCESS_COLLECTION_SEARCH_PLACEHOLDER}
                        className="programs-collection-controls__search"
                        data-testid="business-process-collection-search"
                    />
                </div>
                <ConfigurationPrimaryButton
                    className="mt-2 w-full gap-1"
                    onClick={onCreateNew}
                    data-testid="business-process-collection-new"
                >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    {BUSINESS_PROCESS_COLLECTION_NEW}
                </ConfigurationPrimaryButton>
            </div>
            <div className="locations-collection-rail__list" role="listbox" aria-label={BUSINESS_PROCESS_COLLECTION_TITLE}>
                {loading ?
                    <p className="px-2 py-6 text-center text-xs text-alloy-midnight/45" data-testid="business-process-collection-loading">
                        Loading processes…
                    </p>
                :   visibleItems.map((entry) => {
                        const selected = entry.id === selectedId;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`${QUEUE_ROW_CARD_SHELL_CLASS} locations-collection-row ${
                                    selected ? QUEUE_ROW_CARD_SELECTED_BORDER_CLASS : QUEUE_ROW_CARD_IDLE_BORDER_CLASS
                                }`}
                                onClick={() => onSelect(entry)}
                                data-testid={`business-process-collection-item-${entry.id}`}
                            >
                                {selected ? <span aria-hidden className={QUEUE_ROW_SELECTED_RAIL_CLASS} /> : null}
                                <span className="locations-collection-row__body">
                                    <span className="locations-collection-row__name">{entry.lifecycle_name}</span>
                                    <span className="locations-collection-row__meta text-alloy-midnight/50">
                                        {businessProcessStageSummary(entry)} · {businessProcessHealthHint(entry)}
                                    </span>
                                </span>
                            </button>
                        );
                    })
                }
                {!loading && items.length > 0 && visibleItems.length === 0 ?
                    <p className="px-2 py-6 text-center text-xs text-alloy-midnight/45">
                        {BUSINESS_PROCESS_COLLECTION_EMPTY_SEARCH}
                    </p>
                :   null}
                {!loading && items.length === 0 ?
                    <p className="px-2 py-6 text-center text-xs text-alloy-midnight/45" data-testid="business-process-collection-empty">
                        No processes yet. Create your first Business Process.
                    </p>
                :   null}
            </div>
        </aside>
    );
}
