"use client";

import {
    CHILDCARE_PRIORITY_RULE_ORDER_LABELS_V1,
    reorderPriorityRuleMoveDown,
    reorderPriorityRuleMoveUp,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";

export type PriorityRuleOrderEditorProps = {
    order: string[];
    fallbackBucketKey: string;
    /** bucket_key → label; missing keys fall back to key */
    labels?: Record<string, string>;
    disabled?: boolean;
    onChange: (next: string[]) => void;
};

export function PriorityRuleOrderEditor({
    order,
    fallbackBucketKey,
    labels = CHILDCARE_PRIORITY_RULE_ORDER_LABELS_V1,
    disabled = false,
    onChange,
}: PriorityRuleOrderEditorProps) {
    return (
        <div className="space-y-2 rounded-md border border-alloy-forge/12 bg-white/50 p-3">
            <div>
                <h2 className="text-xs font-semibold text-alloy-midnight/80">Priority rule order</h2>
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                    Rules are applied inside each program or room group. The first matching rule wins.
                </p>
            </div>
            <ol className="m-0 list-none space-y-2 p-0">
                {order.map((bucketKey, i) => {
                    const label = labels[bucketKey]?.trim() || bucketKey;
                    const isLast = i === order.length - 1;
                    const up = reorderPriorityRuleMoveUp(order, i, fallbackBucketKey);
                    const down = reorderPriorityRuleMoveDown(order, i, fallbackBucketKey);
                    return (
                        <li
                            key={bucketKey}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5 text-sm text-alloy-midnight"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="mr-2 font-mono text-[10px] text-alloy-midnight/40">{i + 1}.</span>
                                {label}
                                {isLast ? (
                                    <span className="ml-2 text-[10px] font-normal text-alloy-midnight/45">(always last)</span>
                                ) : null}
                            </span>
                            <span className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-forge/5 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={disabled || up == null}
                                    onClick={() => up && onChange(up)}
                                >
                                    Move up
                                </button>
                                <button
                                    type="button"
                                    className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[11px] font-medium text-alloy-midnight hover:bg-alloy-forge/5 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={disabled || down == null}
                                    onClick={() => down && onChange(down)}
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
