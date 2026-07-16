"use client";

import type { DragEvent } from "react";
import {
    reorderPriorityRuleByDrag,
    reorderPriorityRuleMoveDownEnabled,
    reorderPriorityRuleMoveUpEnabled,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import {
    WAITLIST_RANKING_POLICY_FACTOR_DESCRIPTIONS,
    WAITLIST_RANKING_POLICY_FACTOR_LABELS,
    WAITLIST_RANKING_POLICY_FACTOR_SOURCES,
    WAITLIST_RANKING_POLICY_FACTORS,
} from "@/lib/orchestration/placement/waitlistRankingPolicyFactors";

export type PriorityRuleOrderEditorProps = {
    order: string[];
    /** Keys whose matcher rules are active (always includes `fallbackBucketKey`). */
    enabledKeys: Set<string>;
    fallbackBucketKey: string;
    labels?: Record<string, string>;
    descriptions?: Record<string, string>;
    sources?: Record<string, string>;
    selectableCatalog?: boolean;
    disabled?: boolean;
    onOrderChange: (next: string[]) => void;
    onEnabledKeysChange: (next: Set<string>) => void;
};

export function PriorityRuleOrderEditor({
    order,
    enabledKeys,
    fallbackBucketKey,
    labels = WAITLIST_RANKING_POLICY_FACTOR_LABELS,
    descriptions = WAITLIST_RANKING_POLICY_FACTOR_DESCRIPTIONS,
    sources = WAITLIST_RANKING_POLICY_FACTOR_SOURCES,
    selectableCatalog = false,
    disabled = false,
    onOrderChange,
    onEnabledKeysChange,
}: PriorityRuleOrderEditorProps) {
    const sourceKeyByBucket = Object.fromEntries(
        WAITLIST_RANKING_POLICY_FACTORS.map((f) => [f.bucketKey, f.sourceKey ?? ""])
    );

    const setFactorActive = (bucketKey: string, active: boolean) => {
        if (bucketKey === fallbackBucketKey) return;
        const next = new Set(enabledKeys);
        if (active) next.add(bucketKey);
        else next.delete(bucketKey);
        next.add(fallbackBucketKey);
        onEnabledKeysChange(next);
    };

    const handleDrop = (event: DragEvent<HTMLElement>, targetKey: string) => {
        event.preventDefault();
        if (disabled) return;
        const draggedKey = event.dataTransfer.getData("application/x-alloy-priority-factor");
        const next = reorderPriorityRuleByDrag(order, enabledKeys, fallbackBucketKey, draggedKey, targetKey);
        if (next) onOrderChange(next);
    };

    if (selectableCatalog) {
        const activeOrder = order.filter((bucketKey) => enabledKeys.has(bucketKey));
        const availableFactors = order.filter(
            (bucketKey) => bucketKey !== fallbackBucketKey && !enabledKeys.has(bucketKey)
        );

        return (
            <div className="space-y-4" data-testid="priority-factors-editor">
                <p className="text-[11px] leading-snug text-alloy-midnight/55">
                    Add supported factors, then drag active factors into priority order. The first match wins.
                </p>
                <section className="space-y-2" aria-labelledby="priority-active-factors-title">
                    <div className="flex items-center justify-between gap-3">
                        <h4
                            id="priority-active-factors-title"
                            className="config-typo-field-label"
                        >
                            Active ranking
                        </h4>
                        <span className="config-typo-meta">Drag to reorder</span>
                    </div>
                    <ol className="m-0 list-none space-y-2 p-0" data-testid="priority-active-factors">
                        {activeOrder.map((bucketKey, activeIndex) => {
                            const orderIndex = order.indexOf(bucketKey);
                            const label = labels[bucketKey]?.trim() || bucketKey;
                            const description = descriptions[bucketKey]?.trim();
                            const isFallback = bucketKey === fallbackBucketKey;
                            const up = reorderPriorityRuleMoveUpEnabled(
                                order,
                                enabledKeys,
                                fallbackBucketKey,
                                orderIndex
                            );
                            const down = reorderPriorityRuleMoveDownEnabled(
                                order,
                                enabledKeys,
                                fallbackBucketKey,
                                orderIndex
                            );
                            return (
                                <li
                                    key={bucketKey}
                                    className="rounded-lg border border-alloy-forge/10 bg-white/80 px-3 py-2.5 text-sm text-alloy-midnight"
                                    data-testid={`priority-factor-${bucketKey}`}
                                    draggable={!disabled && !isFallback}
                                    onDragStart={(event) => {
                                        event.dataTransfer.effectAllowed = "move";
                                        event.dataTransfer.setData(
                                            "application/x-alloy-priority-factor",
                                            bucketKey
                                        );
                                    }}
                                    onDragOver={(event) => {
                                        if (!disabled) event.preventDefault();
                                    }}
                                    onDrop={(event) => handleDrop(event, bucketKey)}
                                >
                                    <div className="flex flex-wrap items-start gap-2">
                                        <span
                                            className="mt-0.5 select-none text-alloy-midnight/35"
                                            aria-hidden="true"
                                        >
                                            {isFallback ? "·" : "⋮⋮"}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="font-medium">
                                                <span className="mr-2 text-[11px] font-normal text-alloy-midnight/45">
                                                    {activeIndex + 1}.
                                                </span>
                                                {label}
                                            </span>
                                            {isFallback ?
                                                <span className="ml-2 text-[10px] font-normal text-alloy-midnight/45">
                                                    (always on · last)
                                                </span>
                                            :   null}
                                            {description ?
                                                <span className="mt-0.5 block text-[11px] leading-snug text-alloy-midnight/55">
                                                    {description}
                                                </span>
                                            :   null}
                                        </span>
                                        <span className="flex shrink-0 flex-wrap gap-1">
                                            {!isFallback ?
                                                <button
                                                    type="button"
                                                    className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-forge/5 disabled:cursor-not-allowed disabled:opacity-40"
                                                    disabled={disabled}
                                                    onClick={() => setFactorActive(bucketKey, false)}
                                                >
                                                    Remove
                                                </button>
                                            :   null}
                                            <button
                                                type="button"
                                                className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-forge/5 disabled:cursor-not-allowed disabled:opacity-40"
                                                disabled={disabled || up == null}
                                                onClick={() => up && onOrderChange(up)}
                                                aria-label={`Move ${label} up`}
                                            >
                                                Move up
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-forge/5 disabled:cursor-not-allowed disabled:opacity-40"
                                                disabled={disabled || down == null}
                                                onClick={() => down && onOrderChange(down)}
                                                aria-label={`Move ${label} down`}
                                            >
                                                Move down
                                            </button>
                                        </span>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </section>
                <section className="space-y-2" aria-labelledby="priority-available-factors-title">
                    <h4 id="priority-available-factors-title" className="config-typo-field-label">
                        Available factors
                    </h4>
                    {availableFactors.length > 0 ?
                        <ul
                            className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2"
                            data-testid="priority-available-factors"
                        >
                            {availableFactors.map((bucketKey) => {
                                const label = labels[bucketKey]?.trim() || bucketKey;
                                const description = descriptions[bucketKey]?.trim();
                                return (
                                    <li
                                        key={bucketKey}
                                        className="flex items-start justify-between gap-3 rounded-lg border border-dashed border-alloy-forge/15 px-3 py-2"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-xs font-medium text-alloy-midnight/75">
                                                {label}
                                            </span>
                                            {description ?
                                                <span className="mt-0.5 block text-[11px] leading-snug text-alloy-midnight/50">
                                                    {description}
                                                </span>
                                            :   null}
                                        </span>
                                        <button
                                            type="button"
                                            className="shrink-0 text-xs font-medium text-[#007d68] disabled:opacity-40"
                                            disabled={disabled}
                                            onClick={() => setFactorActive(bucketKey, true)}
                                            aria-label={`Add ${label} to ranking`}
                                        >
                                            Add
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    :   <p className="config-typo-meta">All supported factors are active.</p>}
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="priority-factors-editor">
            <p className="text-[11px] leading-snug text-alloy-midnight/55">
                Rules apply within each program or room group. The first matching factor wins. Reorder to change
                precedence; uncheck factors you do not want to match.
            </p>
            <ol className="m-0 list-none space-y-2 p-0">
                {order.map((bucketKey, i) => {
                    const label = labels[bucketKey]?.trim() || bucketKey;
                    const description = descriptions[bucketKey]?.trim();
                    const sourceLabel = sources[bucketKey]?.trim();
                    const sourceKey = sourceKeyByBucket[bucketKey]?.trim();
                    const isFallback = bucketKey === fallbackBucketKey;
                    const isActive = enabledKeys.has(bucketKey);
                    const up = reorderPriorityRuleMoveUpEnabled(order, enabledKeys, fallbackBucketKey, i);
                    const down = reorderPriorityRuleMoveDownEnabled(order, enabledKeys, fallbackBucketKey, i);
                    return (
                        <li
                            key={bucketKey}
                            className="flex flex-col gap-2 rounded-lg border border-alloy-forge/10 bg-white/80 px-3 py-2.5 text-sm text-alloy-midnight sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
                            data-testid={`priority-factor-${bucketKey}`}
                        >
                            <div className="min-w-0 flex-1">
                                <label className="flex cursor-pointer items-start gap-2">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5"
                                        checked={isActive}
                                        disabled={disabled || isFallback}
                                        onChange={() => {
                                            if (isFallback) return;
                                            setFactorActive(bucketKey, !isActive);
                                        }}
                                    />
                                    <span>
                                        <span className="font-medium">
                                            <span className="mr-2 text-[11px] font-normal text-alloy-midnight/45">
                                                {i + 1}.
                                            </span>
                                            {label}
                                        </span>
                                        {isFallback ? (
                                            <span className="ml-2 text-[10px] font-normal text-alloy-midnight/45">
                                                (always on · last)
                                            </span>
                                        ) : null}
                                        {description ? (
                                            <span className="mt-0.5 block text-[11px] font-normal leading-snug text-alloy-midnight/55">
                                                {description}
                                            </span>
                                        ) : null}
                                        {sourceLabel ? (
                                            <span
                                                className="mt-1 block text-[11px] font-normal leading-snug text-alloy-midnight/65"
                                                data-testid={`priority-factor-source-${bucketKey}`}
                                            >
                                                <span className="font-medium text-alloy-midnight/70">Uses: </span>
                                                {sourceLabel.replace(/^Uses\s+/i, "")}
                                                {sourceKey ? (
                                                    <span className="mt-0.5 block font-mono text-[10px] text-alloy-midnight/40">
                                                        {sourceKey}
                                                    </span>
                                                ) : null}
                                            </span>
                                        ) : null}
                                    </span>
                                </label>
                            </div>
                            <span className="flex shrink-0 gap-1 pl-6 sm:pl-0 sm:pt-0.5">
                                <button
                                    type="button"
                                    className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-forge/5 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={disabled || !isActive || up == null}
                                    onClick={() => up && onOrderChange(up)}
                                >
                                    Move up
                                </button>
                                <button
                                    type="button"
                                    className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-forge/5 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={disabled || !isActive || down == null}
                                    onClick={() => down && onOrderChange(down)}
                                >
                                    Move down
                                </button>
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
