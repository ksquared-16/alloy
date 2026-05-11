"use client";

import {
    CHILDCARE_PRIORITY_RULE_ORDER_LABELS_V1,
    reorderPriorityRuleMoveDownEnabled,
    reorderPriorityRuleMoveUpEnabled,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";

export type PriorityRuleOrderEditorProps = {
    order: string[];
    /** Keys whose matcher rules are active (always includes `fallbackBucketKey`). */
    enabledKeys: Set<string>;
    fallbackBucketKey: string;
    labels?: Record<string, string>;
    disabled?: boolean;
    onOrderChange: (next: string[]) => void;
    onEnabledKeysChange: (next: Set<string>) => void;
};

export function PriorityRuleOrderEditor({
    order,
    enabledKeys,
    fallbackBucketKey,
    labels = CHILDCARE_PRIORITY_RULE_ORDER_LABELS_V1,
    disabled = false,
    onOrderChange,
    onEnabledKeysChange,
}: PriorityRuleOrderEditorProps) {
    return (
        <div className="space-y-2 rounded-md border border-alloy-forge/12 bg-white/50 p-3">
            <div>
                <h2 className="text-xs font-semibold text-alloy-midnight/80">Priority rule order</h2>
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                    Rules are applied inside each program or room group. The first matching rule wins. Turn off tiers you
                    do not want to match — standard family always applies last.
                </p>
            </div>
            <ol className="m-0 list-none space-y-2 p-0">
                {order.map((bucketKey, i) => {
                    const label = labels[bucketKey]?.trim() || bucketKey;
                    const isFallback = bucketKey === fallbackBucketKey;
                    const isActive = enabledKeys.has(bucketKey);
                    const up = reorderPriorityRuleMoveUpEnabled(order, enabledKeys, fallbackBucketKey, i);
                    const down = reorderPriorityRuleMoveDownEnabled(order, enabledKeys, fallbackBucketKey, i);
                    return (
                        <li
                            key={bucketKey}
                            className="flex flex-col gap-2 rounded border border-alloy-forge/10 bg-white/80 px-2 py-2 text-sm text-alloy-midnight sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                        >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 sm:items-center">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 sm:mt-0"
                                    checked={isActive}
                                    disabled={disabled || isFallback}
                                    onChange={() => {
                                        if (isFallback) return;
                                        const next = new Set(enabledKeys);
                                        if (next.has(bucketKey)) next.delete(bucketKey);
                                        else next.add(bucketKey);
                                        next.add(fallbackBucketKey);
                                        onEnabledKeysChange(next);
                                    }}
                                />
                                <span>
                                    <span className="mr-2 font-mono text-[10px] text-alloy-midnight/40">{i + 1}.</span>
                                    {label}
                                    {isFallback ? (
                                        <span className="ml-2 text-[10px] font-normal text-alloy-midnight/45">
                                            (always on · last)
                                        </span>
                                    ) : null}
                                </span>
                            </label>
                            <span className="flex shrink-0 gap-1 pl-6 sm:pl-0">
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
