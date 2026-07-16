"use client";

import type { ConfigAttentionItem } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Attention Panel — "What needs attention?"
 * Fix / Improve / Good. Empty calm line when all good. No third "health" concept.
 */
export function ConfigAttentionPanel({
    items,
    onResolve,
    compact = false,
    testId = "config-attention-panel",
}: {
    items: ConfigAttentionItem[];
    onResolve?: (item: ConfigAttentionItem) => void;
    compact?: boolean;
    testId?: string;
}) {
    const actionable = items.filter((item) => item.grade !== "good");
    const allGood = actionable.length === 0;

    return (
        <ConfigWorkspaceCard title="Needs attention" compact={compact} testId={testId}>
            {allGood ?
                <p className="text-sm text-[#007d68]" data-testid={`${testId}-all-good`}>
                    Everything looks good ✓
                </p>
            :   <ul className="divide-y divide-alloy-forge/10">
                    {actionable.map((item) => (
                        <li
                            key={item.key}
                            className={`flex items-center gap-2.5 ${compact ? "py-2" : "py-2.5"} first:pt-0 last:pb-0`}
                        >
                            <span
                                className={item.grade === "fix" ? "text-amber-700" : "text-blue-700"}
                                aria-hidden="true"
                            >
                                {item.grade === "fix" ? "⚠" : "ⓘ"}
                            </span>
                            <span className="min-w-0 flex-1 text-sm text-alloy-midnight/80">{item.label}</span>
                            {onResolve ?
                                <button
                                    type="button"
                                    className="shrink-0 text-xs font-semibold text-[#007d68]"
                                    onClick={() => onResolve(item)}
                                >
                                    Resolve
                                </button>
                            :   null}
                        </li>
                    ))}
                </ul>
            }
        </ConfigWorkspaceCard>
    );
}
